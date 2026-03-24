from __future__ import annotations

import base64
import binascii
import mimetypes
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from uuid import uuid4

from PIL import Image, ImageOps
from psycopg2.extras import RealDictCursor
from supabase import Client, create_client

from app.config import settings
from app.services.better_auth_service import (
    get_database_connection,
    get_user_id_from_better_auth_jwt,
    get_user_id_from_session_token,
)


class SupabaseNotConfiguredError(RuntimeError):
    pass


_SUPABASE_CLIENT: Client | None = None
_SIGNED_URL_CACHE: dict[tuple[str, int], tuple[str | None, float]] = {}
_PROFILE_PHOTO_MAX_SIDE = 768


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_text(value: Any, fallback: str = "") -> str:
    cleaned = " ".join(str(value or "").strip().split())
    return cleaned or fallback


def _normalize_label(value: Any, fallback: str) -> str:
    cleaned = _normalize_text(value, fallback)
    return cleaned.title() if cleaned else fallback


def _normalize_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _build_item_description(item: dict[str, Any]) -> str:
    description = _normalize_text(item.get("description"))
    if description:
        return description
    parts = [
        _normalize_text(item.get("color")),
        _normalize_text(item.get("material")),
        _normalize_text(item.get("name")) or _normalize_text(item.get("category"), "item"),
    ]
    return _normalize_text(" ".join(part for part in parts if part), "item")


def _normalize_item_payload(item: dict[str, Any]) -> dict[str, str]:
    category = _normalize_label(item.get("category"), "Item")
    name = _normalize_label(item.get("name"), "Unknown Item")
    color = _normalize_label(item.get("color"), "Unknown")
    material = _normalize_text(item.get("material"))
    return {
        "category": category,
        "name": name,
        "color": color,
        "material": material,
        "description": _build_item_description(
            {
                "category": category,
                "name": name,
                "color": color,
                "material": material,
                "description": item.get("description"),
            }
        ),
    }


def _item_signature(item: dict[str, Any]) -> tuple[str, str, str, str]:
    normalized = _normalize_item_payload(item)
    return (
        normalized["category"].lower(),
        normalized["name"].lower(),
        normalized["color"].lower(),
        normalized["description"].lower(),
    )


def _normalize_storage_target(mime_type: str | None) -> tuple[str, str]:
    normalized = str(mime_type or "").strip().lower()
    if normalized == "image/png":
        return "image/png", ".png"
    if normalized == "image/webp":
        return "image/webp", ".webp"
    return "image/jpeg", ".jpg"


def _decode_image_data_uri(data_uri: str) -> tuple[bytes, str]:
    if not isinstance(data_uri, str) or not data_uri.startswith("data:image/"):
        raise ValueError("Expected a valid image data URI.")
    header, encoded = data_uri.split(",", 1)
    mime_type = header.split(";")[0].replace("data:", "") or "image/png"
    try:
        return base64.b64decode(encoded), mime_type
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Generated image payload could not be decoded.") from exc


def _resize_profile_photo_content(image_bytes: bytes, mime_type: str | None) -> tuple[bytes, str, str]:
    if not image_bytes:
        raise ValueError("Image file is empty.")

    target_mime_type, extension = _normalize_storage_target(mime_type)
    try:
        with Image.open(BytesIO(image_bytes)) as img:
            source = ImageOps.exif_transpose(img)
            width, height = source.size
            if width <= 0 or height <= 0:
                raise ValueError("Invalid image dimensions.")

            if max(width, height) > _PROFILE_PHOTO_MAX_SIDE:
                scale = min(_PROFILE_PHOTO_MAX_SIDE / float(width), _PROFILE_PHOTO_MAX_SIDE / float(height))
                next_size = (
                    max(1, int(round(width * scale))),
                    max(1, int(round(height * scale))),
                )
                resample = getattr(Image, "Resampling", Image).LANCZOS
                source = source.resize(next_size, resample=resample)

            output = BytesIO()
            if target_mime_type == "image/png":
                if source.mode not in {"RGB", "RGBA", "L", "LA"}:
                    source = source.convert("RGBA" if "A" in source.getbands() else "RGB")
                source.save(output, format="PNG", optimize=True)
            elif target_mime_type == "image/webp":
                if source.mode not in {"RGB", "RGBA", "L", "LA"}:
                    source = source.convert("RGBA" if "A" in source.getbands() else "RGB")
                source.save(output, format="WEBP", quality=90, method=6)
            else:
                if source.mode not in {"RGB", "L"}:
                    if "A" in source.getbands():
                        flattened = Image.new("RGB", source.size, (255, 255, 255))
                        flattened.paste(source, mask=source.getchannel("A"))
                        source = flattened
                    else:
                        source = source.convert("RGB")
                source.save(output, format="JPEG", quality=90, optimize=True, progressive=True)
            return output.getvalue(), target_mime_type, extension
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Invalid profile photo. Please upload a JPG, PNG, or WEBP image.") from exc


