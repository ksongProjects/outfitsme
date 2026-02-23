from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import requests

from app.config import settings
from app.services.bedrock_service import analyze_outfit_with_bedrock_agent
from app.services.gemini_service import analyze_outfit_with_gemini
from app.services.models_service import build_model_availability
from app.services.supabase_service import (
    claim_analysis_job,
    download_photo_bytes,
    get_analysis_job_by_id,
    get_user_model_settings,
    mark_analysis_job_completed,
    mark_analysis_job_failed,
    persist_analysis_for_photo,
)

_JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="analysis-job")


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


def process_analysis_job(job_id: str) -> None:
    claimed = claim_analysis_job(job_id)
    if not claimed:
        return

    try:
        user_id = claimed["user_id"]
        chosen_model_id = claimed.get("analysis_model") or settings.DEFAULT_ANALYSIS_MODEL
        mime_type = claimed.get("mime_type") or "image/jpeg"
        storage_path = claimed.get("storage_path") or ""
        if not storage_path:
            raise ValueError("Job is missing storage path.")

        image_bytes = download_photo_bytes(storage_path)
        if not image_bytes:
            raise ValueError("Stored image could not be loaded.")

        user_settings = get_user_model_settings(user_id)
        available_models = build_model_availability(user_settings)
        model_entry = next((model for model in available_models if model["id"] == chosen_model_id), None)
        if not model_entry:
            raise ValueError(f"Unknown analysis model: {chosen_model_id}")
        if not model_entry.get("available"):
            reason = model_entry.get("unavailable_reason") or "Selected model is unavailable."
            raise ValueError(reason)

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

        analysis_for_persistence = _build_persistence_payload(analysis)
        persistence = persist_analysis_for_photo(user_id, claimed["photo_id"], analysis_for_persistence)
        response_payload = _build_response_payload(analysis, chosen_model_id, persistence)
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
