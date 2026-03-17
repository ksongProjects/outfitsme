from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import re
from io import BytesIO
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4

from PIL import Image, ImageOps
from supabase import Client, create_client

from app.config import settings
from app.services.access_control import normalize_user_role
from app.services.gemini_service import (
    estimate_gemini_usage_cost_usd,
    normalize_gemini_usage_record,
)
from app.services.better_auth_service import (
    get_database_connection,
    get_user_created_at_from_better_auth_token,
    get_user_id_from_better_auth_jwt,
    get_user_id_from_session_token,
)


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
HISTORY_JOB_TYPE_PHOTO_ANALYSIS = "photo_analysis"
HISTORY_JOB_TYPE_CUSTOM_OUTFIT = "custom_outfit"
HISTORY_JOB_TYPE_TRY_ON = "try_on"

_SUPABASE_CLIENT: Client | None = None
_SIGNED_URL_CACHE: dict[tuple[str, int], tuple[str | None, float]] = {}
_PROFILE_PHOTO_MAX_SIDE = 768


def _title_case_label(value: str) -> str:
    cleaned = " ".join((value or "").strip().split())
    return cleaned.title() if cleaned else "Other"


def _normalize_label(value: str, fallback: str) -> str:
    cleaned = " ".join(str(value or "").strip().split())
    if not cleaned:
        return fallback
    return cleaned.title()


def _normalize_free_text(value, fallback: str = "") -> str:
    cleaned = " ".join(str(value or "").strip().split())
    return cleaned or fallback


def _build_item_description(item: dict) -> str:
    color = _normalize_free_text(item.get("color"), "")
    material = _normalize_free_text(item.get("material"), "")
    pattern = _normalize_free_text(item.get("pattern"), "")
    fit = _normalize_free_text(item.get("fit"), "")
    silhouette = _normalize_free_text(item.get("silhouette"), "")
    length = _normalize_free_text(item.get("length"), "")
    details = _normalize_free_text(item.get("details"), "")
    name = _normalize_free_text(item.get("name"), _normalize_free_text(item.get("category"), "item")).lower()
    pieces = [value for value in [color, material, pattern, fit, silhouette, length] if value]
    summary = " ".join(pieces).strip()
    if summary:
        description = f"{summary} {name}".strip()
    else:
        description = name
    if details:
        description = f"{description} with {details}".strip()
    return description


def _normalize_item_fields(item: dict) -> dict:
    if not isinstance(item, dict):
        return {
            "category": "Item",
            "name": "Unknown Item",
            "color": "Unknown",
            "material": "",
            "pattern": "",
            "fit": "",
            "silhouette": "",
            "length": "",
            "details": "",
            "description": "",
        }
    attributes = _coerce_dict(item.get("attributes_json") or {})
    normalized = {
        "category": _normalize_label(item.get("category"), "Item"),
        "name": _normalize_label(item.get("name"), "Unknown Item"),
        "color": _normalize_label(item.get("color"), "Unknown"),
        "material": _normalize_free_text(item.get("material") or attributes.get("material"), ""),
        "pattern": _normalize_free_text(item.get("pattern") or attributes.get("pattern"), ""),
        "fit": _normalize_free_text(item.get("fit") or attributes.get("fit"), ""),
        "silhouette": _normalize_free_text(item.get("silhouette") or attributes.get("silhouette"), ""),
        "length": _normalize_free_text(item.get("length") or attributes.get("length"), ""),
        "details": _normalize_free_text(item.get("details") or attributes.get("details"), ""),
        "description": _normalize_free_text(item.get("description") or attributes.get("description"), ""),
    }
    if not normalized["description"]:
        normalized["description"] = _build_item_description(normalized)
    return normalized


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


def _build_item_attributes(
    normalized_item: dict,
    *,
    outfit_index: int,
    outfit_style: str,
    existing_attributes: dict | None = None
) -> dict:
    attributes = dict(existing_attributes or {})
    attributes.update(
        {
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "outfit_index": outfit_index,
            "outfit_style": _normalize_label(outfit_style, "Unknown"),
            "material": _normalize_free_text(normalized_item.get("material"), ""),
            "pattern": _normalize_free_text(normalized_item.get("pattern"), ""),
            "fit": _normalize_free_text(normalized_item.get("fit"), ""),
            "silhouette": _normalize_free_text(normalized_item.get("silhouette"), ""),
            "length": _normalize_free_text(normalized_item.get("length"), ""),
            "details": _normalize_free_text(normalized_item.get("details"), ""),
            "description": _normalize_free_text(normalized_item.get("description"), ""),
        }
    )
    return attributes


def _normalize_upload_image_target(mime_type: str | None) -> tuple[str, str]:
    normalized = str(mime_type or "").strip().lower()
    if normalized == "image/png":
        return "image/png", ".png"
    if normalized == "image/webp":
        return "image/webp", ".webp"
    return "image/jpeg", ".jpg"


def _resize_profile_photo_content(
    image_bytes: bytes,
    mime_type: str | None
) -> tuple[bytes, str, str]:
    if not image_bytes:
        raise ValueError("Image file is empty.")

    target_mime_type, extension = _normalize_upload_image_target(mime_type)

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


def _normalize_ai_usage(value) -> dict:
    return normalize_gemini_usage_record(_coerce_dict(value))


def _has_meaningful_ai_usage(usage: dict) -> bool:
    return any(
        [
            _safe_outfit_index(usage.get("input_tokens")),
            _safe_outfit_index(usage.get("output_tokens")),
            _safe_outfit_index(usage.get("input_images")),
            _safe_outfit_index(usage.get("output_images")),
            bool(str(usage.get("model") or "").strip()),
        ]
    )


def _sum_ai_usage(entries: list[dict]) -> dict:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "input_images": 0,
        "output_images": 0,
        "call_count": 0,
        "estimated_call_count": 0,
        "models": {},
    }
    for entry in entries:
        usage = _normalize_ai_usage(entry)
        if not _has_meaningful_ai_usage(usage):
            continue
        totals["input_tokens"] += usage["input_tokens"]
        totals["output_tokens"] += usage["output_tokens"]
        totals["total_tokens"] += usage["total_tokens"]
        totals["input_images"] += usage["input_images"]
        totals["output_images"] += usage["output_images"]
        totals["call_count"] += 1
        if bool(usage.get("estimated_input_tokens")) or bool(usage.get("estimated_output_tokens")):
            totals["estimated_call_count"] += 1

        model_key = str(usage.get("model") or "").strip()
        if model_key:
            model_totals = totals["models"].setdefault(
                model_key,
                {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "input_images": 0,
                    "output_images": 0,
                    "call_count": 0,
                    "estimated_call_count": 0,
                },
            )
            model_totals["input_tokens"] += usage["input_tokens"]
            model_totals["output_tokens"] += usage["output_tokens"]
            model_totals["total_tokens"] += usage["total_tokens"]
            model_totals["input_images"] += usage["input_images"]
            model_totals["output_images"] += usage["output_images"]
            model_totals["call_count"] += 1
            if bool(usage.get("estimated_input_tokens")) or bool(usage.get("estimated_output_tokens")):
                model_totals["estimated_call_count"] += 1
    return totals


