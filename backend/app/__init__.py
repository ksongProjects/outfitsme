from flask import Flask, current_app
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

from app.config import settings
from app.extensions import limiter
from app.routes.api import api_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = settings.UPLOAD_MAX_BYTES
    app.config["RATELIMIT_STORAGE_URI"] = settings.RATE_LIMIT_STORAGE_URI
    app.config["RATELIMIT_HEADERS_ENABLED"] = True

    if settings.IS_PRODUCTION and not settings.CORS_ALLOWED_ORIGINS:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must be configured in production.")

    CORS(app, resources={r"/api/*": {"origins": settings.CORS_ALLOWED_ORIGINS}})

    limiter.init_app(app)

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/health")
    def health_check():
        return {"status": "ok"}, 200

    @app.errorhandler(429)
    def rate_limit_exceeded(_exc):
        return {"error": "Rate limit exceeded. Please wait and try again."}, 429

    @app.errorhandler(RequestEntityTooLarge)
    def request_entity_too_large(_exc):
        limit_bytes = int(current_app.config.get("MAX_CONTENT_LENGTH") or 0)
        return {"error": f"Image upload is too large. Keep uploads under {_format_byte_limit(limit_bytes)}."}, 413

    return app


def _format_byte_limit(limit_bytes: int) -> str:
    if limit_bytes >= 1024 * 1024:
        size = limit_bytes / float(1024 * 1024)
        unit = "MB"
    elif limit_bytes >= 1024:
        size = limit_bytes / float(1024)
        unit = "KB"
    else:
        size = float(limit_bytes)
        unit = "bytes"

    rendered = f"{size:.1f}".rstrip("0").rstrip(".")
    return f"{rendered} {unit}"
