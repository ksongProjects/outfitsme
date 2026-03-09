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
from app.services.access_control import normalize_user_role
from app.services.better_auth_service import get_user_id_from_session_token


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

OUTFIT_SOURCE_PHOTO_ANALYSIS = "photo_analysis"
OUTFIT_SOURCE_CUSTOM = "custom_outfit"
OUTFIT_SOURCE_OUTFITSME = "outfitsme_generated"


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


def _normalize_ai_usage(value) -> dict:
    usage = _coerce_dict(value)
    input_tokens = _safe_outfit_index(usage.get("input_tokens"))
    output_tokens = _safe_outfit_index(usage.get("output_tokens"))
    input_images = _safe_outfit_index(usage.get("input_images"))
    output_images = _safe_outfit_index(usage.get("output_images"))
    total_tokens = _safe_outfit_index(usage.get("total_tokens"))
    if total_tokens <= 0:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "input_images": input_images,
        "output_images": output_images
    }


def _sum_ai_usage(entries: list[dict]) -> dict:
    totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "input_images": 0, "output_images": 0}
    for entry in entries:
        usage = _normalize_ai_usage(entry)
        totals["input_tokens"] += usage["input_tokens"]
        totals["output_tokens"] += usage["output_tokens"]
        totals["total_tokens"] += usage["total_tokens"]
        totals["input_images"] += usage["input_images"]
        totals["output_images"] += usage["output_images"]
    return totals


def _estimate_token_cost_usd(usage: dict) -> dict:
    normalized = _normalize_ai_usage(usage)
    input_cost = round(
        (normalized["input_tokens"] / 1_000_000.0) * settings.GEMINI_INPUT_COST_PER_1M_TOKENS_USD,
        6
    )
    output_cost = round(
        (normalized["output_tokens"] / 1_000_000.0) * settings.GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD,
        6
    )
    return {
        "input": input_cost,
        "output": output_cost,
        "total": round(input_cost + output_cost, 6)
    }


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


def _normalize_outfit_source_type(value: str | None, fallback: str = OUTFIT_SOURCE_PHOTO_ANALYSIS) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {OUTFIT_SOURCE_PHOTO_ANALYSIS, OUTFIT_SOURCE_CUSTOM, OUTFIT_SOURCE_OUTFITSME}:
        return normalized
    return fallback


def _insert_outfits_and_items(
    client: Client,
    *,
    user_id: str,
    photo_id: str,
    analysis_id: str,
    analysis_created_at: str | None,
    analysis: dict,
    source_type: str = OUTFIT_SOURCE_PHOTO_ANALYSIS,
    source_outfit_id: str | None = None,
    generated_image_path: str | None = None
) -> list[dict]:
    normalized_source_type = _normalize_outfit_source_type(source_type)
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
                    "source_type": normalized_source_type,
                    "source_outfit_id": source_outfit_id,
                    "generated_image_path": generated_image_path,
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
                "source_type": normalized_source_type,
                "source_outfit_id": source_outfit_id,
                "generated_image_path": generated_image_path,
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
    # Try Better Auth first (new auth system)
    user_id = get_user_id_from_session_token(access_token)
    if user_id:
        return user_id
    
    # Fall back to Supabase auth (legacy)
    try:
        client = get_supabase_client()
        user_response = client.auth.get_user(access_token)
        user = getattr(user_response, "user", None)
        return getattr(user, "id", None)
    except Exception:
        return None


def get_user_from_token(access_token: str):
    client = get_supabase_client()
    user_response = client.auth.get_user(access_token)
    return getattr(user_response, "user", None)


def get_user_created_at_from_token(access_token: str) -> str | None:
    user = get_user_from_token(access_token)
    return getattr(user, "created_at", None)


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
        analysis=analysis,
        source_type=OUTFIT_SOURCE_PHOTO_ANALYSIS
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
    return _get_signed_image_url_with_client(
        get_supabase_client(),
        storage_path,
        expires_in_seconds=expires_in_seconds
    )


