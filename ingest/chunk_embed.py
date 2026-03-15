"""
Chunk transcripts, embed with OpenAI, and upsert to Pinecone.
Resumable — tracks processed video IDs in data/embedded.json.
"""

import json
import os
from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
TRANSCRIPTS_FILE = os.path.join(DATA_DIR, 'transcripts.json')
EMBEDDED_FILE = os.path.join(DATA_DIR, 'embedded.json')

CHUNK_SIZE = 500        # words per chunk
CHUNK_OVERLAP = 50      # words of overlap between chunks
EMBED_MODEL = "text-embedding-3-small"
EMBED_BATCH = 100       # embeddings per API call
UPSERT_BATCH = 100      # vectors per Pinecone upsert

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def get_pinecone_index():
    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
    index_name = os.environ.get("PINECONE_INDEX_NAME", "kingdom-age")

    existing = [i.name for i in pc.list_indexes()]
    if index_name not in existing:
        print(f"Creating Pinecone index '{index_name}'...")
        pc.create_index(
            name=index_name,
            dimension=1536,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1")
        )

    return pc.Index(index_name)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(' '.join(words[start:end]))
        start += chunk_size - overlap
    return chunks


def embed_texts(texts: list[str]) -> list[list[float]]:
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in response.data]


def chunk_and_embed(transcripts: list[dict] = None):
    if transcripts is None:
        with open(TRANSCRIPTS_FILE) as f:
            transcripts = json.load(f)

    # Load progress
    embedded_ids = set()
    if os.path.exists(EMBEDDED_FILE):
        with open(EMBEDDED_FILE) as f:
            embedded_ids = set(json.load(f))
        print(f"Resuming — {len(embedded_ids)} videos already embedded.")

    index = get_pinecone_index()

    pending = [t for t in transcripts if t['video_id'] not in embedded_ids]
    print(f"{len(pending)} videos to process.")

    vector_buffer = []

    for item in tqdm(pending, desc="Chunking & embedding"):
        video_id = item['video_id']
        chunks = chunk_text(item['transcript'])

        # Embed in batches
        for i in range(0, len(chunks), EMBED_BATCH):
            batch_texts = chunks[i:i + EMBED_BATCH]
            embeddings = embed_texts(batch_texts)

            for j, (text, embedding) in enumerate(zip(batch_texts, embeddings)):
                chunk_idx = i + j
                vector_buffer.append({
                    "id": f"{video_id}_{chunk_idx}",
                    "values": embedding,
                    "metadata": {
                        "video_id": video_id,
                        "title": item['title'],
                        "url": item['url'],
                        "chunk_index": chunk_idx,
                        "text": text
                    }
                })

        # Upsert when buffer is full
        if len(vector_buffer) >= UPSERT_BATCH:
            index.upsert(vectors=vector_buffer)
            vector_buffer = []

        embedded_ids.add(video_id)

        # Save progress every 25 videos
        if len(embedded_ids) % 25 == 0:
            _save_progress(embedded_ids)

    # Flush remaining
    if vector_buffer:
        index.upsert(vectors=vector_buffer)

    _save_progress(embedded_ids)
    print(f"\nDone. {len(embedded_ids)} videos embedded into Pinecone.")


def _save_progress(embedded_ids):
    with open(EMBEDDED_FILE, 'w') as f:
        json.dump(list(embedded_ids), f)


if __name__ == "__main__":
    chunk_and_embed()
