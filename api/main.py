"""
FastAPI backend — exposes a /chat endpoint and serves the frontend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import logging
import os
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))
from rag import chat


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

    yield


app = FastAPI(title="Kingdom Age Chat", lifespan=lifespan)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')


ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
}

class ChatRequest(BaseModel):
    question: str
    model: str = "claude-sonnet-4-6"


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
    result = chat(req.question, model=req.model)
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve frontend
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
