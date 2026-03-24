import mimetypes
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import requests
from flask import Blueprint, jsonify, request

from app.config import settings
from app.extensions import limiter
from app.services.access_control import has_unlimited_ai_access, is_admin_role, normalize_user_role
from app.services.analysis_jobs_service import enqueue_analysis_job_processing
from app.services.gemini_service import GeminiNotConfiguredError, generate_outfitsme_image_with_gemini
from app.services.supabase_service import (
    SupabaseNotConfiguredError,
    build_analysis_result_for_photo,
    create_analysis_job,
    create_completed_ai_job,
    create_outfit_with_items,
    create_photo_record,
    delete_wardrobe_outfit,
    delete_wardrobe_outfits,
    download_photo_bytes,
    get_analysis_job_for_user,
    get_dashboard_stats,
    get_items_for_user,
    get_outfit_for_generation,
    get_signed_image_url,
    get_user_access_snapshot,
    get_user_daily_ai_usage,
    get_user_cost_summary,
    get_user_id_from_token,
    get_user_model_settings,
    list_analysis_history,
    list_user_items,
    list_wardrobe,
    save_generated_outfit_image,
    save_user_profile_photo,
    update_wardrobe_outfit_style_label,
    upsert_user_model_settings,
    upload_photo_for_user,
    get_wardrobe_photo_details,
)


api_bp = Blueprint("api", __name__)


def _extract_access_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.removeprefix("Bearer ").strip() or None


def _rate_limit_key() -> str:
    token = _extract_access_token()
    if not token:
        return request.remote_addr or "anonymous"
    try:
        user_id = get_user_id_from_token(token)
        return f"user:{user_id}" if user_id else (request.remote_addr or "anonymous")
    except Exception:  # noqa: BLE001
        return request.remote_addr or "anonymous"


