# Kingdom Age Chat — Claude Instructions

## For Claude: keeping this file useful
Update this file whenever you learn something new about the project — a gotcha, a convention, a workflow step that wasn't obvious. The goal is that each session leaves this file slightly more complete than it found it. Commit updates to `CLAUDE.md` alongside the relevant code changes.

## What this project is
A RAG-powered chat app over Kingdom Age YouTube video transcripts. Users ask questions; the backend embeds the query, retrieves relevant transcript chunks from Pinecone, and streams an answer via Claude or GPT.

**Live on Railway** — pushing to `main` triggers an automatic redeploy.

## Architecture
- **Backend**: FastAPI (`api/main.py`, `api/rag.py`) — serves the frontend static files and exposes `/chat/stream` (SSE streaming) and `/chat` (non-streaming)
- **Frontend**: React + Vite (`frontend/src/`) — pre-built dist is committed to `frontend/dist/` and served by the backend
- **Ingest**: Python scripts in `ingest/` — fetch videos, transcripts (via Apify), chunk/embed, upsert to Pinecone
- **Data**: `data/videos.json`, `data/transcripts.json`, `data/embedded.json` (local state, not committed)

## Dev servers
```bash
# Backend (port 8000)
.venv/bin/uvicorn api.main:app --port 8000

# Frontend dev server (port 5173, proxies /chat/* to backend)
cd frontend && npm run dev
```
Both are configured in `.claude/launch.json` — use `preview_start` tools.

## Deploy checklist — ALWAYS do all of these before pushing
1. **Bump the version** in `frontend/src/App.tsx` → `const VERSION`
2. **Rebuild the frontend**: `cd frontend && npm run build`
3. **Stage and commit** including `frontend/dist/`
4. **Push to main**: `git push origin main` — this triggers Railway redeploy

Version scheme: `v{major}.{minor}.{patch}` — minor bump for new features, patch for fixes.

## Ingest pipeline
- `ingest/fetch_videos.py` — scrape video list from YouTube channel
- `ingest/fetch_transcripts.py` — fetch transcripts via Apify API
- `ingest/chunk_embed.py` — chunk (500 words, 50 overlap), embed (OpenAI `text-embedding-3-small`), upsert to Pinecone
- `ingest/daily_sync.py` — runs all three steps for new-only videos; safe to run repeatedly
- All scripts are resumable — they check local state files before doing work
- A scheduled task (`kingdom-age-daily-sync`) runs `daily_sync.py` at 3 AM daily

## Key config (api/rag.py)
- `CLAUDE_MODEL = "claude-sonnet-4-6"` — default model
- `TOP_K = 20` — chunks retrieved from Pinecone per query
- Streaming via `/chat/stream` SSE endpoint; frontend uses `useKingdomAgeChat` hook

## Pinecone
- Index: `kingdom-age`
- ~3,231 videos embedded, ~50k+ vectors
- Tracks embedded state locally in `data/embedded.json`

## Python environment
- Use `python3` (not `python`) — venv at `.venv/`
- Python 3.9 — no f-string backslashes, no `match` statements, no `str | None` union syntax
