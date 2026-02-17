import requests
from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from app.config import settings
from app.services.bedrock_service import (
    BedrockNotConfiguredError,
    analyze_outfit_with_bedrock_agent,
)
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    analyze_outfit_with_gemini,
    probe_gemini_connectivity,
)
from app.services.models_service import build_model_availability, get_preferred_model
from app.services.secrets_service import SettingsEncryptionError
from app.services.supabase_service import (
    delete_wardrobe_photo,
    get_dashboard_stats,
    get_wardrobe_photo_details,
    get_user_model_settings,
    get_user_model_settings_masked,
    list_user_items,
    SupabaseNotConfiguredError,
    get_supabase_client,
    get_user_id_from_token,
    list_wardrobe,
    persist_analysis,
    upsert_user_model_settings,
    upload_photo_for_user,
)

api_bp = Blueprint("api", __name__)


def _extract_access_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.removeprefix("Bearer ").strip() or None


def _mask_shape(value: str) -> dict:
    if not value:
        return {"set": False, "prefix": "", "length": 0}
    return {"set": True, "prefix": value[:8], "length": len(value)}


@api_bp.post("/analyze")
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

        if model_entry["provider"] == "gemini":
            gemini_key = user_settings.get("gemini_api_key") or settings.GEMINI_API_KEY
            analysis = analyze_outfit_with_gemini(
                image_bytes,
                mime_type,
                model=chosen_model_id,
                api_key=gemini_key
            )
        elif model_entry["provider"] == "bedrock_agent":
            analysis = analyze_outfit_with_bedrock_agent(
                image_bytes=image_bytes,
                mime_type=mime_type,
                agent_id=user_settings.get("aws_bedrock_agent_id", ""),
                agent_alias_id=user_settings.get("aws_bedrock_agent_alias_id", ""),
                aws_access_key_id=user_settings.get("aws_access_key_id", ""),
                aws_secret_access_key=user_settings.get("aws_secret_access_key", ""),
                aws_region=user_settings.get("aws_region", ""),
                aws_session_token=user_settings.get("aws_session_token", "")
            )
        else:
            return jsonify({"error": f"Unsupported model provider: {model_entry['provider']}"}), 400
        analysis_items = analysis.get("items", [])
        analysis_outfits = analysis.get("outfits", [])
        analysis_response = {
            "style": analysis.get("style"),
            "items": [dict(item) for item in analysis_items],
            "outfits": [dict(outfit) for outfit in analysis_outfits],
            "analysis_model": chosen_model_id
        }

        # Persist core analysis only (avoid storing large base64 image strings in DB).
        analysis_for_persistence = {
            "style": analysis.get("style"),
            "items": [
                {
                    "category": item.get("category"),
                    "name": item.get("name"),
                    "color": item.get("color")
                }
                for item in analysis_items
            ]
        }

        image.stream.seek(0)
        storage_path = upload_photo_for_user(image, user_id)
        persistence = persist_analysis(user_id, storage_path, analysis_for_persistence)

        return jsonify({**analysis_response, **persistence}), 200
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


@api_bp.delete("/wardrobe/<photo_id>")
def delete_wardrobe_entry(photo_id: str):
    access_token = _extract_access_token()
    if not access_token:
        return jsonify({"error": "Missing bearer token."}), 401

    try:
        user_id = get_user_id_from_token(access_token)
        if not user_id:
            return jsonify({"error": "Invalid or expired token."}), 401

        deleted = delete_wardrobe_photo(user_id, photo_id)
        if not deleted:
            return jsonify({"error": "Wardrobe item not found."}), 404

        return jsonify({"deleted": True, "photo_id": photo_id}), 200
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

        details = get_wardrobe_photo_details(user_id, photo_id)
        if not details:
            return jsonify({"error": "Outfit details not found."}), 404

        return jsonify({"photo_id": photo_id, "details": details}), 200
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


@api_bp.get("/diagnostics")
def diagnostics():
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
        "supabase_key_shape": _mask_shape(settings.SUPABASE_SECRET_KEY),
        "gemini_key_shape": _mask_shape(settings.GEMINI_API_KEY),
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
