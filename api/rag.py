"""
RAG core: embed a question, retrieve relevant chunks from Pinecone,
generate an answer with Claude, return answer + citations.
"""

import os
import json
from typing import Optional, List, Dict, Tuple
from openai import OpenAI
from pinecone import Pinecone
from anthropic import Anthropic
from dotenv import load_dotenv

# Load .env from project root regardless of working directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
anthropic_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

EMBED_MODEL = "text-embedding-3-small"
CLAUDE_MODEL = "claude-opus-4-6"
PREPROCESS_MODEL = "gpt-4o-mini"

# Retrieval config
POOL_K = 80          # chunks fetched from Pinecone before filtering
MIN_SCORE = 0.35     # drop chunks below this cosine similarity
CHUNKS_PER_VIDEO = 2 # max chunks per video (ensures breadth across a series)
MAX_VIDEOS = 20      # max distinct videos in final context

SYSTEM_PROMPT = """You are a knowledgeable assistant for Kingdom Age, a Christian ministry that teaches on the transition from the Church Age to the Kingdom Age — a new era in which God is actively establishing His kingdom on earth through His people.

The content comes from hundreds of video teachings covering topics such as: the Kingdom of God, the 7 Spirits of God, spiritual authority, prayer, intercession, end-times theology, the nature of the Church, discipleship, and prophetic ministry.

When answering:
- Synthesize insights from ALL provided sources, not just one or two
- If multiple videos address the same topic from different angles, weave them together into a comprehensive, unified answer
- Be thorough — these are theological topics that deserve full treatment
- Stay grounded in what the transcripts actually say; do not add outside theology not present in the sources
- If the sources only partially address the question, answer what you can and honestly note what is not covered
- Do not mention, list, or cite sources in your answer — they are shown separately in the UI

In multi-turn conversations, your prior responses were based on transcript excerpts that are only provided with each new question — they are NOT carried forward. Do not treat specific details from your own prior answers as verified facts. If a follow-up question asks about something you mentioned previously that does not appear in the current TRANSCRIPT EXCERPTS, say clearly that you do not have that material in the current context rather than repeating or elaborating on it."""


def get_pinecone_index():
    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index_name = os.environ.get("PINECONE_INDEX_NAME", "kingdom-age")
    return pc.Index(index_name)


_index = None


def index():
    global _index
    if _index is None:
        _index = get_pinecone_index()
    return _index


def embed_query(text: str) -> list[float]:
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=text)
    return response.data[0].embedding


def preprocess_query(question: str, history: Optional[List[Dict]] = None) -> str:
    """Use a fast LLM to rewrite ambiguous follow-up questions into standalone retrieval queries.
    Only fires when there is conversation history. Returns the original question unchanged if
    no history is present or if the model determines no enrichment is needed."""
    if not history:
        return question

    recent = [m for m in history if m["role"] == "user"][-3:]
    if not recent:
        return question

    history_text = "\n".join("User: " + m["content"] for m in recent)
    prompt = (
        "Given this conversation history:\n"
        + history_text
        + "\n\nAnd this new question: \"" + question + "\"\n\n"
        "Rewrite the new question as a complete, self-contained search query that includes "
        "any context needed to understand what the user is asking. "
        "If the question is already fully self-contained, return it unchanged. "
        "Return only the rewritten query, nothing else."
    )

    response = openai_client.chat.completions.create(
        model=PREPROCESS_MODEL,
        max_tokens=128,
        temperature=0,
        messages=[{"role": "user", "content": prompt}]
    )
    rewritten = response.choices[0].message.content.strip()
    return rewritten if rewritten else question


def retrieve(question: str, history: Optional[List[Dict]] = None) -> List[Dict]:
    retrieval_query = preprocess_query(question, history)
    embedding = embed_query(retrieval_query)
    results = index().query(vector=embedding, top_k=POOL_K, include_metadata=True)

    # Step 3: filter by score threshold
    matches = [m for m in results["matches"] if m["score"] >= MIN_SCORE]

    # Step 1: diversify — cap at CHUNKS_PER_VIDEO per video, up to MAX_VIDEOS
    seen_videos = {}
    for m in matches:
        vid = m["metadata"].get("video_id", m["metadata"]["url"])
        if vid not in seen_videos:
            if len(seen_videos) >= MAX_VIDEOS:
                continue
            seen_videos[vid] = []
        if len(seen_videos[vid]) < CHUNKS_PER_VIDEO:
            seen_videos[vid].append(m)

    # Flatten in video order (best-scoring video first)
    diverse_matches = []
    for vid_chunks in seen_videos.values():
        diverse_matches.extend(vid_chunks)

    return [
        {
            "text": m["metadata"]["text"],
            "title": m["metadata"]["title"],
            "url": m["metadata"]["url"],
            "score": round(m["score"], 3),
        }
        for m in diverse_matches
    ]


