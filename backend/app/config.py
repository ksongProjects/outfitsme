import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=True)


def _clean_env(value: str, default: str = "") -> str:
    cleaned = (value or default).strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


class Settings:
    SUPABASE_URL = _clean_env(os.getenv("SUPABASE_URL", ""))
    SUPABASE_SECRET_KEY = _clean_env(os.getenv("SUPABASE_SECRET_KEY", ""))
    SUPABASE_BUCKET = _clean_env(os.getenv("SUPABASE_BUCKET", "outfit-images"), "outfit-images")
    GEMINI_API_KEY = _clean_env(os.getenv("GEMINI_API_KEY", ""))
    GEMINI_MODEL = _clean_env(os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), "gemini-2.5-flash")


settings = Settings()
