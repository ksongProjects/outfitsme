from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import requests
from PIL import Image, ImageOps

from app.config import settings
from app.services.bedrock_service import analyze_outfit_with_bedrock_agent
from app.services.gemini_service import (
    analyze_outfit_with_gemini,
    detect_item_bounding_boxes_with_gemini,
    generate_item_image_with_gemini
)
from app.services.models_service import build_model_availability
from app.services.supabase_service import (
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


def _build_response_payload(analysis: dict, chosen_model_id: str, persistence: dict) -> dict:
    return {
        "style": analysis.get("style"),
        "items": [dict(item) for item in (analysis.get("items") or [])],
        "outfits": [dict(outfit) for outfit in (analysis.get("outfits") or []) if isinstance(outfit, dict)],
        "analysis_model": chosen_model_id,
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


def _has_accessory_access(user_settings: dict) -> bool:
    return bool(
        user_settings.get("is_premium")
        or user_settings.get("enable_accessory_analysis")
    )


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


def _item_signature(item: dict) -> tuple[str, str, str]:
    return (
        str(item.get("category", "")).strip().lower(),
        str(item.get("name", "")).strip().lower(),
        str(item.get("color", "")).strip().lower()
    )


def _crop_item_reference_image(
    source_image_bytes: bytes,
    bbox: dict
) -> tuple[bytes, str] | None:
    try:
        with Image.open(BytesIO(source_image_bytes)) as image:
            source = ImageOps.exif_transpose(image)
            width, height = source.size
            if width <= 0 or height <= 0:
                return None

            x = int(bbox.get("x", 0))
            y = int(bbox.get("y", 0))
            w = int(bbox.get("w", 0))
            h = int(bbox.get("h", 0))
            if w <= 0 or h <= 0:
                return None

            left = max(0, min(width - 1, int((x / 1000.0) * width)))
            top = max(0, min(height - 1, int((y / 1000.0) * height)))
            right = max(left + 1, min(width, int(((x + w) / 1000.0) * width)))
            bottom = max(top + 1, min(height, int(((y + h) / 1000.0) * height)))
            if right <= left or bottom <= top:
                return None

            crop = source.crop((left, top, right, bottom))
            if crop.mode not in {"RGB", "L"}:
                crop = crop.convert("RGB")
            output = BytesIO()
            crop.save(output, format="JPEG", quality=90, optimize=True)
            return output.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001
        return None


def _prepare_item_reference_crops(
    source_image_bytes: bytes | None,
    source_mime_type: str | None,
    items: list[dict],
    gemini_key: str
) -> dict[tuple[str, str, str], list[tuple[bytes, str]]]:
    if not source_image_bytes or not items:
        return {}

    try:
        detections = detect_item_bounding_boxes_with_gemini(
            source_image_bytes,
            source_mime_type or "image/jpeg",
            items,
            api_key=gemini_key
        )
    except Exception:  # noqa: BLE001
        return {}

    by_signature: dict[tuple[str, str, str], list[tuple[bytes, str]]] = {}
    for detection in detections:
        signature = _item_signature(detection)
        cropped = _crop_item_reference_image(source_image_bytes, detection.get("bbox") or {})
        if not cropped:
            continue
        by_signature.setdefault(signature, []).append(cropped)
    return by_signature


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
            "disabled": True
        }

    gemini_key = user_settings.get("gemini_api_key") or settings.GEMINI_API_KEY
    if not gemini_key:
        _mark_job_progress(
            job_id,
            stage="generating_item_images",
            message="Item image generation is disabled because no Gemini API key is configured."
        )
        return {
            "total_items": 0,
            "processed_items": 0,
            "generated_items": 0,
            "failed_items": 0,
            "skipped_items": 0,
            "disabled": True
        }

    items = list_items_for_analysis(user_id, analysis_id)
    crop_map_by_signature = _prepare_item_reference_crops(
        source_image_bytes,
        source_mime_type,
        items,
        gemini_key
    )
    total_items = len(items)
    summary = {
        "total_items": total_items,
        "processed_items": 0,
        "generated_items": 0,
        "failed_items": 0,
        "skipped_items": 0,
        "disabled": False
    }
    _mark_job_progress(
        job_id,
        stage="generating_item_images",
        message=f"Preparing item image generation for {total_items} item(s).",
        counts=summary
    )
    for item in items:
        item_index = summary["processed_items"] + 1
        current_item = {
            "index": item_index,
            "name": item.get("name"),
            "category": item.get("category"),
            "color": item.get("color")
        }
        _mark_job_progress(
            job_id,
            stage="generating_item_images",
            message=f"Generating item image {item_index} of {total_items}.",
            counts=summary,
            current_item=current_item
        )
        attributes = item.get("attributes_json") or {}
        if isinstance(attributes, dict) and attributes.get("generated_item_image_path"):
            summary["processed_items"] += 1
            summary["skipped_items"] += 1
            continue
        try:
            signature = _item_signature(item)
            signature_crops = crop_map_by_signature.get(signature) or []
            crop_reference = signature_crops.pop(0) if signature_crops else None
            reference_bytes = crop_reference[0] if crop_reference else source_image_bytes
            reference_mime = crop_reference[1] if crop_reference else source_mime_type
            image_data_uri = generate_item_image_with_gemini(
                {
                    "category": item.get("category"),
                    "name": item.get("name"),
                    "color": item.get("color")
                },
                api_key=gemini_key,
                reference_image_bytes=reference_bytes,
                reference_mime_type=reference_mime
            )
            if not image_data_uri:
                summary["processed_items"] += 1
                summary["failed_items"] += 1
                continue
            save_generated_item_image(user_id, item["id"], image_data_uri)
            summary["processed_items"] += 1
            summary["generated_items"] += 1
        except Exception:  # noqa: BLE001
            # Item image generation is best-effort and should not fail analysis completion.
            summary["processed_items"] += 1
            summary["failed_items"] += 1
            continue
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
            gemini_key = user_settings.get("gemini_api_key") or settings.GEMINI_API_KEY
            analysis = analyze_outfit_with_gemini(
                image_bytes,
                mime_type,
                model=chosen_model_id,
                api_key=gemini_key
            )
        elif model_entry["provider"] == "bedrock_agent":
            analysis = analyze_outfit_with_bedrock_agent(
                image_bytes=image_bytes,
                mime_type=mime_type,
                agent_id=user_settings.get("aws_bedrock_agent_id", ""),
                agent_alias_id=user_settings.get("aws_bedrock_agent_alias_id", ""),
                aws_region=user_settings.get("aws_region", "")
            )
        else:
            raise ValueError(f"Unsupported model provider: {model_entry['provider']}")

        # Accessories are premium-only and excluded for default tier users.
        if not _has_accessory_access(user_settings):
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
        _mark_job_progress(
            job_id,
            stage="finalizing",
            message="Finalizing analysis response.",
            counts=item_image_summary
        )
        response_payload = _build_response_payload(analysis_for_response, chosen_model_id, persistence)
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
