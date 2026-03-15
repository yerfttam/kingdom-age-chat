# Kingdom Age Chat

A NotebookLM-style chat interface for the [Kingdom Age YouTube channel](https://www.youtube.com/@kingdomage) — 3500+ videos indexed for semantic search and Q&A.

## How it works

1. YouTube transcripts are fetched and chunked
2. Chunks are embedded and stored in Pinecone
3. Users ask questions via a chat interface
4. Relevant video segments are retrieved and synthesized into answers with citations

## Stack

- **Backend**: Python / FastAPI
- **Transcripts**: `youtube-transcript-api`
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Vector DB**: Pinecone
- **LLM**: Claude (Anthropic)
- **Hosting**: Railway

## Setup

```bash
cp .env.example .env
# Fill in your API keys

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Project Structure

```
ingest/       # Transcript fetching, chunking, embedding pipeline
api/          # FastAPI backend
frontend/     # Chat UI
data/         # Local transcript cache (gitignored)
```