def _get_signed_image_url_with_client(
    client: Client,
    storage_path: str,
    *,
    expires_in_seconds: int = 3600
) -> str | None:
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


def _build_signed_url_resolver(
    client: Client,
    *,
    expires_in_seconds: int = 3600
):
    cache: dict[str, str | None] = {}

    def _resolve(storage_path: str | None) -> str | None:
        path = str(storage_path or "").strip()
        if not path or path.startswith("virtual/"):
            return None
        if path in cache:
            return cache[path]
        signed = _get_signed_image_url_with_client(
            client,
            path,
            expires_in_seconds=expires_in_seconds
        )
        cache[path] = signed
        return signed

    return _resolve


def _build_generated_item_image_lookup(
    client: Client,
    *,
    user_id: str,
    analysis_id: str,
    resolve_signed_url,
    required_counts_by_signature: dict[tuple[str, str, str], int] | None = None
) -> dict[tuple[str, str, str], list[str]]:
    images_by_signature: dict[tuple[str, str, str], list[str]] = {}
    limit_to_required = required_counts_by_signature is not None
    remaining_by_signature = {
        signature: max(0, int(count))
        for signature, count in (required_counts_by_signature or {}).items()
    }
    analysis_items_response = (
        client.table("items")
        .select("category,name,color,attributes_json")
        .eq("user_id", user_id)
        .eq("analysis_id", analysis_id)
        .execute()
    )
    for analysis_item in (analysis_items_response.data or []):
        if not isinstance(analysis_item, dict):
            continue
        attributes = _coerce_dict(analysis_item.get("attributes_json") or {})
        image_path = attributes.get("generated_item_image_path") or ""
        image_url = resolve_signed_url(image_path)
        if not image_url:
            continue
        signature = (
            str(analysis_item.get("category", "")).strip().lower(),
            str(analysis_item.get("name", "")).strip().lower(),
            str(analysis_item.get("color", "")).strip().lower()
        )
        if limit_to_required:
            remaining = remaining_by_signature.get(signature, 0)
            if remaining <= 0:
                continue
        images_by_signature.setdefault(signature, []).append(image_url)
        if limit_to_required:
            remaining_by_signature[signature] = remaining_by_signature.get(signature, 0) - 1
    return images_by_signature


def _normalize_items_with_images(
    raw_items: list[dict],
    images_by_signature: dict[tuple[str, str, str], list[str]]
) -> list[dict]:
    remaining_by_signature = {
        signature: list(candidates)
        for signature, candidates in images_by_signature.items()
    }
    normalized_items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        normalized = _normalize_item_fields(item)
        signature = (
            normalized["category"].lower(),
            normalized["name"].lower(),
            normalized["color"].lower()
        )
        candidates = remaining_by_signature.get(signature) or []
        image_url = candidates.pop(0) if candidates else None
        normalized_items.append({**normalized, "image_url": image_url})
    return normalized_items