def _parse_pagination_params(default_page_size: int = 20, max_page_size: int = 25) -> tuple[int, int]:
    page_raw = request.args.get("page", "1")
    page_size_raw = request.args.get("page_size", str(default_page_size))
    try:
        page = max(int(page_raw), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(page_size_raw)
    except (TypeError, ValueError):
        page_size = default_page_size
    page_size = max(1, min(page_size, max_page_size))
    return page, page_size


def _month_start_utc() -> str:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()


def _coerce_utc_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _build_analysis_access_payload(user_id: str) -> dict:
    snapshot = get_user_access_snapshot(user_id)
    user_role = normalize_user_role(snapshot.get("user_role"))
    if has_unlimited_ai_access(user_role):
        return {
            "user_role": user_role,
            "trial_active": False,
            "trial_started_at_utc": None,
            "trial_ends_at_utc": None,
            "trial_days_total": 0,
            "trial_days_remaining": None,
            "daily_limit": None,
            "used_today": 0,
            "remaining_today": None,
            "today_window_start_utc": None,
            "next_reset_utc": None,
            "analysis_actions_today": 0,
            "outfit_generations_today": 0,
            "access_mode": "unlimited",
        }

    now = datetime.now(timezone.utc)
    trial_started_at = _coerce_utc_datetime(snapshot.get("account_created_at")) or now
    trial_ends_at = trial_started_at + timedelta(days=max(settings.TRIAL_DAYS, 0))
    trial_active = now < trial_ends_at if settings.TRIAL_DAYS > 0 else False
    remaining_seconds = max((trial_ends_at - now).total_seconds(), 0)
    trial_days_remaining = int((remaining_seconds + 86399) // 86400) if trial_active else 0
    today_window_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    next_reset = today_window_start + timedelta(days=1)
    daily_limit = max(settings.TRIAL_DAILY_AI_ACTION_LIMIT, 0)
    usage = get_user_daily_ai_usage(user_id, today_window_start.isoformat())
    analysis_actions_today = max(int(usage.get("analysis_actions_today", 0)), 0)
    outfit_generations_today = max(int(usage.get("outfit_generations_today", 0)), 0)
    used_today = analysis_actions_today + outfit_generations_today
    remaining_today = max(daily_limit - used_today, 0) if trial_active else 0

    return {
        "user_role": user_role,
        "trial_active": trial_active,
        "trial_started_at_utc": trial_started_at.isoformat(),
        "trial_ends_at_utc": trial_ends_at.isoformat(),
        "trial_days_total": max(settings.TRIAL_DAYS, 0),
        "trial_days_remaining": trial_days_remaining,
        "daily_limit": daily_limit,
        "used_today": used_today,
        "remaining_today": remaining_today,
        "today_window_start_utc": today_window_start.isoformat(),
        "next_reset_utc": next_reset.isoformat(),
        "analysis_actions_today": analysis_actions_today,
        "outfit_generations_today": outfit_generations_today,
        "access_mode": "trial",
    }


def _require_user() -> tuple[str | None, tuple[dict, int] | None]:
    access_token = _extract_access_token()
    if not access_token:
        return None, ({"error": "Missing bearer token."}, 401)
    user_id = get_user_id_from_token(access_token)
    if not user_id:
        return None, ({"error": "Invalid or expired token."}, 401)
    return user_id, None


def _load_profile_photo_inputs(user_id: str) -> tuple[dict, bytes, str]:
    user_settings = get_user_model_settings(user_id)
    profile_photo_path = str(user_settings.get("profile_photo_path") or "").strip()
    if not profile_photo_path:
        raise ValueError("Profile photo is required before generating outfit previews.")

    profile_photo_bytes = download_photo_bytes(profile_photo_path)
    if not profile_photo_bytes:
        raise ValueError("Profile photo could not be loaded. Please upload it again.")

    profile_photo_mime = mimetypes.guess_type(profile_photo_path)[0] or "image/jpeg"
    return user_settings, profile_photo_bytes, profile_photo_mime


def _load_item_reference_images(items: list[dict]) -> tuple[list[tuple[bytes, str]], list[str]]:
    reference_images: list[tuple[bytes, str]] = []
    missing_items: list[str] = []
    for item in items:
        image_path = str(item.get("image_path") or "").strip()
        if not image_path:
            missing_items.append(str(item.get("name") or "Unnamed item"))
            continue
        image_bytes = download_photo_bytes(image_path)
        if not image_bytes:
            missing_items.append(str(item.get("name") or "Unnamed item"))
            continue
        reference_images.append((image_bytes, mimetypes.guess_type(image_path)[0] or "image/jpeg"))
    return reference_images, missing_items


@api_bp.post("/analyze")
@limiter.limit("5 per minute", key_func=_rate_limit_key)
def analyze_outfit():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    image = request.files.get("image")
    if image is None or image.filename == "":
        return jsonify({"error": "Image file is required."}), 400
    if not settings.GEMINI_API_KEY:
        return jsonify({"error": "Outfit analysis is temporarily unavailable."}), 503

    try:
        storage_path = upload_photo_for_user(image, user_id)
        photo_row = create_photo_record(user_id, storage_path)
        model_used = (request.form.get("analysis_model") or settings.GEMINI_MODEL).strip() or settings.GEMINI_MODEL
        job_row = create_analysis_job(user_id, photo_id=str(photo_row["id"]), model_used=model_used)
        enqueue_analysis_job_processing(str(job_row["id"]))
        return jsonify(
            {
                "job_id": job_row["id"],
                "status": job_row.get("status", "pending"),
                "analysis_model": job_row.get("model_used") or model_used,
                "photo_id": photo_row["id"],
                "created_at": job_row.get("created_at"),
            }
        ), 202
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except GeminiNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except requests.HTTPError as exc:
        return jsonify({"error": f"Model request failed: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Analyze failed: {exc}"}), 500


@api_bp.get("/analyze/jobs/<job_id>")
def get_analyze_job(job_id: str):
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        job_row = get_analysis_job_for_user(user_id, job_id)
        if not job_row:
            return jsonify({"error": "Job not found."}), 404

        result = None
        if job_row.get("status") == "completed" and job_row.get("job_type") == "analysis" and job_row.get("photo_id"):
            result = build_analysis_result_for_photo(user_id, str(job_row["photo_id"]))

        updated_at = job_row.get("completed_at") or job_row.get("created_at")
        return jsonify(
            {
                "job_id": job_row.get("id"),
                "status": job_row.get("status"),
                "error_message": job_row.get("error_message"),
                "result": result,
                "created_at": job_row.get("created_at"),
                "completed_at": job_row.get("completed_at"),
                "updated_at": updated_at,
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Analyze job lookup failed: {exc}"}), 500


@api_bp.post("/similar")
def find_similar_items():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400
    items = payload.get("items", [])
    if not isinstance(items, list):
        return jsonify({"error": "items must be a list."}), 400

    results = []
    for item in items:
        results.append(
            {
                "item": str((item or {}).get("name") or "Unknown item"),
                "store": "Example Fashion Store",
                "price": "$49.99",
                "availability": "In stock",
                "delivery_timeline": "3-5 business days",
            }
        )
    return jsonify({"user_id": user_id, "results": results}), 200


@api_bp.post("/outfits/compose")
def compose_outfit():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400
    item_ids = payload.get("item_ids", [])
    style_label = str(payload.get("style_label") or "Composed outfit")
    if not isinstance(item_ids, list) or not item_ids:
        return jsonify({"error": "item_ids must be a non-empty list."}), 400
    if not settings.GEMINI_API_KEY:
        return jsonify({"error": "Outfit generation is temporarily unavailable."}), 503

    try:
        items = get_items_for_user(user_id, [str(item_id) for item_id in item_ids])
        if len(items) != len(item_ids):
            return jsonify({"error": "One or more items could not be found."}), 404

        user_settings, profile_photo_bytes, profile_photo_mime = _load_profile_photo_inputs(user_id)
        reference_images, missing_items = _load_item_reference_images(items)
        if missing_items:
            return jsonify({"error": f"Missing item images for: {', '.join(missing_items)}"}), 400

        generated_data_uri, usage_summary = generate_outfitsme_image_with_gemini(
            reference_image_bytes=profile_photo_bytes,
            reference_mime_type=profile_photo_mime,
            outfit_style=style_label,
            outfit_items=items,
            outfit_item_reference_images=reference_images,
            profile_gender=user_settings.get("profile_gender"),
            profile_age=user_settings.get("profile_age"),
            return_usage=True,
        )
        if not generated_data_uri:
            return jsonify({"error": "Outfit generation returned no image."}), 502

        stored = save_generated_outfit_image(user_id, uuid4().hex, generated_data_uri)
        photo_row = create_photo_record(user_id, str(stored["storage_path"]))
        job_row = create_completed_ai_job(
            user_id,
            photo_id=str(photo_row["id"]),
            model_used=str((usage_summary or {}).get("model") or settings.GEMINI_IMAGE_MODEL),
            job_type="custom_outfit",
            tokens_input=int((usage_summary or {}).get("input_tokens") or 0),
            tokens_output=int((usage_summary or {}).get("output_tokens") or 0),
        )
        outfit_row = create_outfit_with_items(
            user_id,
            photo_id=str(photo_row["id"]),
            style_label=style_label,
            item_ids=[str(item["id"]) for item in items],
            job_id=str(job_row["id"]),
            generated_image_path=str(stored["storage_path"]),
        )
        return jsonify(
            {
                "photo_id": photo_row["id"],
                "outfit_id": outfit_row["id"],
                "style_label": outfit_row.get("style_label"),
                "image_url": stored.get("image_url"),
                "image_storage_path": stored.get("storage_path"),
                "ai_usage": usage_summary or {},
            }
        ), 200
    except (SupabaseNotConfiguredError, GeminiNotConfiguredError) as exc:
        return jsonify({"error": str(exc)}), 500
    except requests.HTTPError as exc:
        return jsonify({"error": f"Outfit generation failed: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Outfit compose failed: {exc}"}), 500


@api_bp.get("/wardrobe")
def get_wardrobe():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        page, page_size = _parse_pagination_params()
        wardrobe = list_wardrobe(user_id, limit=page_size + 1, offset=(page - 1) * page_size)
        has_more = len(wardrobe) > page_size
        return jsonify({"wardrobe": wardrobe[:page_size], "page": page, "page_size": page_size, "has_more": has_more}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe lookup failed: {exc}"}), 500


@api_bp.get("/history")
def get_history():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        history = list_analysis_history(user_id)
        return jsonify({"history": history}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"History lookup failed: {exc}"}), 500


@api_bp.route("/delete-wardrobe", methods=["DELETE"])
def delete_wardrobe_entries():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    outfit_ids = payload.get("outfit_ids", [])
    if not isinstance(outfit_ids, list):
        return jsonify({"error": "outfit_ids must be a list."}), 400

    try:
        result = delete_wardrobe_outfits(user_id, [str(outfit_id) for outfit_id in outfit_ids])
        return jsonify(result), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe bulk delete failed: {exc}"}), 500


@api_bp.delete("/wardrobe/<outfit_id>")
def delete_wardrobe_entry(outfit_id: str):
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        deleted = delete_wardrobe_outfit(user_id, outfit_id)
        if not deleted:
            return jsonify({"error": "Wardrobe item not found."}), 404
        return jsonify({"deleted": True, "outfit_id": outfit_id}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe delete failed: {exc}"}), 500


@api_bp.put("/wardrobe/<outfit_id>")
def update_wardrobe_entry(outfit_id: str):
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    style_label = str(payload.get("style_label") or "").strip()
    if not style_label:
        return jsonify({"error": "style_label is required."}), 400

    try:
        updated = update_wardrobe_outfit_style_label(user_id, outfit_id, style_label)
        if not updated:
            return jsonify({"error": "Wardrobe item not found."}), 404
        return jsonify({"updated": True, "outfit": updated}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe update failed: {exc}"}), 500


@api_bp.get("/wardrobe/<photo_id>/details")
def get_wardrobe_details(photo_id: str):
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    outfit_index_raw = request.args.get("outfit_index")
    outfit_index = None
    if outfit_index_raw not in {None, ""}:
        try:
            outfit_index = int(outfit_index_raw)
        except ValueError:
            return jsonify({"error": "outfit_index must be an integer."}), 400

    try:
        details = get_wardrobe_photo_details(user_id, photo_id, outfit_index=outfit_index)
        if not details:
            return jsonify({"error": "Outfit details not found."}), 404
        return jsonify({"photo_id": photo_id, "details": details}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe details lookup failed: {exc}"}), 500


@api_bp.post("/wardrobe/<photo_id>/outfitsme")
@limiter.limit("3 per minute", key_func=_rate_limit_key)
def generate_outfitsme_preview(photo_id: str):
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400
    outfit_index_raw = payload.get("outfit_index")
    try:
        outfit_index = int(outfit_index_raw) if outfit_index_raw not in {None, ""} else None
    except (TypeError, ValueError):
        return jsonify({"error": "outfit_index must be an integer."}), 400
    if not settings.GEMINI_API_KEY:
        return jsonify({"error": "Outfit generation is temporarily unavailable."}), 503

    try:
        selection = get_outfit_for_generation(user_id, photo_id, outfit_index=outfit_index)
        if not selection:
            return jsonify({"error": "Outfit details not found."}), 404

        selected_outfit = selection["outfit"]
        if str(selected_outfit.get("source_type") or "").strip().lower() != "photo_analysis":
            return jsonify({"error": "Try-on previews are only available for photo analysis outfits."}), 400
        user_settings, profile_photo_bytes, profile_photo_mime = _load_profile_photo_inputs(user_id)
        reference_images, missing_items = _load_item_reference_images(selected_outfit.get("items") or [])
        if missing_items:
            return jsonify({"error": f"Missing item images for: {', '.join(missing_items)}"}), 400

        generated_data_uri, usage_summary = generate_outfitsme_image_with_gemini(
            reference_image_bytes=profile_photo_bytes,
            reference_mime_type=profile_photo_mime,
            outfit_style=str(selected_outfit.get("style") or "Outfit"),
            outfit_items=selected_outfit.get("items") or [],
            outfit_item_reference_images=reference_images,
            profile_gender=user_settings.get("profile_gender"),
            profile_age=user_settings.get("profile_age"),
            return_usage=True,
        )
        if not generated_data_uri:
            return jsonify({"error": "Outfit generation returned no image."}), 502

        stored = save_generated_outfit_image(user_id, str(selected_outfit["outfit_id"]), generated_data_uri)
        photo_row = create_photo_record(user_id, str(stored["storage_path"]))
        job_row = create_completed_ai_job(
            user_id,
            photo_id=str(photo_row["id"]),
            model_used=str((usage_summary or {}).get("model") or settings.GEMINI_IMAGE_MODEL),
            job_type="try_on",
            tokens_input=int((usage_summary or {}).get("input_tokens") or 0),
            tokens_output=int((usage_summary or {}).get("output_tokens") or 0),
        )
        item_ids = [str(item.get("id")) for item in (selected_outfit.get("items") or []) if item.get("id")]
        outfit_row = create_outfit_with_items(
            user_id,
            photo_id=str(photo_row["id"]),
            style_label=str(selected_outfit.get("style") or "Outfit"),
            item_ids=item_ids,
            job_id=str(job_row["id"]),
            generated_image_path=str(stored["storage_path"]),
        )
        return jsonify(
            {
                "photo_id": photo_row["id"],
                "outfit_index": 0,
                "outfitsme_image_url": stored.get("image_url"),
                "outfitsme_storage_path": stored.get("storage_path"),
                "saved_outfit": {
                    "outfit_id": outfit_row["id"],
                    "photo_id": photo_row["id"],
                    "outfit_index": 0,
                    "style": outfit_row.get("style_label"),
                    "source_type": "outfitsme_generated",
                },
            }
        ), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except (SupabaseNotConfiguredError, GeminiNotConfiguredError) as exc:
        return jsonify({"error": str(exc)}), 500
    except requests.HTTPError as exc:
        return jsonify({"error": f"Outfit generation failed: {exc}"}), 502
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"OutfitsMe generation failed: {exc}"}), 500


@api_bp.get("/items")
def get_items():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        page, page_size = _parse_pagination_params()
        items = list_user_items(user_id, limit=page_size + 1, offset=(page - 1) * page_size)
        has_more = len(items) > page_size
        return jsonify({"user_id": user_id, "items": items[:page_size], "page": page, "page_size": page_size, "has_more": has_more}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Items lookup failed: {exc}"}), 500


@api_bp.get("/stats")
def get_stats():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        return jsonify({"user_id": user_id, "stats": get_dashboard_stats(user_id)}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Stats lookup failed: {exc}"}), 500


@api_bp.get("/limits")
def get_limits():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    access_payload = _build_analysis_access_payload(user_id)
    return jsonify(
        {
            "user_id": user_id,
            "analysis": access_payload,
            "rate_limit": {"analyze": "5 per minute"},
            "access": {"user_role": access_payload["user_role"], "is_admin": is_admin_role(access_payload["user_role"])},
        }
    ), 200


@api_bp.get("/models")
def get_models():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    access_payload = _build_analysis_access_payload(user_id)
    available = bool(settings.GEMINI_API_KEY)
    model = {
        "id": settings.GEMINI_MODEL,
        "label": "Gemini 2.5 Flash",
        "supports_image": True,
        "available": available,
        "unavailable_reason": None if available else "GEMINI_API_KEY is not configured.",
    }
    return jsonify({"models": [model], "preferred_model": settings.GEMINI_MODEL, "user_role": access_payload["user_role"]}), 200


@api_bp.get("/settings/preferences")
def get_settings_preferences():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        current_settings = get_user_model_settings(user_id)
        return jsonify(
            {
                "settings": {
                    "user_role": current_settings.get("user_role", "trial"),
                    "profile_gender": current_settings.get("profile_gender", ""),
                    "profile_age": current_settings.get("profile_age"),
                    "profile_photo_url": get_signed_image_url(current_settings.get("profile_photo_path")),
                    "enable_outfit_image_generation": bool(current_settings.get("enable_outfit_image_generation")),
                    "enable_online_store_search": bool(current_settings.get("enable_online_store_search")),
                    "enable_accessory_analysis": bool(current_settings.get("enable_accessory_analysis")),
                }
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings lookup failed: {exc}"}), 500


@api_bp.put("/settings/preferences")
def update_settings_preferences():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400

    try:
        updated = upsert_user_model_settings(user_id, payload)
        return jsonify({"settings": updated}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings update failed: {exc}"}), 500


@api_bp.get("/settings/costs")
def get_settings_costs():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    try:
        return jsonify({"costs": get_user_cost_summary(user_id, _month_start_utc())}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Costs lookup failed: {exc}"}), 500


@api_bp.post("/settings/profile-photo")
def upload_profile_photo():
    user_id, error = _require_user()
    if error:
        return jsonify(error[0]), error[1]

    image = request.files.get("image")
    if image is None or image.filename == "":
        return jsonify({"error": "Image file is required."}), 400

    try:
        return jsonify(save_user_profile_photo(user_id, image)), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Profile photo upload failed: {exc}"}), 500
