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

WIKI_SYSTEM_PROMPT = """You are a knowledgeable assistant for Kingdom Age, a Christian ministry that teaches on the transition from the Church Age to the Kingdom Age — a new era in which God is actively establishing His kingdom on earth through His people.

The context below consists of synthesized wiki pages drawn from hundreds of video teachings, written materials, and the book "The Seed" by Immanuel Sun. Each page represents compiled, cross-referenced knowledge on a topic.

When answering:
- Synthesize across all provided wiki pages into a single unified answer
- Preserve Immanuel Sun's specific theological meanings — terms like "seed", "kingdom", "organic", and "sonship" carry precise meanings in Kingdom Age teaching
- Be thorough — these are theological topics that deserve full treatment
- Stay grounded in what the wiki pages actually say; do not add outside theology
- If the pages only partially address the question, answer what you can and honestly note what is not covered
- Do not mention, list, or cite sources in your answer — they are shown separately in the UI

In multi-turn conversations, do not treat specific details from your own prior answers as verified facts unless they appear in the current WIKI CONTEXT."""

SYSTEM_PROMPT = """You are a knowledgeable assistant for Kingdom Age, a Christian ministry that teaches on the transition from the Church Age to the Kingdom Age — a new era in which God is actively establishing His kingdom on earth through His people.

The content comes from hundreds of video teachings and written materials covering topics such as: the Kingdom of God, the 7 Spirits of God, spiritual authority, prayer, intercession, end-times theology, the nature of the Church, discipleship, and prophetic ministry. Written sources include the book "The Seed" by Immanuel Sun.

When answering:
- Synthesize insights from ALL provided sources, not just one or two
- If multiple sources address the same topic from different angles, weave them together into a comprehensive, unified answer
- Be thorough — these are theological topics that deserve full treatment
- Stay grounded in what the sources actually say; do not add outside theology not present in the sources
- If the sources only partially address the question, answer what you can and honestly note what is not covered
- Do not mention, list, or cite sources in your answer — they are shown separately in the UI

In multi-turn conversations, your prior responses were based on source excerpts that are only provided with each new question — they are NOT carried forward. Do not treat specific details from your own prior answers as verified facts. If a follow-up question asks about something you mentioned previously that does not appear in the current SOURCE EXCERPTS, say clearly that you do not have that material in the current context rather than repeating or elaborating on it."""


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

    # Step 1: diversify — cap at CHUNKS_PER_VIDEO per source, up to MAX_VIDEOS
    # For PDF chunks (no video_id, empty url) use the title as the grouping key
    seen_videos = {}
    for m in matches:
        meta = m["metadata"]
        if meta.get("video_id"):
            vid = meta["video_id"]
        elif meta.get("url"):
            vid = meta["url"]
        else:
            vid = meta.get("title", "unknown")  # group PDFs by chapter title
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


def retrieve_wiki(question: str, history: Optional[List[Dict]] = None, limit: int = 8) -> List[Dict]:
    """Full-text search the wiki_pages table. Returns page dicts."""
    from db import get_conn
    retrieval_query = preprocess_query(question, history)

    # Build a tsquery from the query terms
    terms = [t.strip() for t in retrieval_query.split() if t.strip()]
    if not terms:
        return []
    tsquery = " & ".join(terms)

    conn = get_conn()
    if not conn:
        return []

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT slug, title, category, body, sources,
                       ts_rank(search_vector, query) AS rank
                FROM wiki_pages, to_tsquery('english', %s) query
                WHERE search_vector @@ query
                ORDER BY rank DESC
                LIMIT %s
            """, (tsquery, limit))
            rows = cur.fetchall()
    except Exception:
        # Fallback: plain ILIKE search if tsquery fails (e.g. single stopword)
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT slug, title, category, body, sources, 1.0 AS rank
                    FROM wiki_pages
                    WHERE title ILIKE %s OR body ILIKE %s
                    ORDER BY title
                    LIMIT %s
                """, ("%" + retrieval_query + "%", "%" + retrieval_query + "%", limit))
                rows = cur.fetchall()
        except Exception:
            return []

    return [
        {
            "slug":     r[0],
            "title":    r[1],
            "category": r[2],
            "body":     r[3],
            "sources":  r[4] if r[4] else [],
            "score":    float(r[5]),
        }
        for r in rows
    ]


