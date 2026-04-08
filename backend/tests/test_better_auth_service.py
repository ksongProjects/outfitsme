from __future__ import annotations

import app.services.better_auth_service as better_auth_module


def test_get_jwks_url_defaults_to_public_auth_origin(monkeypatch):
    monkeypatch.setattr(
        better_auth_module.settings,
        "BETTER_AUTH_JWKS_URL",
        "https://outfitsme.com",
        raising=False,
    )

    assert better_auth_module._get_jwks_url() == "https://outfitsme.com/api/auth/jwks"


def test_get_jwks_url_preserves_explicit_path(monkeypatch):
    monkeypatch.setattr(
        better_auth_module.settings,
        "BETTER_AUTH_JWKS_URL",
        "http://frontend:3000/api/auth/jwks",
        raising=False,
    )

    assert better_auth_module._get_jwks_url() == "http://frontend:3000/api/auth/jwks"
