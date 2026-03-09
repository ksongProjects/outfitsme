"""Better Auth backend session validation for Flask API."""
from datetime import datetime, timezone
import psycopg2
from psycopg2 import sql
from app.config import settings


class BetterAuthSessionError(RuntimeError):
    pass


def get_database_connection():
    """Create a direct PostgreSQL connection to Supabase."""
    if not settings.DATABASE_URL:
        raise BetterAuthSessionError("DATABASE_URL environment variable is required.")
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        return conn
    except psycopg2.Error as e:
        raise BetterAuthSessionError(f"Failed to connect to database: {e}")


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
        conn = get_database_connection()
        cur = conn.cursor()
        
        # Query the session table for a valid session
        cur.execute(
            sql.SQL("""
                SELECT user_id FROM "session" 
                WHERE token = %s AND expires_at > %s
                LIMIT 1
            """),
            (session_token, datetime.now(timezone.utc).isoformat())
        )
        
        result = cur.fetchone()
        cur.close()
        conn.close()
        
        return result[0] if result else None
    except psycopg2.Error as e:
        # If we can't query the database, return None (invalid session)
        return None
    except Exception:
        return None