def build_context(chunks: List[Dict]) -> str:
    # Group chunks by URL so same-video chunks appear together
    grouped = {}
    for c in chunks:
        if c["url"] not in grouped:
            grouped[c["url"]] = {"title": c["title"], "url": c["url"], "texts": []}
        grouped[c["url"]]["texts"].append(c["text"])

    parts = []
    for g in grouped.values():
        combined = "\n\n".join(g["texts"])
        parts.append('[Source: "' + g["title"] + '" — ' + g["url"] + ']\n' + combined)

    return "\n\n---\n\n".join(parts)


def build_prompt(question: str, chunks: List[Dict]) -> Tuple:
    """Returns (system_prompt, user_message) for use with the LLM."""
    context = build_context(chunks)
    user_message = "TRANSCRIPT EXCERPTS:\n" + context + "\n\nQUESTION: " + question
    return SYSTEM_PROMPT, user_message


def chat(question: str, model: str = CLAUDE_MODEL, history: Optional[List[Dict]] = None) -> Dict:
    history = (history or [])[-6:]  # cap at last 3 exchanges
    chunks = retrieve(question, history)

    if not chunks:
        return {
            "answer": "I couldn't find anything relevant in the Kingdom Age videos for that question.",
            "sources": []
        }

    system_prompt, user_message = build_prompt(question, chunks)

    # Build messages: prior user questions only (no assistant responses — avoids hallucination
    # where model elaborates on claims that are no longer in the current RAG context)
    prior = [{"role": "user", "content": m["content"]} for m in history if m["role"] == "user"]
    current = {"role": "user", "content": user_message}

    if model.startswith("gpt-"):
        response = openai_client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "system", "content": system_prompt}] + prior + [current]
        )
        answer = response.choices[0].message.content
    else:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=prior + [current]
        )
        answer = response.content[0].text

    # Deduplicate sources by URL
    seen = set()
    sources = []
    for c in chunks:
        if c["url"] not in seen:
            seen.add(c["url"])
            sources.append({"title": c["title"], "url": c["url"]})

    return {"answer": answer, "sources": sources}


def stream_chat(question: str, model: str = CLAUDE_MODEL, history: Optional[List[Dict]] = None):
    """Sync generator that yields SSE-formatted strings for streaming responses."""
    history = (history or [])[-6:]  # cap at last 3 exchanges
    chunks = retrieve(question, history)

    if not chunks:
        no_results = "I couldn't find anything relevant in the Kingdom Age videos for that question."
        yield "data: " + json.dumps({"type": "text", "delta": no_results}) + "\n\n"
        yield "data: " + json.dumps({"type": "sources", "sources": []}) + "\n\n"
        yield 'data: {"type": "done"}\n\n'
        return

    system_prompt, user_message = build_prompt(question, chunks)

    seen = set()
    sources = []
    for c in chunks:
        if c["url"] not in seen:
            seen.add(c["url"])
            sources.append({"title": c["title"], "url": c["url"]})

    # Build messages: prior user questions only (no assistant responses — avoids hallucination
    # where model elaborates on claims that are no longer in the current RAG context)
    prior = [{"role": "user", "content": m["content"]} for m in history if m["role"] == "user"]
    current = {"role": "user", "content": user_message}

    if model.startswith("gpt-"):
        response = openai_client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "system", "content": system_prompt}] + prior + [current],
            stream=True,
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield "data: " + json.dumps({"type": "text", "delta": delta}) + "\n\n"
    else:
        with anthropic_client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=prior + [current],
        ) as stream:
            for delta in stream.text_stream:
                yield "data: " + json.dumps({"type": "text", "delta": delta}) + "\n\n"

    yield "data: " + json.dumps({"type": "sources", "sources": sources}) + "\n\n"
    yield 'data: {"type": "done"}\n\n'
