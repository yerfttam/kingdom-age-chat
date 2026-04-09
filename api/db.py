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
    """Create all tables if they don't exist."""
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

            cur.execute("""
                CREATE TABLE IF NOT EXISTS wiki_pages (
                    id             SERIAL PRIMARY KEY,
                    slug           TEXT UNIQUE NOT NULL,
                    title          TEXT NOT NULL,
                    category       TEXT NOT NULL,
                    body           TEXT NOT NULL,
                    sources        JSONB DEFAULT '[]',
                    tags           TEXT[] DEFAULT '{}',
                    search_vector  TSVECTOR,
                    created_at     TIMESTAMPTZ DEFAULT NOW(),
                    updated_at     TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS wiki_pages_search_idx
                    ON wiki_pages USING GIN(search_vector)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS wiki_pages_category_idx
                    ON wiki_pages (category)
            """)

            cur.execute("""
                CREATE OR REPLACE FUNCTION wiki_pages_search_vector_update()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.search_vector := to_tsvector('english', NEW.title || ' ' || NEW.body);
                    NEW.updated_at := NOW();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """)

            cur.execute("""
                DROP TRIGGER IF EXISTS wiki_pages_search_vector_trigger ON wiki_pages
            """)

            cur.execute("""
                CREATE TRIGGER wiki_pages_search_vector_trigger
                BEFORE INSERT OR UPDATE ON wiki_pages
                FOR EACH ROW EXECUTE FUNCTION wiki_pages_search_vector_update()
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS wiki_ingest_log (
                    id           SERIAL PRIMARY KEY,
                    source_id    TEXT UNIQUE NOT NULL,
                    source_type  TEXT NOT NULL,
                    ingested_at  TIMESTAMPTZ DEFAULT NOW(),
                    page_slugs   TEXT[] DEFAULT '{}'
                )
            """)

        logger.info("DB ready — all tables OK")
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
