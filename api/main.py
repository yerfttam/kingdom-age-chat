"""
FastAPI backend — exposes a /chat endpoint and serves the frontend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import logging
import os
import sys
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))
from rag import chat, stream_chat
from db import init_db, log_query


def _startup_checks():
    """Run slow startup checks in a background thread — never blocks the server from accepting requests."""
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

    try:
        init_db()
        logger.info("OK Database initialized")
    except Exception as e:
        logger.error(f"FAIL Database init failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"PORT env var = {os.environ.get('PORT', 'NOT SET')}")
    # Fire checks in a background thread so the server is ready immediately
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _startup_checks)
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


@app.get("/admin")
async def admin_page():
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


# ---------------------------------------------------------------------------
# Prophetic status endpoint
# ---------------------------------------------------------------------------

@app.get("/api/prophetic-status")
async def prophetic_status():
    """Return prophetic scan progress and entry stats."""
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            # Total transcripts available
            import json as _json
            transcripts_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'transcripts.json')
            try:
                with open(transcripts_file) as f:
                    total_videos = len([t for t in _json.load(f) if t.get('transcript', '').strip()])
            except Exception:
                total_videos = 0

            # Videos scanned
            cur.execute("SELECT COUNT(*), COALESCE(SUM(found_count), 0) FROM prophetic_scan_log")
            row = cur.fetchone()
            scanned = int(row[0])
            found_total = int(row[1])

            # Entry breakdown
            cur.execute("SELECT COUNT(*) FROM prophetic_entries WHERE entry_type = 'vision'")
            visions = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM prophetic_entries WHERE entry_type = 'dream'")
            dreams = cur.fetchone()[0]

            # Recent entries
            cur.execute("""
                SELECT video_id, video_title, video_url, video_date,
                       speaker, entry_type, LEFT(narrative, 300), created_at,
                       timestamp_seconds
                FROM prophetic_entries
                ORDER BY created_at DESC
                LIMIT 10
            """)
            recent = [
                {
                    "video_id":          r[0],
                    "video_title":       r[1],
                    "video_url":         r[2],
                    "watch_url":         (r[2] + ("&" if "?" in r[2] else "?") + f"t={r[8]}") if r[8] is not None else r[2],
                    "video_date":        r[3].isoformat() if r[3] else None,
                    "speaker":           r[4],
                    "type":              r[5],
                    "narrative":         r[6],
                    "created_at":        r[7].isoformat() if r[7] else None,
                    "timestamp_seconds": r[8],
                }
                for r in cur.fetchall()
            ]

            # Last scan time
            cur.execute("SELECT MAX(scanned_at) FROM prophetic_scan_log")
            last_scanned = cur.fetchone()[0]

    except Exception as e:
        logger.error(f"Prophetic status query failed: {e}")
        raise HTTPException(status_code=500, detail="Query failed")

    return {
        "total_videos":   total_videos,
        "scanned":        scanned,
        "remaining":      max(0, total_videos - scanned),
        "pct_complete":   round((scanned / total_videos * 100), 1) if total_videos else 0,
        "total_entries":  found_total,
        "visions":        visions,
        "dreams":         dreams,
        "last_scanned":   last_scanned.isoformat() if last_scanned else None,
        "recent_entries": recent,
    }


@app.get("/prophetic-status")
async def prophetic_status_spa():
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


@app.get("/prophetic")
async def prophetic_spa():
    return FileResponse(os.path.join(FRONTEND_DIST, 'index.html'))


# ---------------------------------------------------------------------------
# Prophetic entries browse endpoint
# ---------------------------------------------------------------------------

@app.get("/api/prophetic-entries")
async def prophetic_entries(q: str = "", type: str = ""):
    """Return all prophetic entries, optionally filtered by search or type."""
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            conditions = []
            params = []

            if type in ("vision", "dream"):
                conditions.append("entry_type = %s")
                params.append(type)

            if q.strip():
                conditions.append("(narrative ILIKE %s OR video_title ILIKE %s OR COALESCE(speaker, '') ILIKE %s)")
                like = f"%{q.strip()}%"
                params.extend([like, like, like])

            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            cur.execute(f"""
                SELECT id, video_id, video_title, video_url, video_date,
                       speaker, entry_type, narrative, interpretation,
                       timestamp_seconds, created_at
                FROM prophetic_entries
                {where}
                ORDER BY video_date DESC NULLS LAST, created_at DESC
            """, params)

            rows = cur.fetchall()

    except Exception as e:
        logger.error(f"Prophetic entries query failed: {e}")
        raise HTTPException(status_code=500, detail="Query failed")

    def watch_url(base_url: str, ts: int | None) -> str:
        if ts is not None:
            return f"{base_url}&t={ts}" if "?" in base_url else f"{base_url}?t={ts}"
        return base_url

    entries = [
        {
            "id":                r[0],
            "video_id":          r[1],
            "video_title":       r[2],
            "video_url":         r[3],
            "watch_url":         watch_url(r[3], r[9]),
            "video_date":        r[4].isoformat() if r[4] else None,
            "speaker":           r[5],
            "type":              r[6],
            "narrative":         r[7],
            "interpretation":    r[8],
            "timestamp_seconds": r[9],
            "created_at":        r[10].isoformat() if r[10] else None,
        }
        for r in rows
    ]

    visions = [e for e in entries if e["type"] == "vision"]
    dreams  = [e for e in entries if e["type"] == "dream"]

    return {
        "entries": entries,
        "visions": visions,
        "dreams":  dreams,
        "total":   len(entries),
    }


@app.get("/api/prophetic-entries/{entry_id}")
async def prophetic_entry_detail(entry_id: int):
    """Return a single prophetic entry by ID."""
    from db import get_conn
    conn = get_conn()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, video_id, video_title, video_url, video_date,
                       speaker, entry_type, narrative, interpretation,
                       timestamp_seconds, created_at
                FROM prophetic_entries
                WHERE id = %s
            """, (entry_id,))
            r = cur.fetchone()
    except Exception as e:
        logger.error(f"Prophetic entry detail query failed: {e}")
        raise HTTPException(status_code=500, detail="Query failed")

    if not r:
        raise HTTPException(status_code=404, detail="Entry not found")

    def watch_url(base_url: str, ts) -> str:
        if ts is not None:
            return f"{base_url}&t={ts}" if "?" in base_url else f"{base_url}?t={ts}"
        return base_url

    return {
        "id":                r[0],
        "video_id":          r[1],
        "video_title":       r[2],
        "video_url":         r[3],
        "watch_url":         watch_url(r[3], r[9]),
        "video_date":        r[4].isoformat() if r[4] else None,
        "speaker":           r[5],
        "type":              r[6],
        "narrative":         r[7],
        "interpretation":    r[8],
        "timestamp_seconds": r[9],
        "created_at":        r[10].isoformat() if r[10] else None,
    }


@app.get("/prophetic/{entry_id}")
async def prophetic_detail_spa(entry_id: int):
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
