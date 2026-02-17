from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from app.services.supabase_service import (
    SupabaseNotConfiguredError,
    get_user_id_from_token,
    persist_analysis,
    upload_photo_for_user,
)

api_bp = Blueprint("api", __name__)


def _extract_access_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.removeprefix("Bearer ").strip() or None


def _mock_analysis_result() -> dict:
    return {
        "style": "Smart Casual",
        "items": [
            {"category": "Top", "name": "White Oxford Shirt", "color": "White"},
            {"category": "Bottom", "name": "Navy Chinos", "color": "Navy"},
            {"category": "Shoes", "name": "Brown Loafers", "color": "Brown"}
        ]
    }


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

        storage_path = upload_photo_for_user(image, user_id)
        analysis = _mock_analysis_result()
        persistence = persist_analysis(user_id, storage_path, analysis)

        return jsonify({**analysis, **persistence}), 200
    except SupabaseNotConfiguredError as exc:
        return jsonify({"error": str(exc)}), 500
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
