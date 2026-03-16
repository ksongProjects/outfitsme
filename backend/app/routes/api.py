import requests
import mimetypes
from datetime import datetime, timedelta, timezone
from time import monotonic, sleep
from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from app.services.access_control import has_unlimited_ai_access, is_admin_role, normalize_user_role
from app.services.analysis_jobs_service import enqueue_analysis_job_processing
from app.config import settings
from app.extensions import limiter
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    generate_outfitsme_image_with_gemini,
)
from app.services.models_service import build_model_availability, get_preferred_model
from app.services.secrets_service import SettingsEncryptionError
from app.services.supabase_service import (
    compose_outfit_from_items,
    create_analysis_job,
    create_outfitsme_generated_outfit,
    create_photo_record,
    delete_wardrobe_outfit,
    download_photo_bytes,
    update_wardrobe_outfit_style_label,
    get_dashboard_stats,
    get_analysis_job_for_user,
    get_signed_image_url,
    list_analysis_history,
    get_wardrobe_photo_details,
    get_user_model_settings,
    get_trial_usage_snapshot,
    list_user_items,
    SupabaseNotConfiguredError,
    get_user_created_at_from_token,
    get_user_id_from_token,
    get_user_analysis_job_count_since,
    get_user_monthly_composed_outfit_count,
    get_user_cost_summary,
    get_user_generated_image_count_since,
    save_user_profile_photo,
    attach_generated_image_to_outfit,
    save_generated_outfit_image,
    list_wardrobe,
    upsert_user_model_settings,
    upload_photo_for_user,
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


def _current_month_window_utc() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    month_start_dt = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        next_month_start_dt = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month_start_dt = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return month_start_dt.isoformat(), next_month_start_dt.isoformat()


def _parse_iso_datetime(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _current_day_window_utc() -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    day_start_dt = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    next_day_start_dt = day_start_dt + timedelta(days=1)
    return day_start_dt.isoformat(), next_day_start_dt.isoformat(), now


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


def _build_trial_usage(user_id: str, access_token: str) -> dict:
    day_start_iso, next_day_start_iso, _ = _current_day_window_utc()
    usage_snapshot = get_trial_usage_snapshot(user_id, day_start_iso) or {}
    user_role = normalize_user_role(usage_snapshot.get("user_role"))
    if not user_role:
        user_settings = get_user_model_settings(user_id)
        user_role = normalize_user_role(user_settings.get("user_role"))
    if has_unlimited_ai_access(user_role):
        return {
            "user_role": user_role,
            "trial_active": False,
            "trial_started_at_utc": None,
            "trial_ends_at_utc": None,
            "trial_days_total": settings.TRIAL_DAYS,
            "trial_days_remaining": None,
            "daily_limit": None,
            "used_today": 0,
            "remaining_today": None,
            "today_window_start_utc": None,
            "next_reset_utc": None,
            "analysis_actions_today": 0,
            "outfit_generations_today": 0,
            "access_mode": "unlimited"
        }

    created_at = _parse_iso_datetime(str(usage_snapshot.get("user_created_at") or ""))
    if created_at is None:
        created_at = _parse_iso_datetime(get_user_created_at_from_token(access_token))
    if created_at is None:
        created_at = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    trial_ends_at = created_at + timedelta(days=max(settings.TRIAL_DAYS, 0))
    trial_active = now < trial_ends_at if settings.TRIAL_DAYS > 0 else False
    analysis_actions = int(usage_snapshot.get("analysis_actions_today") or 0)
    outfit_generation_actions = int(usage_snapshot.get("outfit_generations_today") or 0)
    if not usage_snapshot:
        analysis_actions = get_user_analysis_job_count_since(
            user_id,
            day_start_iso,
            statuses=["completed"]
        )
        outfit_generation_actions = get_user_generated_image_count_since(user_id, day_start_iso, "outfits")
    used_today = analysis_actions + outfit_generation_actions
    daily_limit = max(settings.TRIAL_DAILY_AI_ACTION_LIMIT, 0)
    remaining_today = None if daily_limit <= 0 else max(daily_limit - used_today, 0)
    days_remaining = max((trial_ends_at.date() - now.date()).days, 0) if trial_active else 0
    return {
        "user_role": user_role,
        "trial_active": trial_active,
        "trial_started_at_utc": created_at.isoformat(),
        "trial_ends_at_utc": trial_ends_at.isoformat(),
        "trial_days_total": settings.TRIAL_DAYS,
        "trial_days_remaining": days_remaining,
        "daily_limit": daily_limit,
        "used_today": used_today,
        "remaining_today": remaining_today,
        "today_window_start_utc": day_start_iso,
        "next_reset_utc": next_day_start_iso,
        "analysis_actions_today": analysis_actions,
        "outfit_generations_today": outfit_generation_actions,
        "access_mode": "trial"
    }


def _trial_limit_response(usage: dict) -> tuple[dict, int]:
    if not usage.get("trial_active"):
        return (
            {
                "error": "Your 14-day trial has ended.",
                **usage
            },
            403
        )
    return (
        {
            "error": "Daily trial limit reached.",
            **usage
        },
        429
    )


@api_bp.post("/analyze")
@limiter.limit("5 per minute", key_func=_rate_limit_key)
def analyze_outfit():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    image = request.files.get("image")

    if image is None or image.filename == "":
        return jsonify({"error": "Image file is required."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        usage = _build_trial_usage(user_id, access_token)
        if usage.get("access_mode") == "trial" and not usage["trial_active"]:
            payload, status_code = _trial_limit_response(usage)
            return jsonify(payload), status_code
        if usage.get("access_mode") == "trial" and usage["daily_limit"] > 0 and usage["used_today"] >= usage["daily_limit"]:
            payload, status_code = _trial_limit_response(usage)
            return jsonify(payload), status_code

        image_bytes = image.read()
        if not image_bytes:
            return jsonify({"error": "Image file is empty."}), 400

        mime_type = image.mimetype or "image/jpeg"

        requested_model = (request.form.get("analysis_model") or "").strip()
        user_settings = get_user_model_settings(user_id)
        available_models = build_model_availability(user_settings)
        chosen_model_id = requested_model or get_preferred_model(user_settings)
        model_entry = next((model for model in available_models if model["id"] == chosen_model_id), None)
        if not model_entry:
            return jsonify({"error": f"Unknown analysis model: {chosen_model_id}"}), 400
        if not model_entry.get("available"):
            return jsonify({"error": model_entry.get("unavailable_reason") or "Selected model is unavailable."}), 400

        image.stream.seek(0)
        storage_path = upload_photo_for_user(image, user_id)
        photo_row = create_photo_record(user_id, storage_path)
        job_row = create_analysis_job(
            user_id,
            photo_id=photo_row["id"],
            storage_path=storage_path,
            mime_type=mime_type,
            analysis_model=chosen_model_id
        )
        enqueue_analysis_job_processing(job_row["id"])

        return jsonify(
            {
                "job_id": job_row["id"],
                "status": job_row.get("status", "queued"),
                "analysis_model": chosen_model_id,
                "photo_id": photo_row["id"],
                "created_at": job_row.get("created_at")
            }
        ), 202
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except GeminiNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except requests.HTTPError as exc:
        error_text = str(exc)
        if "Unable to process input image" in error_text:
            return (
                jsonify(
                    {
                        "error": (
                            "We couldn't process this image. It may be corrupted or unsupported. "
                            "Please try another JPG, PNG, or WEBP file."
                        )
                    }
                ),
                400
            )
        if "429" in error_text or "quota" in error_text.lower():
            return jsonify({"error": "AI service quota/rate limit reached. Please try again shortly."}), 429
        return jsonify({"error": f"Model request failed: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": f"Model response parse failed: {exc}"}), 502
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Analyze failed: {exc}"}), 500


@api_bp.get("/analyze/jobs/<job_id>")
def get_analyze_job(job_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        wait_seconds_raw = request.args.get("wait_seconds", "0")
        try:
            wait_seconds = int(wait_seconds_raw)
        except ValueError:
            wait_seconds = 0
        wait_seconds = max(0, min(wait_seconds, 20))

        deadline = monotonic() + wait_seconds
        job_row = None
        while True:
            job_row = get_analysis_job_for_user(user_id, job_id)
            if not job_row:
                return jsonify({"error": "Job not found."}), 404
            if job_row.get("status") == "queued":
                enqueue_analysis_job_processing(job_id)
            if job_row.get("status") in {"completed", "failed"}:
                break
            if monotonic() >= deadline:
                break
            sleep(1)

        return jsonify(
            {
                "job_id": job_row.get("id"),
                "status": job_row.get("status"),
                "error_message": job_row.get("error_message"),
                "result": job_row.get("result_json"),
                "created_at": job_row.get("created_at"),
                "started_at": job_row.get("started_at"),
                "completed_at": job_row.get("completed_at"),
                "updated_at": job_row.get("updated_at")
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Analyze job lookup failed: {exc}"}), 500


@api_bp.post("/similar")
def find_similar_items():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    payload = request.get_json(silent=True) or {}
    items = payload.get("items", [])

    if not isinstance(items, list):
        return jsonify({"error": "items must be a list."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401

    results = []
    for item in items:
        item_name = item.get("name", "Unknown item")
        results.append(
            {
                "item": item_name,
                "store": "Example Fashion Store",
                "price": "$49.99",
                "availability": "In stock",
                "delivery_timeline": "3-5 business days"
            }
        )

    return jsonify({"user_id": user_id, "results": results}), 200


@api_bp.post("/outfits/compose")
def compose_outfit():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400

    item_ids = payload.get("item_ids", [])
    style_label = payload.get("style_label", "Composed outfit")
    if not isinstance(item_ids, list):
        return jsonify({"error": "item_ids must be a list."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        month_start_iso, _ = _current_month_window_utc()
        monthly_custom_outfit_count = get_user_monthly_composed_outfit_count(user_id, month_start_iso)
        if monthly_custom_outfit_count >= settings.MONTHLY_CUSTOM_OUTFIT_LIMIT:
            return jsonify(
                {
                    "error": "Monthly custom outfit generation limit reached.",
                    "monthly_limit": settings.MONTHLY_CUSTOM_OUTFIT_LIMIT,
                    "used_this_month": monthly_custom_outfit_count,
                    "remaining_this_month": 0
                }
            ), 429

        user_settings = get_user_model_settings(user_id)
        if not bool(user_settings.get("enable_outfit_image_generation")):
            return jsonify(
                {
                    "error": (
                        "Outfit image generation is off. Enable it in "
                        "Settings > Features after confirming Google billing is enabled."
                    )
                }
            ), 400

        profile_photo_path = str(user_settings.get("profile_photo_path") or "").strip()
        if not profile_photo_path:
            return jsonify({"error": "Profile photo is required to create a custom outfit preview."}), 400

        if not settings.GEMINI_API_KEY:
            return jsonify({"error": "OutfitsMe generation is temporarily unavailable."}), 503

        reference_photo_bytes = download_photo_bytes(profile_photo_path)
        if not reference_photo_bytes:
            return jsonify({"error": "Profile photo could not be loaded. Please upload it again."}), 400
        reference_mime_type = mimetypes.guess_type(profile_photo_path)[0] or "image/jpeg"

        result = compose_outfit_from_items(user_id, item_ids=item_ids, style_label=style_label)
        item_reference_images: list[tuple[bytes, str]] = []
        seen_item_paths: set[str] = set()
        for item in (result.get("items") or []):
            if len(item_reference_images) >= max(0, settings.ITEM_IMAGE_MAX):
                break
            if not isinstance(item, dict):
                continue
            image_path = str(item.get("image_path") or "").strip()
            if not image_path or image_path in seen_item_paths:
                continue
            seen_item_paths.add(image_path)
            item_image_bytes = download_photo_bytes(image_path)
            if not item_image_bytes:
                continue
            item_reference_images.append(
                (
                    item_image_bytes,
                    mimetypes.guess_type(image_path)[0] or "image/jpeg",
                )
            )

        generated_data_uri, usage_summary = generate_outfitsme_image_with_gemini(
            reference_image_bytes=reference_photo_bytes,
            reference_mime_type=reference_mime_type,
            outfit_style=result.get("style_label") or style_label or "Composed outfit",
            outfit_items=result.get("items") or [],
            outfit_item_reference_images=item_reference_images,
            profile_gender=user_settings.get("profile_gender"),
            profile_age=user_settings.get("profile_age"),
            return_usage=True
        )
        if not generated_data_uri:
            return jsonify({"error": "Custom outfit preview generation returned no image."}), 502

        if generated_data_uri and result.get("outfit_id"):
            stored = save_generated_outfit_image(
                user_id,
                str(result.get("outfit_id")),
                generated_data_uri
            )
            attach_generated_image_to_outfit(
                user_id,
                str(result.get("outfit_id")),
                stored.get("storage_path") or ""
            )
            result["image_url"] = stored.get("image_url")
            result["image_storage_path"] = stored.get("storage_path")
            result["ai_usage"] = usage_summary

        return jsonify({"user_id": user_id, **result}), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Compose outfit failed: {exc}"}), 500


@api_bp.get("/wardrobe")
def get_wardrobe():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        page, page_size = _parse_pagination_params()
        wardrobe = list_wardrobe(user_id, limit=page_size + 1, offset=(page - 1) * page_size)
        has_more = len(wardrobe) > page_size
        return jsonify(
            {
                "user_id": user_id,
                "wardrobe": wardrobe[:page_size],
                "page": page,
                "page_size": page_size,
                "has_more": has_more
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe lookup failed: {exc}"}), 500


@api_bp.get("/history")
def get_history():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        history = list_analysis_history(user_id)
        return jsonify({"user_id": user_id, "history": history}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"History lookup failed: {exc}"}), 500


@api_bp.delete("/wardrobe/<outfit_id>")
def delete_wardrobe_entry(outfit_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        deleted = delete_wardrobe_outfit(user_id, outfit_id)
        if not deleted:
            return jsonify({"error": "Wardrobe item not found."}), 404

        return jsonify({"deleted": True, "outfit_id": outfit_id}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe delete failed: {exc}"}), 500


@api_bp.put("/wardrobe/<outfit_id>")
def update_wardrobe_entry(outfit_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    payload = request.get_json(silent=True) or {}
    style_label = payload.get("style_label", "")
    if not str(style_label or "").strip():
        return jsonify({"error": "style_label is required."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        updated = update_wardrobe_outfit_style_label(user_id, outfit_id, style_label)
        if not updated:
            return jsonify({"error": "Wardrobe item not found."}), 404

        return jsonify({"updated": True, "outfit": updated}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe update failed: {exc}"}), 500


@api_bp.get("/wardrobe/<photo_id>/details")
def get_wardrobe_details(photo_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        outfit_index_raw = request.args.get("outfit_index")
        outfit_index = None
        if outfit_index_raw is not None and outfit_index_raw != "":
            outfit_index = int(outfit_index_raw)
            if outfit_index < 0:
                return jsonify({"error": "outfit_index must be >= 0"}), 400

        details = get_wardrobe_photo_details(user_id, photo_id, outfit_index=outfit_index)
        if not details:
            return jsonify({"error": "Outfit details not found."}), 404

        if outfit_index is not None and details.get("selected_outfit") is None:
            return jsonify({"error": "Requested outfit index not found for this photo."}), 404

        return jsonify({"photo_id": photo_id, "details": details}), 200
    except ValueError:
        return jsonify({"error": "outfit_index must be an integer."}), 400
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Wardrobe details lookup failed: {exc}"}), 500


@api_bp.post("/wardrobe/<photo_id>/outfitsme")
@limiter.limit("3 per minute", key_func=_rate_limit_key)
def generate_outfitsme_preview(photo_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    payload = request.get_json(silent=True) or {}
    outfit_index_raw = payload.get("outfit_index")

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        outfit_index = None
        if outfit_index_raw is not None and str(outfit_index_raw).strip() != "":
            outfit_index = int(outfit_index_raw)
            if outfit_index < 0:
                return jsonify({"error": "outfit_index must be >= 0"}), 400

        details = get_wardrobe_photo_details(user_id, photo_id, outfit_index=outfit_index)
        selected_outfit = details.get("selected_outfit") if isinstance(details, dict) else None
        if not details or not selected_outfit:
            return jsonify({"error": "Outfit details not found."}), 404

        user_settings = get_user_model_settings(user_id)
        if not bool(user_settings.get("enable_outfit_image_generation")):
            return jsonify(
                {
                    "error": (
                        "OutfitsMe image generation is disabled. Enable it in "
                        "Settings > Features after confirming Google billing is enabled."
                    )
                }
            ), 400
        profile_photo_path = str(user_settings.get("profile_photo_path") or "").strip()
        if not profile_photo_path:
            return jsonify({"error": "Reference photo is required. Upload one in Settings > Profile to use OutfitsMe."}), 400

        reference_photo_bytes = download_photo_bytes(profile_photo_path)
        if not reference_photo_bytes:
            return jsonify({"error": "Reference photo could not be loaded. Please upload it again."}), 400
        reference_mime_type = mimetypes.guess_type(profile_photo_path)[0] or "image/jpeg"

        usage = _build_trial_usage(user_id, access_token)
        if usage.get("access_mode") == "trial" and not usage["trial_active"]:
            payload, status_code = _trial_limit_response(usage)
            return jsonify(payload), status_code
        if usage.get("access_mode") == "trial" and usage["daily_limit"] > 0 and usage["used_today"] >= usage["daily_limit"]:
            payload, status_code = _trial_limit_response(usage)
            return jsonify(payload), status_code

        item_reference_images: list[tuple[bytes, str]] = []
        seen_item_paths: set[str] = set()
        for item in (selected_outfit.get("items") or []):
            if len(item_reference_images) >= max(0, settings.ITEM_IMAGE_MAX):
                break
            if not isinstance(item, dict):
                continue
            image_path = str(item.get("image_path") or "").strip()
            if not image_path or image_path in seen_item_paths:
                continue
            seen_item_paths.add(image_path)
            item_image_bytes = download_photo_bytes(image_path)
            if not item_image_bytes:
                continue
            item_reference_images.append(
                (
                    item_image_bytes,
                    mimetypes.guess_type(image_path)[0] or "image/jpeg",
                )
            )

        if not settings.GEMINI_API_KEY:
            return jsonify(
                {
                    "error": "OutfitsMe generation is temporarily unavailable."
                }
            ), 503
        generated_data_uri, usage_summary = generate_outfitsme_image_with_gemini(
            reference_image_bytes=reference_photo_bytes,
            reference_mime_type=reference_mime_type,
            outfit_style=selected_outfit.get("style") or "Outfit",
            outfit_items=selected_outfit.get("items") or [],
            outfit_item_reference_images=item_reference_images,
            profile_gender=user_settings.get("profile_gender"),
            profile_age=user_settings.get("profile_age"),
            return_usage=True
        )
        if not generated_data_uri:
            return jsonify({"error": "OutfitsMe generation returned no image."}), 502

        outfit_row_id = selected_outfit.get("outfit_id") or f"{photo_id}-{selected_outfit.get('outfit_index', 0)}"
        stored = save_generated_outfit_image(user_id, str(outfit_row_id), generated_data_uri)
        source_outfit_id = str(selected_outfit.get("outfit_id")) if selected_outfit.get("outfit_id") else None
        if selected_outfit.get("outfit_id"):
            attach_generated_image_to_outfit(
                user_id,
                str(selected_outfit.get("outfit_id")),
                stored.get("storage_path") or ""
            )
        generated_entry = create_outfitsme_generated_outfit(
            user_id,
            source_photo_id=photo_id,
            source_outfit_id=source_outfit_id,
            source_outfit_index=int(selected_outfit.get("outfit_index") or 0),
            style_label=selected_outfit.get("style") or "Outfit",
            items=selected_outfit.get("items") or [],
            generated_storage_path=stored.get("storage_path") or "",
            usage_summary=usage_summary
        )
        return jsonify(
            {
                "photo_id": photo_id,
                "outfit_index": selected_outfit.get("outfit_index"),
                "outfitsme_image_url": stored.get("image_url"),
                "outfitsme_storage_path": stored.get("storage_path"),
                "saved_outfit": generated_entry
            }
        ), 200
    except ValueError:
        return jsonify({"error": "outfit_index must be an integer."}), 400
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except GeminiNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except requests.HTTPError as exc:
        return jsonify({"error": f"OutfitsMe model request failed: {exc}"}), 502
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"OutfitsMe generation failed: {exc}"}), 500


@api_bp.get("/items")
def get_items():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        page, page_size = _parse_pagination_params()
        items = list_user_items(user_id, limit=page_size + 1, offset=(page - 1) * page_size)
        has_more = len(items) > page_size
        return jsonify(
            {
                "user_id": user_id,
                "items": items[:page_size],
                "page": page,
                "page_size": page_size,
                "has_more": has_more
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Items lookup failed: {exc}"}), 500


@api_bp.get("/stats")
def get_stats():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        stats = get_dashboard_stats(user_id)
        return jsonify({"user_id": user_id, "stats": stats}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Stats lookup failed: {exc}"}), 500


@api_bp.get("/limits")
def get_limits():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        usage = _build_trial_usage(user_id, access_token)
        return jsonify(
            {
                "user_id": user_id,
                "analysis": usage,
                "rate_limit": {"analyze": "5 per minute"},
                "access": {
                    "user_role": usage.get("user_role", "trial"),
                    "is_admin": is_admin_role(usage.get("user_role"))
                }
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Limits lookup failed: {exc}"}), 500


@api_bp.get("/models")
def get_models():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        model_settings = get_user_model_settings(user_id)
        models = build_model_availability(model_settings)
        preferred_model = get_preferred_model(model_settings)
        image_ready = [model for model in models if model.get("supports_image") and model.get("available")]
        return jsonify(
            {
                "models": models,
                "preferred_model": preferred_model,
                "image_ready_models": image_ready,
                "user_role": model_settings.get("user_role", "trial")
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Model lookup failed: {exc}"}), 500


@api_bp.get("/settings/preferences")
def get_settings_preferences():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        current_settings = get_user_model_settings(user_id)
        return jsonify(
            {
                "settings": {
                    "user_role": current_settings.get("user_role", "trial"),
                    "profile_gender": current_settings.get("profile_gender", ""),
                    "profile_age": current_settings.get("profile_age"),
                    "profile_photo_url": (
                        get_signed_image_url(current_settings.get("profile_photo_path"), expires_in_seconds=3600)
                        if current_settings.get("profile_photo_path")
                        else None
                    ),
                    "enable_outfit_image_generation": bool(current_settings.get("enable_outfit_image_generation")),
                    "enable_online_store_search": bool(current_settings.get("enable_online_store_search")),
                    "enable_accessory_analysis": bool(current_settings.get("enable_accessory_analysis"))
                }
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings lookup failed: {exc}"}), 500


@api_bp.put("/settings/preferences")
def update_settings_preferences():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        updated = upsert_user_model_settings(user_id, payload)
        return jsonify({"settings": updated}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings update failed: {exc}"}), 500


@api_bp.get("/settings/costs")
def get_settings_costs():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401
        month_start_iso, _ = _current_month_window_utc()
        summary = get_user_cost_summary(user_id, month_start_iso)
        return jsonify({"costs": summary}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Costs lookup failed: {exc}"}), 500


@api_bp.post("/settings/profile-photo")
def upload_profile_photo():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    image = request.files.get("image")
    if image is None or image.filename == "":
        return jsonify({"error": "Image file is required."}), 400

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        result = save_user_profile_photo(user_id, image)
        return jsonify(result), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Profile photo upload failed: {exc}"}), 500

