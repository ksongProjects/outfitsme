from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from uuid import uuid4

from supabase import Client, create_client

from app.config import settings
from app.services.secrets_service import decrypt_secret, encrypt_secret, mask_secret


class SupabaseNotConfiguredError(RuntimeError):
    pass


def get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise SupabaseNotConfiguredError("SUPABASE_URL and SUPABASE_SECRET_KEY are required.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


def get_user_id_from_token(access_token: str) -> str | None:
    client = get_supabase_client()
    user_response = client.auth.get_user(access_token)
    user = getattr(user_response, "user", None)
    return getattr(user, "id", None)


def upload_photo_for_user(file_storage, user_id: str) -> str:
    client = get_supabase_client()

    ext = ""
    if file_storage.filename and "." in file_storage.filename:
        ext = "." + file_storage.filename.rsplit(".", 1)[-1].lower()

    storage_path = f"{user_id}/{uuid4().hex}{ext}"
    content = file_storage.read()
    content_type = file_storage.mimetype or mimetypes.guess_type(file_storage.filename or "")[0] or "application/octet-stream"

    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": content_type, "upsert": "false"}
    )

    return storage_path


def persist_analysis(user_id: str, storage_path: str, analysis: dict) -> dict:
    client = get_supabase_client()

    photo_insert = (
        client.table("photos")
        .insert({"user_id": user_id, "storage_path": storage_path})
        .execute()
    )
    photo_row = photo_insert.data[0]

    analysis_insert = (
        client.table("outfit_analyses")
        .insert(
            {
                "photo_id": photo_row["id"],
                "user_id": user_id,
                "style_label": analysis.get("style"),
                "raw_json": analysis
            }
        )
        .execute()
    )
    analysis_row = analysis_insert.data[0]

    item_rows = []
    for item in analysis.get("items", []):
        item_rows.append(
            {
                "analysis_id": analysis_row["id"],
                "user_id": user_id,
                "category": item.get("category"),
                "name": item.get("name"),
                "color": item.get("color"),
                "attributes_json": {
                    "captured_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )

    if item_rows:
        client.table("items").insert(item_rows).execute()

    return {
        "photo_id": photo_row["id"],
        "analysis_id": analysis_row["id"],
        "storage_path": storage_path
    }


def _normalize_signed_url(signed_data: dict) -> str | None:
    signed_url = (
        signed_data.get("signedURL")
        or signed_data.get("signedUrl")
        or signed_data.get("signed_url")
    )
    if not signed_url:
        return None
    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url
    return f"{settings.SUPABASE_URL}{signed_url}"


def get_signed_image_url(storage_path: str, expires_in_seconds: int = 3600) -> str | None:
    client = get_supabase_client()
    response = client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
        storage_path,
        expires_in_seconds
    )
    data = getattr(response, "data", None) or response
    if isinstance(data, dict):
        return _normalize_signed_url(data)
    return None


def list_wardrobe(user_id: str, limit: int = 20) -> list[dict]:
    client = get_supabase_client()
    photos_response = (
        client.table("photos")
        .select("id,storage_path,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    photos = photos_response.data or []

    wardrobe = []
    for photo in photos:
        analyses_response = (
            client.table("outfit_analyses")
            .select("id,style_label,created_at")
            .eq("photo_id", photo["id"])
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        analysis = (analyses_response.data or [None])[0]

        wardrobe.append(
            {
                "photo_id": photo["id"],
                "storage_path": photo["storage_path"],
                "created_at": photo["created_at"],
                "analysis_id": analysis["id"] if analysis else None,
                "style_label": analysis["style_label"] if analysis else None,
                "analysis_created_at": analysis["created_at"] if analysis else None
            }
        )

    return wardrobe


def list_user_items(user_id: str, limit: int = 200) -> list[dict]:
    client = get_supabase_client()
    items_response = (
        client.table("items")
        .select("id,analysis_id,category,name,color,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return items_response.data or []


def delete_wardrobe_photo(user_id: str, photo_id: str) -> bool:
    client = get_supabase_client()

    photo_response = (
        client.table("photos")
        .select("id,storage_path")
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    photo_row = (photo_response.data or [None])[0]
    if not photo_row:
        return False

    storage_path = photo_row.get("storage_path")
    if storage_path:
        client.storage.from_(settings.SUPABASE_BUCKET).remove([storage_path])

    (
        client.table("photos")
        .delete()
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .execute()
    )
    return True


def get_original_photo_url(user_id: str, photo_id: str) -> str | None:
    client = get_supabase_client()
    photo_response = (
        client.table("photos")
        .select("storage_path")
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    photo_row = (photo_response.data or [None])[0]
    if not photo_row:
        return None

    storage_path = photo_row.get("storage_path")
    if not storage_path:
        return None

    return get_signed_image_url(storage_path, expires_in_seconds=3600)


def get_dashboard_stats(user_id: str) -> dict:
    client = get_supabase_client()

    photos = (
        client.table("photos")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    analyses = (
        client.table("outfit_analyses")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    items = (
        client.table("items")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    return {
        "outfits_count": len(photos),
        "analyses_count": len(analyses),
        "items_count": len(items)
    }


def _empty_model_settings() -> dict:
    return {
        "preferred_model": settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key": "",
        "aws_access_key_id": "",
        "aws_secret_access_key": "",
        "aws_session_token": "",
        "aws_region": "",
        "aws_bedrock_model_id": ""
    }


def get_user_model_settings(user_id: str) -> dict:
    client = get_supabase_client()
    response = (
        client.table("user_settings")
        .select(
            "preferred_model,gemini_api_key_enc,aws_access_key_id_enc,aws_secret_access_key_enc,"
            "aws_session_token_enc,aws_region,aws_bedrock_model_id"
        )
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = (response.data or [None])[0]
    if not row:
        return _empty_model_settings()

    return {
        "preferred_model": row.get("preferred_model") or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key": decrypt_secret(row.get("gemini_api_key_enc") or ""),
        "aws_access_key_id": decrypt_secret(row.get("aws_access_key_id_enc") or ""),
        "aws_secret_access_key": decrypt_secret(row.get("aws_secret_access_key_enc") or ""),
        "aws_session_token": decrypt_secret(row.get("aws_session_token_enc") or ""),
        "aws_region": row.get("aws_region") or "",
        "aws_bedrock_model_id": row.get("aws_bedrock_model_id") or ""
    }


def get_user_model_settings_masked(user_id: str) -> dict:
    settings_row = get_user_model_settings(user_id)
    return {
        "preferred_model": settings_row.get("preferred_model") or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key_masked": mask_secret(settings_row.get("gemini_api_key", "")),
        "aws_access_key_id_masked": mask_secret(settings_row.get("aws_access_key_id", "")),
        "aws_secret_access_key_masked": mask_secret(settings_row.get("aws_secret_access_key", "")),
        "aws_session_token_masked": mask_secret(settings_row.get("aws_session_token", "")),
        "aws_region": settings_row.get("aws_region", ""),
        "aws_bedrock_model_id": settings_row.get("aws_bedrock_model_id", "")
    }


def upsert_user_model_settings(user_id: str, payload: dict) -> dict:
    client = get_supabase_client()
    current = get_user_model_settings(user_id)

    preferred_model = str(payload.get("preferred_model", current.get("preferred_model", ""))).strip()

    gemini_api_key = payload.get("gemini_api_key")
    aws_access_key_id = payload.get("aws_access_key_id")
    aws_secret_access_key = payload.get("aws_secret_access_key")
    aws_session_token = payload.get("aws_session_token")
    aws_region = payload.get("aws_region")
    aws_bedrock_model_id = payload.get("aws_bedrock_model_id")

    def _next_secret(incoming, existing):
        if incoming is None:
            return existing
        return str(incoming).strip()

    row = {
        "user_id": user_id,
        "preferred_model": preferred_model or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key_enc": encrypt_secret(_next_secret(gemini_api_key, current.get("gemini_api_key", ""))),
        "aws_access_key_id_enc": encrypt_secret(_next_secret(aws_access_key_id, current.get("aws_access_key_id", ""))),
        "aws_secret_access_key_enc": encrypt_secret(
            _next_secret(aws_secret_access_key, current.get("aws_secret_access_key", ""))
        ),
        "aws_session_token_enc": encrypt_secret(_next_secret(aws_session_token, current.get("aws_session_token", ""))),
        "aws_region": str(aws_region).strip() if aws_region is not None else current.get("aws_region", ""),
        "aws_bedrock_model_id": (
            str(aws_bedrock_model_id).strip() if aws_bedrock_model_id is not None else current.get("aws_bedrock_model_id", "")
        ),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    (
        client.table("user_settings")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return get_user_model_settings_masked(user_id)
