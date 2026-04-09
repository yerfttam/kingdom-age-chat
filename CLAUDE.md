# Kingdom Age Chat — Claude Instructions

## For Claude: keeping this file useful
Update this file whenever you learn something new about the project — a gotcha, a convention, a workflow step that wasn't obvious. The goal is that each session leaves this file slightly more complete than it found it. Commit updates to `CLAUDE.md` alongside the relevant code changes.

## What this project is
A RAG-powered chat app over Kingdom Age content — YouTube video transcripts, WordPress posts from kingdomage.org, and the book *The Seed* by Immanuel Sun. Users ask questions; the backend embeds the query, retrieves relevant chunks from Pinecone, and streams an answer via Claude or GPT.

There is also a **Wiki** (Karpathy LLM Wiki pattern) — a persistent, LLM-synthesized knowledge base stored in Postgres. Pinecone remains the default; wiki mode is opt-in via `mode=wiki`. The wiki is browsable at `/wiki`.

**Live on Render** — pushing to `main` triggers an automatic redeploy.

## Architecture
- **Backend**: FastAPI (`api/main.py`, `api/rag.py`) — serves the frontend static files and exposes `/chat/stream` (SSE streaming) and `/chat` (non-streaming)
- **Frontend**: React + Vite (`frontend/src/`) — pre-built dist is committed to `frontend/dist/` and served by the backend
- **App**: React Native + Expo (`app/`) — iOS app, runs via Expo Go in simulator for dev, will be submitted to App Store separately
- **Ingest**: Python scripts in `ingest/` — fetch videos, transcripts (via Apify), chunk/embed, upsert to Pinecone
- **Wiki ingest**: `ingest/build_wiki.py` — builds/refines wiki pages from transcripts + PDF + WordPress
- **Data**: `data/videos.json`, `data/transcripts.json`, `data/embedded.json` (local state, not committed)
- **Wiki state**: `data/wiki_ingest.json` — tracks which sources have been ingested (resumable)

## Dev servers
All three are configured in `.claude/launch.json` — always use `preview_start` tools, never raw bash:
```
preview_start "kingdom-age-chat"      # backend on port 8000
preview_start "kingdom-age-frontend"  # frontend dev server on port 5173 (proxies /chat/* to backend)
preview_start "kingdom-age-app"       # Expo / Metro bundler on port 8081 (opens iOS Simulator)
```

⚠️ NEVER guess server names. Always call `preview_list` first to see what's running, and use only the exact names above. Do not invent variants like "Frontend" or "backend".

⚠️ iOS app changes CANNOT be verified via preview tools — the simulator UI is not browser-accessible. `preview_screenshot` on port 8081 only returns the Metro bundler JSON manifest. Visual verification of iOS changes requires the user to share a simulator/device screenshot.

