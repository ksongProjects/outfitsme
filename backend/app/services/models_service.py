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

def get_model_catalog() -> list[dict]:
    return [dict(model) for model in MODEL_CATALOG]


def build_model_availability(model_settings: dict) -> list[dict]:
    models = []
    for model in get_model_catalog():
        provider = model["provider"]
        available = True
        unavailable_reason = ""

        if not model.get("supports_image", False):
            available = False
            unavailable_reason = "This model does not support image analysis."
        elif provider == "gemini":
            if not settings.GEMINI_API_KEY:
                available = False
                unavailable_reason = "Gemini image analysis is temporarily unavailable."

        models.append({**model, "available": available, "unavailable_reason": unavailable_reason})
    return models


def get_preferred_model(model_settings: dict) -> str:
    catalog_ids = {model["id"] for model in get_model_catalog()}
    default_model = settings.DEFAULT_ANALYSIS_MODEL
    if default_model in catalog_ids:
        return default_model
    return next(iter(catalog_ids), "gemini-2.5-flash")
