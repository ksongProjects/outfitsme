from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import base64
import math

import requests
from PIL import Image, ImageOps

from app.config import settings
from app.services.access_control import has_accessory_access
from app.services.gemini_service import (
    analyze_outfit_with_gemini,
    generate_item_sprite_with_gemini
)
from app.services.models_service import build_model_availability
from app.services.supabase_service import (
    build_analysis_job_cost_summary,
    claim_analysis_job,
    download_photo_bytes,
    get_analysis_job_by_id,
    list_items_for_analysis,
    get_user_model_settings,
    mark_analysis_job_completed,
    mark_analysis_job_failed,
    mark_analysis_job_progress,
    persist_analysis_for_photo,
    save_generated_item_image,
    save_generated_item_sprite,
)

_JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="analysis-job")
_ACCESSORY_KEYWORDS = {
    "ring",
    "earring",
    "necklace",
    "bracelet",
    "watch",
    "bag",
    "purse",
    "tote",
    "backpack",
    "wallet",
    "scarf",
    "belt",
    "hat",
    "cap",
    "beanie",
    "sunglass",
    "glasses",
    "jewelry",
    "tie",
    "sock"
}


def _build_response_payload(
    analysis: dict,
    chosen_model_id: str,
    persistence: dict,
    cost_summary: dict | None = None
) -> dict:
    usage = analysis.get("_usage") if isinstance(analysis, dict) else None
    generated_item_sprite_path = analysis.get("generated_item_sprite_path") if isinstance(analysis, dict) else None
    generated_item_sprite_url = analysis.get("generated_item_sprite_url") if isinstance(analysis, dict) else None
    return {
        "style": analysis.get("style"),
        "items": [dict(item) for item in (analysis.get("items") or [])],
        "outfits": [dict(outfit) for outfit in (analysis.get("outfits") or []) if isinstance(outfit, dict)],
        "analysis_model": chosen_model_id,
        "ai_usage": usage if isinstance(usage, dict) else {},
        "cost_summary": cost_summary if isinstance(cost_summary, dict) else {},
        **({"generated_item_sprite_path": generated_item_sprite_path} if generated_item_sprite_path else {}),
        **({"generated_item_sprite_url": generated_item_sprite_url} if generated_item_sprite_url else {}),
        **persistence
    }


def _build_persistence_payload(analysis: dict) -> dict:
    analysis_items = analysis.get("items", [])
    analysis_outfits = analysis.get("outfits", [])
    return {
        "style": analysis.get("style"),
        "items": [
            {
                "category": item.get("category"),
                "name": item.get("name"),
                "color": item.get("color")
            }
            for item in analysis_items
            if isinstance(item, dict)
        ],
        "outfits": [
            {
                "style": outfit.get("style"),
                "items": [
                    {
                        "category": item.get("category"),
                        "name": item.get("name"),
                        "color": item.get("color")
                    }
                    for item in (outfit.get("items") or [])
                    if isinstance(item, dict)
                ]
            }
            for outfit in analysis_outfits
            if isinstance(outfit, dict)
        ]
    }


def _is_accessory_item(item: dict) -> bool:
    text = " ".join(
        [
            str(item.get("category", "")).strip().lower(),
            str(item.get("name", "")).strip().lower()
        ]
    )
    return any(keyword in text for keyword in _ACCESSORY_KEYWORDS)


def _filter_analysis_for_free_tier(analysis: dict) -> dict:
    filtered_outfits = []
    for outfit in (analysis.get("outfits") or []):
        if not isinstance(outfit, dict):
            continue
        next_items = []
        for item in (outfit.get("items") or []):
            if not isinstance(item, dict):
                continue
            if _is_accessory_item(item):
                continue
            next_items.append(item)
        if next_items:
            filtered_outfits.append({**outfit, "items": next_items})

    filtered_items = []
    for item in (analysis.get("items") or []):
        if not isinstance(item, dict):
            continue
        if _is_accessory_item(item):
            continue
        filtered_items.append(item)

    style_value = analysis.get("style")
    if filtered_outfits:
        style_value = filtered_outfits[0].get("style") or style_value

    return {
        **analysis,
        "style": style_value,
        "items": filtered_items,
        "outfits": filtered_outfits
    }


