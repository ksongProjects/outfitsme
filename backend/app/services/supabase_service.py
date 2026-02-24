from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from supabase import Client, create_client

from app.config import settings
from app.services.secrets_service import decrypt_secret, encrypt_secret, mask_secret


class SupabaseNotConfiguredError(RuntimeError):
    pass


DETAILED_ITEM_TYPE_KEYWORDS = [
    ("Blazer", ["blazer"]),
    ("Jacket", ["jacket", "bomber", "windbreaker", "anorak", "puffer"]),
    ("Coat", ["coat", "trench", "parka", "overcoat", "peacoat"]),
    ("Hoodie", ["hoodie", "sweatshirt"]),
    ("Sweater", ["sweater", "cardigan", "knit"]),
    ("T-Shirt", ["t-shirt", "tee", "tshirt"]),
    ("Polo", ["polo"]),
    ("Shirt", ["shirt", "button-down", "button up", "blouse", "top"]),
    ("Tank Top", ["tank top", "tank"]),
    ("Dress", ["dress", "gown"]),
    ("Skirt", ["skirt"]),
    ("Jeans", ["jean", "denim"]),
    ("Dress Pants", ["dress pant", "dress pants", "slack", "slacks", "trouser", "trousers", "chino", "chinos"]),
    ("Shorts", ["short", "shorts"]),
    ("Leggings", ["legging", "leggings"]),
    ("Suit", ["suit"]),
    ("Tie", ["tie", "necktie", "bow tie"]),
    ("Belt", ["belt"]),
    ("Scarf", ["scarf"]),
    ("Hat", ["hat", "cap", "beanie"]),
    ("Socks", ["sock", "socks"]),
    ("Sneakers", ["sneaker", "sneakers", "trainer", "trainers"]),
    ("Boots", ["boot", "boots"]),
    ("Loafers", ["loafer", "loafers"]),
    ("Heels", ["heel", "heels", "pump", "pumps", "stiletto"]),
    ("Sandals", ["sandal", "sandals", "flip flop", "flip-flop"]),
    ("Bag", ["bag", "handbag", "tote", "backpack", "purse", "clutch"]),
    ("Jewelry", ["jewelry", "necklace", "ring", "bracelet", "earring"]),
    ("Watch", ["watch"]),
    ("Sunglasses", ["sunglass", "sunglasses", "eyewear", "glasses"]),
]

ACCESSORY_ITEM_TYPES = {
    "Tie",
    "Belt",
    "Scarf",
    "Hat",
    "Socks",
    "Bag",
    "Jewelry",
    "Watch",
    "Sunglasses",
}


def _title_case_label(value: str) -> str:
    cleaned = " ".join((value or "").strip().split())
    return cleaned.title() if cleaned else "Other"


def _normalize_label(value: str, fallback: str) -> str:
    cleaned = " ".join(str(value or "").strip().split())
    if not cleaned:
        return fallback
    return cleaned.title()


def _normalize_item_fields(item: dict) -> dict:
    if not isinstance(item, dict):
        return {"category": "Item", "name": "Unknown Item", "color": "Unknown"}
    return {
        "category": _normalize_label(item.get("category"), "Item"),
        "name": _normalize_label(item.get("name"), "Unknown Item"),
        "color": _normalize_label(item.get("color"), "Unknown")
    }


def _coerce_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except ValueError:
            return {}
    return {}


def _build_item_signature(item: dict) -> tuple[str, str, str]:
    normalized = _normalize_item_fields(item)
    return (
        normalized["category"].lower(),
        normalized["name"].lower(),
        normalized["color"].lower()
    )


def _safe_outfit_index(value) -> int:
    try:
        parsed = int(value)
        return parsed if parsed >= 0 else 0
    except (TypeError, ValueError):
        return 0