def _estimate_token_cost_usd(usage: dict) -> dict:
    normalized = _normalize_ai_usage(usage)
    return estimate_gemini_usage_cost_usd(normalized)


def _sum_ai_costs(entries: list[dict]) -> dict:
    totals = {
        "input": 0.0,
        "output": 0.0,
        "total": 0.0,
        "input_tokens": 0.0,
        "output_text_tokens": 0.0,
        "output_image": 0.0,
        "models": {},
    }
    for entry in entries:
        usage = _normalize_ai_usage(entry)
        if not _has_meaningful_ai_usage(usage):
            continue
        cost = usage.get("cost_usd") if isinstance(usage.get("cost_usd"), dict) else _estimate_token_cost_usd(usage)
        totals["input"] += float(cost.get("input") or 0)
        totals["output"] += float(cost.get("output") or 0)
        totals["total"] += float(cost.get("total") or 0)
        totals["input_tokens"] += float(cost.get("input_tokens") or 0)
        totals["output_text_tokens"] += float(cost.get("output_text_tokens") or 0)
        totals["output_image"] += float(cost.get("output_image") or 0)

        model_key = str(usage.get("model") or "").strip()
        if model_key:
            model_totals = totals["models"].setdefault(
                model_key,
                {
                    "input": 0.0,
                    "output": 0.0,
                    "total": 0.0,
                    "input_tokens": 0.0,
                    "output_text_tokens": 0.0,
                    "output_image": 0.0,
                },
            )
            model_totals["input"] += float(cost.get("input") or 0)
            model_totals["output"] += float(cost.get("output") or 0)
            model_totals["total"] += float(cost.get("total") or 0)
            model_totals["input_tokens"] += float(cost.get("input_tokens") or 0)
            model_totals["output_text_tokens"] += float(cost.get("output_text_tokens") or 0)
            model_totals["output_image"] += float(cost.get("output_image") or 0)

    totals["input"] = round(totals["input"], 6)
    totals["output"] = round(totals["output"], 6)
    totals["total"] = round(totals["total"], 6)
    totals["input_tokens"] = round(totals["input_tokens"], 6)
    totals["output_text_tokens"] = round(totals["output_text_tokens"], 6)
    totals["output_image"] = round(totals["output_image"], 6)
    for model_totals in totals["models"].values():
        model_totals["input"] = round(model_totals["input"], 6)
        model_totals["output"] = round(model_totals["output"], 6)
        model_totals["total"] = round(model_totals["total"], 6)
        model_totals["input_tokens"] = round(model_totals["input_tokens"], 6)
        model_totals["output_text_tokens"] = round(model_totals["output_text_tokens"], 6)
        model_totals["output_image"] = round(model_totals["output_image"], 6)
    return totals


def _merge_token_costs(*entries: dict | None) -> dict:
    input_total = 0.0
    output_total = 0.0
    for entry in entries:
        token_costs = entry or {}
        input_total += float(token_costs.get("input") or 0)
        output_total += float(token_costs.get("output") or 0)
    return {
        "input": round(input_total, 6),
        "output": round(output_total, 6),
        "total": round(input_total + output_total, 6)
    }


