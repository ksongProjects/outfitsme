from flask import Flask
from flask_cors import CORS

from app.config import settings
from app.extensions import limiter
from app.routes.api import api_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
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

    return app
