from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from uuid import uuid4

from supabase import Client, create_client

from app.config import settings


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