def _attach_item_images_to_analysis(analysis: dict, persisted_items: list[dict]) -> dict:
    def _sig(item: dict) -> tuple[str, str, str]:
        return (
            str(item.get("category", "")).strip().lower(),
            str(item.get("name", "")).strip().lower(),
            str(item.get("color", "")).strip().lower()
        )

    by_signature: dict[tuple[str, str, str], list[dict]] = {}
    for item in persisted_items:
        signature = _sig(item)
        by_signature.setdefault(signature, []).append(item)

    def _consume_image(item: dict) -> str | None:
        signature = _sig(item)
        candidates = by_signature.get(signature) or []
        if not candidates:
            return None
        matched = candidates.pop(0)
        return matched.get("image_url")

    enriched_items = []
    for item in (analysis.get("items") or []):
        if not isinstance(item, dict):
            continue
        enriched_items.append({**item, "image_url": _consume_image(item)})

    enriched_outfits = []
    for outfit in (analysis.get("outfits") or []):
        if not isinstance(outfit, dict):
            continue
        next_items = []
        for item in (outfit.get("items") or []):
            if not isinstance(item, dict):
                continue
            next_items.append({**item, "image_url": _consume_image(item)})
        enriched_outfits.append({**outfit, "items": next_items})

    return {
        **analysis,
        "items": enriched_items,
        "outfits": enriched_outfits
    }


def _mark_job_progress(
    job_id: str,
    *,
    stage: str,
    message: str,
    counts: dict | None = None,
    current_item: dict | None = None
) -> None:
    payload = {
        "stage": stage,
        "message": message
    }
    if isinstance(counts, dict):
        payload["counts"] = counts
    if isinstance(current_item, dict):
        payload["current_item"] = current_item
    try:
        mark_analysis_job_progress(job_id, payload)
    except Exception:  # noqa: BLE001
        # Progress updates are best-effort and should not fail the job.
        return


def _decode_data_uri_image(data_uri: str) -> tuple[bytes, str] | None:
    if not isinstance(data_uri, str) or not data_uri.startswith("data:image/"):
        return None
    parts = data_uri.split(",", 1)
    if len(parts) != 2:
        return None
    header, encoded = parts
    mime_type = header.split(";")[0].replace("data:", "") or "image/png"
    try:
        return base64.b64decode(encoded), mime_type
    except Exception:  # noqa: BLE001
        return None


def _build_sprite_grid(item_count: int) -> tuple[int, int]:
    if item_count <= 1:
        return 1, 1
    if item_count <= 4:
        return 2, 2
    if item_count <= 6:
        return 3, 2
    cols = 4
    rows = int(math.ceil(item_count / cols))
    return cols, rows


