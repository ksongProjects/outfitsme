"""Better Auth backend session validation for Flask API."""
import base64
from datetime import datetime, timezone
import json
import time
from urllib.parse import urlparse, urlunparse

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import requests
from supabase import Client, create_client
from app.config import settings


class BetterAuthSessionError(RuntimeError):
    pass


_JWKS_CACHE: dict[str, object] = {"keys": {}, "expires_at": 0.0}
_SUPABASE_CLIENT: Client | None = None


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _normalized_auth_origin(raw_url: str) -> str:
    parsed = urlparse((raw_url or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalized_jwks_url(raw_url: str) -> str:
    parsed = urlparse((raw_url or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""

    path = (parsed.path or "").rstrip("/")
    if not path:
        path = "/api/auth/jwks"

    return urlunparse((parsed.scheme, parsed.netloc, path, "", parsed.query, ""))


def _get_jwks_url() -> str:
    jwks_url = _normalized_jwks_url(settings.BETTER_AUTH_JWKS_URL)
    if not jwks_url:
        raise BetterAuthSessionError(
            "BETTER_AUTH_JWKS_URL or BETTER_AUTH_URL must be configured for Better Auth JWT validation."
        )
    return jwks_url


def _get_cached_jwks() -> dict[str, dict]:
    now = time.time()
    if _JWKS_CACHE["keys"] and now < float(_JWKS_CACHE["expires_at"]):
        return _JWKS_CACHE["keys"]  # type: ignore[return-value]

    response = requests.get(_get_jwks_url(), timeout=5)
    response.raise_for_status()
    payload = response.json()
    keys = {
        str(key.get("kid")): key
        for key in payload.get("keys", [])
        if isinstance(key, dict) and key.get("kid")
    }
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + 300
    return keys


def _get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise BetterAuthSessionError("SUPABASE_URL and SUPABASE_SECRET_KEY must be configured.")

    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is None:
        _SUPABASE_CLIENT = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
    return _SUPABASE_CLIENT


def _response_rows(response) -> list[dict]:
    data = getattr(response, "data", None) if response is not None else None
    if isinstance(data, list):
        return [dict(row) for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [dict(data)]
    return []


def get_user_id_from_better_auth_jwt(token: str) -> str | None:
    if not token:
        return None

    parts = token.split(".")
    if len(parts) != 3:
        return None

    try:
        header = json.loads(_base64url_decode(parts[0]).decode("utf-8"))
        payload = json.loads(_base64url_decode(parts[1]).decode("utf-8"))
        signature = _base64url_decode(parts[2])
    except (ValueError, json.JSONDecodeError):
        return None

    kid = str(header.get("kid") or "").strip()
    alg = str(header.get("alg") or "").strip()
    if not kid or alg != "EdDSA":
        return None

    key = _get_cached_jwks().get(kid)
    if not key:
        return None

    if key.get("kty") != "OKP" or key.get("crv") != "Ed25519":
        return None

    x = str(key.get("x") or "").strip()
    if not x:
        return None

    try:
        expected_issuer = _normalized_auth_origin(settings.BETTER_AUTH_JWT_ISSUER)
        expected_audience = _normalized_auth_origin(settings.BETTER_AUTH_JWT_AUDIENCE)
        public_key = Ed25519PublicKey.from_public_bytes(_base64url_decode(x))
        public_key.verify(signature, f"{parts[0]}.{parts[1]}".encode("utf-8"))
        now = int(time.time())
        exp = payload.get("exp")
        nbf = payload.get("nbf")
        iss = str(payload.get("iss") or "").strip()
        aud = payload.get("aud")
        sub = str(payload.get("sub") or "").strip()

        if isinstance(exp, (int, float)) and now >= int(exp):
            return None
        if isinstance(nbf, (int, float)) and now < int(nbf):
            return None
        if expected_issuer and iss != expected_issuer:
            return None
        if expected_audience:
            audiences = aud if isinstance(aud, list) else [aud]
            if expected_audience not in {str(value).strip() for value in audiences if value is not None}:
                return None

        return sub or None
    except Exception:
        return None


def get_user_id_from_session_token(session_token: str) -> str | None:
    """
    Validate a Better Auth session token and return the user ID.
    
    Args:
        session_token: The session token from Better Auth
        
    Returns:
        The user ID if the session is valid, None otherwise
    """
    if not session_token:
        return None
    
    try:
        rows = _response_rows(
            _get_supabase_client()
            .table("sessions")
            .select("user_id")
            .eq("token", session_token)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        return str(rows[0].get("user_id")) if rows and rows[0].get("user_id") else None
    except Exception:
        return None

def get_user_created_at_from_better_auth_token(token: str) -> str | None:
    """Return the Better Auth user created_at timestamp for a JWT or session token."""
    if not token:
        return None

    user_id = get_user_id_from_better_auth_jwt(token)
    if not user_id:
        user_id = get_user_id_from_session_token(token)
    if not user_id:
        return None

    try:
        rows = _response_rows(
            _get_supabase_client()
            .table("users")
            .select("created_at")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        created_at = rows[0].get("created_at") if rows else None
        if isinstance(created_at, datetime):
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            return created_at.astimezone(timezone.utc).isoformat()
        return str(created_at) if created_at else None
    except Exception:
        return None