## iOS App (app/)
- React Native 0.83 + **Expo SDK 54** (downgraded from 55 for Expo Go compatibility — Expo Go on the App Store currently supports SDK 54)
- Streaming uses `XMLHttpRequest` with `onprogress` — NOT fetch + ReadableStream (doesn't work reliably in RN)
- `punycode` must be installed as an explicit dep (`npm install punycode`) — removed from Node core in v17+
- `metro.config.js` maps `punycode` to the installed package via `extraNodeModules`
- In dev, app hits `http://localhost:8000` (simulator can reach Mac localhost directly)
- In production, app hits `https://kingdom-age-chat.onrender.com` (set via `__DEV__` flag in `constants.ts`)
- No Apple Developer account needed to run in simulator — required only for real device / App Store

### Running Expo (important gotchas)
- ⚠️ NEVER use `npx expo start` — npx grabs the latest Expo (SDK 55) from the registry, not the local SDK 54
- Always use the local binary: `./node_modules/.bin/expo start`
- For tunnel mode (to share with others off local network):
  1. `npm install @expo/ngrok@^4.0.0` (one-time)
  2. `./node_modules/.bin/expo start --tunnel`
  3. Mac must stay awake/running for tunnel to work
- For real device testing without tunnel: phone and Mac must be on the same Wi-Fi

## Key config (api/rag.py)
- `CLAUDE_MODEL = "claude-opus-4-6"` — default model (expensive; consider Sonnet for cost savings)
- `POOL_K = 80`, `MIN_SCORE = 0.35`, `CHUNKS_PER_VIDEO = 2`, `MAX_VIDEOS = 20` — diversified retrieval config
- Streaming via `/chat/stream` SSE endpoint; frontend uses `useKingdomAgeChat` hook
- ⚠️ There is a DEBUG logging block in `stream_chat` — remove before shipping to production

## Deploy checklist — ALWAYS do all of these before pushing
1. **Bump the version** in `frontend/src/App.tsx` → `const VERSION` — bump for EVERY change, even text tweaks. NO EXCEPTIONS.
2. **Rebuild the frontend**: `cd frontend && npm run build`
3. **Stage and commit** including `frontend/dist/`
4. **Push to main**: `git push origin main` — this triggers Render redeploy

Version scheme: `v{major}.{minor}.{patch}` — minor bump for new features, patch for fixes.

⚠️ NEVER push without bumping the version first. This is non-negotiable.

## Git commit convention
Always lead the commit message with the version number. Example:
```
v2.7.1 — admin page rebuilt in React, shares CSS with main app
```

## Ingest pipeline
- `ingest/fetch_videos.py` — scrape video list from YouTube channel
- `ingest/fetch_transcripts.py` — fetch transcripts via Apify API
- `ingest/chunk_embed.py` — chunk (500 words, 50 overlap), embed (OpenAI `text-embedding-3-small`), upsert to Pinecone
- `ingest/embed_pdf.py` — embed a PDF book into Pinecone (see PDF Ingest section below)
- `ingest/daily_sync.py` — runs all three steps for new-only videos; safe to run repeatedly
- All scripts are resumable — they check local state files before doing work
- A scheduled task (`kingdom-age-daily-sync`) runs `daily_sync.py` at 3 AM daily

## Wiki
The wiki is a Karpathy-style LLM knowledge base: instead of raw chunk retrieval, the LLM synthesizes content into durable, human-readable pages stored in Postgres.

### Schema (`wiki_pages` table)
- `slug` (UNIQUE), `title`, `category`, `body` (markdown), `sources` (JSONB), `tags` (text[]), `search_vector` (TSVECTOR), timestamps
- Auto-updated `search_vector` via Postgres trigger on insert/update
- GIN index on `search_vector` for full-text search

### Categories
`Concepts` | `Teachings` | `Biblical Texts` | `Series` | `Entities` | `Prophetic`

### Wiki ingest script
```
.venv/bin/python3 ingest/build_wiki.py [flags]
```
- `--source [videos|pdf|wordpress|all]` — which sources to process (default: all)
- `--limit N` — process only N sources (useful for testing)
- `--dry-run` — print LLM output without writing to DB
- `--refine` — **Opus refine pass**: re-reads every existing page and improves it (better synthesis, sharper language). Does NOT re-ingest sources.
- Models: `INGEST_MODEL = "claude-sonnet-4-6"` (first pass + enhance), `REFINE_MODEL = "claude-opus-4-6"` (refine pass)
- **Additive ingest**: when a source produces a page whose slug already exists, `call_enhance()` merges the existing body with the new content — pages deepen with every new source rather than being overwritten
- State file: `data/wiki_ingest.json` — tracks processed source IDs; resumable
- ⚠️ `load_dotenv(override=True)` is required — shell may have empty env vars that shadow `.env`
- ⚠️ `call_ingest()` returns `None` on LLM error (not `[]`) — check `if pages is None: continue` before updating state

### Wiki API endpoints
- `GET /api/wiki` — all pages grouped by category (optional `?category=` filter)
- `GET /api/wiki/search?q=` — Postgres full-text search with `ts_headline` excerpts
- `GET /api/wiki/{slug}` — single page detail

### Wiki frontend (`frontend/src/WikiPage.tsx`)
- Route: `/wiki` and `/wiki/*` — served as SPA from `index.html`
- ⚠️ Global `index.css` locks `html, body, #root { height: 100dvh; overflow: hidden }` for the chat layout — WikiPage uses a `useEffect` to override this on mount and restore on unmount
- `[[slug]]` cross-reference syntax → converted to `wiki-internal:` URLs → intercepted by custom ReactMarkdown link renderer → calls `openPage(slug)`
- `video:{id} — Title` source citations → converted to `https://youtube.com/watch?v={id}` links via `processSourceLinks()`
- Page body: plain article styling (no chat-bubble border), clean `ka-markdown` prose

### Wiki schema doc
`ingest/wiki_schema.md` — read by the LLM during ingest. Defines categories, page format (Summary / Key Points / Cross-References / Sources), slug conventions, tag vocabulary, and 8 ingest rules.

### Pending wiki work
- ⬜ GitHub Actions: `wiki-from-queries.yml` (nightly query gap analysis), `wiki-ingest-new-videos.yml`, optional `wiki-refine.yml` (weekly Opus pass)
- ⬜ Switch default chat mode from `pinecone` to `wiki` when quality is ready

## PDF Ingest
- Script: `ingest/embed_pdf.py`
- Dependency: `pypdf` (install via `.venv/bin/pip install pypdf`)
- Run: `.venv/bin/python3 ingest/embed_pdf.py /path/to/file.pdf`
- Re-embed (wipes old vectors first): `.venv/bin/python3 ingest/embed_pdf.py /path/to/file.pdf --delete`
- PDF chunks use `source: "pdf"`, `url: ""`, and `title: "{Book}, Chapter {N}"` in metadata
- ⚠️ Always use `.venv/bin/python3` not `python3` — pypdf is only in the venv

### The Seed
- File: `The Seed/the-seed_print_final_10-22-2022.pdf` (340 pages, 12 chapters)
- Author: Immanuel Sun, Published by New Streams Studio
- Chapter page ranges are hardcoded in `embed_pdf.py` — chapters 5 and 12 have image-only intro pages (chapter numbers not extractable as text)
- 159 chunks currently in Pinecone with IDs `seed_ch{N}_{idx}`
- NOT linkable as a source — cite as "The Seed, Chapter N" only

## Pinecone
- Index: `kingdom-age`
- ~3,231 videos embedded + 159 PDF chunks (~50k+ vectors total)
- Tracks video embedded state locally in `data/embedded.json`
- PDF chunks identified by `source: "pdf"` metadata filter

## RAG quality improvement roadmap
Steps 1-3 done (as of v2.1.0). Steps 4-5 still to do:
1. ✅ Diversified retrieval — 80 chunks, 2/video cap, 20 videos max
2. ✅ Better system prompt — KA theological context, synthesize across sources
3. ✅ Score threshold — drop chunks below 0.35 cosine similarity
4. ⬜ Cohere reranking — re-score the diversified pool, keep top 12-15
5. ⬜ Re-embed with `text-embedding-3-large` — requires full re-ingest (~2 hrs)

## Anthropic API key gotcha
- Running out of credits **suspends the API key** — adding credits does NOT reactivate the old key
- When this happens: create a new key in the Anthropic console, update `ANTHROPIC_API_KEY` in Render env vars (triggers auto-redeploy)
- Prevention: set up auto-reload in the Anthropic billing console (e.g., reload when balance < $10)
- Cost profile: Opus 4.6 runs ~$15/MTok input + $75/MTok output; input dominates (13:1 ratio vs output)

## Database
- PostgreSQL on Render (`ka_chat_db`)
- **Local dev**: use the **External** Database URL in `.env` — `dpg-...oregon-postgres.render.com`
- **Render production**: use the **Internal** Database URL in Render environment settings — `dpg-...-a` (no hostname suffix, faster and free within Render's network)
- Same env var name in both: `DATABASE_URL`
- `psycopg2-binary` must be installed locally: `.venv/bin/pip install psycopg2-binary --only-binary=:all:`

## Python environment
- Use `python3` (not `python`) — venv at `.venv/`
- Always run scripts as `.venv/bin/python3 ingest/script.py` to ensure venv packages are used
- Python 3.9 — no f-string backslashes, no `match` statements, no `str | None` union syntax
