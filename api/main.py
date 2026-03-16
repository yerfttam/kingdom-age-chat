"""
FastAPI backend — exposes a /chat endpoint and serves the frontend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
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
    # Log what port Railway assigned
    logger.info(f"PORT env var = {os.environ.get('PORT', 'NOT SET')}")

    # Check API keys
    for key in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PINECONE_API_KEY"]:
        val = os.environ.get(key, "")
        if val:
            logger.info(f"OK {key} loaded ({val[:6]}...)")
        else:
            logger.error(f"MISSING {key} is not set")

    # Test Pinecone connection
    try:
        from rag import index
        stats = index().describe_index_stats()
        logger.info(f"OK Pinecone connected — {stats.total_vector_count} vectors indexed")
    except Exception as e:
        logger.error(f"FAIL Pinecone connection failed: {e}")

    # Initialize database
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
    result = chat(req.question, model=req.model, history=history)
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
        for chunk in stream_chat(req.question, model=req.model, history=history):
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


@app.get("/admin", response_class=HTMLResponse)
async def admin():
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
                    SELECT created_at, question, model, response_ms, num_sources, session_id
                    FROM queries
                    ORDER BY created_at DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()
        except Exception as e:
            logger.error(f"Admin query failed: {e}")

    rows_html = ""
    for r in rows:
        created_at, question, model, response_ms, num_sources, session_id = r
        dt = created_at.strftime("%Y-%m-%d %H:%M:%S") if created_at else ""
        q = question[:120] + "…" if question and len(question) > 120 else (question or "")
        ms = f"{response_ms:,} ms" if response_ms else "—"
        rows_html += f"""
        <tr>
            <td>{dt}</td>
            <td title="{question}">{q}</td>
            <td>{model or '—'}</td>
            <td>{ms}</td>
            <td style="font-size:0.7rem;color:#999">{(session_id or '')[:8]}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Kingdom Age Chat Administration</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@700&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, sans-serif; background: #f5f5f5; color: #222; }}
  .ka-header {{
    background: #8b0000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 24px 8px;
  }}
  .ka-header img {{
    height: 52px;
    width: auto;
  }}
  .ka-subheader {{
    background: white;
    border-bottom: 2px solid #e8e8e8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 24px;
  }}
  .ka-subheader h1 {{
    font-family: "Barlow", Helvetica, Arial, sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }}
  .ka-subheader h1 span {{ color: #1a1a1a; }}
  .content {{ padding: 24px; }}
  .meta {{ font-size: 0.85rem; color: #666; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }}
  th {{ background: #8b0000; color: white; text-align: left; padding: 10px 14px; font-size: 0.8rem; font-weight: 600; }}
  td {{ padding: 9px 14px; font-size: 0.82rem; border-bottom: 1px solid #f0f0f0; vertical-align: top; }}
  tr:last-child td {{ border-bottom: none; }}
  tr:hover td {{ background: #fafafa; }}
</style>
</head>
<body>
  <div class="ka-header">
    <div style="position:relative;height:52px;width:108px;">
      <img src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png"
        style="position:absolute;inset:0;height:52px;width:auto;filter:sepia(1) saturate(4) hue-rotate(5deg) brightness(1.3);clip-path:inset(0 62% 0 0);" />
      <img src="https://kingdomage.org/wp-content/uploads/2017/10/logo@3x.png"
        style="position:absolute;inset:0;height:52px;width:auto;filter:brightness(0) invert(1);clip-path:inset(0 0 0 34%);" />
    </div>
  </div>
  <div class="ka-subheader">
    <h1>Kingdom Age <span>Chat</span> Query Log</h1>
  </div>
  <div class="content">
    <div class="meta">Showing {len(rows):,} of {total:,} total queries</div>
    <table>
      <thead>
        <tr>
          <th>Time (UTC)</th>
          <th>Question</th>
          <th>Model</th>
          <th>Response Time</th>
          <th>Session</th>
        </tr>
      </thead>
      <tbody>
        {rows_html if rows_html else '<tr><td colspan="5" style="text-align:center;color:#999;padding:40px">No queries yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>"""
    return HTMLResponse(content=html)


# Serve frontend (React build output)
# Falls back gracefully if dist/ doesn't exist yet (local dev uses Vite dev server)
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    logger.warning(
        "frontend/dist not found — run 'cd frontend && npm run build' to build, "
        "or use the Vite dev server on http://localhost:5173"
    )
