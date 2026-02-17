from __future__ import annotations

import mimetypes
import re
from datetime import datetime, timezone
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
                "style_label": _normalize_label(analysis.get("style"), "Unknown"),
                "raw_json": analysis
            }
        )
        .execute()
    )
    analysis_row = analysis_insert.data[0]

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
            .select("id,style_label,raw_json,created_at")
            .eq("photo_id", photo["id"])
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        analysis = (analyses_response.data or [None])[0]
        raw_json = analysis.get("raw_json") if analysis else {}
        raw_outfits = raw_json.get("outfits") if isinstance(raw_json, dict) else None

        normalized_outfits = []
        if isinstance(raw_outfits, list):
            for outfit in raw_outfits:
                if not isinstance(outfit, dict):
                    continue
                normalized_items = [item for item in (outfit.get("items") or []) if isinstance(item, dict)]
                normalized_outfits.append(
                    {
                        "style": _normalize_label(outfit.get("style"), "Unlabeled"),
                        "items_count": len(normalized_items)
                    }
                )

        if not normalized_outfits:
            normalized_outfits = [
                {
                    "style": _normalize_label(analysis["style_label"], "Unlabeled") if analysis else "Unlabeled",
                    "items_count": 0
                }
            ]

        for index, outfit in enumerate(normalized_outfits):
            wardrobe.append(
                {
                    "row_id": f"{photo['id']}:{index}",
                    "photo_id": photo["id"],
                    "storage_path": photo["storage_path"],
                    "created_at": photo["created_at"],
                    "analysis_id": analysis["id"] if analysis else None,
                    "analysis_created_at": analysis["created_at"] if analysis else None,
                    "style_label": outfit["style"],
                    "outfit_index": index,
                    "outfit_count": len(normalized_outfits),
                    "outfit_items_count": outfit["items_count"]
                }
            )

    return wardrobe


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
    style_by_analysis_id = {}
    if analysis_ids:
        analyses_response = (
            client.table("outfit_analyses")
            .select("id,style_label")
            .in_("id", analysis_ids)
            .eq("user_id", user_id)
            .execute()
        )
        for analysis in (analyses_response.data or []):
            style_by_analysis_id[analysis.get("id")] = _normalize_label(analysis.get("style_label"), "Unknown")

    return [
        {
            **item,
            "category": _normalize_label(item.get("category"), "Item"),
            "name": _normalize_label(item.get("name"), "Unknown Item"),
            "color": _normalize_label(item.get("color"), "Unknown"),
            "style_label": (
                _normalize_label((item.get("attributes_json") or {}).get("outfit_style"), "")
                or style_by_analysis_id.get(item.get("analysis_id"))
                or "Unknown"
            )
        }
        for item in items
    ]


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

    outfits = []
    if analysis_row:
        raw_json = analysis_row.get("raw_json") or {}
        raw_outfits = raw_json.get("outfits") if isinstance(raw_json, dict) else None
        if isinstance(raw_outfits, list):
            for index, outfit in enumerate(raw_outfits):
                if not isinstance(outfit, dict):
                    continue
                outfit_items = [item for item in (outfit.get("items") or []) if isinstance(item, dict)]
                outfits.append(
                    {
                        "outfit_index": index,
                        "style": _normalize_label(outfit.get("style"), "Unlabeled"),
                        "items": [_normalize_item_fields(item) for item in outfit_items]
                    }
                )

        if not outfits:
            fallback_items = raw_json.get("items") if isinstance(raw_json, dict) else []
            outfits = [
                {
                    "outfit_index": 0,
                    "style": _normalize_label(analysis_row.get("style_label"), "Unlabeled"),
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

    detailed_type_counts = {}
    color_counts = {}
    for item in items:
        item_type = _classify_item_type(item.get("category") or "", item.get("name") or "")
        color = _normalize_label(item.get("color"), "Unknown")
        detailed_type_counts[item_type] = detailed_type_counts.get(item_type, 0) + 1
        color_counts[color] = color_counts.get(color, 0) + 1

    detailed_item_types = [
        {"label": label, "count": count}
        for label, count in sorted(detailed_type_counts.items(), key=lambda pair: pair[1], reverse=True)
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
    outfits_count = 0
    for analysis in analyses:
        raw_json = analysis.get("raw_json") if isinstance(analysis, dict) else {}
        raw_outfits = raw_json.get("outfits") if isinstance(raw_json, dict) else None
        if isinstance(raw_outfits, list) and len(raw_outfits) > 0:
            outfits_count += len([outfit for outfit in raw_outfits if isinstance(outfit, dict)])
        else:
            outfits_count += 1

    avg_items_per_outfit = round(items_count / outfits_count, 1) if outfits_count > 0 else 0

    return {
        "photos_count": photos_count,
        "outfits_count": outfits_count,
        "analyses_count": analyses_count,
        "items_count": items_count,
        "top_item_types": top_item_types,
        "detailed_item_types": detailed_item_types,
        "top_colors": top_colors,
        "latest_outfit": latest_outfit,
        "highlights": {
            "most_common_item_type": top_item_types[0]["label"] if top_item_types else "N/A",
            "most_common_color": top_colors[0]["label"] if top_colors else "N/A",
            "avg_items_per_outfit": avg_items_per_outfit
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
        "aws_bedrock_agent_alias_id": ""
    }


def get_user_model_settings(user_id: str) -> dict:
    client = get_supabase_client()
    response = (
        client.table("user_settings")
        .select(
            "preferred_model,gemini_api_key_enc,aws_region,aws_bedrock_agent_id,aws_bedrock_agent_alias_id"
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
        "aws_bedrock_agent_alias_id": row.get("aws_bedrock_agent_alias_id") or ""
    }


def get_user_model_settings_masked(user_id: str) -> dict:
    settings_row = get_user_model_settings(user_id)
    return {
        "preferred_model": settings_row.get("preferred_model") or settings.DEFAULT_ANALYSIS_MODEL,
        "gemini_api_key_masked": mask_secret(settings_row.get("gemini_api_key", "")),
        "aws_region": settings_row.get("aws_region", ""),
        "aws_bedrock_agent_id": settings_row.get("aws_bedrock_agent_id", ""),
        "aws_bedrock_agent_alias_id": settings_row.get("aws_bedrock_agent_alias_id", "")
    }


def upsert_user_model_settings(user_id: str, payload: dict) -> dict:
    client = get_supabase_client()
    current = get_user_model_settings(user_id)

    preferred_model = str(payload.get("preferred_model", current.get("preferred_model", ""))).strip()

    gemini_api_key = payload.get("gemini_api_key")
    aws_region = payload.get("aws_region")
    aws_bedrock_agent_id = payload.get("aws_bedrock_agent_id")
    aws_bedrock_agent_alias_id = payload.get("aws_bedrock_agent_alias_id")

    def _next_secret(incoming, existing):
        if incoming is None:
            return existing
        return str(incoming).strip()

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
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    (
        client.table("user_settings")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return get_user_model_settings_masked(user_id)