def build_context_wiki(pages: List[Dict]) -> str:
    """Format wiki pages as LLM context."""
    parts = []
    for p in pages:
        header = '[Wiki: "{}" — {}]'.format(p["title"], p["category"])
        parts.append(header + "\n" + p["body"])
    return "\n\n---\n\n".join(parts)


def build_context(chunks: List[Dict]) -> str:
    # Group chunks by URL (videos) or title (PDFs with no URL)
    grouped = {}
    for c in chunks:
        key = c["url"] if c["url"] else c["title"]
        if key not in grouped:
            grouped[key] = {"title": c["title"], "url": c["url"], "texts": []}
        grouped[key]["texts"].append(c["text"])

    parts = []
    for g in grouped.values():
        combined = "\n\n".join(g["texts"])
        if g["url"]:
            header = '[Source: "' + g["title"] + '" — ' + g["url"] + ']'
        else:
            header = '[Source: "' + g["title"] + '"]'
        parts.append(header + '\n' + combined)

    return "\n\n---\n\n".join(parts)


def build_prompt(question: str, chunks: List[Dict]) -> Tuple:
    """Returns (system_prompt, user_message) for use with the LLM."""
    context = build_context(chunks)
    user_message = "SOURCE EXCERPTS:\n" + context + "\n\nQUESTION: " + question
    return SYSTEM_PROMPT, user_message


def chat(question: str, model: str = CLAUDE_MODEL, history: Optional[List[Dict]] = None, mode: str = "pinecone") -> Dict:
    history = (history or [])[-6:]  # cap at last 3 exchanges

    if mode == "wiki":
        pages = retrieve_wiki(question, history)
        if not pages:
            return {
                "answer": "I couldn't find anything relevant in the Kingdom Age wiki for that question.",
                "sources": []
            }
        context = build_context_wiki(pages)
        system_prompt = WIKI_SYSTEM_PROMPT
        user_message = "WIKI CONTEXT:\n" + context + "\n\nQUESTION: " + question
        sources = [{"title": p["title"], "url": ""} for p in pages]
    else:
        chunks = retrieve(question, history)
        if not chunks:
            return {
                "answer": "I couldn't find anything relevant in the Kingdom Age library for that question.",
                "sources": []
            }
        system_prompt, user_message = build_prompt(question, chunks)
        seen = set()
        sources = []
        for c in chunks:
            dedup_key = c["url"] if c["url"] else c["title"]
            if dedup_key not in seen:
                seen.add(dedup_key)
                sources.append({"title": c["title"], "url": c["url"]})

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

    return {"answer": answer, "sources": sources}


def stream_chat(question: str, model: str = CLAUDE_MODEL, history: Optional[List[Dict]] = None, mode: str = "pinecone"):
    """Sync generator that yields SSE-formatted strings for streaming responses."""
    history = (history or [])[-6:]  # cap at last 3 exchanges

    if mode == "wiki":
        pages = retrieve_wiki(question, history)
        if not pages:
            no_results = "I couldn't find anything relevant in the Kingdom Age wiki for that question."
            yield "data: " + json.dumps({"type": "text", "delta": no_results}) + "\n\n"
            yield "data: " + json.dumps({"type": "sources", "sources": []}) + "\n\n"
            yield 'data: {"type": "done"}\n\n'
            return
        system_prompt = WIKI_SYSTEM_PROMPT
        user_message = "WIKI CONTEXT:\n" + build_context_wiki(pages) + "\n\nQUESTION: " + question
        sources = [{"title": p["title"], "url": ""} for p in pages]
    else:
        chunks = retrieve(question, history)
        if not chunks:
            no_results = "I couldn't find anything relevant in the Kingdom Age library for that question."
            yield "data: " + json.dumps({"type": "text", "delta": no_results}) + "\n\n"
            yield "data: " + json.dumps({"type": "sources", "sources": []}) + "\n\n"
            yield 'data: {"type": "done"}\n\n'
            return
        system_prompt, user_message = build_prompt(question, chunks)
        seen = set()
        sources = []
        for c in chunks:
            dedup_key = c["url"] if c["url"] else c["title"]
            if dedup_key not in seen:
                seen.add(dedup_key)
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