def list_wardrobe(user_id: str, limit: int = 20) -> list[dict]:
    client = get_supabase_client()
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)
    wardrobe = []
    try:
        rpc_response = client.rpc(
            "get_wardrobe_rows",
            {"p_user_id": user_id, "p_limit": max(1, int(limit))}
        ).execute()
        rpc_rows = rpc_response.data or []
        for row in rpc_rows:
            storage_path = str(row.get("storage_path") or "")
            outfit_id = row.get("outfit_id")
            outfit_index = _safe_outfit_index(row.get("outfit_index"))
            wardrobe.append(
                {
                    "row_id": row.get("row_id") or outfit_id or f"{row.get('photo_id')}:{outfit_index}",
                    "outfit_id": outfit_id,
                    "photo_id": row.get("photo_id"),
                    "storage_path": storage_path,
                    "image_url": resolve_signed_url(storage_path),
                    "created_at": row.get("created_at") or row.get("photo_created_at"),
                    "analysis_id": row.get("analysis_id"),
                    "analysis_created_at": None,
                    "style_label": _normalize_label(row.get("style_label"), "Unlabeled"),
                    "source_type": _normalize_outfit_source_type(row.get("source_type")),
                    "source_outfit_id": row.get("source_outfit_id"),
                    "generated_image_path": row.get("generated_image_path") or "",
                    "outfit_index": outfit_index,
                    "outfit_count": int(row.get("outfit_count") or 1),
                    "outfit_items_count": int(row.get("outfit_items_count") or 0)
                }
            )
        return wardrobe
    except Exception:  # noqa: BLE001
        # Fallback for environments where RPC migrations have not been applied yet.
        pass

    outfits_response = (
        client.table("outfits")
        .select("id,photo_id,analysis_id,outfit_index,style_label,created_at,source_type,source_outfit_id,generated_image_path")
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

    for outfit in outfits:
        photo = photos_by_id.get(outfit.get("photo_id")) or {}
        outfit_id = outfit.get("id")
        generated_image_path = outfit.get("generated_image_path") or ""
        storage_path = (
            generated_image_path
            if _normalize_outfit_source_type(outfit.get("source_type")) == OUTFIT_SOURCE_CUSTOM and generated_image_path
            else (photo.get("storage_path") or "")
        )
        wardrobe.append(
            {
                "row_id": outfit_id or f"{outfit.get('photo_id')}:{outfit.get('outfit_index', 0)}",
                "outfit_id": outfit_id,
                "photo_id": outfit.get("photo_id"),
                "storage_path": storage_path,
                "image_url": resolve_signed_url(storage_path),
                "created_at": outfit.get("created_at") or photo.get("created_at"),
                "analysis_id": outfit.get("analysis_id"),
                "analysis_created_at": None,
                "style_label": _normalize_label(outfit.get("style_label"), "Unlabeled"),
                "source_type": _normalize_outfit_source_type(outfit.get("source_type")),
                "source_outfit_id": outfit.get("source_outfit_id"),
                "generated_image_path": generated_image_path,
                "outfit_index": _safe_outfit_index(outfit.get("outfit_index")),
                "outfit_count": counts_by_photo.get(outfit.get("photo_id"), 1),
                "outfit_items_count": item_counts_by_outfit.get(outfit_id, 0)
            }
        )

    return wardrobe


def list_analysis_history(user_id: str, limit: int = 50) -> list[dict]:
    client = get_supabase_client()
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)
    try:
        rpc_response = client.rpc(
            "get_analysis_history_rows",
            {"p_user_id": user_id, "p_limit": max(1, int(limit))}
        ).execute()
        rpc_rows = rpc_response.data or []
        history = []
        for row in rpc_rows:
            storage_path = str(row.get("storage_path") or "")
            history.append(
                {
                    "job_id": row.get("job_id"),
                    "photo_id": row.get("photo_id"),
                    "analysis_model": row.get("analysis_model"),
                    "status": row.get("status"),
                    "error_message": row.get("error_message"),
                    "created_at": row.get("created_at"),
                    "started_at": row.get("started_at"),
                    "completed_at": row.get("completed_at"),
                    "updated_at": row.get("updated_at"),
                    "photo_created_at": row.get("photo_created_at"),
                    "storage_path": storage_path,
                    "image_url": resolve_signed_url(storage_path),
                    "outfit_count": int(row.get("outfit_count") or 0)
                }
            )
        return history
    except Exception:  # noqa: BLE001
        # Fallback for environments where RPC migrations have not been applied yet.
        pass

    jobs_response = (
        client.table("analysis_jobs")
        .select("id,photo_id,analysis_model,status,error_message,created_at,started_at,completed_at,updated_at")
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
        image_url = resolve_signed_url(storage_path)
        history.append(
            {
                "job_id": job.get("id"),
                "photo_id": photo_id,
                "analysis_model": job.get("analysis_model"),
                "status": job.get("status"),
                "error_message": job.get("error_message"),
                "created_at": job.get("created_at"),
                "started_at": job.get("started_at"),
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
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)
    try:
        rpc_response = client.rpc(
            "get_item_catalog_rows",
            {"p_user_id": user_id, "p_limit": max(1, int(limit))}
        ).execute()
        rpc_rows = rpc_response.data or []
        normalized_items = []
        for row in rpc_rows:
            attributes = _coerce_dict(row.get("attributes_json") or {})
            image_path = attributes.get("generated_item_image_path") or ""
            normalized_items.append(
                {
                    **row,
                    "category": _normalize_label(row.get("category"), "Item"),
                    "name": _normalize_label(row.get("name"), "Unknown Item"),
                    "color": _normalize_label(row.get("color"), "Unknown"),
                    "style_label": _normalize_label(row.get("style_label"), "Unknown"),
                    "image_url": resolve_signed_url(image_path)
                }
            )
        return normalized_items
    except Exception:  # noqa: BLE001
        # Fallback for environments where RPC migrations have not been applied yet.
        pass

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
                "image_url": resolve_signed_url(image_path)
            }
        )
    return normalized_items