def _build_sprite_axis_bounds(axis_length: int, segment_count: int) -> list[int]:
    safe_axis_length = max(1, int(axis_length))
    safe_segment_count = max(1, int(segment_count))
    bounds = [
        min(
            safe_axis_length,
            max(0, (index * safe_axis_length) // safe_segment_count)
        )
        for index in range(safe_segment_count)
    ]
    bounds.append(safe_axis_length)
    return bounds


def _build_inset_sprite_cell_bounds(
    *,
    left: int,
    top: int,
    right: int,
    bottom: int,
    col: int,
    row: int,
    grid_cols: int,
    grid_rows: int
) -> tuple[int, int, int, int]:
    cell_width = max(1, right - left)
    cell_height = max(1, bottom - top)
    inset_x = min(max(1, int(round(cell_width * 0.015))), max(1, cell_width // 10))
    inset_y = min(max(1, int(round(cell_height * 0.015))), max(1, cell_height // 10))

    next_left = left + (inset_x if col > 0 else 0)
    next_top = top + (inset_y if row > 0 else 0)
    next_right = right - (inset_x if col < grid_cols - 1 else 0)
    next_bottom = bottom - (inset_y if row < grid_rows - 1 else 0)

    if next_right - next_left < max(8, cell_width // 3):
        next_left, next_right = left, right
    if next_bottom - next_top < max(8, cell_height // 3):
        next_top, next_bottom = top, bottom

    return next_left, next_top, next_right, next_bottom


def _slice_sprite_to_item_data_uris(
    sprite_data_uri: str,
    item_count: int,
    grid_cols: int,
    grid_rows: int
) -> list[str]:
    decoded = _decode_data_uri_image(sprite_data_uri)
    if not decoded:
        return []
    image_bytes, _mime = decoded
    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source)
            width, height = image.size
            if width <= 0 or height <= 0:
                return []
            x_bounds = _build_sprite_axis_bounds(width, grid_cols)
            y_bounds = _build_sprite_axis_bounds(height, grid_rows)
            result = []
            for index in range(item_count):
                row = index // grid_cols
                col = index % grid_cols
                if row >= len(y_bounds) - 1 or col >= len(x_bounds) - 1:
                    continue
                left = x_bounds[col]
                top = y_bounds[row]
                right = x_bounds[col + 1]
                bottom = y_bounds[row + 1]
                left, top, right, bottom = _build_inset_sprite_cell_bounds(
                    left=left,
                    top=top,
                    right=right,
                    bottom=bottom,
                    col=col,
                    row=row,
                    grid_cols=grid_cols,
                    grid_rows=grid_rows
                )
                if right <= left or bottom <= top:
                    continue
                crop = image.crop((left, top, right, bottom))
                if crop.mode not in {"RGB", "L"}:
                    crop = crop.convert("RGB")
                max_side = settings.ITEM_IMAGE_MAX_SIDE
                resize_threshold = max(0, int(settings.ITEM_IMAGE_RESIZE_THRESHOLD))
                if max_side > 0 and max(crop.width, crop.height) > resize_threshold:
                    crop.thumbnail((max_side, max_side), resample=Image.Resampling.LANCZOS)
                output = BytesIO()
                crop.save(output, format="JPEG", quality=90, optimize=True)
                result.append(f"data:image/jpeg;base64,{base64.b64encode(output.getvalue()).decode('utf-8')}")
            return result
    except Exception:  # noqa: BLE001
        return []


def _generate_item_images_for_analysis(
    user_id: str,
    analysis_id: str,
    user_settings: dict,
    job_id: str,
    source_image_bytes: bytes | None = None,
    source_mime_type: str | None = None
) -> dict:
    if not bool(user_settings.get("enable_outfit_image_generation")):
        _mark_job_progress(
            job_id,
            stage="generating_item_images",
            message="Item image generation is disabled in Settings."
        )
        return {
            "total_items": 0,
            "processed_items": 0,
            "generated_items": 0,
            "failed_items": 0,
            "skipped_items": 0,
            "ai_usage": {},
            "disabled": True
        }

    if not settings.GEMINI_API_KEY:
        _mark_job_progress(
            job_id,
            stage="generating_item_images",
            message="Item image generation is unavailable right now."
        )
        return {
            "total_items": 0,
            "processed_items": 0,
            "generated_items": 0,
            "failed_items": 0,
            "skipped_items": 0,
            "ai_usage": {},
            "disabled": True
        }

    items = list_items_for_analysis(user_id, analysis_id)
    total_items = len(items)
    summary = {
        "total_items": total_items,
        "processed_items": 0,
        "generated_items": 0,
        "failed_items": 0,
        "skipped_items": 0,
        "ai_usage": {},
        "sprite_storage_path": None,
        "sprite_image_url": None,
        "disabled": False
    }
    _mark_job_progress(
        job_id,
        stage="generating_item_images",
        message=f"Preparing sprite generation for {total_items} item(s).",
        counts=summary
    )
    pending_items = []
    for item in items:
        attributes = item.get("attributes_json") or {}
        if isinstance(attributes, dict) and attributes.get("generated_item_image_path"):
            summary["processed_items"] += 1
            summary["skipped_items"] += 1
            continue
        pending_items.append(item)

    if pending_items:
        grid_cols, grid_rows = _build_sprite_grid(len(pending_items))
        _mark_job_progress(
            job_id,
            stage="generating_item_images",
            message=f"Generating item sprite ({grid_cols}x{grid_rows}) for {len(pending_items)} item(s).",
            counts=summary
        )
        try:
            sprite_data_uri, sprite_usage = generate_item_sprite_with_gemini(
                [
                    {
                        "category": item.get("category"),
                        "name": item.get("name"),
                        "color": item.get("color")
                    }
                    for item in pending_items
                ],
                grid_cols=grid_cols,
                grid_rows=grid_rows,
                reference_image_bytes=source_image_bytes,
                reference_mime_type=source_mime_type,
                return_usage=True
            )
            summary["ai_usage"] = sprite_usage if isinstance(sprite_usage, dict) else {}
            if sprite_data_uri:
                stored_sprite = save_generated_item_sprite(
                    user_id,
                    analysis_id,
                    sprite_data_uri,
                    grid_cols=grid_cols,
                    grid_rows=grid_rows,
                    item_count=len(pending_items),
                    usage_summary=sprite_usage if isinstance(sprite_usage, dict) else None
                )
                summary["sprite_storage_path"] = stored_sprite.get("storage_path")
                summary["sprite_image_url"] = stored_sprite.get("image_url")
            cropped_data_uris = _slice_sprite_to_item_data_uris(
                sprite_data_uri or "",
                len(pending_items),
                grid_cols,
                grid_rows
            )
            token_divisor = max(1, len([uri for uri in cropped_data_uris if uri]))
            for index, item in enumerate(pending_items):
                image_data_uri = cropped_data_uris[index] if index < len(cropped_data_uris) else None
                if not image_data_uri:
                    summary["processed_items"] += 1
                    summary["failed_items"] += 1
                    continue
                per_item_usage = {}
                if isinstance(sprite_usage, dict):
                    per_item_usage = {
                        "input_tokens": int(sprite_usage.get("input_tokens", 0) / token_divisor),
                        "output_tokens": int(sprite_usage.get("output_tokens", 0) / token_divisor),
                        "input_images": int(sprite_usage.get("input_images", 0) / token_divisor),
                        "output_images": int(sprite_usage.get("output_images", 0) / token_divisor)
                    }
                    per_item_usage["total_tokens"] = per_item_usage["input_tokens"] + per_item_usage["output_tokens"]
                save_generated_item_image(user_id, item["id"], image_data_uri, usage_summary=per_item_usage)
                summary["processed_items"] += 1
                summary["generated_items"] += 1
        except Exception:  # noqa: BLE001
            summary["processed_items"] += len(pending_items)
            summary["failed_items"] += len(pending_items)
    _mark_job_progress(
        job_id,
        stage="generating_item_images",
        message="Finished item image generation.",
        counts=summary
    )
    return summary


def process_analysis_job(job_id: str) -> None:
    claimed = claim_analysis_job(job_id)
    if not claimed:
        return

    try:
        _mark_job_progress(job_id, stage="processing_started", message="Analysis job started.")
        user_id = claimed["user_id"]
        chosen_model_id = claimed.get("analysis_model") or settings.DEFAULT_ANALYSIS_MODEL
        mime_type = claimed.get("mime_type") or "image/jpeg"
        storage_path = claimed.get("storage_path") or ""
        if not storage_path:
            raise ValueError("Job is missing storage path.")

        _mark_job_progress(job_id, stage="loading_photo", message="Loading uploaded photo.")
        image_bytes = download_photo_bytes(storage_path)
        if not image_bytes:
            raise ValueError("Stored image could not be loaded.")
        _mark_job_progress(job_id, stage="photo_processed", message="Photo loaded successfully.")

        user_settings = get_user_model_settings(user_id)
        available_models = build_model_availability(user_settings)
        model_entry = next((model for model in available_models if model["id"] == chosen_model_id), None)
        if not model_entry:
            raise ValueError(f"Unknown analysis model: {chosen_model_id}")
        if not model_entry.get("available"):
            reason = model_entry.get("unavailable_reason") or "Selected model is unavailable."
            raise ValueError(reason)

        _mark_job_progress(
            job_id,
            stage="analyzing_photo",
            message=f"Analyzing photo with {model_entry['label']}."
        )
        if model_entry["provider"] == "gemini":
            analysis = analyze_outfit_with_gemini(
                image_bytes,
                mime_type,
                model=chosen_model_id
            )
        else:
            raise ValueError(f"Unsupported model provider: {model_entry['provider']}")

        analysis_usage = analysis.pop("_usage", {}) if isinstance(analysis, dict) else {}

        # Accessories are premium-only and excluded for default tier users.
        if not has_accessory_access(
            user_settings.get("user_role"),
            enable_accessory_analysis=bool(user_settings.get("enable_accessory_analysis"))
        ):
            analysis = _filter_analysis_for_free_tier(analysis)

        _mark_job_progress(job_id, stage="persisting_results", message="Saving analysis results.")
        analysis_for_persistence = _build_persistence_payload(analysis)
        persistence = persist_analysis_for_photo(user_id, claimed["photo_id"], analysis_for_persistence)
        analysis_for_response = analysis
        item_image_summary = None
        if persistence.get("analysis_id"):
            item_image_summary = _generate_item_images_for_analysis(
                user_id,
                persistence["analysis_id"],
                user_settings,
                job_id,
                source_image_bytes=image_bytes,
                source_mime_type=mime_type
            )
            persisted_items = list_items_for_analysis(user_id, persistence["analysis_id"])
            analysis_for_response = _attach_item_images_to_analysis(analysis, persisted_items)
        if isinstance(analysis_for_response, dict) and isinstance(item_image_summary, dict):
            if item_image_summary.get("sprite_storage_path"):
                analysis_for_response["generated_item_sprite_path"] = item_image_summary.get("sprite_storage_path")
            if item_image_summary.get("sprite_image_url"):
                analysis_for_response["generated_item_sprite_url"] = item_image_summary.get("sprite_image_url")
        if isinstance(analysis_for_response, dict):
            analysis_for_response["_usage"] = analysis_usage
        cost_summary = build_analysis_job_cost_summary(
            analysis_usage=analysis_usage,
            item_image_usage=(item_image_summary or {}).get("ai_usage") if isinstance(item_image_summary, dict) else {},
            generated_item_image_count=(item_image_summary or {}).get("generated_items", 0)
            if isinstance(item_image_summary, dict)
            else 0
        )
        _mark_job_progress(
            job_id,
            stage="finalizing",
            message="Finalizing analysis response.",
            counts=item_image_summary
        )
        response_payload = _build_response_payload(
            analysis_for_response,
            chosen_model_id,
            persistence,
            cost_summary=cost_summary
        )
        mark_analysis_job_completed(job_id, response_payload)
    except requests.HTTPError as exc:
        mark_analysis_job_failed(job_id, f"Model request failed: {exc}")
    except Exception as exc:  # noqa: BLE001
        mark_analysis_job_failed(job_id, f"Analyze failed: {exc}")


def enqueue_analysis_job_processing(job_id: str) -> None:
    _JOB_EXECUTOR.submit(process_analysis_job, job_id)


def get_job_status_response(job_id: str) -> dict | None:
    row = get_analysis_job_by_id(job_id)
    if not row:
        return None
    return {
        "job_id": row.get("id"),
        "status": row.get("status"),
        "error_message": row.get("error_message"),
        "result": row.get("result_json"),
        "created_at": row.get("created_at"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
        "updated_at": row.get("updated_at")
    }


