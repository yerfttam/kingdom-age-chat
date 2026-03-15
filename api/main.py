"""
FastAPI backend — exposes a /chat endpoint and serves the frontend.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from rag import chat

app = FastAPI(title="Kingdom Age Chat")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')


class ChatRequest(BaseModel):
    question: str


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
    result = chat(req.question)
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve frontend
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
