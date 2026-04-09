"""
FastAPI backend — exposes a /chat endpoint and serves the frontend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import logging
import os
import sys
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))
from rag import chat, stream_chat
from db import init_db, log_query


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"PORT env var = {os.environ.get('PORT', 'NOT SET')}")

    for key in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PINECONE_API_KEY"]:
        val = os.environ.get(key, "")
        if val:
            logger.info(f"OK {key} loaded ({val[:6]}...)")
        else:
            logger.error(f"MISSING {key} is not set")

    try:
        from rag import index
        stats = index().describe_index_stats()
        logger.info(f"OK Pinecone connected — {stats.total_vector_count} vectors indexed")
    except Exception as e:
        logger.error(f"FAIL Pinecone connection failed: {e}")

    init_db()
    yield


app = FastAPI(title="Kingdom Age Chat", lifespan=lifespan)

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "gpt-4o-mini",
    "gpt-4o",
}

class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    model: str = "claude-opus-4-6"
    history: List[HistoryMessage] = []
    session_id: Optional[str] = None
    mode: str = "pinecone"  # "pinecone" (default) or "wiki"


class Source(BaseModel):
    title: str
    url: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if req.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model}")
    history = [{"role": m.role, "content": m.content} for m in req.history]
    result = chat(req.question, model=req.model, history=history, mode=req.mode)
    return result


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if req.model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model}")
    history = [{"role": m.role, "content": m.content} for m in req.history]
    session_id = req.session_id if hasattr(req, 'session_id') else None

    def logged_stream():
        import json as _json
        start = time.time()
        num_sources = 0
        for chunk in stream_chat(req.question, model=req.model, history=history, mode=req.mode):
            if '"type":"sources"' in chunk:
                try:
                    if chunk.startswith("data: "):
                        parsed = _json.loads(chunk[6:])
                        num_sources = len(parsed.get("sources", []))
                except Exception:
                    pass
            yield chunk
        response_ms = int((time.time() - start) * 1000)
        log_query(req.question, req.model, response_ms, num_sources, session_id)

    return StreamingResponse(
        logged_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/report")
async def report_page():
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


@app.get("/report/data")
async def report_data():
    from db import get_conn
    conn = get_conn()
    rows = []
    total = 0
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM queries")
                total = cur.fetchone()[0]
                cur.execute("""
                    SELECT created_at, question, model, response_ms, session_id
                    FROM queries
                    ORDER BY created_at DESC
                    LIMIT 200
                """)
                raw = cur.fetchall()
                rows = [
                    {
                        "created_at": r[0].strftime("%Y-%m-%d %H:%M:%S") if r[0] else "",
                        "question": r[1] or "",
                        "model": r[2] or "",
                        "response_ms": r[3],
                        "session_id": r[4] or "",
                    }
                    for r in raw
                ]
        except Exception as e:
            logger.error(f"Report query failed: {e}")
    return {"rows": rows, "total": total}


# ---------------------------------------------------------------------------
# Wiki endpoints
# ---------------------------------------------------------------------------

@app.get("/api/wiki")
async def wiki_index(category: Optional[str] = None):
    """Return all wiki pages grouped by category, optionally filtered."""
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            if category:
                cur.execute("""
                    SELECT slug, title, category, tags, updated_at
                    FROM wiki_pages
                    WHERE category = %s
                    ORDER BY title
                """, (category,))
            else:
                cur.execute("""
                    SELECT slug, title, category, tags, updated_at
                    FROM wiki_pages
                    ORDER BY category, title
                """)
            rows = cur.fetchall()
    except Exception as e:
        logger.error(f"Wiki index query failed: {e}")
        raise HTTPException(status_code=500, detail="Query failed")

    pages = [
        {
            "slug":       r[0],
            "title":      r[1],
            "category":   r[2],
            "tags":       r[3] or [],
            "updated_at": r[4].isoformat() if r[4] else None,
        }
        for r in rows
    ]

    grouped = {}
    for p in pages:
        grouped.setdefault(p["category"], []).append(p)

    return {"pages": pages, "grouped": grouped, "total": len(pages)}


@app.get("/api/wiki/search")
async def wiki_search(q: str, limit: int = 10):
    """Full-text search across wiki pages."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT slug, title, category, tags,
                       ts_rank(search_vector, query) AS rank,
                       ts_headline('english', body, query,
                           'MaxWords=40, MinWords=20, StartSel=<mark>, StopSel=</mark>'
                       ) AS excerpt
                FROM wiki_pages, to_tsquery('english', %s) query
                WHERE search_vector @@ query
                ORDER BY rank DESC
                LIMIT %s
            """, (_to_tsquery(q), limit))
            rows = cur.fetchall()
    except Exception as e:
        logger.error(f"Wiki search failed: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

    results = [
        {
            "slug":     r[0],
            "title":    r[1],
            "category": r[2],
            "tags":     r[3] or [],
            "rank":     float(r[4]),
            "excerpt":  r[5],
        }
        for r in rows
    ]
    return {"results": results, "query": q}


@app.get("/api/wiki/{slug}")
async def wiki_page(slug: str):
    """Return a single wiki page by slug."""
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT slug, title, category, body, sources, tags, created_at, updated_at
                FROM wiki_pages
                WHERE slug = %s
            """, (slug,))
            row = cur.fetchone()
    except Exception as e:
        logger.error(f"Wiki page query failed: {e}")
        raise HTTPException(status_code=500, detail="Query failed")

    if not row:
        raise HTTPException(status_code=404, detail=f"Wiki page not found: {slug}")

    return {
        "slug":       row[0],
        "title":      row[1],
        "category":   row[2],
        "body":       row[3],
        "sources":    row[4] if row[4] else [],
        "tags":       row[5] or [],
        "created_at": row[6].isoformat() if row[6] else None,
        "updated_at": row[7].isoformat() if row[7] else None,
    }


def _to_tsquery(q: str) -> str:
    terms = [t.strip() for t in q.split() if t.strip()]
    return " & ".join(terms) if terms else q


@app.get("/admin")
async def admin_page():
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


@app.get("/wiki")
@app.get("/wiki/{path:path}")
async def wiki_spa(path: str = ""):
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


@app.get("/admin/data")
async def admin_data():
    from db import get_conn
    conn = get_conn()
    rows = []
    total = 0
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM queries")
                total = cur.fetchone()[0]
                cur.execute("""
                    SELECT created_at, question, model, response_ms, session_id
                    FROM queries
                    ORDER BY created_at DESC
                    LIMIT 200
                """)
                raw = cur.fetchall()
                rows = [
                    {
                        "created_at": r[0].strftime("%Y-%m-%d %H:%M:%S") if r[0] else "",
                        "question": r[1] or "",
                        "model": r[2] or "",
                        "response_ms": r[3],
                        "session_id": r[4] or "",
                    }
                    for r in raw
                ]
        except Exception as e:
            logger.error(f"Admin query failed: {e}")
    return {"rows": rows, "total": total}


# Serve frontend (React build output)
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    logger.warning(
        "frontend/dist not found — run 'cd frontend && npm run build' to build, "
        "or use the Vite dev server on http://localhost:5173"
    )
