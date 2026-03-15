"""Better Auth backend session validation for Flask API."""
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import time
from urllib.parse import urlparse

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import psycopg2
from psycopg2 import sql
from psycopg2.pool import SimpleConnectionPool
import requests
from app.config import settings


class BetterAuthSessionError(RuntimeError):
    pass


_JWKS_CACHE: dict[str, object] = {"keys": {}, "expires_at": 0.0}
_DB_POOL: SimpleConnectionPool | None = None


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _normalized_auth_origin(raw_url: str) -> str:
    parsed = urlparse((raw_url or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _get_jwks_url() -> str:
    base_url = _normalized_auth_origin(settings.BETTER_AUTH_URL)
    if not base_url:
        raise BetterAuthSessionError("BETTER_AUTH_URL or APP_URL must be configured for Better Auth JWT validation.")
    return f"{base_url}/api/auth/jwks"


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


def _get_database_pool() -> SimpleConnectionPool:
    if not settings.DATABASE_URL:
        raise BetterAuthSessionError("DATABASE_URL environment variable is required.")
    global _DB_POOL
    if _DB_POOL is None:
        try:
            _DB_POOL = SimpleConnectionPool(1, 5, settings.DATABASE_URL)
        except psycopg2.Error as e:
            raise BetterAuthSessionError(f"Failed to connect to database: {e}")
    return _DB_POOL


@contextmanager
def get_database_connection():
    """Borrow a PostgreSQL connection from a small shared pool."""
    pool = _get_database_pool()
    conn = None
    try:
        conn = pool.getconn()
        yield conn
    finally:
        if conn is not None:
            try:
                conn.rollback()
            except psycopg2.Error:
                pass
            pool.putconn(conn)


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
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                # Better Auth is configured with plural table names in this repo.
                cur.execute(
                    sql.SQL("""
                        SELECT user_id FROM "sessions"
                        WHERE token = %s AND expires_at > %s
                        LIMIT 1
                    """),
                    (session_token, datetime.now(timezone.utc))
                )
                result = cur.fetchone()

        return result[0] if result else None
    except psycopg2.Error:
        return None
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
        with get_database_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("""
                        SELECT created_at FROM "users"
                        WHERE id = %s
                        LIMIT 1
                    """),
                    (user_id,)
                )
                result = cur.fetchone()

        created_at = result[0] if result else None
        if isinstance(created_at, datetime):
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            return created_at.astimezone(timezone.utc).isoformat()
        return str(created_at) if created_at else None
    except psycopg2.Error:
        return None
    except Exception:
        return None
