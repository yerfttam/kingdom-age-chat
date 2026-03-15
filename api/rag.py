"""
RAG core: embed a question, retrieve relevant chunks from Pinecone,
generate an answer with Claude, return answer + citations.
"""

import os
from openai import OpenAI
from pinecone import Pinecone
from anthropic import Anthropic
from dotenv import load_dotenv

# Load .env from project root regardless of working directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
anthropic_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

EMBED_MODEL = "text-embedding-3-small"
CLAUDE_MODEL = "claude-sonnet-4-6"
TOP_K = 8  # number of chunks to retrieve


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


def retrieve(question: str) -> list[dict]:
    embedding = embed_query(question)
    results = index().query(vector=embedding, top_k=TOP_K, include_metadata=True)
    return [
        {
            "text": m["metadata"]["text"],
            "title": m["metadata"]["title"],
            "url": m["metadata"]["url"],
            "score": round(m["score"], 3),
        }
        for m in results["matches"]
    ]


def build_prompt(question: str, chunks: list[dict]) -> str:
    context = "\n\n".join(
        f'[Source: "{c["title"]}" — {c["url"]}]\n{c["text"]}'
        for c in chunks
    )
    return f"""You are a helpful assistant for the Kingdom Age YouTube channel.
Answer the question below using only the provided video transcript excerpts.
Be clear, concise, and grounded in the sources.
If the answer isn't in the sources, say so honestly.
Do not list or mention sources in your answer.

TRANSCRIPT EXCERPTS:
{context}

QUESTION: {question}"""


def chat(question: str, model: str = CLAUDE_MODEL) -> dict:
    chunks = retrieve(question)

    if not chunks:
        return {
            "answer": "I couldn't find anything relevant in the Kingdom Age videos for that question.",
            "sources": []
        }

    prompt = build_prompt(question, chunks)

    if model.startswith("gpt-"):
        response = openai_client.chat.completions.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        answer = response.choices[0].message.content
    else:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
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
