import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "")
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "outfit-images")


settings = Settings()