def list_items_for_analysis(user_id: str, analysis_id: str) -> list[dict]:
    client = get_supabase_client()
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)
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
                "image_url": resolve_signed_url(image_path)
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


def save_generated_item_image(user_id: str, item_id: str, data_uri: str, usage_summary: dict | None = None) -> dict:
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
    if usage_summary:
        attributes["generated_item_image_ai_usage"] = _normalize_ai_usage(usage_summary)
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


def get_photo_storage_path_for_user(user_id: str, photo_id: str) -> str | None:
    client = get_supabase_client()
    response = (
        client.table("photos")
        .select("storage_path")
        .eq("id", photo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = (response.data or [None])[0]
    if not row:
        return None
    return row.get("storage_path")


def save_generated_outfit_image(user_id: str, outfit_id: str, data_uri: str) -> dict:
    client = get_supabase_client()
    image_bytes, content_type = _decode_image_data_uri(data_uri)
    extension = ".png" if content_type == "image/png" else ".jpg"
    storage_path = f"{user_id}/generated/outfits/{outfit_id}-{uuid4().hex}{extension}"
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": content_type}
    )
    return {
        "storage_path": storage_path,
        "content_type": content_type,
        "image_url": _get_signed_image_url_with_client(client, storage_path, expires_in_seconds=3600)
    }


def create_outfitsme_generated_outfit(
    user_id: str,
    *,
    source_photo_id: str,
    source_outfit_id: str | None,
    source_outfit_index: int,
    style_label: str,
    items: list[dict],
    generated_storage_path: str,
    usage_summary: dict | None = None
) -> dict:
    client = get_supabase_client()
    style = _normalize_label(style_label, "Outfit")
    normalized_items = [_normalize_item_fields(item) for item in (items or []) if isinstance(item, dict)]
    photo_row = create_photo_record(user_id, generated_storage_path, client=client)
    raw_json = {
        "style": style,
        "items": normalized_items,
        "outfits": [
            {
                "style": style,
                "items": normalized_items
            }
        ],
        "outfitsme_generated": True,
        "ai_usage": _normalize_ai_usage(usage_summary or {}),
        "source_photo_id": source_photo_id,
        "source_outfit_id": source_outfit_id,
        "source_outfit_index": _safe_outfit_index(source_outfit_index)
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
    outfits = _insert_outfits_and_items(
        client,
        user_id=user_id,
        photo_id=photo_row["id"],
        analysis_id=analysis_row["id"],
        analysis_created_at=analysis_row.get("created_at"),
        analysis=raw_json,
        source_type=OUTFIT_SOURCE_OUTFITSME,
        source_outfit_id=source_outfit_id
    )
    generated_outfit = (outfits or [None])[0] or {}
    return {
        "photo_id": photo_row["id"],
        "analysis_id": analysis_row["id"],
        "outfit_id": generated_outfit.get("id"),
        "outfit_index": _safe_outfit_index(generated_outfit.get("outfit_index")),
        "style_label": style,
        "source_type": OUTFIT_SOURCE_OUTFITSME,
        "image_url": _get_signed_image_url_with_client(client, generated_storage_path, expires_in_seconds=3600)
    }


def attach_generated_image_to_outfit(user_id: str, outfit_id: str, generated_storage_path: str) -> dict | None:
    client = get_supabase_client()
    existing_response = (
        client.table("outfits")
        .select("id,photo_id,outfit_index,source_type")
        .eq("id", outfit_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    existing_row = (existing_response.data or [None])[0]
    if not existing_row:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    (
        client.table("outfits")
        .update(
            {
                "generated_image_path": generated_storage_path,
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
        "source_type": _normalize_outfit_source_type(existing_row.get("source_type")),
        "generated_image_path": generated_storage_path
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


def get_user_analysis_job_count_since(
    user_id: str,
    since_iso: str,
    *,
    statuses: list[str] | None = None
) -> int:
    client = get_supabase_client()
    query = (
        client.table("analysis_jobs")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", since_iso)
    )
    if statuses:
        query = query.in_("status", statuses)
    response = query.execute()
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


def get_user_monthly_generated_image_count(user_id: str, month_start_iso: str, kind: str) -> int:
    client = get_supabase_client()
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in {"items", "outfits"}:
        return 0
    prefix = f"{user_id}/generated/{safe_kind}/%"
    try:
        response = (
            client.table("storage.objects")
            .select("id")
            .eq("bucket_id", settings.SUPABASE_BUCKET)
            .like("name", prefix)
            .gte("created_at", month_start_iso)
            .execute()
        )
        return len(response.data or [])
    except Exception:  # noqa: BLE001
        # Keep costs endpoint resilient even if storage.objects query fails.
        return 0


def get_user_generated_image_count_since(user_id: str, since_iso: str, kind: str) -> int:
    client = get_supabase_client()
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in {"items", "outfits"}:
        return 0
    prefix = f"{user_id}/generated/{safe_kind}/%"
    try:
        response = (
            client.table("storage.objects")
            .select("id")
            .eq("bucket_id", settings.SUPABASE_BUCKET)
            .like("name", prefix)
            .gte("created_at", since_iso)
            .execute()
        )
        return len(response.data or [])
    except Exception:  # noqa: BLE001
        return 0


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
        .select("id,photo_id,outfit_index,source_type")
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
        "style_label": normalized_style_label,
        "source_type": _normalize_outfit_source_type(existing_row.get("source_type"))
    }


def get_wardrobe_photo_details(user_id: str, photo_id: str, outfit_index: int | None = None) -> dict | None:
    client = get_supabase_client()
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)

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
        .select("id,outfit_index,style_label,source_type,source_outfit_id,generated_image_path")
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
        selected_indices: list[int] = []
        if outfit_index is not None:
            selected_indices = [outfit_index]
        elif isinstance(raw_outfits, list):
            selected_indices = list(range(len(raw_outfits)))
        else:
            selected_indices = [0]

        prepared_outfits: list[dict] = []
        if isinstance(raw_outfits, list):
            for index in selected_indices:
                if index < 0 or index >= len(raw_outfits):
                    continue
                outfit = raw_outfits[index]
                if not isinstance(outfit, dict):
                    continue
                prepared_outfits.append(
                    {
                        "outfit_index": index,
                        "style": _normalize_label(outfit.get("style"), "Unlabeled"),
                        "items": [item for item in (outfit.get("items") or []) if isinstance(item, dict)]
                    }
                )

        if not prepared_outfits:
            fallback_items = [item for item in (raw_json.get("items") or []) if isinstance(item, dict)] if isinstance(raw_json, dict) else []
            fallback_index = outfit_index if outfit_index is not None else 0
            prepared_outfits = [
                {
                    "outfit_index": fallback_index,
                    "style": _normalize_label(analysis_row.get("style_label"), "Unlabeled"),
                    "items": fallback_items
                }
            ]

        required_counts_by_signature: dict[tuple[str, str, str], int] = {}
        for prepared in prepared_outfits:
            for item in prepared.get("items") or []:
                if not isinstance(item, dict):
                    continue
                signature = (
                    str(item.get("category", "")).strip().lower(),
                    str(item.get("name", "")).strip().lower(),
                    str(item.get("color", "")).strip().lower()
                )
                required_counts_by_signature[signature] = required_counts_by_signature.get(signature, 0) + 1

        images_by_signature = (
            _build_generated_item_image_lookup(
                client,
                user_id=user_id,
                analysis_id=analysis_row.get("id"),
                resolve_signed_url=resolve_signed_url,
                required_counts_by_signature=required_counts_by_signature
            )
            if analysis_row.get("id")
            else {}
        )

        for prepared in prepared_outfits:
            index = _safe_outfit_index(prepared.get("outfit_index"))
            outfit_row = outfits_by_index.get(index) or {}
            outfits.append(
                {
                    "outfit_id": outfit_row.get("id"),
                    "outfit_index": index,
                    "source_type": _normalize_outfit_source_type(outfit_row.get("source_type")),
                    "source_outfit_id": outfit_row.get("source_outfit_id"),
                    "generated_image_path": outfit_row.get("generated_image_path") or "",
                    "style": _normalize_label(
                        outfit_row.get("style_label") or prepared.get("style"),
                        "Unlabeled"
                    ),
                    "items": _normalize_items_with_images(
                        [item for item in (prepared.get("items") or []) if isinstance(item, dict)],
                        images_by_signature
                    )
                }
            )

    storage_path = photo_row.get("storage_path") or ""
    image_url = resolve_signed_url(storage_path)
    source_outfit_image_url = None

    selected_outfit = None
    if outfit_index is not None:
        selected_outfit = next((outfit for outfit in outfits if outfit.get("outfit_index") == outfit_index), None)
        selected_outfit_row = outfits_by_index.get(_safe_outfit_index(outfit_index)) or {}
        selected_outfit_generated_path = selected_outfit_row.get("generated_image_path") or ""
        selected_outfit_source_type = _normalize_outfit_source_type(selected_outfit_row.get("source_type"))
        if selected_outfit_source_type == OUTFIT_SOURCE_CUSTOM and selected_outfit_generated_path:
            image_url = resolve_signed_url(selected_outfit_generated_path) or image_url
        if selected_outfit_source_type == OUTFIT_SOURCE_OUTFITSME:
            source_outfit_id = selected_outfit_row.get("source_outfit_id")
            if source_outfit_id:
                source_outfit_response = (
                    client.table("outfits")
                    .select("id,photo_id")
                    .eq("id", source_outfit_id)
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                )
                source_outfit_row = (source_outfit_response.data or [None])[0]
                source_photo_id = source_outfit_row.get("photo_id") if source_outfit_row else None
                if source_photo_id:
                    source_photo_response = (
                        client.table("photos")
                        .select("storage_path")
                        .eq("id", source_photo_id)
                        .eq("user_id", user_id)
                        .limit(1)
                        .execute()
                    )
                    source_photo_row = (source_photo_response.data or [None])[0]
                    source_outfit_image_url = resolve_signed_url((source_photo_row or {}).get("storage_path") or "")

    return {
        "photo_id": photo_row["id"],
        "created_at": photo_row.get("created_at"),
        "analysis_id": analysis_row["id"] if analysis_row else None,
        "style_label": _normalize_label(analysis_row.get("style_label"), "Unlabeled") if analysis_row else None,
        "analysis_created_at": analysis_row["created_at"] if analysis_row else None,
        "image_url": image_url,
        "source_outfit_image_url": source_outfit_image_url,
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
        analysis=raw_json,
        source_type=OUTFIT_SOURCE_CUSTOM
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
        "user_role": "trial",
        "profile_gender": "",
        "profile_age": None,
        "profile_photo_path": "",
        "enable_outfit_image_generation": False,
        "enable_online_store_search": False,
        "enable_accessory_analysis": False
    }


def get_user_model_settings(user_id: str) -> dict:
    client = get_supabase_client()
    response = (
        client.table("user_settings")
        .select(
            "user_role,profile_gender,profile_age,profile_photo_path,"
            "enable_outfit_image_generation,enable_online_store_search,enable_accessory_analysis"
        )
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = (response.data or [None])[0]
    if not row:
        return _empty_model_settings()

    normalized_role = normalize_user_role(row.get("user_role"))
    return {
        "user_role": normalized_role,
        "profile_gender": row.get("profile_gender") or "",
        "profile_age": row.get("profile_age"),
        "profile_photo_path": row.get("profile_photo_path") or "",
        "enable_outfit_image_generation": bool(row.get("enable_outfit_image_generation")),
        "enable_online_store_search": bool(row.get("enable_online_store_search")),
        "enable_accessory_analysis": bool(row.get("enable_accessory_analysis"))
    }


def upsert_user_model_settings(user_id: str, payload: dict) -> dict:
    client = get_supabase_client()
    current = get_user_model_settings(user_id)
    profile_gender = payload.get("profile_gender")
    profile_age = payload.get("profile_age")
    profile_photo_path = payload.get("profile_photo_path")
    enable_outfit_image_generation = payload.get("enable_outfit_image_generation")
    enable_online_store_search = payload.get("enable_online_store_search")
    enable_accessory_analysis = payload.get("enable_accessory_analysis")

    def _to_bool(value, fallback):
        if value is None:
            return fallback
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    current_role = normalize_user_role(current.get("user_role"))
    row = {
        "user_id": user_id,
        "user_role": current_role,
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
        "enable_accessory_analysis": (
            _to_bool(enable_accessory_analysis, bool(current.get("enable_accessory_analysis")))
        ),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    (
        client.table("user_settings")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    settings_row = get_user_model_settings(user_id)
    return {
        "user_role": settings_row.get("user_role", "trial"),
        "profile_gender": settings_row.get("profile_gender", ""),
        "profile_age": settings_row.get("profile_age"),
        "profile_photo_url": (
            get_signed_image_url(settings_row.get("profile_photo_path"), expires_in_seconds=3600)
            if settings_row.get("profile_photo_path")
            else None
        ),
        "enable_outfit_image_generation": bool(settings_row.get("enable_outfit_image_generation")),
        "enable_online_store_search": bool(settings_row.get("enable_online_store_search")),
        "enable_accessory_analysis": bool(settings_row.get("enable_accessory_analysis"))
    }


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
    client = get_supabase_client()
    analysis_count = get_user_monthly_analysis_count(user_id, month_start_iso)
    composed_outfit_count = get_user_monthly_composed_outfit_count(user_id, month_start_iso)
    generated_item_image_count = get_user_monthly_generated_image_count(user_id, month_start_iso, "items")
    generated_outfit_image_count = get_user_monthly_generated_image_count(user_id, month_start_iso, "outfits")
    analysis_unit_cost = round(
        settings.ANALYSIS_INPUT_COST_USD + settings.ANALYSIS_OUTPUT_IMAGE_COST_USD,
        4
    )
    outfit_image_unit_cost = round(
        settings.OUTFIT_IMAGE_INPUT_COST_USD + settings.OUTFIT_IMAGE_OUTPUT_COST_USD,
        4
    )
    analysis_cost = round(analysis_count * analysis_unit_cost, 4)
    outfit_image_cost = round(generated_outfit_image_count * outfit_image_unit_cost, 4)
    item_image_cost = round(generated_item_image_count * settings.ITEM_IMAGE_COST_USD, 4)
    total_cost = round(analysis_cost + outfit_image_cost + item_image_cost, 4)

    analysis_usage_rows = (
        client.table("analysis_jobs")
        .select("result_json")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .gte("completed_at", month_start_iso)
        .execute()
    ).data or []
    analysis_usages = []
    for row in analysis_usage_rows:
        result_json = _coerce_dict((row or {}).get("result_json") or {})
        analysis_usages.append(_coerce_dict(result_json.get("ai_usage") or {}))
    analysis_token_usage = _sum_ai_usage(analysis_usages)

    outfit_analysis_rows = (
        client.table("outfit_analyses")
        .select("raw_json")
        .eq("user_id", user_id)
        .gte("created_at", month_start_iso)
        .execute()
    ).data or []
    outfit_usages = []
    for row in outfit_analysis_rows:
        raw_json = _coerce_dict((row or {}).get("raw_json") or {})
        if not bool(raw_json.get("outfitsme_generated")):
            continue
        outfit_usages.append(_coerce_dict(raw_json.get("ai_usage") or {}))
    outfit_token_usage = _sum_ai_usage(outfit_usages)

    item_rows = (
        client.table("items")
        .select("attributes_json")
        .eq("user_id", user_id)
        .gte("created_at", month_start_iso)
        .execute()
    ).data or []
    item_usages = []
    for row in item_rows:
        attributes = _coerce_dict((row or {}).get("attributes_json") or {})
        if not attributes.get("generated_item_image_path"):
            continue
        item_usages.append(_coerce_dict(attributes.get("generated_item_image_ai_usage") or {}))
    item_token_usage = _sum_ai_usage(item_usages)

    token_costs = {
        "analysis": _estimate_token_cost_usd(analysis_token_usage),
        "outfit_image_generation": _estimate_token_cost_usd(outfit_token_usage),
        "item_image_generation": _estimate_token_cost_usd(item_token_usage)
    }
    token_costs["total"] = {
        "input": round(
            token_costs["analysis"]["input"]
            + token_costs["outfit_image_generation"]["input"]
            + token_costs["item_image_generation"]["input"],
            6
        ),
        "output": round(
            token_costs["analysis"]["output"]
            + token_costs["outfit_image_generation"]["output"]
            + token_costs["item_image_generation"]["output"],
            6
        )
    }
    token_costs["total"]["total"] = round(
        token_costs["total"]["input"] + token_costs["total"]["output"],
        6
    )
    return {
        "month_start_utc": month_start_iso,
        "analysis_runs": analysis_count,
        "custom_outfit_generations": composed_outfit_count,
        "generated_item_images": generated_item_image_count,
        "generated_outfit_images": generated_outfit_image_count,
        "cost_formula": {
            "analysis": "1 text/image input call + 1 image output call per completed analysis",
            "outfit_image_generation": "1 text/image input call + 1 image output call per generated outfit image",
            "item_image_generation": "1 generated item image counted per stored item image output"
        },
        "unit_costs_usd": {
            "analysis": analysis_unit_cost,
            "analysis_input": settings.ANALYSIS_INPUT_COST_USD,
            "analysis_output_image": settings.ANALYSIS_OUTPUT_IMAGE_COST_USD,
            "outfit_image_generation": outfit_image_unit_cost,
            "outfit_image_input": settings.OUTFIT_IMAGE_INPUT_COST_USD,
            "outfit_image_output": settings.OUTFIT_IMAGE_OUTPUT_COST_USD,
            "item_image_generation": settings.ITEM_IMAGE_COST_USD
        },
        "estimated_costs_usd": {
            "analysis": analysis_cost,
            "outfit_image_generation": outfit_image_cost,
            "item_image_generation": item_image_cost,
            "total": total_cost
        },
        "token_usage_estimate": {
            "analysis": analysis_token_usage,
            "outfit_image_generation": outfit_token_usage,
            "item_image_generation": item_token_usage,
            "total": _sum_ai_usage([analysis_token_usage, outfit_token_usage, item_token_usage]),
            "source": "Gemini usageMetadata when available; estimator fallback otherwise."
        },
        "token_pricing_usd_per_1m": {
            "input": settings.GEMINI_INPUT_COST_PER_1M_TOKENS_USD,
            "output": settings.GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD
        },
        "estimated_token_costs_usd": token_costs,
        "limits": {
            "monthly_custom_outfit_generation_limit": settings.MONTHLY_CUSTOM_OUTFIT_LIMIT
        }
    }
