"""
Full re-index script using text-embedding-3-large (3072 dimensions).

Run this when you want to upgrade from text-embedding-3-small (1536 dims).
Because Pinecone indexes are fixed to one dimension size, this script:
  1. Deletes the existing index
  2. Creates a new one at 3072 dimensions
  3. Re-embeds all transcript chunks
  4. Re-embeds all WordPress post chunks  <-- add fetch logic when ready

WARNING: This is destructive. The existing index will be deleted.
Estimated runtime: ~2 hours for ~3,200 videos + WordPress posts.

Usage:
    python3 ingest/reindex_large.py

The script is resumable. Progress is saved to:
    data/embedded_large.json   (transcripts)
    data/wp_embedded_large.json  (WordPress posts)
Clear these files to start over from scratch.
"""

import json
import os
import sys

from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
TRANSCRIPTS_FILE = os.path.join(DATA_DIR, 'transcripts.json')
WP_POSTS_FILE = os.path.join(DATA_DIR, 'wp_posts.json')          # fetch separately
TRANSCRIPT_PROGRESS_FILE = os.path.join(DATA_DIR, 'embedded_large.json')
WP_PROGRESS_FILE = os.path.join(DATA_DIR, 'wp_embedded_large.json')

EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMS = 3072
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
EMBED_BATCH = 100
UPSERT_BATCH = 100

INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "kingdom-age")

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


# ---------------------------------------------------------------------------
# Pinecone helpers
# ---------------------------------------------------------------------------

def recreate_index(pc: Pinecone) -> object:
    existing = [i.name for i in pc.list_indexes()]
    if INDEX_NAME in existing:
        print(f"Deleting existing index '{INDEX_NAME}'...")
        pc.delete_index(INDEX_NAME)
        print("Deleted.")

    print(f"Creating index '{INDEX_NAME}' at {EMBED_DIMS} dimensions...")
    pc.create_index(
        name=INDEX_NAME,
        dimension=EMBED_DIMS,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )
    print("Index created.")
    return pc.Index(INDEX_NAME)


# ---------------------------------------------------------------------------
# Embedding / chunking helpers
# ---------------------------------------------------------------------------

def chunk_text(text):
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + CHUNK_SIZE
        chunks.append(' '.join(words[start:end]))
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def embed_texts(texts):
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in response.data]


def save_progress(path, done_ids):
    with open(path, 'w') as f:
        json.dump(list(done_ids), f)


def load_progress(path):
    if os.path.exists(path):
        with open(path) as f:
            return set(json.load(f))
    return set()


# ---------------------------------------------------------------------------
# Transcript ingest
# ---------------------------------------------------------------------------

def ingest_transcripts(index):
    if not os.path.exists(TRANSCRIPTS_FILE):
        print(f"No transcripts file found at {TRANSCRIPTS_FILE} — skipping.")
        return

    with open(TRANSCRIPTS_FILE) as f:
        transcripts = json.load(f)

    done_ids = load_progress(TRANSCRIPT_PROGRESS_FILE)
    if done_ids:
        print(f"Resuming transcripts — {len(done_ids)} already embedded.")

    pending = [t for t in transcripts if t['video_id'] not in done_ids]
    print(f"{len(pending)} transcript videos to process.")

    vector_buffer = []

    for item in tqdm(pending, desc="Transcripts"):
        video_id = item['video_id']
        chunks = chunk_text(item['transcript'])

        for i in range(0, len(chunks), EMBED_BATCH):
            batch_texts = chunks[i:i + EMBED_BATCH]
            embeddings = embed_texts(batch_texts)

            for j, (text, embedding) in enumerate(zip(batch_texts, embeddings)):
                chunk_idx = i + j
                vector_buffer.append({
                    "id": f"yt_{video_id}_{chunk_idx}",
                    "values": embedding,
                    "metadata": {
                        "source": "youtube",
                        "video_id": video_id,
                        "title": item['title'],
                        "url": item['url'],
                        "chunk_index": chunk_idx,
                        "text": text
                    }
                })

        if len(vector_buffer) >= UPSERT_BATCH:
            index.upsert(vectors=vector_buffer)
            vector_buffer = []

        done_ids.add(video_id)

        if len(done_ids) % 25 == 0:
            save_progress(TRANSCRIPT_PROGRESS_FILE, done_ids)

    if vector_buffer:
        index.upsert(vectors=vector_buffer)

    save_progress(TRANSCRIPT_PROGRESS_FILE, done_ids)
    print(f"Transcripts done. {len(done_ids)} videos embedded.")