def _insert_outfits_and_items(
    client: Client,
    *,
    user_id: str,
    photo_id: str,
    analysis_id: str,
    analysis_created_at: str | None,
    analysis: dict
) -> list[dict]:
    raw_outfits = analysis.get("outfits", [])
    normalized_outfits = []
    if isinstance(raw_outfits, list) and raw_outfits:
        for index, outfit in enumerate(raw_outfits):
            if not isinstance(outfit, dict):
                continue
            normalized_outfits.append(
                {
                    "photo_id": photo_id,
                    "analysis_id": analysis_id,
                    "user_id": user_id,
                    "outfit_index": index,
                    "style_label": _normalize_label(outfit.get("style"), "Unlabeled"),
                    "created_at": analysis_created_at or datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            )

    if not normalized_outfits:
        normalized_outfits = [
            {
                "photo_id": photo_id,
                "analysis_id": analysis_id,
                "user_id": user_id,
                "outfit_index": 0,
                "style_label": _normalize_label(analysis.get("style"), "Unlabeled"),
                "created_at": analysis_created_at or datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        ]

    outfits_insert = (
        client.table("outfits")
        .upsert(normalized_outfits, on_conflict="analysis_id,outfit_index")
        .execute()
    )
    outfits = outfits_insert.data or []
    outfit_id_by_index = {row.get("outfit_index"): row.get("id") for row in outfits if row.get("id")}

    outfit_items_rows = []
    if isinstance(raw_outfits, list) and raw_outfits:
        for index, outfit in enumerate(raw_outfits):
            if not isinstance(outfit, dict):
                continue
            outfit_index = index
            outfit_id = outfit_id_by_index.get(outfit_index)
            if not outfit_id:
                continue
            for item in (outfit.get("items") or []):
                if not isinstance(item, dict):
                    continue
                normalized_item = _normalize_item_fields(item)
                outfit_items_rows.append(
                    {
                        "outfit_id": outfit_id,
                        "user_id": user_id,
                        "category": normalized_item["category"],
                        "name": normalized_item["name"],
                        "color": normalized_item["color"],
                        "attributes_json": {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "outfit_index": outfit_index
                        }
                    }
                )
    else:
        outfit_id = outfit_id_by_index.get(0)
        if outfit_id:
            for item in (analysis.get("items") or []):
                if not isinstance(item, dict):
                    continue
                normalized_item = _normalize_item_fields(item)
                outfit_items_rows.append(
                    {
                        "outfit_id": outfit_id,
                        "user_id": user_id,
                        "category": normalized_item["category"],
                        "name": normalized_item["name"],
                        "color": normalized_item["color"],
                        "attributes_json": {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "outfit_index": 0
                        }
                    }
                )

    if outfit_items_rows:
        client.table("outfit_items").insert(outfit_items_rows).execute()

    return outfits


def _resolve_item_style_label(item: dict, analysis_by_id: dict) -> str:
    attributes = _coerce_dict(item.get("attributes_json") or {})

    analysis_id = item.get("analysis_id")
    analysis_entry = analysis_by_id.get(analysis_id) or {}
    raw_json = _coerce_dict(analysis_entry.get("raw_json") if isinstance(analysis_entry, dict) else {})

    outfit_index_raw = attributes.get("outfit_index")
    try:
        outfit_index = int(outfit_index_raw) if outfit_index_raw is not None else None
    except (TypeError, ValueError):
        outfit_index = None

    if outfit_index is not None and isinstance(raw_json, dict):
        raw_outfits = raw_json.get("outfits")
        if isinstance(raw_outfits, list) and 0 <= outfit_index < len(raw_outfits):
            outfit = raw_outfits[outfit_index]
            if isinstance(outfit, dict):
                style_from_outfit = _normalize_label(outfit.get("style"), "")
                if style_from_outfit:
                    return style_from_outfit
    elif isinstance(raw_json, dict):
        raw_outfits = raw_json.get("outfits")
        if isinstance(raw_outfits, list) and len(raw_outfits) == 1 and isinstance(raw_outfits[0], dict):
            single_outfit_style = _normalize_label(raw_outfits[0].get("style"), "")
            if single_outfit_style:
                return single_outfit_style
        if isinstance(raw_outfits, list) and raw_outfits:
            source_signature = _build_item_signature(item)
            for outfit in raw_outfits:
                if not isinstance(outfit, dict):
                    continue
                raw_items = outfit.get("items")
                if not isinstance(raw_items, list):
                    continue
                for outfit_item in raw_items:
                    if not isinstance(outfit_item, dict):
                        continue
                    if _build_item_signature(outfit_item) == source_signature:
                        matched_style = _normalize_label(outfit.get("style"), "")
                        if matched_style:
                            return matched_style

    style_from_item = _normalize_label(attributes.get("outfit_style"), "")
    if style_from_item:
        return style_from_item

    style_from_analysis = _normalize_label(analysis_entry.get("style_label"), "")
    return style_from_analysis or "Unknown"


def _contains_keyword(text: str, keyword: str) -> bool:
    if not text or not keyword:
        return False
    pattern = rf"\b{re.escape(keyword.lower())}\b"
    return re.search(pattern, text) is not None


def _classify_item_type(category: str, name: str) -> str:
    text = f"{(category or '').lower()} {(name or '').lower()}".strip()
    for label, keywords in DETAILED_ITEM_TYPE_KEYWORDS:
        if any(_contains_keyword(text, keyword) for keyword in keywords):
            return label

    fallback = (category or "").strip()
    return _title_case_label(fallback or "Other")


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


def create_photo_record(user_id: str, storage_path: str, client: Client | None = None) -> dict:
    effective_client = client or get_supabase_client()
    photo_insert = effective_client.table("photos").insert({"user_id": user_id, "storage_path": storage_path}).execute()
    return photo_insert.data[0]


def download_photo_bytes(storage_path: str) -> bytes:
    client = get_supabase_client()
    response = client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
    if isinstance(response, bytes):
        return response
    if isinstance(response, str):
        return response.encode("utf-8")
    return b""


def _persist_analysis_for_photo(client: Client, user_id: str, photo_row: dict, analysis: dict) -> dict:
    analysis_insert = (
        client.table("outfit_analyses")
        .insert(
            {
                "photo_id": photo_row["id"],
                "user_id": user_id,
                "style_label": _normalize_label(analysis.get("style"), "Unknown"),
                "raw_json": analysis
            }
        )
        .execute()
    )
    analysis_row = analysis_insert.data[0]
    _insert_outfits_and_items(
        client,
        user_id=user_id,
        photo_id=photo_row["id"],
        analysis_id=analysis_row["id"],
        analysis_created_at=analysis_row.get("created_at"),
        analysis=analysis
    )

    item_rows = []
    raw_outfits = analysis.get("outfits", [])
    if isinstance(raw_outfits, list) and raw_outfits:
        for outfit_index, outfit in enumerate(raw_outfits):
            if not isinstance(outfit, dict):
                continue
            outfit_style = str(outfit.get("style") or analysis.get("style") or "Unknown").strip() or "Unknown"
            for item in (outfit.get("items") or []):
                if not isinstance(item, dict):
                    continue
                normalized_item = _normalize_item_fields(item)
                item_rows.append(
                    {
                        "analysis_id": analysis_row["id"],
                        "user_id": user_id,
                        "category": normalized_item["category"],
                        "name": normalized_item["name"],
                        "color": normalized_item["color"],
                        "attributes_json": {
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "outfit_index": outfit_index,
                            "outfit_style": _normalize_label(outfit_style, "Unknown")
                        }
                    }
                )
    else:
        for item in analysis.get("items", []):
            normalized_item = _normalize_item_fields(item)
            item_rows.append(
                {
                    "analysis_id": analysis_row["id"],
                    "user_id": user_id,
                    "category": normalized_item["category"],
                    "name": normalized_item["name"],
                    "color": normalized_item["color"],
                    "attributes_json": {
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                        "outfit_index": 0,
                        "outfit_style": _normalize_label(analysis.get("style"), "Unknown")
                    }
                }
            )

    if item_rows:
        client.table("items").insert(item_rows).execute()

    return {
        "photo_id": photo_row["id"],
        "analysis_id": analysis_row["id"],
        "storage_path": photo_row["storage_path"]
    }


def persist_analysis_for_photo(user_id: str, photo_id: str, analysis: dict) -> dict:
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
        raise ValueError("Photo not found for user.")
    return _persist_analysis_for_photo(client, user_id, photo_row, analysis)


def persist_analysis(user_id: str, storage_path: str, analysis: dict) -> dict:
    client = get_supabase_client()
    photo_row = create_photo_record(user_id, storage_path, client=client)
    return _persist_analysis_for_photo(client, user_id, photo_row, analysis)


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
    try:
        response = client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            storage_path,
            expires_in_seconds
        )
        data = getattr(response, "data", None) or response
        if isinstance(data, dict):
            return _normalize_signed_url(data)
    except Exception:  # noqa: BLE001
        return None
    return None


def list_wardrobe(user_id: str, limit: int = 20) -> list[dict]:
    client = get_supabase_client()
    outfits_response = (
        client.table("outfits")
        .select("id,photo_id,analysis_id,outfit_index,style_label,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    outfits = outfits_response.data or []
    if not outfits:
        return []

    photo_ids = list({outfit.get("photo_id") for outfit in outfits if outfit.get("photo_id")})
    outfit_ids = [outfit.get("id") for outfit in outfits if outfit.get("id")]

    photos_by_id = {}
    if photo_ids:
        photos_response = (
            client.table("photos")
            .select("id,storage_path,created_at")
            .in_("id", photo_ids)
            .eq("user_id", user_id)
            .execute()
        )
        photos_by_id = {photo.get("id"): photo for photo in (photos_response.data or []) if photo.get("id")}

    counts_by_photo = {}
    if photo_ids:
        photo_outfits_response = (
            client.table("outfits")
            .select("photo_id")
            .in_("photo_id", photo_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for row in (photo_outfits_response.data or []):
            photo_id = row.get("photo_id")
            if not photo_id:
                continue
            counts_by_photo[photo_id] = counts_by_photo.get(photo_id, 0) + 1

    item_counts_by_outfit = {}
    if outfit_ids:
        outfit_items_response = (
            client.table("outfit_items")
            .select("outfit_id")
            .in_("outfit_id", outfit_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for row in (outfit_items_response.data or []):
            outfit_id = row.get("outfit_id")
            if not outfit_id:
                continue
            item_counts_by_outfit[outfit_id] = item_counts_by_outfit.get(outfit_id, 0) + 1

    wardrobe = []
    for outfit in outfits:
        photo = photos_by_id.get(outfit.get("photo_id")) or {}
        outfit_id = outfit.get("id")
        wardrobe.append(
            {
                "row_id": outfit_id or f"{outfit.get('photo_id')}:{outfit.get('outfit_index', 0)}",
                "outfit_id": outfit_id,
                "photo_id": outfit.get("photo_id"),
                "storage_path": photo.get("storage_path"),
                "created_at": outfit.get("created_at") or photo.get("created_at"),
                "analysis_id": outfit.get("analysis_id"),
                "analysis_created_at": None,
                "style_label": _normalize_label(outfit.get("style_label"), "Unlabeled"),
                "outfit_index": _safe_outfit_index(outfit.get("outfit_index")),
                "outfit_count": counts_by_photo.get(outfit.get("photo_id"), 1),
                "outfit_items_count": item_counts_by_outfit.get(outfit_id, 0)
            }
        )
    return wardrobe


def list_analysis_history(user_id: str, limit: int = 50) -> list[dict]:
    client = get_supabase_client()
    jobs_response = (
        client.table("analysis_jobs")
        .select("id,photo_id,analysis_model,status,error_message,created_at,completed_at,updated_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    jobs = jobs_response.data or []
    if not jobs:
        return []

    photo_ids = list({job.get("photo_id") for job in jobs if job.get("photo_id")})
    photos_by_id = {}
    if photo_ids:
        photos_response = (
            client.table("photos")
            .select("id,storage_path,created_at")
            .in_("id", photo_ids)
            .eq("user_id", user_id)
            .execute()
        )
        photos_by_id = {photo.get("id"): photo for photo in (photos_response.data or []) if photo.get("id")}

    outfit_counts_by_photo = {}
    if photo_ids:
        outfits_response = (
            client.table("outfits")
            .select("photo_id")
            .in_("photo_id", photo_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for row in (outfits_response.data or []):
            photo_id = row.get("photo_id")
            if not photo_id:
                continue
            outfit_counts_by_photo[photo_id] = outfit_counts_by_photo.get(photo_id, 0) + 1

    history = []
    for job in jobs:
        photo_id = job.get("photo_id")
        photo = photos_by_id.get(photo_id) or {}
        storage_path = photo.get("storage_path") or ""
        image_url = (
            get_signed_image_url(storage_path, expires_in_seconds=3600)
            if storage_path and not str(storage_path).startswith("virtual/")
            else None
        )
        history.append(
            {
                "job_id": job.get("id"),
                "photo_id": photo_id,
                "analysis_model": job.get("analysis_model"),
                "status": job.get("status"),
                "error_message": job.get("error_message"),
                "created_at": job.get("created_at"),
                "completed_at": job.get("completed_at"),
                "updated_at": job.get("updated_at"),
                "photo_created_at": photo.get("created_at"),
                "storage_path": storage_path,
                "image_url": image_url,
                "outfit_count": outfit_counts_by_photo.get(photo_id, 0)
            }
        )
    return history


def list_user_items(user_id: str, limit: int = 200) -> list[dict]:
    client = get_supabase_client()
    items_response = (
        client.table("items")
        .select("id,analysis_id,category,name,color,attributes_json,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    items = items_response.data or []
    analysis_ids = list({item.get("analysis_id") for item in items if item.get("analysis_id")})
    analysis_by_id = {}
    if analysis_ids:
        analyses_response = (
            client.table("outfit_analyses")
            .select("id,style_label,raw_json")
            .in_("id", analysis_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for analysis in (analyses_response.data or []):
            analysis_by_id[analysis.get("id")] = {
                "style_label": _normalize_label(analysis.get("style_label"), "Unknown"),
                "raw_json": _coerce_dict(analysis.get("raw_json") if isinstance(analysis, dict) else {})
            }

    normalized_items = []
    for item in items:
        attributes = _coerce_dict(item.get("attributes_json") or {})
        image_path = attributes.get("generated_item_image_path") or ""
        normalized_items.append(
            {
                **item,
                "category": _normalize_label(item.get("category"), "Item"),
                "name": _normalize_label(item.get("name"), "Unknown Item"),
                "color": _normalize_label(item.get("color"), "Unknown"),
                "style_label": _resolve_item_style_label(item, analysis_by_id),
                "image_url": (
                    get_signed_image_url(image_path, expires_in_seconds=3600)
                    if image_path
                    else None
                )
            }
        )
    return normalized_items


def list_items_for_analysis(user_id: str, analysis_id: str) -> list[dict]:
    client = get_supabase_client()
    response = (
        client.table("items")
        .select("id,category,name,color,attributes_json")
        .eq("user_id", user_id)
        .eq("analysis_id", analysis_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = response.data or []
    enriched = []
    for row in rows:
        attributes = _coerce_dict(row.get("attributes_json") or {})
        image_path = attributes.get("generated_item_image_path") or ""
        enriched.append(
            {
                **row,
                "image_url": (
                    get_signed_image_url(image_path, expires_in_seconds=3600)
                    if image_path
                    else None
                )
            }
        )
    return enriched


def _decode_image_data_uri(data_uri: str) -> tuple[bytes, str]:
    if not isinstance(data_uri, str) or not data_uri.startswith("data:"):
        raise ValueError("Generated item image is not a valid data URI.")
    try:
        header, encoded = data_uri.split(",", 1)
    except ValueError as exc:
        raise ValueError("Generated item image data URI is malformed.") from exc
    mime_match = re.match(r"^data:(image/[-+.\w]+);base64$", header)
    if not mime_match:
        raise ValueError("Generated item image data URI header is invalid.")
    mime_type = mime_match.group(1)
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Generated item image payload is not valid base64.") from exc
    return image_bytes, mime_type


def save_generated_item_image(user_id: str, item_id: str, data_uri: str) -> dict:
    client = get_supabase_client()
    image_bytes, content_type = _decode_image_data_uri(data_uri)
    extension = ".png" if content_type == "image/png" else ".jpg"
    storage_path = f"{user_id}/generated/items/{item_id}-{uuid4().hex}{extension}"
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": content_type}
    )

    item_response = (
        client.table("items")
        .select("id,attributes_json")
        .eq("id", item_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    item_row = (item_response.data or [None])[0]
    if not item_row:
        raise ValueError("Item not found while saving generated image.")

    attributes = _coerce_dict(item_row.get("attributes_json") or {})
    attributes["generated_item_image_path"] = storage_path
    attributes["generated_item_image_size_limit"] = "1K square requested from generation API"
    attributes["generated_item_image_created_at"] = datetime.now(timezone.utc).isoformat()
    (
        client.table("items")
        .update({"attributes_json": attributes})
        .eq("id", item_id)
        .eq("user_id", user_id)
        .execute()
    )
    return {
        "storage_path": storage_path
    }


def get_user_monthly_analysis_count(user_id: str, month_start_iso: str) -> int:
    client = get_supabase_client()
    response = (
        client.table("analysis_jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .gte("completed_at", month_start_iso)
        .execute()
    )
    return len(response.data or [])


def get_user_monthly_composed_outfit_count(user_id: str, month_start_iso: str) -> int:
    client = get_supabase_client()
    response = (
        client.table("photos")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", month_start_iso)
        .like("storage_path", "virtual/composed/%")
        .execute()
    )
    return len(response.data or [])


def create_analysis_job(
    user_id: str,
    *,
    photo_id: str,
    storage_path: str,
    mime_type: str,
    analysis_model: str
) -> dict:
    client = get_supabase_client()
    response = (
        client.table("analysis_jobs")
        .insert(
            {
                "user_id": user_id,
                "photo_id": photo_id,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "analysis_model": analysis_model,
                "status": "queued",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        )
        .execute()
    )
    return (response.data or [None])[0]


def get_analysis_job_for_user(user_id: str, job_id: str) -> dict | None:
    client = get_supabase_client()
    response = (
        client.table("analysis_jobs")
        .select(
            "id,user_id,photo_id,storage_path,mime_type,analysis_model,status,error_message,result_json,"
            "created_at,started_at,completed_at,updated_at"
        )
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def claim_analysis_job(job_id: str) -> dict | None:
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    response = (
        client.table("analysis_jobs")
        .update(
            {
                "status": "processing",
                "started_at": now_iso,
                "updated_at": now_iso
            }
        )
        .eq("id", job_id)
        .eq("status", "queued")
        .execute()
    )
    return (response.data or [None])[0]


def mark_analysis_job_completed(job_id: str, result_json: dict) -> None:
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    (
        client.table("analysis_jobs")
        .update(
            {
                "status": "completed",
                "result_json": result_json,
                "error_message": None,
                "completed_at": now_iso,
                "updated_at": now_iso
            }
        )
        .eq("id", job_id)
        .execute()
    )


def mark_analysis_job_failed(job_id: str, error_message: str) -> None:
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    (
        client.table("analysis_jobs")
        .update(
            {
                "status": "failed",
                "error_message": (error_message or "Unknown error.")[:500],
                "completed_at": now_iso,
                "updated_at": now_iso
            }
        )
        .eq("id", job_id)
        .execute()
    )


def mark_analysis_job_progress(job_id: str, progress: dict) -> None:
    client = get_supabase_client()
    (
        client.table("analysis_jobs")
        .update(
            {
                "result_json": {"progress": progress},
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        )
        .eq("id", job_id)
        .eq("status", "processing")
        .execute()
    )


def get_analysis_job_by_id(job_id: str) -> dict | None:
    client = get_supabase_client()
    response = (
        client.table("analysis_jobs")
        .select(
            "id,user_id,photo_id,storage_path,mime_type,analysis_model,status,error_message,result_json,"
            "created_at,started_at,completed_at,updated_at"
        )
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


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
    if storage_path and not str(storage_path).startswith("virtual/"):
        client.storage.from_(settings.SUPABASE_BUCKET).remove([storage_path])

    (
        client.table("photos")
        .delete()
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .execute()
    )
    return True


def delete_wardrobe_outfit(user_id: str, outfit_id: str) -> bool:
    client = get_supabase_client()
    outfit_response = (
        client.table("outfits")
        .select("id,analysis_id,outfit_index")
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    outfit_row = (outfit_response.data or [None])[0]
    if not outfit_row:
        return False

    analysis_id = outfit_row.get("analysis_id")
    outfit_index = _safe_outfit_index(outfit_row.get("outfit_index"))
    (
        client.table("items")
        .delete()
        .eq("user_id", user_id)
        .eq("analysis_id", analysis_id)
        .filter("attributes_json->>outfit_index", "eq", str(outfit_index))
        .execute()
    )

    (
        client.table("outfits")
        .delete()
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .execute()
    )
    return True


def update_wardrobe_outfit_style_label(user_id: str, outfit_id: str, style_label: str) -> dict | None:
    client = get_supabase_client()
    normalized_style_label = _normalize_label(style_label, "Unlabeled")
    now_iso = datetime.now(timezone.utc).isoformat()

    existing_response = (
        client.table("outfits")
        .select("id,photo_id,outfit_index")
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    existing_row = (existing_response.data or [None])[0]
    if not existing_row:
        return None

    (
        client.table("outfits")
        .update(
            {
                "style_label": normalized_style_label,
                "updated_at": now_iso
            }
        )
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "outfit_id": existing_row.get("id"),
        "photo_id": existing_row.get("photo_id"),
        "outfit_index": _safe_outfit_index(existing_row.get("outfit_index")),
        "style_label": normalized_style_label
    }


def get_wardrobe_photo_details(user_id: str, photo_id: str, outfit_index: int | None = None) -> dict | None:
    client = get_supabase_client()

    photo_response = (
        client.table("photos")
        .select("id,storage_path,created_at")
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    photo_row = (photo_response.data or [None])[0]
    if not photo_row:
        return None

    analysis_response = (
        client.table("outfit_analyses")
        .select("id,style_label,raw_json,created_at")
        .eq("photo_id", photo_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    analysis_row = (analysis_response.data or [None])[0]

    outfit_rows_response = (
        client.table("outfits")
        .select("id,outfit_index,style_label")
        .eq("photo_id", photo_id)
        .eq("user_id", user_id)
        .execute()
    )
    outfit_rows = outfit_rows_response.data or []
    outfits_by_index = {
        _safe_outfit_index(row.get("outfit_index")): row
        for row in outfit_rows
        if isinstance(row, dict)
    }

    outfits = []
    if analysis_row:
        raw_json = analysis_row.get("raw_json") or {}
        raw_outfits = raw_json.get("outfits") if isinstance(raw_json, dict) else None
        if isinstance(raw_outfits, list):
            for index, outfit in enumerate(raw_outfits):
                if not isinstance(outfit, dict):
                    continue
                outfit_items = [item for item in (outfit.get("items") or []) if isinstance(item, dict)]
                outfit_row = outfits_by_index.get(index) or {}
                outfits.append(
                    {
                        "outfit_id": outfit_row.get("id"),
                        "outfit_index": index,
                        "style": _normalize_label(
                            outfit_row.get("style_label") or outfit.get("style"),
                            "Unlabeled"
                        ),
                        "items": [_normalize_item_fields(item) for item in outfit_items]
                    }
                )

        if not outfits:
            fallback_items = raw_json.get("items") if isinstance(raw_json, dict) else []
            fallback_row = outfits_by_index.get(0) or {}
            outfits = [
                {
                    "outfit_id": fallback_row.get("id"),
                    "outfit_index": 0,
                    "style": _normalize_label(
                        fallback_row.get("style_label") or analysis_row.get("style_label"),
                        "Unlabeled"
                    ),
                    "items": [_normalize_item_fields(item) for item in (fallback_items or []) if isinstance(item, dict)]
                }
            ]

    storage_path = photo_row.get("storage_path") or ""
    image_url = (
        get_signed_image_url(storage_path, expires_in_seconds=3600)
        if storage_path and not str(storage_path).startswith("virtual/")
        else None
    )

    selected_outfit = None
    if outfit_index is not None:
        selected_outfit = next((outfit for outfit in outfits if outfit.get("outfit_index") == outfit_index), None)

    return {
        "photo_id": photo_row["id"],
        "created_at": photo_row.get("created_at"),
        "analysis_id": analysis_row["id"] if analysis_row else None,
        "style_label": _normalize_label(analysis_row.get("style_label"), "Unlabeled") if analysis_row else None,
        "analysis_created_at": analysis_row["created_at"] if analysis_row else None,
        "image_url": image_url,
        "outfits": outfits,
        "selected_outfit_index": outfit_index,
        "selected_outfit": selected_outfit
    }


def get_dashboard_stats(user_id: str) -> dict:
    client = get_supabase_client()
    now_utc = datetime.now(timezone.utc)
    week_start_iso = (now_utc - timedelta(days=7)).isoformat()

    photos = (
        client.table("photos")
        .select("id,storage_path")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    analyses = (
        client.table("outfit_analyses")
        .select("id,raw_json")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    outfits = (
        client.table("outfits")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    items = (
        client.table("items")
        .select("id,category,name,color")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    latest_photo_row = (
        client.table("photos")
        .select("id,storage_path,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    latest_photo = (latest_photo_row or [None])[0]

    weekly_analyses_count = len(
        (
            client.table("outfit_analyses")
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", week_start_iso)
            .execute()
        ).data or []
    )
    weekly_outfits_count = len(
        (
            client.table("outfits")
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", week_start_iso)
            .execute()
        ).data or []
    )
    weekly_items_count = len(
        (
            client.table("items")
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", week_start_iso)
            .execute()
        ).data or []
    )

    detailed_type_counts = {}
    clothing_type_counts = {}
    accessory_type_counts = {}
    color_counts = {}
    accessories_items_count = 0
    clothing_items_count = 0
    for item in items:
        item_type = _classify_item_type(item.get("category") or "", item.get("name") or "")
        color = _normalize_label(item.get("color"), "Unknown")
        detailed_type_counts[item_type] = detailed_type_counts.get(item_type, 0) + 1
        color_counts[color] = color_counts.get(color, 0) + 1
        if item_type in ACCESSORY_ITEM_TYPES:
            accessories_items_count += 1
            accessory_type_counts[item_type] = accessory_type_counts.get(item_type, 0) + 1
        else:
            clothing_items_count += 1
            clothing_type_counts[item_type] = clothing_type_counts.get(item_type, 0) + 1

    detailed_item_types = [
        {"label": label, "count": count}
        for label, count in sorted(detailed_type_counts.items(), key=lambda pair: pair[1], reverse=True)
    ]
    clothing_item_types = [
        {"label": label, "count": count}
        for label, count in sorted(clothing_type_counts.items(), key=lambda pair: pair[1], reverse=True)
    ]
    accessory_item_types = [
        {"label": label, "count": count}
        for label, count in sorted(accessory_type_counts.items(), key=lambda pair: pair[1], reverse=True)
    ]
    top_item_types = detailed_item_types[:10]
    top_colors = [
        {"label": label, "count": count}
        for label, count in sorted(color_counts.items(), key=lambda pair: pair[1], reverse=True)[:5]
    ]

    latest_outfit = {
        "photo_id": latest_photo["id"],
        "created_at": latest_photo.get("created_at"),
        "image_url": get_signed_image_url(latest_photo.get("storage_path") or "", expires_in_seconds=3600)
        if latest_photo and latest_photo.get("storage_path")
        else None
    } if latest_photo else None

    photos_count = len(
        [photo for photo in photos if not str(photo.get("storage_path") or "").startswith("virtual/")]
    )
    analyses_count = len(analyses)
    items_count = len(items)
    outfits_count = len(outfits)

    return {
        "photos_count": photos_count,
        "outfits_count": outfits_count,
        "analyses_count": analyses_count,
        "items_count": items_count,
        "weekly_activity": {
            "analyses_count": weekly_analyses_count,
            "outfits_count": weekly_outfits_count,
            "items_count": weekly_items_count,
            "window_start_utc": week_start_iso
        },
        "category_split": {
            "clothing_items_count": clothing_items_count,
            "accessories_items_count": accessories_items_count
        },
        "top_item_types": top_item_types,
        "detailed_item_types": detailed_item_types,
        "clothing_item_types": clothing_item_types,
        "accessory_item_types": accessory_item_types,
        "top_colors": top_colors,
        "latest_outfit": latest_outfit,
        "highlights": {
            "most_common_item_type": top_item_types[0]["label"] if top_item_types else "N/A",
            "most_common_color": top_colors[0]["label"] if top_colors else "N/A",
            "most_common_accessory_type": accessory_item_types[0]["label"] if accessory_item_types else "N/A"
        }
    }


def compose_outfit_from_items(
    user_id: str,
    item_ids: list[str],
    style_label: str = "Composed outfit"
) -> dict:
    client = get_supabase_client()
    unique_item_ids = []
    seen = set()
    for item_id in item_ids:
        value = str(item_id or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique_item_ids.append(value)

    if not unique_item_ids:
        raise ValueError("item_ids must include at least one valid item id.")

    source_items = (
        client.table("items")
        .select("id,category,name,color")
        .eq("user_id", user_id)
        .in_("id", unique_item_ids)
        .execute()
    ).data or []
    if not source_items:
        raise ValueError("No matching items found for this user.")

    style = _normalize_label(style_label, "Composed Outfit")
    composed_items = [
        _normalize_item_fields(item)
        for item in source_items
    ]

    photo_insert = (
        client.table("photos")
        .insert(
            {
                "user_id": user_id,
                "storage_path": f"virtual/composed/{uuid4().hex}.json"
            }
        )
        .execute()
    )
    photo_row = photo_insert.data[0]

    raw_json = {
        "style": style,
        "items": composed_items,
        "outfits": [
            {
                "style": style,
                "items": composed_items
            }
        ],
        "source_item_ids": unique_item_ids,
        "composed": True
    }

    analysis_insert = (
        client.table("outfit_analyses")
        .insert(
            {
                "photo_id": photo_row["id"],
                "user_id": user_id,
                "style_label": style,
                "raw_json": raw_json
            }
        )
        .execute()
    )
    analysis_row = analysis_insert.data[0]
    _insert_outfits_and_items(
        client,
        user_id=user_id,
        photo_id=photo_row["id"],
        analysis_id=analysis_row["id"],
        analysis_created_at=analysis_row.get("created_at"),
        analysis=raw_json
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    new_item_rows = [
        {
            "analysis_id": analysis_row["id"],
            "user_id": user_id,
            "category": _normalize_label(item.get("category"), "Item"),
            "name": _normalize_label(item.get("name"), "Unknown Item"),
            "color": _normalize_label(item.get("color"), "Unknown"),
            "attributes_json": {
                "captured_at": now_iso,
                "outfit_index": 0,
                "outfit_style": style,
                "composed_from_item_id": item.get("id")
            }
        }
        for item in source_items
    ]
    if new_item_rows:
        client.table("items").insert(new_item_rows).execute()

    return {
        "photo_id": photo_row["id"],
        "analysis_id": analysis_row["id"],
        "style_label": style,
        "items_count": len(new_item_rows)
    }


def _empty_model_settings() -> dict:
    return {
        "preferred_model": settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key": "",
        "aws_region": "",
        "aws_bedrock_agent_id": "",
        "aws_bedrock_agent_alias_id": "",
        "profile_gender": "",
        "profile_age": None,
        "profile_photo_path": "",
        "enable_outfit_image_generation": False,
        "enable_online_store_search": False
    }


def get_user_model_settings(user_id: str) -> dict:
    client = get_supabase_client()
    response = (
        client.table("user_settings")
        .select(
            "preferred_model,gemini_api_key_enc,aws_region,aws_bedrock_agent_id,aws_bedrock_agent_alias_id,"
            "profile_gender,profile_age,profile_photo_path,enable_outfit_image_generation,enable_online_store_search"
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
        "aws_region": row.get("aws_region") or "",
        "aws_bedrock_agent_id": row.get("aws_bedrock_agent_id") or "",
        "aws_bedrock_agent_alias_id": row.get("aws_bedrock_agent_alias_id") or "",
        "profile_gender": row.get("profile_gender") or "",
        "profile_age": row.get("profile_age"),
        "profile_photo_path": row.get("profile_photo_path") or "",
        "enable_outfit_image_generation": bool(row.get("enable_outfit_image_generation")),
        "enable_online_store_search": bool(row.get("enable_online_store_search"))
    }


def get_user_model_settings_masked(user_id: str) -> dict:
    settings_row = get_user_model_settings(user_id)
    return {
        "preferred_model": settings_row.get("preferred_model") or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key_masked": mask_secret(settings_row.get("gemini_api_key", "")),
        "aws_region": settings_row.get("aws_region", ""),
        "aws_bedrock_agent_id": settings_row.get("aws_bedrock_agent_id", ""),
        "aws_bedrock_agent_alias_id": settings_row.get("aws_bedrock_agent_alias_id", ""),
        "profile_gender": settings_row.get("profile_gender", ""),
        "profile_age": settings_row.get("profile_age"),
        "profile_photo_url": (
            get_signed_image_url(settings_row.get("profile_photo_path"), expires_in_seconds=3600)
            if settings_row.get("profile_photo_path")
            else None
        ),
        "enable_outfit_image_generation": bool(settings_row.get("enable_outfit_image_generation")),
        "enable_online_store_search": bool(settings_row.get("enable_online_store_search"))
    }


def upsert_user_model_settings(user_id: str, payload: dict) -> dict:
    client = get_supabase_client()
    current = get_user_model_settings(user_id)

    preferred_model = str(payload.get("preferred_model", current.get("preferred_model", ""))).strip()

    gemini_api_key = payload.get("gemini_api_key")
    aws_region = payload.get("aws_region")
    aws_bedrock_agent_id = payload.get("aws_bedrock_agent_id")
    aws_bedrock_agent_alias_id = payload.get("aws_bedrock_agent_alias_id")
    profile_gender = payload.get("profile_gender")
    profile_age = payload.get("profile_age")
    profile_photo_path = payload.get("profile_photo_path")
    enable_outfit_image_generation = payload.get("enable_outfit_image_generation")
    enable_online_store_search = payload.get("enable_online_store_search")

    def _next_secret(incoming, existing):
        if incoming is None:
            return existing
        return str(incoming).strip()

    def _to_bool(value, fallback):
        if value is None:
            return fallback
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    row = {
        "user_id": user_id,
        "preferred_model": preferred_model or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key_enc": encrypt_secret(_next_secret(gemini_api_key, current.get("gemini_api_key", ""))),
        "aws_region": str(aws_region).strip() if aws_region is not None else current.get("aws_region", ""),
        "aws_bedrock_agent_id": (
            str(aws_bedrock_agent_id).strip() if aws_bedrock_agent_id is not None else current.get("aws_bedrock_agent_id", "")
        ),
        "aws_bedrock_agent_alias_id": (
            str(aws_bedrock_agent_alias_id).strip() if aws_bedrock_agent_alias_id is not None else current.get("aws_bedrock_agent_alias_id", "")
        ),
        "profile_gender": str(profile_gender).strip() if profile_gender is not None else current.get("profile_gender", ""),
        "profile_age": (
            int(profile_age)
            if str(profile_age).strip().isdigit() and 0 < int(profile_age) < 121
            else current.get("profile_age")
        ) if profile_age is not None else current.get("profile_age"),
        "profile_photo_path": (
            str(profile_photo_path).strip()
            if profile_photo_path is not None
            else current.get("profile_photo_path", "")
        ),
        "enable_outfit_image_generation": (
            _to_bool(enable_outfit_image_generation, bool(current.get("enable_outfit_image_generation")))
        ),
        "enable_online_store_search": (
            _to_bool(enable_online_store_search, bool(current.get("enable_online_store_search")))
        ),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    (
        client.table("user_settings")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return get_user_model_settings_masked(user_id)


def save_user_profile_photo(user_id: str, file_storage) -> dict:
    client = get_supabase_client()
    current = get_user_model_settings(user_id)
    previous_path = current.get("profile_photo_path", "")

    ext = ".jpg"
    if file_storage.filename and "." in file_storage.filename:
        ext = "." + file_storage.filename.rsplit(".", 1)[-1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"

    storage_path = f"{user_id}/profile/reference-{uuid4().hex}{ext}"
    content = file_storage.read()
    content_type = file_storage.mimetype or mimetypes.guess_type(file_storage.filename or "")[0] or "application/octet-stream"
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": content_type}
    )

    (
        client.table("user_settings")
        .upsert(
            {
                "user_id": user_id,
                "profile_photo_path": storage_path,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="user_id"
        )
        .execute()
    )

    if previous_path:
        try:
            client.storage.from_(settings.SUPABASE_BUCKET).remove([previous_path])
        except Exception:  # noqa: BLE001
            pass

    return {
        "profile_photo_path": storage_path,
        "profile_photo_url": get_signed_image_url(storage_path, expires_in_seconds=3600)
    }


def get_user_cost_summary(user_id: str, month_start_iso: str) -> dict:
    analysis_count = get_user_monthly_analysis_count(user_id, month_start_iso)
    composed_outfit_count = get_user_monthly_composed_outfit_count(user_id, month_start_iso)
    analysis_cost = round(analysis_count * settings.ANALYSIS_COST_USD, 4)
    outfit_image_cost = round(composed_outfit_count * settings.OUTFIT_IMAGE_COST_USD, 4)
    item_image_cost = round(composed_outfit_count * settings.ITEM_IMAGE_MAX * settings.ITEM_IMAGE_COST_USD, 4)
    total_cost = round(analysis_cost + outfit_image_cost + item_image_cost, 4)
    return {
        "month_start_utc": month_start_iso,
        "analysis_runs": analysis_count,
        "custom_outfit_generations": composed_outfit_count,
        "unit_costs_usd": {
            "analysis": settings.ANALYSIS_COST_USD,
            "outfit_image_generation": settings.OUTFIT_IMAGE_COST_USD,
            "item_image_generation": settings.ITEM_IMAGE_COST_USD
        },
        "estimated_costs_usd": {
            "analysis": analysis_cost,
            "outfit_image_generation": outfit_image_cost,
            "item_image_generation": item_image_cost,
            "total": total_cost
        },
        "limits": {
            "monthly_custom_outfit_generation_limit": settings.MONTHLY_CUSTOM_OUTFIT_LIMIT
        }
    }
