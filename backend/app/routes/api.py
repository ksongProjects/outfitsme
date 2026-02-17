import requests
from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from app.config import settings
from app.services.gemini_service import (
    GeminiNotConfiguredError,
    analyze_outfit_with_gemini,
    probe_gemini_connectivity,
)
from app.services.supabase_service import (
    SupabaseNotConfiguredError,
    get_supabase_client,
    get_user_id_from_token,
    list_wardrobe,
    persist_analysis,
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
        analysis = analyze_outfit_with_gemini(image_bytes, mime_type)
        image.stream.seek(0)
        storage_path = upload_photo_for_user(image, user_id)
        persistence = persist_analysis(user_id, storage_path, analysis)

        return jsonify({**analysis, **persistence}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except GeminiNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
    except requests.HTTPError as exc:
        return jsonify({"error": f"Gemini request failed: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": f"Gemini response parse failed: {exc}"}), 502
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
