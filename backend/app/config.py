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
    DIAGNOSTICS_ENABLED = _to_bool(
        os.getenv("DIAGNOSTICS_ENABLED", ""),
        default=(FLASK_ENV != "production")
    )
    CORS_ALLOWED_ORIGINS = _split_csv(_clean_env(os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")))
    RATE_LIMIT_STORAGE_URI = _clean_env(os.getenv("RATE_LIMIT_STORAGE_URI", "memory://"), "memory://")
    MONTHLY_ANALYSIS_LIMIT = int(_clean_env(os.getenv("MONTHLY_ANALYSIS_LIMIT", "100"), "100") or "100")
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
    ITEM_IMAGE_MAX = int(_clean_env(os.getenv("ITEM_IMAGE_MAX", "3"), "3") or "3")
    SETTINGS_ENCRYPTION_KEY = _clean_env(os.getenv("SETTINGS_ENCRYPTION_KEY", ""))
    DEFAULT_ANALYSIS_MODEL = _clean_env(os.getenv("DEFAULT_ANALYSIS_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash")


settings = Settings()
