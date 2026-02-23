from __future__ import annotations

from app.config import settings


MODEL_CATALOG = [
    {
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "provider": "gemini",
        "supports_image": True
    }
]

OPTIONAL_MODEL_CATALOG = [
    {
        "id": "bedrock-agent",
        "label": "AWS Bedrock Agent",
        "provider": "bedrock_agent",
        "supports_image": True
    }
]


def get_model_catalog() -> list[dict]:
    models = [dict(model) for model in MODEL_CATALOG]
    if settings.ENABLE_BEDROCK_ANALYSIS:
        models.extend(dict(model) for model in OPTIONAL_MODEL_CATALOG)
    return models


def build_model_availability(model_settings: dict) -> list[dict]:
    gemini_key = (model_settings.get("gemini_api_key") or settings.GEMINI_API_KEY or "").strip()
    aws_region = (model_settings.get("aws_region") or "").strip()
    bedrock_agent_id = (model_settings.get("aws_bedrock_agent_id") or "").strip()
    bedrock_agent_alias_id = (model_settings.get("aws_bedrock_agent_alias_id") or "").strip()

    models = []
    for model in get_model_catalog():
        provider = model["provider"]
        available = True
        unavailable_reason = ""

        if not model.get("supports_image", False):
            available = False
            unavailable_reason = "This model does not support image analysis."
        elif provider == "gemini":
            if not gemini_key:
                available = False
                unavailable_reason = "Add a Gemini API key in Settings."
        elif provider == "bedrock_agent":
            if not aws_region:
                available = False
                unavailable_reason = "Add AWS region in Settings."
            elif not bedrock_agent_id or not bedrock_agent_alias_id:
                available = False
                unavailable_reason = "Add Bedrock Agent ID and Alias ID in Settings."

        models.append({**model, "available": available, "unavailable_reason": unavailable_reason})
    return models


def get_preferred_model(model_settings: dict) -> str:
    preferred = (model_settings.get("preferred_model") or "").strip()
    catalog_ids = {model["id"] for model in get_model_catalog()}
    if preferred and preferred in catalog_ids:
        return preferred
    default_model = settings.DEFAULT_ANALYSIS_MODEL
    if default_model in catalog_ids:
        return default_model
    return next(iter(catalog_ids), "gemini-2.5-flash")
