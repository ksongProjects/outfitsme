import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=False)


def _clean_env(value: str, default: str = "") -> str:
    cleaned = (value or default).strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _to_bool(value: str, default: bool = False) -> bool:
    cleaned = _clean_env(value, "").lower()
    if not cleaned:
        return default
    return cleaned in {"1", "true", "yes", "on"}


def _split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    FLASK_ENV = _clean_env(os.getenv("FLASK_ENV", "development"), "development").lower()
    IS_PRODUCTION = FLASK_ENV == "production"
    PORT = int(_clean_env(os.getenv("PORT", "5000"), "5000") or "5000")
    DEBUG = _to_bool(os.getenv("DEBUG", ""), default=(FLASK_ENV != "production"))
    CORS_ALLOWED_ORIGINS = _split_csv(_clean_env(os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")))
    RATE_LIMIT_STORAGE_URI = _clean_env(os.getenv("RATE_LIMIT_STORAGE_URI", "memory://"), "memory://")
    # Legacy single-tier limit; kept for backwards compatibility.
    MONTHLY_ANALYSIS_LIMIT = int(_clean_env(os.getenv("MONTHLY_ANALYSIS_LIMIT", "100"), "100") or "100")
    # Per-tier limits. Free users default to 5 analyses/month; premium users
    # default to the legacy MONTHLY_ANALYSIS_LIMIT value (100 unless overridden).
    MONTHLY_ANALYSIS_LIMIT_FREE = int(
        _clean_env(os.getenv("MONTHLY_ANALYSIS_LIMIT_FREE", "5"), "5") or "5"
    )
    MONTHLY_ANALYSIS_LIMIT_PREMIUM = int(
        _clean_env(
            os.getenv(
                "MONTHLY_ANALYSIS_LIMIT_PREMIUM",
                os.getenv("MONTHLY_ANALYSIS_LIMIT", "100")
            ),
            "100"
        )
        or "100"
    )
    ENABLE_BEDROCK_ANALYSIS = _to_bool(os.getenv("ENABLE_BEDROCK_ANALYSIS", "false"), default=False)
    SUPABASE_URL = _clean_env(os.getenv("SUPABASE_URL", ""))
    SUPABASE_SECRET_KEY = _clean_env(os.getenv("SUPABASE_SECRET_KEY", ""))
    SUPABASE_BUCKET = _clean_env(os.getenv("SUPABASE_BUCKET", "outfit-images"), "outfit-images")
    GEMINI_API_KEY = _clean_env(os.getenv("GEMINI_API_KEY", ""))
    GEMINI_MODEL = _clean_env(os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash")
    GEMINI_IMAGE_MODEL = _clean_env(
        os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
        "gemini-2.5-flash-image"
    )
    GEMINI_ANALYSIS_IMAGE_MAX_SIDE = int(
        _clean_env(os.getenv("GEMINI_ANALYSIS_IMAGE_MAX_SIDE", "768"), "768") or "768"
    )
    GEMINI_REFERENCE_IMAGE_MAX_SIDE = int(
        _clean_env(os.getenv("GEMINI_REFERENCE_IMAGE_MAX_SIDE", "768"), "768") or "768"
    )
    GEMINI_SOURCE_IMAGE_MAX_SIDE = int(
        _clean_env(os.getenv("GEMINI_SOURCE_IMAGE_MAX_SIDE", "384"), "384") or "384"
    )
    ITEM_IMAGE_MAX = int(_clean_env(os.getenv("ITEM_IMAGE_MAX", "3"), "3") or "3")
    ITEM_IMAGE_MAX_SIDE = int(_clean_env(os.getenv("ITEM_IMAGE_MAX_SIDE", "250"), "250") or "250")
    MONTHLY_CUSTOM_OUTFIT_LIMIT = int(_clean_env(os.getenv("MONTHLY_CUSTOM_OUTFIT_LIMIT", "5"), "5") or "5")
    TRIAL_DAYS = int(_clean_env(os.getenv("TRIAL_DAYS", "14"), "14") or "14")
    TRIAL_DAILY_AI_ACTION_LIMIT = int(_clean_env(os.getenv("TRIAL_DAILY_AI_ACTION_LIMIT", "5"), "5") or "5")
    ANALYSIS_COST_USD = float(_clean_env(os.getenv("ANALYSIS_COST_USD", "0.02"), "0.02") or "0.02")
    OUTFIT_IMAGE_COST_USD = float(_clean_env(os.getenv("OUTFIT_IMAGE_COST_USD", "0.05"), "0.05") or "0.05")
    ITEM_IMAGE_COST_USD = float(_clean_env(os.getenv("ITEM_IMAGE_COST_USD", "0.01"), "0.01") or "0.01")
    SETTINGS_ENCRYPTION_KEY = _clean_env(os.getenv("SETTINGS_ENCRYPTION_KEY", ""))
    DEFAULT_ANALYSIS_MODEL = _clean_env(os.getenv("DEFAULT_ANALYSIS_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash")


settings = Settings()
