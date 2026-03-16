"""
Database connection and query logging.
"""
import os
import time
import logging
import threading

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_conn = None


def get_conn():
    global _conn
    with _lock:
        try:
            if _conn is None or _conn.closed:
                import psycopg2
                _conn = psycopg2.connect(os.environ["DATABASE_URL"])
                _conn.autocommit = True
        except Exception as e:
            logger.error(f"DB connection failed: {e}")
            _conn = None
    return _conn


def init_db():
    """Create the queries table if it doesn't exist."""
    conn = get_conn()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS queries (
                    id            SERIAL PRIMARY KEY,
                    created_at    TIMESTAMPTZ DEFAULT NOW(),
                    question      TEXT NOT NULL,
                    model         TEXT,
                    response_ms   INTEGER,
                    num_sources   INTEGER,
                    session_id    TEXT
                )
            """)
        logger.info("DB ready — queries table OK")
    except Exception as e:
        logger.error(f"DB init failed: {e}")


def log_query(question: str, model: str, response_ms: int, num_sources: int, session_id: str = None):
    """Insert a query record. Fire-and-forget — never raises."""
    try:
        conn = get_conn()
        if not conn:
            return
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO queries (question, model, response_ms, num_sources, session_id) VALUES (%s, %s, %s, %s, %s)",
                (question, model, response_ms, num_sources, session_id)
            )
    except Exception as e:
        logger.error(f"Failed to log query: {e}")
