from __future__ import annotations

from app.config import settings


MODEL_CATALOG = [
    {
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "provider": "gemini",
        "supports_image": True
    },
    {
        "id": "bedrock-agent",
        "label": "AWS Bedrock Agent",
        "provider": "bedrock_agent",
        "supports_image": True
    }
]


def get_model_catalog() -> list[dict]:
    return [dict(model) for model in MODEL_CATALOG]


def build_model_availability(model_settings: dict) -> list[dict]:
    gemini_key = (model_settings.get("gemini_api_key") or settings.GEMINI_API_KEY or "").strip()
    aws_access = (model_settings.get("aws_access_key_id") or "").strip()
    aws_secret = (model_settings.get("aws_secret_access_key") or "").strip()
    aws_region = (model_settings.get("aws_region") or "").strip()
    bedrock_agent_id = (model_settings.get("aws_bedrock_agent_id") or "").strip()
    bedrock_agent_alias_id = (model_settings.get("aws_bedrock_agent_alias_id") or "").strip()

    models = []
    for model in MODEL_CATALOG:
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
            if not aws_access or not aws_secret or not aws_region:
                available = False
                unavailable_reason = "Add AWS Bedrock credentials (access key, secret key, region) in Settings."
            elif not bedrock_agent_id or not bedrock_agent_alias_id:
                available = False
                unavailable_reason = "Add Bedrock Agent ID and Alias ID in Settings."

        models.append({**model, "available": available, "unavailable_reason": unavailable_reason})
    return models


def get_preferred_model(model_settings: dict) -> str:
    preferred = (model_settings.get("preferred_model") or "").strip()
    if preferred:
        return preferred
    return settings.DEFAULT_ANALYSIS_MODEL