def get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise SupabaseNotConfiguredError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured.")

    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is None:
        _SUPABASE_CLIENT = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
    return _SUPABASE_CLIENT


def _table(name: str):
    return get_supabase_client().table(name)


def _response_rows(response: Any) -> list[dict[str, Any]]:
    data = getattr(response, "data", None) if response is not None else None
    if isinstance(data, list):
        return [dict(row) for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [dict(data)]
    return []


def _execute_rows(builder: Any) -> list[dict[str, Any]]:
    return _response_rows(builder.execute())


def _execute_mutation(builder: Any) -> Any:
    return builder.execute()


def _execute_row(builder: Any) -> dict[str, Any] | None:
    rows = _execute_rows(builder)
    return rows[0] if rows else None


def _db_fetchone(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
    return dict(row) if row else None


def _db_fetchall(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
    return [dict(row) for row in rows]


def _best_effort_remove_storage_paths(storage_paths: list[str]) -> None:
    usable_paths = [path for path in storage_paths if _normalize_text(path)]
    if not usable_paths:
        return
    try:
        get_supabase_client().storage.from_(settings.SUPABASE_BUCKET).remove(usable_paths)
    except Exception:  # noqa: BLE001
        return


def _upload_bytes(storage_path: str, content: bytes, content_type: str) -> None:
    get_supabase_client().storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": content_type},
    )


def _serialize_item_row(row: dict[str, Any], *, style_label: str | None = None) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "category": row.get("category"),
        "name": row.get("name"),
        "color": row.get("color"),
        "brand": row.get("brand"),
        "material": row.get("material"),
        "description": row.get("description"),
        "image_path": row.get("image_path"),
        "image_url": get_signed_image_url(row.get("image_path")),
        "style_label": style_label,
    }


def get_user_id_from_token(access_token: str) -> str | None:
    token = _normalize_text(access_token)
    if not token:
        return None
    user_id = get_user_id_from_better_auth_jwt(token)
    if user_id:
        return user_id
    return get_user_id_from_session_token(token)


def upload_photo_for_user(file_storage, user_id: str) -> str:
    content = file_storage.read()
    if not content:
        raise ValueError("Image file is empty.")
    mime_type = file_storage.mimetype or mimetypes.guess_type(file_storage.filename or "")[0] or "image/jpeg"
    normalized_mime, extension = _normalize_storage_target(mime_type)
    storage_path = f"{user_id}/photos/{uuid4().hex}{extension}"
    _upload_bytes(storage_path, content, normalized_mime)
    return storage_path


def create_photo_record(user_id: str, storage_path: str) -> dict[str, Any]:
    row = _execute_row(
        _table("photos")
        .insert({"user_id": user_id, "storage_path": storage_path})
        .select("id, user_id, storage_path, created_at")
    )
    if not row:
        raise RuntimeError("Photo record could not be created.")
    return row


def download_photo_bytes(storage_path: str) -> bytes:
    path = _normalize_text(storage_path)
    if not path:
        return b""
    data = get_supabase_client().storage.from_(settings.SUPABASE_BUCKET).download(path)
    return data if isinstance(data, bytes) else b""


def get_signed_image_url(storage_path: str | None, expires_in_seconds: int = 3600) -> str | None:
    path = _normalize_text(storage_path)
    if not path:
        return None

    cache_key = (path, expires_in_seconds)
    now = datetime.now(timezone.utc).timestamp()
    cached = _SIGNED_URL_CACHE.get(cache_key)
    if cached and cached[1] > now:
        return cached[0]

    signed = get_supabase_client().storage.from_(settings.SUPABASE_BUCKET).create_signed_url(path, expires_in_seconds)
    signed_url = signed.get("signedURL") if isinstance(signed, dict) else None
    if signed_url:
        _SIGNED_URL_CACHE[cache_key] = (signed_url, now + max(expires_in_seconds - 30, 30))
    return signed_url


def _default_user_settings() -> dict[str, Any]:
    return {
        "user_role": "trial",
        "profile_gender": "",
        "profile_age": None,
        "profile_photo_path": "",
        "enable_outfit_image_generation": True,
        "enable_online_store_search": False,
        "enable_accessory_analysis": False,
    }


def _ensure_user_settings_row(user_id: str) -> None:
    defaults = _default_user_settings()
    _table("user_settings").upsert(
        {
            "user_id": user_id,
            "profile_gender": defaults["profile_gender"],
            "profile_age": defaults["profile_age"],
            "profile_photo_path": defaults["profile_photo_path"],
            "enable_outfit_image_generation": defaults["enable_outfit_image_generation"],
            "enable_online_store_search": defaults["enable_online_store_search"],
            "enable_accessory_analysis": defaults["enable_accessory_analysis"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()


def get_user_model_settings(user_id: str) -> dict[str, Any]:
    _ensure_user_settings_row(user_id)
    row = _execute_row(
        _table("user_settings")
        .select(
            "user_role, profile_gender, profile_age, profile_photo_path, "
            "enable_outfit_image_generation, enable_online_store_search, enable_accessory_analysis"
        )
        .eq("user_id", user_id)
    )
    if not row:
        return _default_user_settings()
    return {
        "user_role": _normalize_text(row.get("user_role"), "trial"),
        "profile_gender": _normalize_text(row.get("profile_gender")),
        "profile_age": row.get("profile_age"),
        "profile_photo_path": _normalize_text(row.get("profile_photo_path")),
        "enable_outfit_image_generation": _normalize_bool(row.get("enable_outfit_image_generation"), True),
        "enable_online_store_search": _normalize_bool(row.get("enable_online_store_search"), False),
        "enable_accessory_analysis": _normalize_bool(row.get("enable_accessory_analysis"), False),
    }


def upsert_user_model_settings(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = get_user_model_settings(user_id)
    next_profile_age = current.get("profile_age")
    if payload.get("profile_age") is not None:
        age_value = _safe_int(payload.get("profile_age"), 0)
        next_profile_age = age_value if 0 < age_value < 121 else None

    _execute_mutation(
        _table("user_settings")
        .update(
            {
                "profile_gender": _normalize_text(payload.get("profile_gender"), current.get("profile_gender", "")),
                "profile_age": next_profile_age,
                "enable_outfit_image_generation": _normalize_bool(
                    payload.get("enable_outfit_image_generation"),
                    bool(current.get("enable_outfit_image_generation", True)),
                ),
                "enable_online_store_search": _normalize_bool(
                    payload.get("enable_online_store_search"),
                    bool(current.get("enable_online_store_search", False)),
                ),
                "enable_accessory_analysis": _normalize_bool(
                    payload.get("enable_accessory_analysis"),
                    bool(current.get("enable_accessory_analysis", False)),
                ),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("user_id", user_id)
    )

    settings_row = get_user_model_settings(user_id)
    return {
        **settings_row,
        "profile_photo_url": get_signed_image_url(settings_row.get("profile_photo_path")),
    }


def save_user_profile_photo(user_id: str, file_storage) -> dict[str, Any]:
    current = get_user_model_settings(user_id)
    previous_path = _normalize_text(current.get("profile_photo_path"))

    raw_content = file_storage.read()
    source_mime = file_storage.mimetype or mimetypes.guess_type(file_storage.filename or "")[0] or "image/jpeg"
    content, content_type, extension = _resize_profile_photo_content(raw_content, source_mime)
    storage_path = f"{user_id}/profile/reference-{uuid4().hex}{extension}"
    _upload_bytes(storage_path, content, content_type)

    _ensure_user_settings_row(user_id)
    _execute_mutation(
        _table("user_settings")
        .update({"profile_photo_path": storage_path, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user_id)
    )

    if previous_path and previous_path != storage_path:
        _best_effort_remove_storage_paths([previous_path])

    return {
        "profile_photo_path": storage_path,
        "profile_photo_url": get_signed_image_url(storage_path),
    }


def create_analysis_job(user_id: str, *, photo_id: str, model_used: str | None = None) -> dict[str, Any]:
    row = _execute_row(
        _table("ai_jobs")
        .insert(
            {
                "user_id": user_id,
                "photo_id": photo_id,
                "job_type": "analysis",
                "status": "pending",
                "model_used": _normalize_text(model_used) or settings.DEFAULT_ANALYSIS_MODEL,
            }
        )
        .select("*")
    )
    if not row:
        raise RuntimeError("AI job could not be created.")
    return row


def create_completed_ai_job(
    user_id: str,
    *,
    photo_id: str | None = None,
    model_used: str | None = None,
    job_type: str = "try_on",
    tokens_input: int = 0,
    tokens_output: int = 0,
) -> dict[str, Any]:
    row = _execute_row(
        _table("ai_jobs")
        .insert(
            {
                "user_id": user_id,
                "photo_id": photo_id,
                "job_type": job_type,
                "status": "completed",
                "model_used": _normalize_text(model_used) or None,
                "tokens_input": max(_safe_int(tokens_input), 0),
                "tokens_output": max(_safe_int(tokens_output), 0),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .select("*")
    )
    if not row:
        raise RuntimeError("AI job could not be created.")
    return row


def get_analysis_job_for_user(user_id: str, job_id: str) -> dict[str, Any] | None:
    return _execute_row(_table("ai_jobs").select("*").eq("id", job_id).eq("user_id", user_id))


def claim_analysis_job(job_id: str) -> dict[str, Any] | None:
    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                update public.ai_jobs
                set status = 'processing'
                where id = %s
                  and status = 'pending'
                returning *
                """,
                (job_id,),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else None


def mark_analysis_job_completed(job_id: str, tokens_input: int = 0, tokens_output: int = 0) -> None:
    with get_database_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update public.ai_jobs
                set
                  status = 'completed',
                  tokens_input = %s,
                  tokens_output = %s,
                  completed_at = now()
                where id = %s
                """,
                (max(_safe_int(tokens_input), 0), max(_safe_int(tokens_output), 0), job_id),
            )
        conn.commit()


def mark_analysis_job_failed(job_id: str, error_message: str) -> None:
    with get_database_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update public.ai_jobs
                set
                  status = 'failed',
                  error_message = %s,
                  completed_at = now()
                where id = %s
                """,
                (_normalize_text(error_message, "Job failed."), job_id),
            )
        conn.commit()


def _normalize_analysis_outfits(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    normalized_outfits: list[dict[str, Any]] = []
    raw_outfits = analysis.get("outfits")
    if isinstance(raw_outfits, list):
        for outfit in raw_outfits:
            if not isinstance(outfit, dict):
                continue
            raw_items = outfit.get("items")
            items = raw_items if isinstance(raw_items, list) else []
            normalized_items = [_normalize_item_payload(item) for item in items if isinstance(item, dict)]
            if normalized_items:
                normalized_outfits.append(
                    {
                        "style": _normalize_label(outfit.get("style"), "Outfit"),
                        "items": normalized_items,
                    }
                )
    if normalized_outfits:
        return normalized_outfits

    raw_items = analysis.get("items")
    items = raw_items if isinstance(raw_items, list) else []
    normalized_items = [_normalize_item_payload(item) for item in items if isinstance(item, dict)]
    if not normalized_items:
        return []
    return [{"style": _normalize_label(analysis.get("style"), "Outfit"), "items": normalized_items}]


def persist_analysis_for_photo(
    user_id: str,
    photo_id: str,
    analysis: dict[str, Any],
    *,
    job_id: str | None = None,
) -> dict[str, Any]:
    normalized_outfits = _normalize_analysis_outfits(analysis)
    if not normalized_outfits:
        raise ValueError("Analysis did not return any clothing items.")

    item_map: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for outfit in normalized_outfits:
        for item in outfit["items"]:
            item_map.setdefault(_item_signature(item), item)

    persisted_items: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    persisted_outfits: list[dict[str, Any]] = []

    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for signature, item in item_map.items():
                cur.execute(
                    """
                    insert into public.items (
                      user_id,
                      name,
                      category,
                      color,
                      material,
                      description
                    )
                    values (%s, %s, %s, %s, %s, %s)
                    returning *
                    """,
                    (
                        user_id,
                        item["name"],
                        item["category"],
                        item["color"],
                        item["material"] or None,
                        item["description"],
                    ),
                )
                persisted_items[signature] = dict(cur.fetchone())

            for index, outfit in enumerate(normalized_outfits):
                cur.execute(
                    """
                    insert into public.outfits (user_id, job_id, photo_id, style_label)
                    values (%s, %s, %s, %s)
                    returning *
                    """,
                    (user_id, job_id, photo_id, outfit["style"]),
                )
                outfit_row = dict(cur.fetchone())
                outfit_items: list[dict[str, Any]] = []

                for item in outfit["items"]:
                    item_row = persisted_items[_item_signature(item)]
                    cur.execute(
                        """
                        insert into public.outfit_items (outfit_id, item_id)
                        values (%s, %s)
                        on conflict (outfit_id, item_id) do nothing
                        """,
                        (outfit_row["id"], item_row["id"]),
                    )
                    outfit_items.append(_serialize_item_row(item_row))

                persisted_outfits.append(
                    {
                        "outfit_id": outfit_row["id"],
                        "outfit_index": index,
                        "style": outfit_row["style_label"],
                        "items": outfit_items,
                        "generated_image_path": outfit_row.get("generated_image_path"),
                    }
                )
        conn.commit()

    return {
        "photo_id": photo_id,
        "style": persisted_outfits[0]["style"],
        "items": [_serialize_item_row(row) for row in persisted_items.values()],
        "outfits": persisted_outfits,
    }


def _load_outfit_rows_for_photo(user_id: str, photo_id: str) -> list[dict[str, Any]]:
    return _db_fetchall(
        """
        with ranked as (
          select
            o.*,
            row_number() over (
              partition by o.photo_id
              order by o.created_at asc, o.id asc
            ) - 1 as outfit_index
          from public.outfits o
          where o.user_id = %s
            and o.photo_id = %s
        )
        select *
        from ranked
        order by outfit_index asc
        """,
        (user_id, photo_id),
    )


def _load_items_for_outfits(outfit_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not outfit_ids:
        return {}

    rows = _db_fetchall(
        """
        select
          oi.outfit_id,
          i.id,
          i.name,
          i.category,
          i.color,
          i.brand,
          i.material,
          i.description,
          i.image_path,
          i.created_at
        from public.outfit_items oi
        join public.items i
          on i.id = oi.item_id
        where oi.outfit_id = any(%s::uuid[])
        order by i.created_at asc, i.id asc
        """,
        (outfit_ids,),
    )

    items_by_outfit: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        items_by_outfit.setdefault(str(row["outfit_id"]), []).append(_serialize_item_row(row))
    return items_by_outfit


def build_analysis_result_for_photo(user_id: str, photo_id: str) -> dict[str, Any] | None:
    outfits = _load_outfit_rows_for_photo(user_id, photo_id)
    if not outfits:
        return None

    items_by_outfit = _load_items_for_outfits([str(outfit["id"]) for outfit in outfits])
    unique_items: dict[str, dict[str, Any]] = {}
    response_outfits: list[dict[str, Any]] = []

    for outfit in outfits:
        outfit_items = items_by_outfit.get(str(outfit["id"]), [])
        for item in outfit_items:
            unique_items.setdefault(str(item["id"]), item)
        response_outfits.append(
            {
                "outfit_id": outfit["id"],
                "outfit_index": outfit["outfit_index"],
                "style": _normalize_label(outfit.get("style_label"), "Outfit"),
                "items": outfit_items,
            }
        )

    return {
        "photo_id": photo_id,
        "style": response_outfits[0]["style"],
        "items": list(unique_items.values()),
        "outfits": response_outfits,
    }


def save_generated_item_image(user_id: str, item_id: str, data_uri: str) -> dict[str, Any]:
    image_bytes, mime_type = _decode_image_data_uri(data_uri)
    normalized_mime, extension = _normalize_storage_target(mime_type)
    storage_path = f"{user_id}/items/{item_id}-{uuid4().hex}{extension}"
    _upload_bytes(storage_path, image_bytes, normalized_mime)

    previous = _execute_row(_table("items").select("image_path").eq("id", item_id).eq("user_id", user_id))
    _execute_mutation(
        _table("items")
        .update({"image_path": storage_path})
        .eq("id", item_id)
        .eq("user_id", user_id)
    )
    row = _execute_row(_table("items").select("*").eq("id", item_id).eq("user_id", user_id))
    if not row:
        raise RuntimeError("Item image could not be saved.")

    previous_path = _normalize_text((previous or {}).get("image_path"))
    if previous_path and previous_path != storage_path:
        _best_effort_remove_storage_paths([previous_path])

    result = dict(row)
    result["image_url"] = get_signed_image_url(result.get("image_path"))
    return result


def save_generated_outfit_image(user_id: str, image_key: str, data_uri: str) -> dict[str, Any]:
    image_bytes, mime_type = _decode_image_data_uri(data_uri)
    normalized_mime, extension = _normalize_storage_target(mime_type)
    storage_path = f"{user_id}/generated/{image_key}-{uuid4().hex}{extension}"
    _upload_bytes(storage_path, image_bytes, normalized_mime)
    return {
        "storage_path": storage_path,
        "image_url": get_signed_image_url(storage_path),
    }


def create_outfit_with_items(
    user_id: str,
    *,
    photo_id: str,
    style_label: str,
    item_ids: list[str],
    job_id: str | None = None,
    generated_image_path: str | None = None,
    is_favorite: bool = False,
) -> dict[str, Any]:
    if not item_ids:
        raise ValueError("At least one item is required.")

    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                insert into public.outfits (
                  user_id,
                  job_id,
                  photo_id,
                  style_label,
                  generated_image_path,
                  is_favorite
                )
                values (%s, %s, %s, %s, %s, %s)
                returning *
                """,
                (
                    user_id,
                    job_id,
                    photo_id,
                    _normalize_label(style_label, "Outfit"),
                    _normalize_text(generated_image_path) or None,
                    bool(is_favorite),
                ),
            )
            outfit_row = cur.fetchone()
            if not outfit_row:
                raise RuntimeError("Outfit could not be created.")

            for item_id in item_ids:
                cur.execute(
                    """
                    insert into public.outfit_items (outfit_id, item_id)
                    values (%s, %s)
                    on conflict (outfit_id, item_id) do nothing
                    """,
                    (outfit_row["id"], item_id),
                )
        conn.commit()
    return dict(outfit_row)


def attach_generated_image_to_outfit(user_id: str, outfit_id: str, generated_storage_path: str) -> dict[str, Any] | None:
    previous = _execute_row(_table("outfits").select("generated_image_path").eq("id", outfit_id).eq("user_id", user_id))
    _execute_mutation(
        _table("outfits")
        .update({"generated_image_path": _normalize_text(generated_storage_path) or None})
        .eq("id", outfit_id)
        .eq("user_id", user_id)
    )
    row = _execute_row(_table("outfits").select("*").eq("id", outfit_id).eq("user_id", user_id))
    previous_path = _normalize_text((previous or {}).get("generated_image_path"))
    if previous_path and previous_path != generated_storage_path:
        _best_effort_remove_storage_paths([previous_path])
    return row


def _list_item_rows(
    user_id: str,
    *,
    item_ids: list[str] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict[str, Any]]:
    where_clauses = ["i.user_id = %s"]
    params: list[Any] = [user_id, user_id]

    if item_ids is not None:
        if not item_ids:
            return []
        where_clauses.append("i.id = any(%s::uuid[])")
        params.append(item_ids)

    limit_clause = ""
    if limit is not None:
        limit_clause = "limit %s offset %s"
        params.extend([max(limit, 1), max(offset, 0)])

    query = f"""
        select
          i.*,
          style_source.style_label
        from public.items i
        left join lateral (
          select o.style_label
          from public.outfit_items oi
          join public.outfits o
            on o.id = oi.outfit_id
          where oi.item_id = i.id
            and o.user_id = %s
          order by o.created_at desc, o.id desc
          limit 1
        ) style_source on true
        where {' and '.join(where_clauses)}
        order by i.created_at desc, i.id desc
        {limit_clause}
    """
    return _db_fetchall(query, tuple(params))


def get_items_for_user(user_id: str, item_ids: list[str]) -> list[dict[str, Any]]:
    rows = _list_item_rows(user_id, item_ids=item_ids)
    return [_serialize_item_row(row, style_label=row.get("style_label")) for row in rows]


def list_user_items(user_id: str, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
    rows = _list_item_rows(user_id, limit=limit, offset=offset)
    return [_serialize_item_row(row, style_label=row.get("style_label")) for row in rows]


def list_analysis_history(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = _db_fetchall(
        """
        select
          j.id as job_id,
          j.photo_id,
          j.job_type,
          j.model_used,
          j.status,
          j.error_message,
          j.created_at,
          j.completed_at,
          p.storage_path,
          count(distinct o.id)::integer as outfit_count,
          max(o.style_label) as style_label
        from public.ai_jobs j
        left join public.photos p
          on p.id = j.photo_id
        left join public.outfits o
          on o.job_id = j.id
        where j.user_id = %s
        group by j.id, p.storage_path
        order by j.created_at desc, j.id desc
        limit %s
        """,
        (user_id, max(limit, 1)),
    )
    return [
        {
            "job_id": row["job_id"],
            "photo_id": row.get("photo_id"),
            "job_type": row.get("job_type"),
            "analysis_model": row.get("model_used"),
            "status": row.get("status"),
            "error_message": row.get("error_message"),
            "created_at": row.get("created_at"),
            "completed_at": row.get("completed_at"),
            "image_url": get_signed_image_url(row.get("storage_path")),
            "outfit_count": row.get("outfit_count") or 0,
            "style_label": row.get("style_label"),
        }
        for row in rows
    ]


def list_wardrobe(user_id: str, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
    rows = _db_fetchall(
        """
        with ranked as (
          select
            o.*,
            row_number() over (
              partition by o.photo_id
              order by o.created_at asc, o.id asc
            ) - 1 as outfit_index,
            count(*) over (partition by o.photo_id) as outfit_count
          from public.outfits o
          where o.user_id = %s
        )
        select
          ranked.id as outfit_id,
          ranked.photo_id,
          ranked.style_label,
          ranked.generated_image_path,
          ranked.created_at,
          ranked.outfit_index,
          ranked.outfit_count,
          p.storage_path,
          coalesce(item_counts.outfit_items_count, 0) as outfit_items_count
        from ranked
        left join public.photos p
          on p.id = ranked.photo_id
        left join lateral (
          select count(*)::integer as outfit_items_count
          from public.outfit_items oi
          where oi.outfit_id = ranked.id
        ) item_counts on true
        order by ranked.created_at desc, ranked.id desc
        limit %s offset %s
        """,
        (user_id, max(limit, 1), max(offset, 0)),
    )

    wardrobe: list[dict[str, Any]] = []
    for row in rows:
        generated_image_path = _normalize_text(row.get("generated_image_path"))
        source_path = _normalize_text(row.get("storage_path"))
        wardrobe.append(
            {
                "row_id": str(row["outfit_id"]),
                "outfit_id": row["outfit_id"],
                "photo_id": row["photo_id"],
                "image_url": get_signed_image_url(generated_image_path or source_path),
                "source_outfit_image_url": get_signed_image_url(source_path),
                "created_at": row.get("created_at"),
                "style_label": row.get("style_label"),
                "source_type": "custom_outfit" if not source_path or generated_image_path == source_path else "photo_analysis",
                "source_outfit_id": None,
                "outfit_index": row.get("outfit_index") or 0,
                "outfit_count": row.get("outfit_count") or 1,
                "outfit_items_count": row.get("outfit_items_count") or 0,
            }
        )
    return wardrobe


def get_wardrobe_photo_details(user_id: str, photo_id: str, outfit_index: int | None = None) -> dict[str, Any] | None:
    photo_row = _execute_row(_table("photos").select("id, storage_path, created_at").eq("id", photo_id).eq("user_id", user_id))
    if not photo_row:
        return None

    outfits = _load_outfit_rows_for_photo(user_id, photo_id)
    if not outfits:
        return None

    items_by_outfit = _load_items_for_outfits([str(outfit["id"]) for outfit in outfits])
    response_outfits: list[dict[str, Any]] = []
    selected_outfit: dict[str, Any] | None = None

    for outfit in outfits:
        generated_image_path = _normalize_text(outfit.get("generated_image_path"))
        response = {
            "outfit_id": outfit["id"],
            "outfit_index": outfit["outfit_index"],
            "style": _normalize_label(outfit.get("style_label"), "Outfit"),
            "source_type": "photo_analysis",
            "items": items_by_outfit.get(str(outfit["id"]), []),
            "image_url": get_signed_image_url(generated_image_path or photo_row.get("storage_path")),
        }
        if outfit_index is not None and outfit["outfit_index"] == outfit_index:
            selected_outfit = response
        response_outfits.append(response)

    first_generated = next(
        (
            get_signed_image_url(outfit.get("generated_image_path"))
            for outfit in outfits
            if _normalize_text(outfit.get("generated_image_path"))
        ),
        None,
    )

    return {
        "photo_id": photo_row["id"],
        "created_at": photo_row.get("created_at"),
        "image_url": get_signed_image_url(photo_row.get("storage_path")),
        "source_outfit_image_url": get_signed_image_url(photo_row.get("storage_path")),
        "style_label": response_outfits[0]["style"],
        "outfitsme_image_url": first_generated,
        "outfits": response_outfits,
        "selected_outfit_index": outfit_index,
        "selected_outfit": selected_outfit,
    }


def get_outfit_for_generation(user_id: str, photo_id: str, outfit_index: int | None = None) -> dict[str, Any] | None:
    details = get_wardrobe_photo_details(user_id, photo_id, outfit_index=outfit_index)
    if not details:
        return None
    selected_outfit = (details.get("outfits") or [None])[0] if outfit_index is None else details.get("selected_outfit")
    if not selected_outfit:
        return None
    return {
        "photo_id": details.get("photo_id"),
        "source_image_url": details.get("image_url"),
        "source_outfit_image_url": details.get("source_outfit_image_url"),
        "outfit": selected_outfit,
    }


def get_photo_storage_path_for_user(user_id: str, photo_id: str) -> str | None:
    row = _execute_row(_table("photos").select("storage_path").eq("id", photo_id).eq("user_id", user_id))
    return _normalize_text((row or {}).get("storage_path")) or None


def delete_wardrobe_outfit(user_id: str, outfit_id: str) -> bool:
    orphan_item_paths: list[str] = []
    photo_storage_path = ""
    generated_image_path = ""

    with get_database_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                select
                  o.photo_id,
                  o.generated_image_path,
                  array_remove(array_agg(oi.item_id), null) as item_ids
                from public.outfits o
                left join public.outfit_items oi
                  on oi.outfit_id = o.id
                where o.id = %s
                  and o.user_id = %s
                group by o.id
                """,
                (outfit_id, user_id),
            )
            target = cur.fetchone()
            if not target:
                return False

            generated_image_path = _normalize_text(target.get("generated_image_path"))
            photo_id = target.get("photo_id")
            item_ids = [str(item_id) for item_id in (target.get("item_ids") or [])]

            cur.execute("delete from public.outfits where id = %s and user_id = %s", (outfit_id, user_id))

            for item_id in item_ids:
                cur.execute(
                    """
                    select i.image_path
                    from public.items i
                    where i.id = %s
                      and i.user_id = %s
                      and not exists (
                        select 1
                        from public.outfit_items oi
                        where oi.item_id = i.id
                      )
                    """,
                    (item_id, user_id),
                )
                orphan_item = cur.fetchone()
                if orphan_item and orphan_item.get("image_path"):
                    orphan_item_paths.append(str(orphan_item["image_path"]))

                cur.execute(
                    """
                    delete from public.items
                    where id = %s
                      and user_id = %s
                      and not exists (
                        select 1
                        from public.outfit_items oi
                        where oi.item_id = public.items.id
                      )
                    """,
                    (item_id, user_id),
                )

            if photo_id:
                cur.execute("select count(*)::integer as remaining from public.outfits where photo_id = %s", (photo_id,))
                remaining = cur.fetchone()
                if remaining and int(remaining["remaining"] or 0) == 0:
                    cur.execute("select storage_path from public.photos where id = %s", (photo_id,))
                    photo_row = cur.fetchone()
                    photo_storage_path = _normalize_text((photo_row or {}).get("storage_path"))
                    cur.execute("delete from public.photos where id = %s and user_id = %s", (photo_id, user_id))
        conn.commit()

    storage_paths = orphan_item_paths
    if generated_image_path:
        storage_paths.append(generated_image_path)
    if photo_storage_path:
        storage_paths.append(photo_storage_path)
    _best_effort_remove_storage_paths(storage_paths)
    return True


def delete_wardrobe_outfits(user_id: str, outfit_ids: list[str]) -> dict[str, Any]:
    deleted: list[str] = []
    not_found: list[str] = []
    for outfit_id in outfit_ids:
        if delete_wardrobe_outfit(user_id, outfit_id):
            deleted.append(outfit_id)
        else:
            not_found.append(outfit_id)
    return {"deleted": deleted, "not_found": not_found}


def update_wardrobe_outfit_style_label(user_id: str, outfit_id: str, style_label: str) -> dict[str, Any] | None:
    row = _execute_row(
        _table("outfits")
        .update({"style_label": _normalize_label(style_label, "Outfit")})
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .select("*")
    )
    if not row:
        return None
    return {
        "outfit_id": row["id"],
        "photo_id": row.get("photo_id"),
        "style_label": row.get("style_label"),
        "created_at": row.get("created_at"),
    }


def get_dashboard_stats(user_id: str) -> dict[str, Any]:
    snapshot = _db_fetchone(
        """
        select
          (select count(*)::integer from public.photos where user_id = %s) as photos_count,
          (select count(*)::integer from public.outfits where user_id = %s) as outfits_count,
          (select count(*)::integer from public.ai_jobs where user_id = %s) as analyses_count,
          (select count(*)::integer from public.items where user_id = %s) as items_count,
          (
            select count(*)::integer
            from public.outfits
            where user_id = %s
              and generated_image_path is not null
              and btrim(generated_image_path) <> ''
          ) as generated_outfit_images_count
        """,
        (user_id, user_id, user_id, user_id, user_id),
    )
    return snapshot or {
        "photos_count": 0,
        "outfits_count": 0,
        "analyses_count": 0,
        "items_count": 0,
        "generated_outfit_images_count": 0,
    }


def get_user_cost_summary(user_id: str, month_start_iso: str) -> dict[str, Any]:
    summary = _db_fetchone(
        """
        select
          count(*) filter (where job_type = 'analysis')::integer as analysis_runs,
          count(*) filter (where job_type = 'try_on')::integer as try_on_generations,
          coalesce(sum(tokens_input), 0)::integer as tokens_input,
          coalesce(sum(tokens_output), 0)::integer as tokens_output
        from public.ai_jobs
        where user_id = %s
          and created_at >= %s::timestamptz
        """,
        (user_id, month_start_iso),
    ) or {}

    generated_outfit_images = _db_fetchone(
        """
        select count(*)::integer as generated_outfit_images
        from public.outfits
        where user_id = %s
          and created_at >= %s::timestamptz
          and generated_image_path is not null
          and btrim(generated_image_path) <> ''
        """,
        (user_id, month_start_iso),
    ) or {}

    input_tokens = summary.get("tokens_input") or 0
    output_tokens = summary.get("tokens_output") or 0
    analysis_runs = summary.get("analysis_runs") or 0
    try_on_generations = summary.get("try_on_generations") or 0

    return {
        "month_start_utc": month_start_iso,
        "analysis_runs": analysis_runs,
        "try_on_generations": try_on_generations,
        "composed_outfits_created": 0,
        "custom_outfit_generations": 0,
        "estimated_costs_usd": {
            "analysis": 0,
            "outfit_image_generation": 0,
            "item_image_generation": 0,
            "total": 0,
        },
        "estimated_token_costs_usd": {
            "total": 0,
        },
        "token_usage_estimate": {
            "total": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "call_count": analysis_runs + try_on_generations,
            },
            "source": "Aggregated from ai_jobs token fields.",
        },
        "generated_outfit_images": generated_outfit_images.get("generated_outfit_images") or 0,
        "unit_costs_usd": {},
        "token_pricing_usd_per_1m": {},
    }
