from __future__ import annotations

import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from app import create_app
import app.routes.api as api_module


@pytest.fixture()
def app(monkeypatch):
    monkeypatch.setattr(api_module, "get_user_id_from_token", lambda token: "user-test-123")
    monkeypatch.setattr(api_module.settings, "GEMINI_API_KEY", "test-gemini-key", raising=False)
    monkeypatch.setattr(api_module.settings, "GEMINI_MODEL", "gemini-2.5-flash", raising=False)
    monkeypatch.setattr(api_module.settings, "GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image", raising=False)

    flask_app = create_app()
    flask_app.config.update(TESTING=True, RATELIMIT_ENABLED=False)
    return flask_app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers():
    return {"Authorization": "Bearer test-token"}