def build_analysis_job_cost_summary(
    *,
    analysis_usage: dict | None = None,
    item_image_usage: dict | None = None,
    generated_item_image_count: int = 0
) -> dict:
    normalized_analysis_usage = _normalize_ai_usage(analysis_usage or {})
    normalized_item_image_usage = _normalize_ai_usage(item_image_usage or {})
    analysis_unit_cost = round(
        settings.ANALYSIS_INPUT_COST_USD + settings.ANALYSIS_OUTPUT_IMAGE_COST_USD,
        4
    )
    item_image_unit_cost = round(settings.ITEM_IMAGE_COST_USD, 4)
    analysis_token_costs = _estimate_token_cost_usd(normalized_analysis_usage)
    item_image_token_costs = _estimate_token_cost_usd(normalized_item_image_usage)
    total_usage = _sum_ai_usage([normalized_analysis_usage, normalized_item_image_usage])
    total_token_costs = _merge_token_costs(analysis_token_costs, item_image_token_costs)
    analysis_estimated_cost = analysis_unit_cost
    item_image_estimated_cost = round(max(_safe_outfit_index(generated_item_image_count), 0) * item_image_unit_cost, 4)
    return {
        "version": 2,
        "analysis": {
            "usage": normalized_analysis_usage,
            "estimated_cost_usd": analysis_estimated_cost,
            "estimated_token_cost_usd": analysis_token_costs,
            "unit_costs_usd": {
                "operation": analysis_unit_cost,
                "input": settings.ANALYSIS_INPUT_COST_USD,
                "output_image": settings.ANALYSIS_OUTPUT_IMAGE_COST_USD
            }
        },
        "item_image_generation": {
            "generated_items": _safe_outfit_index(generated_item_image_count),
            "usage": normalized_item_image_usage,
            "estimated_cost_usd": item_image_estimated_cost,
            "estimated_token_cost_usd": item_image_token_costs,
            "unit_costs_usd": {
                "operation": item_image_unit_cost
            }
        },
        "total_usage": total_usage,
        "estimated_costs_usd": {
            "analysis": analysis_estimated_cost,
            "item_image_generation": item_image_estimated_cost,
            "total": round(analysis_estimated_cost + item_image_estimated_cost, 4)
        },
        "estimated_token_costs_usd": {
            "analysis": analysis_token_costs,
            "item_image_generation": item_image_token_costs,
            "total": total_token_costs
        },
        "pricing_snapshot": {
            "analysis_model": normalized_analysis_usage.get("model"),
            "item_image_model": normalized_item_image_usage.get("model"),
            "analysis_pricing": _coerce_dict(normalized_analysis_usage.get("pricing") or {}),
            "item_image_pricing": _coerce_dict(normalized_item_image_usage.get("pricing") or {}),
            "legacy_fallback_token_pricing": {
                "input": settings.GEMINI_INPUT_COST_PER_1M_TOKENS_USD,
                "output": settings.GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD,
            },
            "analysis_input_cost_usd": settings.ANALYSIS_INPUT_COST_USD,
            "analysis_output_image_cost_usd": settings.ANALYSIS_OUTPUT_IMAGE_COST_USD,
            "item_image_cost_usd": settings.ITEM_IMAGE_COST_USD
        }
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
                        "attributes_json": _build_item_attributes(
                            normalized_item,
                            outfit_index=outfit_index,
                            outfit_style=outfit.get("style") or analysis.get("style") or "Unknown",
                            existing_attributes=_coerce_dict(item.get("attributes_json") or {}),
                        )
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
                        "attributes_json": _build_item_attributes(
                            normalized_item,
                            outfit_index=0,
                            outfit_style=analysis.get("style") or "Unknown",
                            existing_attributes=_coerce_dict(item.get("attributes_json") or {}),
                        )
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
    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is None:
        _SUPABASE_CLIENT = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
    return _SUPABASE_CLIENT


def _fetchone_dict(cursor, query: str, params: tuple) -> dict | None:
    cursor.execute(query, params)
    row = cursor.fetchone()
    if row is None:
        return None
    columns = [description[0] for description in cursor.description or []]
    return {columns[index]: value for index, value in enumerate(row)}


def _to_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _query_dashboard_snapshot(user_id: str) -> dict | None:
    try:
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                return _fetchone_dict(
                    cur,
                    """
                    select
                      (
                        select count(*)
                        from public.photos p
                        where p.user_id = %s
                          and p.storage_path not like 'virtual/%%'
                      ) as photos_count,
                      (
                        select count(*)
                        from public.analysis_jobs aj
                        where aj.user_id = %s
                          and aj.status = 'completed'
                      ) as analyses_count,
                      (
                        select count(*)
                        from public.outfits o
                        where o.user_id = %s
                          and o.source_type = %s
                      ) as outfits_count,
                      (
                        select count(*)
                        from public.items i
                        where i.user_id = %s
                      ) as items_count,
                      (
                        select count(*)
                        from public.outfit_analyses oa
                        where oa.user_id = %s
                          and (
                            oa.raw_json ->> 'outfitsme_generated' = 'true'
                            or oa.raw_json ->> 'custom_outfit_generated' = 'true'
                          )
                      ) as generated_outfit_images_count
                    """,
                    (
                        user_id,
                        user_id,
                        user_id,
                        OUTFIT_SOURCE_OUTFITSME,
                        user_id,
                        user_id,
                    )
                )
    except Exception:  # noqa: BLE001
        return None


def _query_trial_usage_snapshot(user_id: str, since_iso: str) -> dict | None:
    try:
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                return _fetchone_dict(
                    cur,
                    """
                    select
                      coalesce(us.user_role, 'trial') as user_role,
                      u.created_at as user_created_at,
                      (
                        select count(*)
                        from public.analysis_jobs aj
                        where aj.user_id = %s
                          and aj.status = 'completed'
                          and coalesce(aj.completed_at, aj.created_at) >= %s::timestamptz
                      ) as analysis_actions_today,
                      (
                        select count(*)
                        from public.outfit_analyses oa
                        where oa.user_id = %s
                          and oa.created_at >= %s::timestamptz
                          and (
                            oa.raw_json ->> 'outfitsme_generated' = 'true'
                            or oa.raw_json ->> 'custom_outfit_generated' = 'true'
                          )
                      ) as outfit_generations_today
                    from public.users u
                    left join public.user_settings us
                      on us.user_id = u.id
                    where u.id = %s
                    limit 1
                    """,
                    (
                        user_id,
                        since_iso,
                        user_id,
                        since_iso,
                        user_id,
                    )
                )
    except Exception:  # noqa: BLE001
        return None


def get_trial_usage_snapshot(user_id: str, since_iso: str) -> dict | None:
    return _query_trial_usage_snapshot(user_id, since_iso)


def _query_cost_snapshot(user_id: str, month_start_iso: str) -> dict | None:
    try:
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                return _fetchone_dict(
                    cur,
                    """
                    select
                      (
                        select count(*)
                        from public.analysis_jobs aj
                        where aj.user_id = %s
                          and aj.status = 'completed'
                          and aj.completed_at >= %s::timestamptz
                      ) as analysis_count,
                      (
                        select count(*)
                        from public.photos p
                        where p.user_id = %s
                          and p.created_at >= %s::timestamptz
                          and p.storage_path like 'virtual/composed/%%'
                      ) as composed_outfit_count,
                      (
                        select count(*)
                        from public.items i
                        where i.user_id = %s
                          and i.created_at >= %s::timestamptz
                          and nullif(i.attributes_json ->> 'generated_item_image_path', '') is not null
                      ) as generated_item_image_count,
                      (
                        select count(*)
                        from public.outfit_analyses oa
                        where oa.user_id = %s
                          and oa.created_at >= %s::timestamptz
                          and oa.raw_json ->> 'custom_outfit_generated' = 'true'
                      ) as custom_outfit_generation_count,
                      (
                        select count(*)
                        from public.outfit_analyses oa
                        where oa.user_id = %s
                          and oa.created_at >= %s::timestamptz
                          and oa.raw_json ->> 'outfitsme_generated' = 'true'
                      ) as try_on_generation_count,
                      (
                        select count(*)
                        from public.outfit_analyses oa
                        where oa.user_id = %s
                          and oa.created_at >= %s::timestamptz
                          and (
                            oa.raw_json ->> 'outfitsme_generated' = 'true'
                            or oa.raw_json ->> 'custom_outfit_generated' = 'true'
                          )
                      ) as generated_outfit_image_count,
                      0 as reserved
                    """,
                    (
                        user_id,
                        month_start_iso,
                        user_id,
                        month_start_iso,
                        user_id,
                        month_start_iso,
                        user_id,
                        month_start_iso,
                        user_id,
                        month_start_iso,
                        user_id,
                        month_start_iso,
                    )
                )
    except Exception:  # noqa: BLE001
        return None


def _is_better_auth_jwt_candidate(access_token: str) -> bool:
    raw_token = str(access_token or "").strip()
    parts = raw_token.split(".")
    if len(parts) != 3:
        return False

    try:
        header_bytes = base64.urlsafe_b64decode(f"{parts[0]}{'=' * (-len(parts[0]) % 4)}")
        header = json.loads(header_bytes.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return False

    return str(header.get("alg") or "").strip() == "EdDSA"


def get_user_id_from_token(access_token: str) -> str | None:
    # Prefer Better Auth JWTs for backend API authorization.
    user_id = get_user_id_from_better_auth_jwt(access_token)
    if user_id:
        return user_id

    # Fall back to Better Auth session tokens during migration.
    user_id = get_user_id_from_session_token(access_token)
    if user_id:
        return user_id

    # Better Auth JWTs use EdDSA, which the legacy Supabase parser cannot verify.
    if _is_better_auth_jwt_candidate(access_token):
        return None

    # Fall back to Supabase auth (legacy)
    try:
        client = get_supabase_client()
        user_response = client.auth.get_user(access_token)
        user = getattr(user_response, "user", None)
        return getattr(user, "id", None)
    except Exception:
        return None


def get_user_from_token(access_token: str):
    if _is_better_auth_jwt_candidate(access_token):
        return None
    client = get_supabase_client()
    user_response = client.auth.get_user(access_token)
    return getattr(user_response, "user", None)


def _get_better_auth_user_created_at_by_user_id(user_id: str) -> str | None:
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id:
        return None

    try:
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                        SELECT created_at FROM "users"
                        WHERE id = %s
                        LIMIT 1
                    """,
                    (normalized_user_id,)
                )
                result = cur.fetchone()
        created_at = result[0] if result else None
        if isinstance(created_at, datetime):
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            return created_at.astimezone(timezone.utc).isoformat()
        return str(created_at) if created_at else None
    except Exception:
        return None


def get_user_created_at_from_token(access_token: str) -> str | None:
    created_at = get_user_created_at_from_better_auth_token(access_token)
    if created_at:
        return created_at

    user_id = get_user_id_from_token(access_token)
    if user_id:
        created_at = _get_better_auth_user_created_at_by_user_id(user_id)
        if created_at:
            return created_at

    if str(access_token or "").count(".") == 2:
        return None

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
                        "attributes_json": _build_item_attributes(
                            normalized_item,
                            outfit_index=outfit_index,
                            outfit_style=outfit_style,
                            existing_attributes=_coerce_dict(item.get("attributes_json") or {}),
                        )
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
                    "attributes_json": _build_item_attributes(
                        normalized_item,
                        outfit_index=0,
                        outfit_style=analysis.get("style") or "Unknown",
                        existing_attributes=_coerce_dict(item.get("attributes_json") or {}),
                    )
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
    path = str(storage_path or "").strip()
    if not path or path.startswith("virtual/"):
        return None
    cache_key = (path, max(int(expires_in_seconds or 0), 1))
    cached = _SIGNED_URL_CACHE.get(cache_key)
    now = monotonic()
    if cached and now < cached[1]:
        return cached[0]

    try:
        response = client.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path,
            expires_in_seconds
        )
        data = getattr(response, "data", None) or response
        if isinstance(data, dict):
            signed_url = _normalize_signed_url(data)
            ttl_seconds = max(int(expires_in_seconds or 0) - 60, 30)
            _SIGNED_URL_CACHE[cache_key] = (signed_url, now + ttl_seconds)
            return signed_url
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


def _resolve_signed_urls_for_paths(
    client: Client,
    paths: list[str],
    *,
    expires_in_seconds: int = 3600
) -> dict[str, str | None]:
    unique_paths = []
    seen: set[str] = set()
    for raw_path in paths:
        path = str(raw_path or "").strip()
        if not path or path.startswith("virtual/") or path in seen:
            continue
        seen.add(path)
        unique_paths.append(path)

    if not unique_paths:
        return {}

    signed_by_path: dict[str, str | None] = {}
    bucket = client.storage.from_(settings.SUPABASE_BUCKET)
    try:
        response = bucket.create_signed_urls(unique_paths, expires_in_seconds)
        data = getattr(response, "data", None) or response
        if isinstance(data, dict):
            data = data.get("data") or data.get("signedUrls") or data.get("signed_urls") or []
        if isinstance(data, list):
            for index, entry in enumerate(data):
                if not isinstance(entry, dict):
                    continue
                entry_path = str(entry.get("path") or entry.get("name") or "").strip()
                if not entry_path and index < len(unique_paths):
                    entry_path = unique_paths[index]
                if not entry_path:
                    continue
                signed_by_path[entry_path] = _normalize_signed_url(entry)
    except Exception:  # noqa: BLE001
        signed_by_path = {}

    for path in unique_paths:
        if path not in signed_by_path:
            signed_by_path[path] = _get_signed_image_url_with_client(
                client,
                path,
                expires_in_seconds=expires_in_seconds
            )

    return signed_by_path


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


def _build_source_item_image_lookup(
    client: Client,
    *,
    user_id: str,
    source_item_ids: list[str],
    resolve_signed_url
) -> dict[str, str]:
    unique_item_ids = []
    seen: set[str] = set()
    for raw_item_id in source_item_ids:
        item_id = str(raw_item_id or "").strip()
        if not item_id or item_id in seen:
            continue
        seen.add(item_id)
        unique_item_ids.append(item_id)

    if not unique_item_ids:
        return {}

    response = (
        client.table("items")
        .select("id,attributes_json")
        .eq("user_id", user_id)
        .in_("id", unique_item_ids)
        .execute()
    )

    image_urls_by_id: dict[str, str] = {}
    for row in (response.data or []):
        if not isinstance(row, dict):
            continue
        item_id = str(row.get("id") or "").strip()
        if not item_id:
            continue
        attributes = _coerce_dict(row.get("attributes_json") or {})
        image_path = str(attributes.get("generated_item_image_path") or "").strip()
        image_url = resolve_signed_url(image_path) if image_path else None
        if image_url:
            image_urls_by_id[item_id] = image_url
    return image_urls_by_id


def _build_source_outfit_generated_item_image_lookup(
    client: Client,
    *,
    user_id: str,
    source_outfit_id: str,
    resolve_signed_url
) -> dict[tuple[str, str, str], list[str]]:
    source_outfit_response = (
        client.table("outfits")
        .select("id,analysis_id,outfit_index")
        .eq("id", source_outfit_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    source_outfit_row = (source_outfit_response.data or [None])[0]
    if not source_outfit_row:
        return {}

    analysis_id = str(source_outfit_row.get("analysis_id") or "").strip()
    if not analysis_id:
        return {}

    analysis_response = (
        client.table("outfit_analyses")
        .select("raw_json")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    analysis_row = (analysis_response.data or [None])[0]
    raw_json = _coerce_dict((analysis_row or {}).get("raw_json") or {})
    raw_outfits = raw_json.get("outfits")
    if not isinstance(raw_outfits, list):
        return {}

    outfit_index = _safe_outfit_index(source_outfit_row.get("outfit_index"))
    if outfit_index < 0 or outfit_index >= len(raw_outfits):
        return {}

    source_outfit = raw_outfits[outfit_index]
    if not isinstance(source_outfit, dict):
        return {}

    required_counts_by_signature: dict[tuple[str, str, str], int] = {}
    for item in (source_outfit.get("items") or []):
        if not isinstance(item, dict):
            continue
        normalized = _normalize_item_fields(item)
        signature = (
            normalized["category"].lower(),
            normalized["name"].lower(),
            normalized["color"].lower()
        )
        required_counts_by_signature[signature] = required_counts_by_signature.get(signature, 0) + 1

    if not required_counts_by_signature:
        return {}

    return _build_generated_item_image_lookup(
        client,
        user_id=user_id,
        analysis_id=analysis_id,
        resolve_signed_url=resolve_signed_url,
        required_counts_by_signature=required_counts_by_signature
    )


def _normalize_items_with_images(
    raw_items: list[dict],
    images_by_signature: dict[tuple[str, str, str], list[str]],
    source_item_images_by_id: dict[str, str] | None = None,
    resolve_signed_url=None
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
        direct_image_path = str(
            item.get("image_path")
            or item.get("generated_item_image_path")
            or ""
        ).strip()
        direct_image_url = resolve_signed_url(direct_image_path) if resolve_signed_url and direct_image_path else None
        signature = (
            normalized["category"].lower(),
            normalized["name"].lower(),
            normalized["color"].lower()
        )
        candidates = remaining_by_signature.get(signature) or []
        image_url = direct_image_url or (candidates.pop(0) if candidates else None)
        source_item_id = str(item.get("source_item_id") or "").strip() or None
        if not image_url and source_item_id and source_item_images_by_id:
            image_url = source_item_images_by_id.get(source_item_id)
        normalized_items.append(
            {
                **normalized,
                "image_url": image_url,
                "image_path": direct_image_path or None,
                "source_item_id": source_item_id,
            }
        )
    return normalized_items


def list_wardrobe(user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    client = get_supabase_client()
    outfits_response = (
        client.table("outfits")
        .select("id,photo_id,analysis_id,outfit_index,style_label,created_at,source_type,source_outfit_id,generated_image_path")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(max(0, int(offset)), max(0, int(offset)) + max(1, int(limit)) - 1)
        .execute()
    )
    outfits = outfits_response.data or []
    if not outfits:
        return []

    wardrobe = []
    photo_ids = list({outfit.get("photo_id") for outfit in outfits if outfit.get("photo_id")})
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

    signed_urls = _resolve_signed_urls_for_paths(
        client,
        [
            (
                outfit.get("generated_image_path") or ""
                if _normalize_outfit_source_type(outfit.get("source_type")) == OUTFIT_SOURCE_CUSTOM and outfit.get("generated_image_path")
                else (photos_by_id.get(outfit.get("photo_id")) or {}).get("storage_path") or ""
            )
            for outfit in outfits
        ],
        expires_in_seconds=3600
    )

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
                "image_url": signed_urls.get(storage_path),
                "created_at": outfit.get("created_at") or photo.get("created_at"),
                "analysis_id": outfit.get("analysis_id"),
                "analysis_created_at": None,
                "style_label": _normalize_label(outfit.get("style_label"), "Unlabeled"),
                "source_type": _normalize_outfit_source_type(outfit.get("source_type")),
                "source_outfit_id": outfit.get("source_outfit_id"),
                "generated_image_path": generated_image_path,
                "outfit_index": _safe_outfit_index(outfit.get("outfit_index")),
            }
        )

    return wardrobe


def list_analysis_history(user_id: str, limit: int = 50) -> list[dict]:
    client = get_supabase_client()
    resolve_signed_url = _build_signed_url_resolver(client, expires_in_seconds=3600)

    jobs_response = (
        client.table("analysis_jobs")
        .select("id,photo_id,storage_path,mime_type,analysis_model,status,error_message,result_json,created_at,started_at,completed_at,updated_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    jobs = jobs_response.data or []

    if not jobs:
        return []

    history = []
    for job in jobs:
        result_json = _coerce_dict(job.get("result_json") or {})
        storage_path = str(job.get("storage_path") or "").strip()
        history.append(
            {
                "job_id": job.get("id"),
                "photo_id": job.get("photo_id"),
                "job_type": (
                    str(result_json.get("job_type") or "").strip().lower().replace("_", "-")
                    or HISTORY_JOB_TYPE_PHOTO_ANALYSIS
                ),
                "analysis_model": job.get("analysis_model"),
                "status": job.get("status"),
                "error_message": job.get("error_message"),
                "created_at": job.get("created_at"),
                "started_at": job.get("started_at"),
                "completed_at": job.get("completed_at"),
                "updated_at": job.get("updated_at"),
                "storage_path": storage_path,
                "image_url": resolve_signed_url(storage_path),
                "style_label": result_json.get("style_label"),
            }
        )
    return history


def list_user_items(user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    client = get_supabase_client()
    items_response = (
        client.table("items")
        .select("id,analysis_id,category,name,color,attributes_json,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(max(0, int(offset)), max(0, int(offset)) + max(1, int(limit)) - 1)
        .execute()
    )
    items = items_response.data or []

    signed_urls = _resolve_signed_urls_for_paths(
        client,
        [
            str(_coerce_dict(item.get("attributes_json") or {}).get("generated_item_image_path") or "")
            for item in items
        ],
        expires_in_seconds=3600
    )

    normalized_items = []
    for item in items:
        attributes = _coerce_dict(item.get("attributes_json") or {})
        image_path = attributes.get("generated_item_image_path") or ""
        normalized_items.append(
            {
                **item,
                "image_url": signed_urls.get(str(image_path or ""))
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
    attributes["generated_item_image_size_limit"] = "Derived from a 1K generated sprite image"
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


def save_generated_item_sprite(
    user_id: str,
    analysis_id: str,
    data_uri: str,
    *,
    grid_cols: int | None = None,
    grid_rows: int | None = None,
    item_count: int | None = None,
    usage_summary: dict | None = None
) -> dict:
    client = get_supabase_client()
    image_bytes, content_type = _decode_image_data_uri(data_uri)
    extension = ".png" if content_type == "image/png" else ".jpg"
    storage_path = f"{user_id}/generated/item-sprites/{analysis_id}-{uuid4().hex}{extension}"
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": content_type}
    )

    analysis_response = (
        client.table("outfit_analyses")
        .select("id,raw_json")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    analysis_row = (analysis_response.data or [None])[0]
    if not analysis_row:
        raise ValueError("Analysis not found while saving generated item sprite.")

    raw_json = _coerce_dict(analysis_row.get("raw_json") or {})
    raw_json["generated_item_sprite_path"] = storage_path
    raw_json["generated_item_sprite_created_at"] = datetime.now(timezone.utc).isoformat()
    raw_json["generated_item_sprite_content_type"] = content_type
    if grid_cols and grid_rows:
        raw_json["generated_item_sprite_grid"] = {
            "cols": int(grid_cols),
            "rows": int(grid_rows),
            "item_count": max(0, int(item_count or 0))
        }
    if usage_summary:
        raw_json["generated_item_sprite_ai_usage"] = _normalize_ai_usage(usage_summary)

    (
        client.table("outfit_analyses")
        .update({"raw_json": raw_json})
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "storage_path": storage_path,
        "content_type": content_type,
        "image_url": _get_signed_image_url_with_client(client, storage_path, expires_in_seconds=3600)
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
    normalized_items = []
    for item in (items or []):
        if not isinstance(item, dict):
            continue
        normalized_item = _normalize_item_fields(item)
        source_item_id = str(item.get("source_item_id") or "").strip()
        image_path = str(item.get("image_path") or item.get("generated_item_image_path") or "").strip()
        if source_item_id:
            normalized_item["source_item_id"] = source_item_id
        if image_path:
            normalized_item["image_path"] = image_path
        normalized_items.append(normalized_item)
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


def attach_ai_usage_to_outfit_analysis(
    user_id: str,
    analysis_id: str,
    *,
    usage_summary: dict | None = None,
    generated_storage_path: str | None = None
) -> dict | None:
    client = get_supabase_client()
    response = (
        client.table("outfit_analyses")
        .select("id,raw_json")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    analysis_row = (response.data or [None])[0]
    if not analysis_row:
        return None

    raw_json = _coerce_dict(analysis_row.get("raw_json") or {})
    if usage_summary:
        raw_json["ai_usage"] = _normalize_ai_usage(usage_summary)
    if generated_storage_path:
        raw_json["generated_image_path"] = generated_storage_path
        raw_json["generated_image_created_at"] = datetime.now(timezone.utc).isoformat()
    if bool(raw_json.get("composed")):
        raw_json["custom_outfit_generated"] = True

    (
        client.table("outfit_analyses")
        .update({"raw_json": raw_json})
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .execute()
    )
    return {
        "analysis_id": analysis_row.get("id"),
        "ai_usage": _coerce_dict(raw_json.get("ai_usage") or {}),
        "generated_image_path": raw_json.get("generated_image_path"),
        "custom_outfit_generated": bool(raw_json.get("custom_outfit_generated"))
    }


def get_user_monthly_analysis_count(user_id: str, month_start_iso: str) -> int:
    snapshot = _query_cost_snapshot(user_id, month_start_iso)
    if snapshot:
        return _to_int(snapshot.get("analysis_count"))
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
    if statuses == ["completed"]:
        snapshot = _query_trial_usage_snapshot(user_id, since_iso)
        if snapshot:
            return _to_int(snapshot.get("analysis_actions_today"))
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
    snapshot = _query_cost_snapshot(user_id, month_start_iso)
    if snapshot:
        return _to_int(snapshot.get("composed_outfit_count"))
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
    snapshot = _query_cost_snapshot(user_id, month_start_iso)
    if snapshot:
        if str(kind or "").strip().lower() == "items":
            return _to_int(snapshot.get("generated_item_image_count"))
        if str(kind or "").strip().lower() == "outfits":
            return _to_int(snapshot.get("generated_outfit_image_count"))
    client = get_supabase_client()
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in {"items", "outfits"}:
        return 0
    try:
        if safe_kind == "items":
            response = (
                client.table("items")
                .select("id,attributes_json")
                .eq("user_id", user_id)
                .gte("created_at", month_start_iso)
                .execute()
            )
            return sum(
                1
                for row in (response.data or [])
                if _coerce_dict((row or {}).get("attributes_json") or {}).get("generated_item_image_path")
            )

        response = (
            client.table("outfit_analyses")
            .select("raw_json")
            .eq("user_id", user_id)
            .gte("created_at", month_start_iso)
            .execute()
        )
        return sum(
            1
            for row in (response.data or [])
            if _coerce_dict((row or {}).get("raw_json") or {}).get("outfitsme_generated")
            or _coerce_dict((row or {}).get("raw_json") or {}).get("custom_outfit_generated")
        )
    except Exception:  # noqa: BLE001
        # Keep costs endpoint resilient even if storage.objects query fails.
        return 0


def get_user_generated_image_count_since(user_id: str, since_iso: str, kind: str) -> int:
    if str(kind or "").strip().lower() == "outfits":
        snapshot = _query_trial_usage_snapshot(user_id, since_iso)
        if snapshot:
            return _to_int(snapshot.get("outfit_generations_today"))
    client = get_supabase_client()
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in {"items", "outfits"}:
        return 0
    try:
        if safe_kind == "items":
            response = (
                client.table("items")
                .select("id,attributes_json")
                .eq("user_id", user_id)
                .gte("created_at", since_iso)
                .execute()
            )
            return sum(
                1
                for row in (response.data or [])
                if _coerce_dict((row or {}).get("attributes_json") or {}).get("generated_item_image_path")
            )
        else:
            response = (
                client.table("outfit_analyses")
                .select("raw_json")
                .eq("user_id", user_id)
                .gte("created_at", since_iso)
                .execute()
            )
            return sum(
                1
                for row in (response.data or [])
                if _coerce_dict((row or {}).get("raw_json") or {}).get("outfitsme_generated")
                or _coerce_dict((row or {}).get("raw_json") or {}).get("custom_outfit_generated")
            )
        return 0
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


def create_completed_ai_job(
    user_id: str,
    *,
    photo_id: str,
    storage_path: str,
    mime_type: str,
    analysis_model: str,
    job_type: str,
    result_json: dict | None = None
) -> dict:
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    normalized_result = _coerce_dict(result_json or {})
    normalized_result["job_type"] = str(job_type or HISTORY_JOB_TYPE_PHOTO_ANALYSIS).strip().lower()
    response = (
        client.table("analysis_jobs")
        .insert(
            {
                "user_id": user_id,
                "photo_id": photo_id,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "analysis_model": analysis_model,
                "status": "completed",
                "result_json": normalized_result,
                "error_message": None,
                "started_at": now_iso,
                "completed_at": now_iso,
                "updated_at": now_iso
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
    raw_generated_image_path = ""
    if analysis_row:
        raw_json = analysis_row.get("raw_json") or {}
        raw_generated_image_path = str(
            _coerce_dict(raw_json).get("generated_image_path") or ""
        ).strip() if isinstance(raw_json, dict) else ""
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
        source_outfit_images_cache: dict[str, dict[tuple[str, str, str], list[str]]] = {}

        for prepared in prepared_outfits:
            index = _safe_outfit_index(prepared.get("outfit_index"))
            outfit_row = outfits_by_index.get(index) or {}
            prepared_items = [item for item in (prepared.get("items") or []) if isinstance(item, dict)]
            source_item_images_by_id = _build_source_item_image_lookup(
                client,
                user_id=user_id,
                source_item_ids=[
                    str(item.get("source_item_id") or "").strip()
                    for item in prepared_items
                    if str(item.get("source_item_id") or "").strip()
                ],
                resolve_signed_url=resolve_signed_url
            )
            images_for_outfit = {
                signature: list(candidates)
                for signature, candidates in images_by_signature.items()
            }
            if _normalize_outfit_source_type(outfit_row.get("source_type")) == OUTFIT_SOURCE_OUTFITSME:
                source_outfit_id = str(outfit_row.get("source_outfit_id") or "").strip()
                if source_outfit_id:
                    if source_outfit_id not in source_outfit_images_cache:
                        source_outfit_images_cache[source_outfit_id] = _build_source_outfit_generated_item_image_lookup(
                            client,
                            user_id=user_id,
                            source_outfit_id=source_outfit_id,
                            resolve_signed_url=resolve_signed_url
                        )
                    for signature, candidates in source_outfit_images_cache[source_outfit_id].items():
                        images_for_outfit.setdefault(signature, []).extend(candidates)
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
                        prepared_items,
                        images_for_outfit,
                        source_item_images_by_id,
                        resolve_signed_url
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
        selected_outfit_generated_path = str(selected_outfit_row.get("generated_image_path") or "").strip() or raw_generated_image_path
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
    snapshot = _query_dashboard_snapshot(user_id)
    if snapshot:
        photos_count = _to_int(snapshot.get("photos_count"))
        analyses_count = _to_int(snapshot.get("analyses_count"))
        outfits_count = _to_int(snapshot.get("outfits_count"))
        items_count = _to_int(snapshot.get("items_count"))
        generated_outfit_images_count = _to_int(snapshot.get("generated_outfit_images_count"))
    else:
        client = get_supabase_client()
        photos = (
            client.table("photos")
            .select("id,storage_path")
            .eq("user_id", user_id)
            .execute()
        ).data or []
        analyses = (
            client.table("analysis_jobs")
            .select("id")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .execute()
        ).data or []
        outfits = (
            client.table("outfits")
            .select("id")
            .eq("user_id", user_id)
            .eq("source_type", OUTFIT_SOURCE_OUTFITSME)
            .execute()
        ).data or []
        generated_outfit_analyses = (
            client.table("outfit_analyses")
            .select("raw_json")
            .eq("user_id", user_id)
            .execute()
        ).data or []
        items = (
            client.table("items")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        ).data or []
        photos_count = len(
            [photo for photo in photos if not str(photo.get("storage_path") or "").startswith("virtual/")]
        )
        analyses_count = len(analyses)
        outfits_count = len(outfits)
        items_count = len(items)
        generated_outfit_images_count = sum(
            1
            for row in generated_outfit_analyses
            if _coerce_dict((row or {}).get("raw_json") or {}).get("outfitsme_generated")
            or _coerce_dict((row or {}).get("raw_json") or {}).get("custom_outfit_generated")
        )

    return {
        "photos_count": photos_count,
        "outfits_count": outfits_count,
        "analyses_count": analyses_count,
        "items_count": items_count,
        "generated_outfit_images_count": generated_outfit_images_count,
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

    source_items_response = (
        client.table("items")
        .select("id,analysis_id,category,name,color,attributes_json")
        .eq("user_id", user_id)
        .in_("id", unique_item_ids)
        .execute()
    )
    source_items_by_id = {
        str(item.get("id")): item
        for item in (source_items_response.data or [])
        if item.get("id")
    }
    source_items = [source_items_by_id[item_id] for item_id in unique_item_ids if item_id in source_items_by_id]
    if not source_items:
        raise ValueError("No matching items found for this user.")

    matched_source_analysis_id = str(source_items[0].get("analysis_id") or "").strip()
    matched_source_outfit_index = _safe_outfit_index(
        _coerce_dict(source_items[0].get("attributes_json") or {}).get("outfit_index")
    )
    exact_source_outfit_match = None
    if matched_source_analysis_id and all(
        str(item.get("analysis_id") or "").strip() == matched_source_analysis_id
        and _safe_outfit_index(_coerce_dict(item.get("attributes_json") or {}).get("outfit_index")) == matched_source_outfit_index
        for item in source_items
    ):
        analysis_response = (
            client.table("outfit_analyses")
            .select("raw_json,style_label")
            .eq("id", matched_source_analysis_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        analysis_row = (analysis_response.data or [None])[0] or {}
        raw_json = _coerce_dict(analysis_row.get("raw_json") or {})
        raw_outfits = raw_json.get("outfits")
        if isinstance(raw_outfits, list) and 0 <= matched_source_outfit_index < len(raw_outfits):
            candidate_outfit = raw_outfits[matched_source_outfit_index]
            if isinstance(candidate_outfit, dict):
                candidate_items = [item for item in (candidate_outfit.get("items") or []) if isinstance(item, dict)]
                selected_counts: dict[tuple[str, str, str], int] = {}
                selected_ids_by_signature: dict[tuple[str, str, str], list[str]] = {}
                for item in source_items:
                    signature = _build_item_signature(item)
                    selected_counts[signature] = selected_counts.get(signature, 0) + 1
                    selected_ids_by_signature.setdefault(signature, []).append(str(item.get("id") or "").strip())

                candidate_counts: dict[tuple[str, str, str], int] = {}
                for item in candidate_items:
                    signature = _build_item_signature(item)
                    candidate_counts[signature] = candidate_counts.get(signature, 0) + 1

                if candidate_counts == selected_counts:
                    ordered_items = []
                    remaining_ids_by_signature = {
                        signature: list(item_ids_for_signature)
                        for signature, item_ids_for_signature in selected_ids_by_signature.items()
                    }
                    for item in candidate_items:
                        copied_item = dict(item)
                        signature = _build_item_signature(copied_item)
                        remaining_ids = remaining_ids_by_signature.get(signature) or []
                        if remaining_ids:
                            copied_item["source_item_id"] = remaining_ids.pop(0)
                        ordered_items.append(copied_item)
                    exact_source_outfit_match = {
                        "style": _normalize_label(
                            candidate_outfit.get("style") or analysis_row.get("style_label"),
                            "Composed Outfit"
                        ),
                        "items": ordered_items,
                    }

    if exact_source_outfit_match:
        style = exact_source_outfit_match["style"]
        composed_items = exact_source_outfit_match["items"]
    else:
        style = _normalize_label(style_label, "Composed Outfit")
        composed_items = []
        for item in source_items:
            normalized_item = _normalize_item_fields(item)
            attributes = _coerce_dict(item.get("attributes_json") or {})
            image_path = str(attributes.get("generated_item_image_path") or "").strip()
            composed_items.append(
                {
                    **normalized_item,
                    "source_item_id": item.get("id"),
                    **({"image_path": image_path} if image_path else {})
                }
            )

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
    outfits = _insert_outfits_and_items(
        client,
        user_id=user_id,
        photo_id=photo_row["id"],
        analysis_id=analysis_row["id"],
        analysis_created_at=analysis_row.get("created_at"),
        analysis=raw_json,
        source_type=OUTFIT_SOURCE_CUSTOM
    )
    primary_outfit = (outfits or [None])[0] or {}

    return {
        "photo_id": photo_row["id"],
        "analysis_id": analysis_row["id"],
        "outfit_id": primary_outfit.get("id"),
        "outfit_index": _safe_outfit_index(primary_outfit.get("outfit_index")),
        "style_label": style,
        "items_count": len(composed_items),
        "items": composed_items
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


def _normalize_model_settings_row(row: dict | None) -> dict:
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


def _fetch_user_model_settings_row(client: Client, user_id: str) -> dict | None:
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
    return (response.data or [None])[0]


def ensure_user_model_settings(user_id: str, client: Client | None = None) -> dict:
    effective_client = client or get_supabase_client()
    existing_row = _fetch_user_model_settings_row(effective_client, user_id)
    if existing_row:
        return _normalize_model_settings_row(existing_row)

    defaults = _empty_model_settings()
    (
        effective_client.table("user_settings")
        .upsert(
            {
                "user_id": user_id,
                "user_role": defaults["user_role"],
                "profile_gender": defaults["profile_gender"],
                "profile_age": defaults["profile_age"],
                "profile_photo_path": defaults["profile_photo_path"],
                "enable_outfit_image_generation": defaults["enable_outfit_image_generation"],
                "enable_online_store_search": defaults["enable_online_store_search"],
                "enable_accessory_analysis": defaults["enable_accessory_analysis"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="user_id"
        )
        .execute()
    )

    return _normalize_model_settings_row(_fetch_user_model_settings_row(effective_client, user_id))


def get_user_model_settings(user_id: str) -> dict:
    return ensure_user_model_settings(user_id)


def upsert_user_model_settings(user_id: str, payload: dict) -> dict:
    client = get_supabase_client()
    current = ensure_user_model_settings(user_id, client)
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
    current = ensure_user_model_settings(user_id, client)
    previous_path = current.get("profile_photo_path", "")

    raw_content = file_storage.read()
    original_content_type = file_storage.mimetype or mimetypes.guess_type(file_storage.filename or "")[0] or "image/jpeg"
    content, content_type, ext = _resize_profile_photo_content(raw_content, original_content_type)
    storage_path = f"{user_id}/profile/reference-{uuid4().hex}{ext}"
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
    snapshot = _query_cost_snapshot(user_id, month_start_iso)
    analysis_count = _to_int((snapshot or {}).get("analysis_count"))
    composed_outfit_count = _to_int((snapshot or {}).get("composed_outfit_count"))
    custom_outfit_generation_count = _to_int((snapshot or {}).get("custom_outfit_generation_count"))
    try_on_generation_count = _to_int((snapshot or {}).get("try_on_generation_count"))
    generated_item_image_count = _to_int((snapshot or {}).get("generated_item_image_count"))
    generated_outfit_image_count = _to_int((snapshot or {}).get("generated_outfit_image_count"))
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
    client = get_supabase_client()
    analysis_usage_rows = (
        client.table("analysis_jobs")
        .select("result_json")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .gte("completed_at", month_start_iso)
        .execute()
    ).data or []
    analysis_usages = []
    item_usages = []
    for row in analysis_usage_rows:
        result_json = _coerce_dict((row or {}).get("result_json") or {})
        saved_cost_summary = _coerce_dict(result_json.get("cost_summary") or {})
        saved_analysis_usage = _coerce_dict(
            _coerce_dict(saved_cost_summary.get("analysis") or {}).get("usage") or {}
        )
        saved_item_usage = _coerce_dict(
            _coerce_dict(saved_cost_summary.get("item_image_generation") or {}).get("usage") or {}
        )
        analysis_usages.append(saved_analysis_usage or _coerce_dict(result_json.get("ai_usage") or {}))
        item_usages.append(saved_item_usage)
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
        if not bool(raw_json.get("outfitsme_generated")) and not bool(raw_json.get("custom_outfit_generated")):
            continue
        outfit_usages.append(_coerce_dict(raw_json.get("ai_usage") or {}))
    outfit_token_usage = _sum_ai_usage(outfit_usages)
    item_token_usage = _sum_ai_usage(item_usages)

    token_costs = {
        "analysis": _sum_ai_costs(analysis_usages),
        "outfit_image_generation": _sum_ai_costs(outfit_usages),
        "item_image_generation": _sum_ai_costs(item_usages)
    }
    token_costs["total"] = _merge_token_costs(
        token_costs["analysis"],
        token_costs["outfit_image_generation"],
        token_costs["item_image_generation"]
    )
    return {
        "month_start_utc": month_start_iso,
        "analysis_runs": analysis_count,
        "custom_outfit_generations": custom_outfit_generation_count,
        "try_on_generations": try_on_generation_count,
        "composed_outfits_created": composed_outfit_count,
        "generated_item_images": generated_item_image_count,
        "generated_outfit_images": generated_outfit_image_count,
        "cost_formula": {
            "analysis": "1 text/image input call + 1 image output call per completed analysis",
            "outfit_image_generation": "1 text/image input call + 1 image output call per custom outfit or Try It On image",
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
            "total": _sum_ai_usage(analysis_usages + outfit_usages + item_usages),
            "source": "Saved per-call Gemini usage metadata when available; countTokens and estimator fallback otherwise."
        },
        "token_pricing_usd_per_1m": {
            "legacy_fallback_input": settings.GEMINI_INPUT_COST_PER_1M_TOKENS_USD,
            "legacy_fallback_output": settings.GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD,
            "gemini_2_5_flash_input": settings.GEMINI_25_FLASH_INPUT_COST_PER_1M_TOKENS_USD,
            "gemini_2_5_flash_output": settings.GEMINI_25_FLASH_OUTPUT_COST_PER_1M_TOKENS_USD,
            "gemini_2_5_flash_image_input": settings.GEMINI_25_FLASH_IMAGE_INPUT_COST_PER_1M_TOKENS_USD,
            "gemini_2_5_flash_image_output_text": settings.GEMINI_25_FLASH_IMAGE_OUTPUT_TEXT_COST_PER_1M_TOKENS_USD,
            "gemini_2_5_flash_image_output_image": settings.GEMINI_25_FLASH_IMAGE_OUTPUT_IMAGE_COST_PER_1M_TOKENS_USD
        },
        "image_pricing_usd": {
            "gemini_2_5_flash_image_output_per_image": settings.GEMINI_25_FLASH_IMAGE_OUTPUT_COST_PER_IMAGE_USD,
            "gemini_2_5_flash_image_output_tokens_per_image": settings.GEMINI_25_FLASH_IMAGE_OUTPUT_TOKENS_PER_IMAGE
        },
        "estimated_token_costs_usd": token_costs,
        "limits": {
            "monthly_custom_outfit_generation_limit": settings.MONTHLY_CUSTOM_OUTFIT_LIMIT
        }
    }


