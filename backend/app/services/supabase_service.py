from __future__ import annotations

import base64
import binascii
import mimetypes
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from uuid import uuid4

from PIL import Image, ImageOps
from supabase import Client, create_client

from app.config import settings
from app.services.better_auth_service import (
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


def _execute_count(builder: Any) -> int:
    response = builder.execute()
    count = getattr(response, "count", None) if response is not None else None
    if count is not None:
        return _safe_int(count)
    return len(_response_rows(response))


def _parse_sortable_datetime(value: Any) -> datetime:
    cleaned = str(value or "").strip()
    if not cleaned:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _sort_key_created_desc(row: dict[str, Any]) -> tuple[datetime, str]:
    return (_parse_sortable_datetime(row.get("created_at")), str(row.get("id") or ""))


def _sort_key_created_asc(row: dict[str, Any]) -> tuple[datetime, str]:
    return (_parse_sortable_datetime(row.get("created_at")), str(row.get("id") or ""))


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


def _derive_outfit_source_type(source_path: str | None, generated_image_path: str | None, job_type: str | None = None) -> str:
    normalized_source_path = _normalize_text(source_path)
    normalized_generated_path = _normalize_text(generated_image_path)
    normalized_job_type = _normalize_text(job_type).lower()
    if not normalized_source_path or normalized_generated_path == normalized_source_path:
        if normalized_job_type == "try_on":
            return "outfitsme_generated"
        return "custom_outfit"
    return "photo_analysis"


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
    photo_id = str(uuid4())
    _execute_mutation(
        _table("photos").insert({"id": photo_id, "user_id": user_id, "storage_path": storage_path})
    )
    row = _execute_row(
        _table("photos")
        .select("id, user_id, storage_path, created_at")
        .eq("id", photo_id)
        .eq("user_id", user_id)
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


def get_user_access_snapshot(user_id: str) -> dict[str, Any]:
    user_row = _execute_row(_table("users").select("id, created_at").eq("id", user_id))
    settings_row = _execute_row(_table("user_settings").select("user_role").eq("user_id", user_id)) or {}
    return {
        "user_role": _normalize_text(settings_row.get("user_role"), "trial"),
        "account_created_at": (user_row or {}).get("created_at"),
    }


def get_user_daily_ai_usage(user_id: str, window_start_iso: str) -> dict[str, int]:
    rows = _execute_rows(
        _table("ai_jobs")
        .select("job_type")
        .eq("user_id", user_id)
        .gte("created_at", window_start_iso)
    )
    analysis_actions_today = 0
    outfit_generations_today = 0
    for row in rows:
        job_type = _normalize_text(row.get("job_type")).lower()
        if job_type == "analysis":
            analysis_actions_today += 1
        elif job_type in {"try_on", "custom_outfit"}:
            outfit_generations_today += 1
    return {
        "analysis_actions_today": analysis_actions_today,
        "outfit_generations_today": outfit_generations_today,
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
    job_id = str(uuid4())
    _execute_mutation(
        _table("ai_jobs").insert(
            {
                "id": job_id,
                "user_id": user_id,
                "photo_id": photo_id,
                "job_type": "analysis",
                "status": "pending",
                "model_used": _normalize_text(model_used) or settings.DEFAULT_ANALYSIS_MODEL,
            }
        )
    )
    row = _execute_row(_table("ai_jobs").select("*").eq("id", job_id).eq("user_id", user_id))
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
    job_id = str(uuid4())
    _execute_mutation(
        _table("ai_jobs").insert(
            {
                "id": job_id,
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
    )
    row = _execute_row(_table("ai_jobs").select("*").eq("id", job_id).eq("user_id", user_id))
    if not row:
        raise RuntimeError("AI job could not be created.")
    return row


def get_analysis_job_for_user(user_id: str, job_id: str) -> dict[str, Any] | None:
    return _execute_row(_table("ai_jobs").select("*").eq("id", job_id).eq("user_id", user_id))


def claim_analysis_job(job_id: str) -> dict[str, Any] | None:
    rows = _execute_rows(
        _table("ai_jobs")
        .update({"status": "processing"})
        .eq("id", job_id)
        .eq("status", "pending")
    )
    return rows[0] if rows else None


def mark_analysis_job_completed(job_id: str, tokens_input: int = 0, tokens_output: int = 0) -> None:
    _execute_mutation(
        _table("ai_jobs")
        .update(
            {
                "status": "completed",
                "tokens_input": max(_safe_int(tokens_input), 0),
                "tokens_output": max(_safe_int(tokens_output), 0),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", job_id)
    )


def mark_analysis_job_failed(job_id: str, error_message: str) -> None:
    _execute_mutation(
        _table("ai_jobs")
        .update(
            {
                "status": "failed",
                "error_message": _normalize_text(error_message, "Job failed."),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", job_id)
    )


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

    for signature, item in item_map.items():
        row = _execute_row(
            _table("items").insert(
                {
                    "user_id": user_id,
                    "name": item["name"],
                    "category": item["category"],
                    "color": item["color"],
                    "material": item["material"] or None,
                    "description": item["description"],
                }
            )
        )
        if not row:
            raise RuntimeError("Item could not be created.")
        persisted_items[signature] = row

    for index, outfit in enumerate(normalized_outfits):
        outfit_row = _execute_row(
            _table("outfits").insert(
                {
                    "user_id": user_id,
                    "job_id": job_id,
                    "photo_id": photo_id,
                    "style_label": outfit["style"],
                }
            )
        )
        if not outfit_row:
            raise RuntimeError("Outfit could not be created.")

        outfit_items: list[dict[str, Any]] = []
        outfit_item_rows: list[dict[str, Any]] = []
        for item in outfit["items"]:
            item_row = persisted_items[_item_signature(item)]
            outfit_item_rows.append({"outfit_id": outfit_row["id"], "item_id": item_row["id"]})
            outfit_items.append(_serialize_item_row(item_row))

        if outfit_item_rows:
            _execute_mutation(
                _table("outfit_items").upsert(
                    outfit_item_rows,
                    ignore_duplicates=True,
                    on_conflict="outfit_id,item_id",
                )
            )

        persisted_outfits.append(
            {
                "outfit_id": outfit_row["id"],
                "outfit_index": index,
                "style": outfit_row["style_label"],
                "items": outfit_items,
                "generated_image_path": outfit_row.get("generated_image_path"),
            }
        )

    return {
        "photo_id": photo_id,
        "style": persisted_outfits[0]["style"],
        "items": [_serialize_item_row(row) for row in persisted_items.values()],
        "outfits": persisted_outfits,
    }


def _load_outfit_rows_for_photo(user_id: str, photo_id: str) -> list[dict[str, Any]]:
    rows = _execute_rows(
        _table("outfits")
        .select("id, photo_id, style_label, generated_image_path, job_id, created_at")
        .eq("user_id", user_id)
        .eq("photo_id", photo_id)
    )
    rows = sorted(rows, key=_sort_key_created_asc)
    job_ids = sorted({str(row.get("job_id")) for row in rows if row.get("job_id") is not None})
    jobs_by_id: dict[str, dict[str, Any]] = {}
    if job_ids:
        jobs_by_id = {
            str(row["id"]): row
            for row in _execute_rows(_table("ai_jobs").select("id, job_type").in_("id", job_ids))
            if row.get("id") is not None
        }

    enriched_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        enriched = dict(row)
        enriched["outfit_index"] = index
        enriched["job_type"] = (jobs_by_id.get(str(row.get("job_id") or "")) or {}).get("job_type", "")
        enriched_rows.append(enriched)
    return enriched_rows


def _load_items_for_outfits(outfit_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not outfit_ids:
        return {}

    outfit_item_rows = _execute_rows(
        _table("outfit_items")
        .select("outfit_id, item_id")
        .in_("outfit_id", outfit_ids)
    )
    item_ids = sorted({str(row.get("item_id")) for row in outfit_item_rows if row.get("item_id") is not None})
    item_rows = (
        _execute_rows(_table("items").select("id, name, category, color, brand, material, description, image_path, created_at").in_("id", item_ids))
        if item_ids
        else []
    )
    items_by_id = {str(row["id"]): row for row in item_rows if row.get("id") is not None}

    items_by_outfit: dict[str, list[dict[str, Any]]] = {}
    for row in sorted(outfit_item_rows, key=lambda value: str(value.get("item_id") or "")):
        outfit_id = str(row.get("outfit_id") or "")
        item = items_by_id.get(str(row.get("item_id") or ""))
        if not outfit_id or not item:
            continue
        items_by_outfit.setdefault(outfit_id, []).append(_serialize_item_row(item))
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

    outfit_row = _execute_row(
        _table("outfits").insert(
            {
                "user_id": user_id,
                "job_id": job_id,
                "photo_id": photo_id,
                "style_label": _normalize_label(style_label, "Outfit"),
                "generated_image_path": _normalize_text(generated_image_path) or None,
                "is_favorite": bool(is_favorite),
            }
        )
    )
    if not outfit_row:
        raise RuntimeError("Outfit could not be created.")

    _execute_mutation(
        _table("outfit_items").upsert(
            [{"outfit_id": outfit_row["id"], "item_id": item_id} for item_id in item_ids],
            ignore_duplicates=True,
            on_conflict="outfit_id,item_id",
        )
    )
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
    builder = _table("items").select("*").eq("user_id", user_id).order("created_at", desc=True).order("id", desc=True)
    if item_ids is not None:
        usable_item_ids = [str(item_id) for item_id in item_ids if str(item_id).strip()]
        if not usable_item_ids:
            return []
        builder = builder.in_("id", usable_item_ids)
    elif limit is not None:
        builder = builder.range(max(offset, 0), max(offset, 0) + max(limit, 1) - 1)

    rows = _execute_rows(builder)
    if not rows:
        return []

    item_id_strings = [str(row.get("id")) for row in rows if row.get("id") is not None]
    style_by_item_id: dict[str, str | None] = {}

    if item_id_strings:
        outfit_item_rows = _execute_rows(_table("outfit_items").select("item_id, outfit_id").in_("item_id", item_id_strings))
        outfit_ids = sorted({str(row.get("outfit_id")) for row in outfit_item_rows if row.get("outfit_id") is not None})
        outfits_by_id: dict[str, dict[str, Any]] = {}
        if outfit_ids:
            outfit_rows = _execute_rows(
                _table("outfits")
                .select("id, user_id, style_label, created_at")
                .eq("user_id", user_id)
                .in_("id", outfit_ids)
            )
            outfits_by_id = {str(row["id"]): row for row in outfit_rows if row.get("id") is not None}

        best_outfit_by_item_id: dict[str, dict[str, Any]] = {}
        for row in outfit_item_rows:
            item_id = str(row.get("item_id") or "")
            outfit = outfits_by_id.get(str(row.get("outfit_id") or ""))
            if not item_id or not outfit:
                continue
            current = best_outfit_by_item_id.get(item_id)
            if current is None or _sort_key_created_desc(outfit) > _sort_key_created_desc(current):
                best_outfit_by_item_id[item_id] = outfit
        style_by_item_id = {
            item_id: best_outfit_by_item_id[item_id].get("style_label")
            for item_id in best_outfit_by_item_id
        }

    for row in rows:
        row["style_label"] = style_by_item_id.get(str(row.get("id")))
    return rows


def get_items_for_user(user_id: str, item_ids: list[str]) -> list[dict[str, Any]]:
    rows = _list_item_rows(user_id, item_ids=item_ids)
    return [_serialize_item_row(row, style_label=row.get("style_label")) for row in rows]


def list_user_items(user_id: str, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
    rows = _list_item_rows(user_id, limit=limit, offset=offset)
    return [_serialize_item_row(row, style_label=row.get("style_label")) for row in rows]


def list_analysis_history(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = _execute_rows(
        _table("ai_jobs")
        .select("id, photo_id, job_type, model_used, status, error_message, created_at, completed_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .order("id", desc=True)
        .range(0, max(limit, 1) - 1)
    )
    photo_ids = sorted({str(row.get("photo_id")) for row in rows if row.get("photo_id") is not None})
    photo_rows = _execute_rows(_table("photos").select("id, storage_path").in_("id", photo_ids)) if photo_ids else []
    photos_by_id = {str(row["id"]): row for row in photo_rows if row.get("id") is not None}

    job_ids = [str(row.get("id")) for row in rows if row.get("id") is not None]
    outfit_rows = (
        _execute_rows(_table("outfits").select("id, job_id, style_label, created_at").eq("user_id", user_id).in_("job_id", job_ids))
        if job_ids
        else []
    )
    outfit_count_by_job_id: dict[str, int] = defaultdict(int)
    style_by_job_id: dict[str, str | None] = {}
    latest_outfit_by_job_id: dict[str, dict[str, Any]] = {}
    for outfit in outfit_rows:
        job_id = str(outfit.get("job_id") or "")
        if not job_id:
            continue
        outfit_count_by_job_id[job_id] += 1
        current = latest_outfit_by_job_id.get(job_id)
        if current is None or _sort_key_created_desc(outfit) > _sort_key_created_desc(current):
            latest_outfit_by_job_id[job_id] = outfit
            style_by_job_id[job_id] = outfit.get("style_label")

    return [
        {
            "job_id": row["id"],
            "photo_id": row.get("photo_id"),
            "job_type": row.get("job_type"),
            "analysis_model": row.get("model_used"),
            "status": row.get("status"),
            "error_message": row.get("error_message"),
            "created_at": row.get("created_at"),
            "completed_at": row.get("completed_at"),
            "image_url": get_signed_image_url((photos_by_id.get(str(row.get("photo_id") or "")) or {}).get("storage_path")),
            "outfit_count": outfit_count_by_job_id.get(str(row.get("id")), 0),
            "style_label": style_by_job_id.get(str(row.get("id"))),
        }
        for row in rows
    ]


def list_wardrobe(user_id: str, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
    rows = _execute_rows(
        _table("outfits")
        .select("id, photo_id, style_label, generated_image_path, job_id, created_at")
        .eq("user_id", user_id)
    )

    outfits_by_photo_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        photo_id = str(row.get("photo_id") or "")
        if photo_id:
            outfits_by_photo_id[photo_id].append(row)

    enriched_rows: list[dict[str, Any]] = []
    for photo_id, outfit_rows in outfits_by_photo_id.items():
        ordered = sorted(outfit_rows, key=_sort_key_created_asc)
        outfit_count = len(ordered)
        for index, outfit in enumerate(ordered):
            enriched = dict(outfit)
            enriched["outfit_index"] = index
            enriched["outfit_count"] = outfit_count
            enriched_rows.append(enriched)

    enriched_rows.sort(key=_sort_key_created_desc, reverse=True)
    paged_rows = enriched_rows[max(offset, 0): max(offset, 0) + max(limit, 1)]

    photo_ids = sorted({str(row.get("photo_id")) for row in paged_rows if row.get("photo_id") is not None})
    photo_rows = _execute_rows(_table("photos").select("id, storage_path").in_("id", photo_ids)) if photo_ids else []
    photos_by_id = {str(row["id"]): row for row in photo_rows if row.get("id") is not None}

    job_ids = sorted({str(row.get("job_id")) for row in paged_rows if row.get("job_id") is not None})
    job_rows = _execute_rows(_table("ai_jobs").select("id, job_type").in_("id", job_ids)) if job_ids else []
    jobs_by_id = {str(row["id"]): row for row in job_rows if row.get("id") is not None}

    outfit_ids = [str(row.get("id")) for row in paged_rows if row.get("id") is not None]
    outfit_item_rows = _execute_rows(_table("outfit_items").select("outfit_id").in_("outfit_id", outfit_ids)) if outfit_ids else []
    outfit_items_count_by_outfit_id: dict[str, int] = defaultdict(int)
    for row in outfit_item_rows:
        outfit_id = str(row.get("outfit_id") or "")
        if outfit_id:
            outfit_items_count_by_outfit_id[outfit_id] += 1

    wardrobe: list[dict[str, Any]] = []
    for row in paged_rows:
        generated_image_path = _normalize_text(row.get("generated_image_path"))
        source_path = _normalize_text((photos_by_id.get(str(row.get("photo_id") or "")) or {}).get("storage_path"))
        job_type = (jobs_by_id.get(str(row.get("job_id") or "")) or {}).get("job_type")
        wardrobe.append(
            {
                "row_id": str(row["id"]),
                "outfit_id": row["id"],
                "photo_id": row["photo_id"],
                "image_url": get_signed_image_url(generated_image_path or source_path),
                "source_outfit_image_url": get_signed_image_url(source_path),
                "created_at": row.get("created_at"),
                "style_label": row.get("style_label"),
                "source_type": _derive_outfit_source_type(source_path, generated_image_path, job_type),
                "source_outfit_id": None,
                "outfit_index": row.get("outfit_index") or 0,
                "outfit_count": row.get("outfit_count") or 1,
                "outfit_items_count": outfit_items_count_by_outfit_id.get(str(row.get("id")), 0),
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
        source_path = _normalize_text(photo_row.get("storage_path"))
        response = {
            "outfit_id": outfit["id"],
            "outfit_index": outfit["outfit_index"],
            "style": _normalize_label(outfit.get("style_label"), "Outfit"),
            "source_type": _derive_outfit_source_type(source_path, generated_image_path, outfit.get("job_type")),
            "items": items_by_outfit.get(str(outfit["id"]), []),
            "image_url": get_signed_image_url(generated_image_path or source_path),
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

    target = _execute_row(
        _table("outfits")
        .select("id, photo_id, generated_image_path")
        .eq("id", outfit_id)
        .eq("user_id", user_id)
    )
    if not target:
        return False

    generated_image_path = _normalize_text(target.get("generated_image_path"))
    photo_id = target.get("photo_id")
    item_rows = _execute_rows(_table("outfit_items").select("item_id").eq("outfit_id", outfit_id))
    item_ids = [str(row.get("item_id")) for row in item_rows if row.get("item_id") is not None]

    _execute_mutation(_table("outfit_items").delete().eq("outfit_id", outfit_id))
    deleted_rows = _execute_rows(_table("outfits").delete().eq("id", outfit_id).eq("user_id", user_id))
    if not deleted_rows:
        return False

    for item_id in item_ids:
        still_linked = _execute_rows(_table("outfit_items").select("outfit_id").eq("item_id", item_id).limit(1))
        if still_linked:
            continue

        orphan_item = _execute_row(
            _table("items")
            .select("id, image_path")
            .eq("id", item_id)
            .eq("user_id", user_id)
        )
        if orphan_item and orphan_item.get("image_path"):
            orphan_item_paths.append(str(orphan_item["image_path"]))
            _execute_mutation(_table("items").delete().eq("id", item_id).eq("user_id", user_id))

    if photo_id:
        remaining = _execute_count(_table("outfits").select("id", count="exact").eq("photo_id", photo_id).eq("user_id", user_id))
        if remaining == 0:
            photo_row = _execute_row(_table("photos").select("id, storage_path").eq("id", photo_id).eq("user_id", user_id))
            photo_storage_path = _normalize_text((photo_row or {}).get("storage_path"))
            _execute_mutation(_table("photos").delete().eq("id", photo_id).eq("user_id", user_id))

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
    _execute_mutation(
        _table("outfits")
        .update({"style_label": _normalize_label(style_label, "Outfit")})
        .eq("id", outfit_id)
        .eq("user_id", user_id)
    )
    row = _execute_row(_table("outfits").select("*").eq("id", outfit_id).eq("user_id", user_id))
    if not row:
        return None
    return {
        "outfit_id": row["id"],
        "photo_id": row.get("photo_id"),
        "style_label": row.get("style_label"),
        "created_at": row.get("created_at"),
    }


def get_dashboard_stats(user_id: str) -> dict[str, Any]:
    photos_count = _execute_count(_table("photos").select("id", count="exact").eq("user_id", user_id))
    outfits_count = _execute_count(_table("outfits").select("id", count="exact").eq("user_id", user_id))
    analyses_count = _execute_count(_table("ai_jobs").select("id", count="exact").eq("user_id", user_id))
    items_count = _execute_count(_table("items").select("id", count="exact").eq("user_id", user_id))
    generated_rows = _execute_rows(_table("outfits").select("generated_image_path").eq("user_id", user_id))
    generated_outfit_images_count = sum(1 for row in generated_rows if _normalize_text(row.get("generated_image_path")))
    return {
        "photos_count": photos_count,
        "outfits_count": outfits_count,
        "analyses_count": analyses_count,
        "items_count": items_count,
        "generated_outfit_images_count": generated_outfit_images_count,
    }


def get_user_cost_summary(user_id: str, month_start_iso: str) -> dict[str, Any]:
    ai_job_rows = _execute_rows(
        _table("ai_jobs")
        .select("job_type, tokens_input, tokens_output")
        .eq("user_id", user_id)
        .gte("created_at", month_start_iso)
    )

    analysis_runs = 0
    try_on_generations = 0
    custom_outfit_generations = 0
    input_tokens = 0
    output_tokens = 0
    for row in ai_job_rows:
        job_type = _normalize_text(row.get("job_type")).lower()
        input_tokens += _safe_int(row.get("tokens_input"))
        output_tokens += _safe_int(row.get("tokens_output"))
        if job_type == "analysis":
            analysis_runs += 1
        elif job_type == "try_on":
            try_on_generations += 1
        elif job_type == "custom_outfit":
            custom_outfit_generations += 1

    outfit_rows = _execute_rows(
        _table("outfits")
        .select("generated_image_path")
        .eq("user_id", user_id)
        .gte("created_at", month_start_iso)
    )
    generated_outfit_images_count = sum(1 for row in outfit_rows if _normalize_text(row.get("generated_image_path")))

    return {
        "month_start_utc": month_start_iso,
        "analysis_runs": analysis_runs,
        "try_on_generations": try_on_generations,
        "composed_outfits_created": custom_outfit_generations,
        "custom_outfit_generations": custom_outfit_generations,
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
                "call_count": analysis_runs + try_on_generations + custom_outfit_generations,
            },
            "source": "Aggregated from ai_jobs token fields.",
        },
        "generated_outfit_images": generated_outfit_images_count,
        "unit_costs_usd": {},
        "token_pricing_usd_per_1m": {},
    }
