import requests
from datetime import datetime, timezone
from time import monotonic, sleep
from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from app.services.analysis_jobs_service import enqueue_analysis_job_processing
from app.config import settings
from app.extensions import limiter
from app.services.bedrock_service import BedrockNotConfiguredError
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    probe_gemini_connectivity,
)
from app.services.models_service import build_model_availability, get_preferred_model
from app.services.secrets_service import SettingsEncryptionError
from app.services.supabase_service import (
    compose_outfit_from_items,
    create_analysis_job,
    create_photo_record,
    delete_wardrobe_photo,
    delete_wardrobe_outfit,
    get_dashboard_stats,
    get_analysis_job_for_user,
    list_analysis_history,
    get_wardrobe_photo_details,
    get_user_model_settings,
    get_user_model_settings_masked,
    list_user_items,
    SupabaseNotConfiguredError,
    get_supabase_client,
    get_user_id_from_token,
    get_user_monthly_analysis_count,
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


def _build_analysis_usage(user_id: str) -> dict:
    monthly_limit = settings.MONTHLY_ANALYSIS_LIMIT
    month_start_iso, next_month_start_iso = _current_month_window_utc()
    monthly_count = get_user_monthly_analysis_count(user_id, month_start_iso)
    remaining = None if monthly_limit <= 0 else max(monthly_limit - monthly_count, 0)
    return {
        "monthly_limit": monthly_limit,
        "used_this_month": monthly_count,
        "remaining_this_month": remaining,
        "month_start_utc": month_start_iso,
        "next_month_start_utc": next_month_start_iso
    }


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

        usage = _build_analysis_usage(user_id)
        monthly_limit = usage["monthly_limit"]
        monthly_count = usage["used_this_month"]
        if monthly_limit > 0 and monthly_count >= monthly_limit:
                return (
                    jsonify(
                        {
                            "error": "Monthly analysis limit reached.",
                            "monthly_limit": monthly_limit,
                            "used_this_month": monthly_count,
                            "remaining_this_month": usage["remaining_this_month"]
                        }
                    ),
                    429
                )

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
    except BedrockNotConfiguredError as exc:
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

        result = compose_outfit_from_items(user_id, item_ids=item_ids, style_label=style_label)
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

        wardrobe = list_wardrobe(user_id)
        return jsonify({"user_id": user_id, "wardrobe": wardrobe}), 200
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


@api_bp.delete("/history/photos/<photo_id>")
def delete_history_photo(photo_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        deleted = delete_wardrobe_photo(user_id, photo_id)
        if not deleted:
            return jsonify({"error": "Photo not found."}), 404

        return jsonify({"deleted": True, "photo_id": photo_id}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Photo delete failed: {exc}"}), 500


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


@api_bp.get("/items")
def get_items():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        items = list_user_items(user_id)
        return jsonify({"user_id": user_id, "items": items}), 200
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

        usage = _build_analysis_usage(user_id)
        return jsonify(
            {
                "user_id": user_id,
                "analysis": usage,
                "rate_limit": {"analyze": "5 per minute"}
            }
        ), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Limits lookup failed: {exc}"}), 500


@api_bp.get("/diagnostics")
def diagnostics():
    if not settings.DIAGNOSTICS_ENABLED:
        return jsonify({"error": "Not found."}), 404

    checks = {
        "supabase": {"ok": False, "message": ""},
        "gemini": {"ok": False, "message": ""}
    }

    # Supabase: validate URL/key wiring and ability to query app tables.
    try:
        client = get_supabase_client()
        client.table("photos").select("id").limit(1).execute()
        checks["supabase"] = {
            "ok": True,
            "message": "Supabase connection and query succeeded."
        }
    except SupabaseNotConfiguredError as exc:
        checks["supabase"]["message"] = str(exc)
    except Exception as exc:  # noqa: BLE001
        checks["supabase"]["message"] = f"Supabase check failed: {exc}"

    # Gemini: validate key/model and a small text generation call.
    try:
        gemini_info = probe_gemini_connectivity()
        checks["gemini"] = {
            "ok": True,
            "message": "Gemini connectivity check succeeded.",
            **gemini_info
        }
    except GeminiNotConfiguredError as exc:
        checks["gemini"]["message"] = str(exc)
    except requests.HTTPError as exc:
        checks["gemini"]["message"] = f"Gemini check failed: {exc}"
    except Exception as exc:  # noqa: BLE001
        checks["gemini"]["message"] = f"Gemini check failed: {exc}"

    env_summary = {
        "supabase_url_set": bool(settings.SUPABASE_URL),
        "supabase_secret_key_set": bool(settings.SUPABASE_SECRET_KEY),
        "gemini_api_key_set": bool(settings.GEMINI_API_KEY),
        "gemini_model": settings.GEMINI_MODEL,
        "config_env_path": "backend/.env"
    }

    all_ok = checks["supabase"]["ok"] and checks["gemini"]["ok"]
    status_code = 200 if all_ok else 503

    return jsonify(
        {
            "ok": all_ok,
            "checks": checks,
            "env": env_summary
        }
    ), status_code


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
                "image_ready_models": image_ready
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


@api_bp.get("/settings/model-keys")
def get_model_keys():
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        masked_settings = get_user_model_settings_masked(user_id)
        return jsonify({"settings": masked_settings}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings lookup failed: {exc}"}), 500


@api_bp.put("/settings/model-keys")
def update_model_keys():
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

        masked = upsert_user_model_settings(user_id, payload)
        model_settings = get_user_model_settings(user_id)
        models = build_model_availability(model_settings)
        return jsonify({"settings": masked, "models": models}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except SettingsEncryptionError as exc:
        return jsonify({"error": str(exc)}), 500
    except AuthApiError:
        return jsonify({"error": "Invalid or expired token."}), 401
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Settings update failed: {exc}"}), 500
