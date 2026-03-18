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
    LOG_GEMINI_PROMPTS = _to_bool(os.getenv("LOG_GEMINI_PROMPTS", ""), default=DEBUG)
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
        _clean_env(os.getenv("GEMINI_ANALYSIS_IMAGE_MAX_SIDE", "1024"), "1024") or "1024"
    )
    GEMINI_REFERENCE_IMAGE_MAX_SIDE = int(
        _clean_env(os.getenv("GEMINI_REFERENCE_IMAGE_MAX_SIDE", "1024"), "1024") or "1024"
    )
    GEMINI_SOURCE_IMAGE_MAX_SIDE = int(
        _clean_env(os.getenv("GEMINI_SOURCE_IMAGE_MAX_SIDE", "1024"), "1024") or "1024"
    )
    ITEM_IMAGE_RESIZE_THRESHOLD = int(_clean_env(os.getenv("ITEM_IMAGE_RESIZE_THRESHOLD", "500"), "500") or "500")
    ITEM_IMAGE_MAX_SIDE = int(_clean_env(os.getenv("ITEM_IMAGE_MAX_SIDE", "350"), "350") or "350")
    MONTHLY_CUSTOM_OUTFIT_LIMIT = int(_clean_env(os.getenv("MONTHLY_CUSTOM_OUTFIT_LIMIT", "5"), "5") or "5")
    TRIAL_DAYS = int(_clean_env(os.getenv("TRIAL_DAYS", "14"), "14") or "14")
    TRIAL_DAILY_AI_ACTION_LIMIT = int(_clean_env(os.getenv("TRIAL_DAILY_AI_ACTION_LIMIT", "10"), "10") or "10")
    ANALYSIS_INPUT_COST_USD = float(
        _clean_env(
            os.getenv("ANALYSIS_INPUT_COST_USD", os.getenv("ANALYSIS_COST_USD", "0.02")),
            "0.02"
        )
        or "0.02"
    )
    ANALYSIS_OUTPUT_IMAGE_COST_USD = float(
        _clean_env(os.getenv("ANALYSIS_OUTPUT_IMAGE_COST_USD", "0.00"), "0.00") or "0.00"
    )
    OUTFIT_IMAGE_INPUT_COST_USD = float(
        _clean_env(
            os.getenv("OUTFIT_IMAGE_INPUT_COST_USD", os.getenv("OUTFIT_IMAGE_COST_USD", "0.05")),
            "0.05"
        )
        or "0.05"
    )
    OUTFIT_IMAGE_OUTPUT_COST_USD = float(
        _clean_env(os.getenv("OUTFIT_IMAGE_OUTPUT_COST_USD", "0.00"), "0.00") or "0.00"
    )
    ITEM_IMAGE_COST_USD = float(_clean_env(os.getenv("ITEM_IMAGE_COST_USD", "0.01"), "0.01") or "0.01")
    GEMINI_INPUT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(os.getenv("GEMINI_INPUT_COST_PER_1M_TOKENS_USD", "0"), "0") or "0"
    )
    GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(os.getenv("GEMINI_OUTPUT_COST_PER_1M_TOKENS_USD", "0"), "0") or "0"
    )
    GEMINI_25_FLASH_INPUT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(os.getenv("GEMINI_25_FLASH_INPUT_COST_PER_1M_TOKENS_USD", "0.30"), "0.30") or "0.30"
    )
    GEMINI_25_FLASH_OUTPUT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(os.getenv("GEMINI_25_FLASH_OUTPUT_COST_PER_1M_TOKENS_USD", "2.50"), "2.50") or "2.50"
    )
    GEMINI_25_FLASH_IMAGE_INPUT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(os.getenv("GEMINI_25_FLASH_IMAGE_INPUT_COST_PER_1M_TOKENS_USD", "0.30"), "0.30") or "0.30"
    )
    GEMINI_25_FLASH_IMAGE_OUTPUT_TEXT_COST_PER_1M_TOKENS_USD = float(
        _clean_env(
            os.getenv("GEMINI_25_FLASH_IMAGE_OUTPUT_TEXT_COST_PER_1M_TOKENS_USD", "2.50"),
            "2.50"
        )
        or "2.50"
    )
    GEMINI_25_FLASH_IMAGE_OUTPUT_IMAGE_COST_PER_1M_TOKENS_USD = float(
        _clean_env(
            os.getenv("GEMINI_25_FLASH_IMAGE_OUTPUT_IMAGE_COST_PER_1M_TOKENS_USD", "30.0"),
            "30.0"
        )
        or "30.0"
    )
    GEMINI_25_FLASH_IMAGE_OUTPUT_COST_PER_IMAGE_USD = float(
        _clean_env(os.getenv("GEMINI_25_FLASH_IMAGE_OUTPUT_COST_PER_IMAGE_USD", "0.039"), "0.039") or "0.039"
    )
    GEMINI_25_FLASH_IMAGE_OUTPUT_TOKENS_PER_IMAGE = int(
        _clean_env(os.getenv("GEMINI_25_FLASH_IMAGE_OUTPUT_TOKENS_PER_IMAGE", "1290"), "1290") or "1290"
    )
    GEMINI_TOKEN_ESTIMATOR_CHARS_PER_TOKEN = float(
        _clean_env(os.getenv("GEMINI_TOKEN_ESTIMATOR_CHARS_PER_TOKEN", "4"), "4") or "4"
    )
    GEMINI_TOKEN_ESTIMATOR_IMAGE_TILE_SIZE = int(
        _clean_env(os.getenv("GEMINI_TOKEN_ESTIMATOR_IMAGE_TILE_SIZE", "768"), "768") or "768"
    )
    GEMINI_TOKEN_ESTIMATOR_IMAGE_TOKENS_PER_TILE = int(
        _clean_env(os.getenv("GEMINI_TOKEN_ESTIMATOR_IMAGE_TOKENS_PER_TILE", "258"), "258") or "258"
    )
    SETTINGS_ENCRYPTION_KEY = _clean_env(os.getenv("SETTINGS_ENCRYPTION_KEY", ""))
    DEFAULT_ANALYSIS_MODEL = _clean_env(os.getenv("DEFAULT_ANALYSIS_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash")
    DATABASE_URL = _clean_env(os.getenv("DATABASE_URL", ""))
    APP_URL = _clean_env(os.getenv("APP_URL", ""))
    BETTER_AUTH_URL = _clean_env(
        os.getenv("BETTER_AUTH_URL", os.getenv("APP_URL", os.getenv("NEXT_PUBLIC_APP_URL", "")))
    )
    BETTER_AUTH_JWT_ISSUER = _clean_env(os.getenv("BETTER_AUTH_JWT_ISSUER", BETTER_AUTH_URL))
    BETTER_AUTH_JWT_AUDIENCE = _clean_env(os.getenv("BETTER_AUTH_JWT_AUDIENCE", BETTER_AUTH_URL))


settings = Settings()


