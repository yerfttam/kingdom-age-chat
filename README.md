# Kingdom Age Chat

A RAG-powered chat interface for the [Kingdom Age](https://www.youtube.com/@kingdomage) ministry — ask questions and get answers synthesized from thousands of video transcripts, teaching articles, and Scripture.

## Content Sources

- **YouTube transcripts** — 3,200+ videos indexed for semantic search
- **kingdomage.org articles** — 2,300+ WordPress posts and pages
- **NIV Bible (2011)** — full 66-book Bible, chunked by chapter *(in progress)*

## How it works

1. Content is fetched, chunked, and embedded via OpenAI `text-embedding-3-small`
2. Chunks are stored in Pinecone with source metadata
3. Users ask questions via a streaming chat interface
4. Relevant chunks are retrieved using diversified semantic search (80-chunk pool, 2/video cap, 20-source max)
5. Claude synthesizes an answer grounded in the retrieved content and streams it back

## Stack

- **Backend**: Python 3.9 / FastAPI — streaming SSE via `/chat/stream`
- **Frontend**: React + Vite — pre-built dist served by FastAPI
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Vector DB**: Pinecone (`kingdom-age` index)
- **LLM**: Claude Sonnet (Anthropic) — with conversation history support
- **Hosting**: Render (auto-deploys from `main`)

## Environment Variables

```
OPENAI_API_KEY
ANTHROPIC_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME=kingdom-age
APIFY_API_TOKEN
```

## Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Backend (port 8000)
.venv/bin/uvicorn api.main:app --port 8000

# Frontend dev server (port 5173, proxies /chat/* to backend)
cd frontend && npm install && npm run dev
```

## Project Structure

```
api/          # FastAPI backend (main.py, rag.py)
frontend/     # React + Vite chat UI (pre-built dist committed)
ingest/       # Content fetch, chunk, embed pipeline
  fetch_videos.py       # Scrape YouTube channel
  fetch_transcripts.py  # Fetch transcripts via Apify
  chunk_embed.py        # Chunk, embed, upsert to Pinecone
  daily_sync.py         # Incremental sync (runs at 3 AM daily)
  embed_wordpress.py    # Ingest WordPress posts from CSV export
  download_bible.py     # Download Bible via API.Bible
  embed_bible.py        # Chunk and embed Bible content
data/         # Local content cache (gitignored)
```

## Deploy

Pushing to `main` triggers an automatic Render redeploy. Always:
1. Bump `VERSION` in `frontend/src/App.tsx`
2. Run `cd frontend && npm run build`
3. Commit including `frontend/dist/`
4. Push to `main`