# ---------------------------------------------------------------------------
# WordPress post ingest
# ---------------------------------------------------------------------------

def ingest_wp_posts(index):
    """
    Embed WordPress posts from wp_posts.json.

    Expected format of wp_posts.json — a list of objects:
        [
          {
            "post_id": "12345",
            "title": "Post title",
            "url": "https://kingdomage.org/...",
            "content": "Full post text..."
          },
          ...
        ]

    To fetch WordPress posts, write ingest/fetch_wp_posts.py using the
    WordPress REST API:  https://kingdomage.org/wp-json/wp/v2/posts
    Then save the results to data/wp_posts.json before running this script.
    """
    if not os.path.exists(WP_POSTS_FILE):
        print(f"No WordPress posts file found at {WP_POSTS_FILE} — skipping.")
        print("  -> Run ingest/fetch_wp_posts.py first to fetch posts.")
        return

    with open(WP_POSTS_FILE) as f:
        posts = json.load(f)

    done_ids = load_progress(WP_PROGRESS_FILE)
    if done_ids:
        print(f"Resuming WordPress posts — {len(done_ids)} already embedded.")

    pending = [p for p in posts if str(p['post_id']) not in done_ids]
    print(f"{len(pending)} WordPress posts to process.")

    vector_buffer = []

    for item in tqdm(pending, desc="WordPress posts"):
        post_id = str(item['post_id'])
        chunks = chunk_text(item['content'])

        for i in range(0, len(chunks), EMBED_BATCH):
            batch_texts = chunks[i:i + EMBED_BATCH]
            embeddings = embed_texts(batch_texts)

            for j, (text, embedding) in enumerate(zip(batch_texts, embeddings)):
                chunk_idx = i + j
                vector_buffer.append({
                    "id": f"wp_{post_id}_{chunk_idx}",
                    "values": embedding,
                    "metadata": {
                        "source": "wordpress",
                        "post_id": post_id,
                        "title": item['title'],
                        "url": item['url'],
                        "chunk_index": chunk_idx,
                        "text": text
                    }
                })

        if len(vector_buffer) >= UPSERT_BATCH:
            index.upsert(vectors=vector_buffer)
            vector_buffer = []

        done_ids.add(post_id)

        if len(done_ids) % 25 == 0:
            save_progress(WP_PROGRESS_FILE, done_ids)

    if vector_buffer:
        index.upsert(vectors=vector_buffer)

    save_progress(WP_PROGRESS_FILE, done_ids)
    print(f"WordPress posts done. {len(done_ids)} posts embedded.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("Kingdom Age — Full Re-index with text-embedding-3-large")
    print("=" * 60)
    print()
    print("This will DELETE the existing Pinecone index and rebuild it.")
    print("Make sure transcripts.json is up to date before proceeding.")
    print()

    # Check for resume state — if either progress file exists, skip the
    # destructive delete/recreate step and jump straight to ingesting.
    transcript_progress = load_progress(TRANSCRIPT_PROGRESS_FILE)
    wp_progress = load_progress(WP_PROGRESS_FILE)
    resuming = bool(transcript_progress or wp_progress)

    pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

    if resuming:
        print("Resume files detected — skipping index deletion and connecting to existing index.")
        index = pc.Index(INDEX_NAME)
    else:
        confirm = input("Type 'yes' to continue: ").strip().lower()
        if confirm != 'yes':
            print("Aborted.")
            sys.exit(0)
        print()
        index = recreate_index(pc)

    print()
    ingest_transcripts(index)
    print()
    ingest_wp_posts(index)
    print()
    print("Re-index complete.")
    print("Next: update EMBED_MODEL in api/rag.py to 'text-embedding-3-large'")
    print("      and update the query embedding call to match.")


if __name__ == "__main__":
    main()
