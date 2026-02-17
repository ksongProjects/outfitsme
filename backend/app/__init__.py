from flask import Flask
from flask_cors import CORS

from app.routes.api import api_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/health")
    def health_check():
        return {"status": "ok"}, 200

    return app
