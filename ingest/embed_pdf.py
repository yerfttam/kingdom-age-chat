"""
Extract text from a PDF, chunk it, embed with OpenAI, and upsert to Pinecone.
Uses page-range based chapter detection (reliable for The Seed PDF which has
some chapter numbers rendered as images and not extractable as text).

Usage:
    python3 ingest/embed_pdf.py /path/to/the-seed.pdf
    python3 ingest/embed_pdf.py /path/to/the-seed.pdf --delete   # wipe existing vectors first
"""

import os
import sys
import argparse

from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from pypdf import PdfReader
from dotenv import load_dotenv

load_dotenv()

CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50
EMBED_MODEL   = "text-embedding-3-small"
EMBED_BATCH   = 100
UPSERT_BATCH  = 100

BOOK_TITLE = "The Seed"

# PDF page ranges for each chapter (0-indexed, end is exclusive).
# Determined by inspecting the PDF — chapters 5 and 12 have image-only
# intro pages so their numbers can't be detected from extracted text.
# Pages after index 326 are appendix/testimonials — excluded.
CHAPTER_RANGES = [
    (1,  10,  36),   # Chapter 1:  PDF pages 11–36
    (2,  36,  60),   # Chapter 2:  PDF pages 37–60
    (3,  60,  86),   # Chapter 3:  PDF pages 61–86
    (4,  86, 114),   # Chapter 4:  PDF pages 87–114
    (5, 114, 158),   # Chapter 5:  PDF pages 115–158  (image intro)
    (6, 158, 182),   # Chapter 6:  PDF pages 159–182
    (7, 182, 206),   # Chapter 7:  PDF pages 183–206
    (8, 206, 224),   # Chapter 8:  PDF pages 207–224
    (9, 224, 248),   # Chapter 9:  PDF pages 225–248
    (10, 248, 284),  # Chapter 10: PDF pages 249–284
    (11, 284, 306),  # Chapter 11: PDF pages 285–305
    (12, 306, 326),  # Chapter 12: PDF pages 307–326  (image intro)
]

# Pages that are pure workbook/journal pages (blank lines, underscores) —
# filter these out as they add no RAG value.
JUNK_THRESHOLD = 0.4   # if >40% of words are underscores or page numbers, skip


def is_junk_page(text: str) -> bool:
    words = text.split()
    if not words:
        return True
    junk = sum(1 for w in words if set(w) <= set('_-0123456789 '))
    return (junk / len(words)) > JUNK_THRESHOLD


def extract_chapter_texts(pdf_path: str) -> list[dict]:
    """Return [{chapter, text}] using known page ranges."""
    reader = PdfReader(pdf_path)
    total = len(reader.pages)
    print(f"  {total} pages in PDF.")

    results = []
    for (chapter, start, end) in CHAPTER_RANGES:
        parts = []
        for idx in range(start, min(end, total)):
            raw = reader.pages[idx].extract_text() or ""
            raw = raw.strip()
            if raw and not is_junk_page(raw):
                parts.append(raw)
        text = " ".join(parts)
        word_count = len(text.split())
        print(f"  Chapter {chapter:>2}: {word_count:,} words  ({end - start} pages)")
        results.append({"chapter": chapter, "text": text})

    return results


def chunk_text(text: str) -> list[str]:
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + CHUNK_SIZE]))
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def embed_texts(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in response.data]


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


def delete_existing_vectors(index):
    """Delete all seed_ch* vectors from a previous run."""
    print("Deleting existing 'The Seed' vectors from Pinecone...")
    try:
        index.delete(delete_all=False, filter={"source": {"$eq": "pdf"}})
        print("  Deleted vectors with source=pdf.")
    except Exception:
        # Fallback: delete by known ID prefixes
        ids_to_delete = [f"seed_ch{ch}_{i}" for ch in range(0, 13) for i in range(0, 500)]
        # Delete in batches of 100
        for i in range(0, len(ids_to_delete), 100):
            try:
                index.delete(ids=ids_to_delete[i:i+100])
            except Exception:
                pass
        print("  Deleted by ID prefix.")


def run(pdf_path: str, delete_first: bool = False):
    print(f"\nReading '{pdf_path}' ...")
    chapters = extract_chapter_texts(pdf_path)

    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    index = get_pinecone_index()

    if delete_first:
        delete_existing_vectors(index)

    vector_buffer = []
    total_chunks = 0
    global_idx = 0

    for seg in chapters:
        chapter = seg["chapter"]
        source = f"{BOOK_TITLE}, Chapter {chapter}"
        chunks = chunk_text(seg["text"])

        for i in range(0, len(chunks), EMBED_BATCH):
            batch = chunks[i:i + EMBED_BATCH]
            embeddings = embed_texts(openai_client, batch)

            for text, embedding in zip(batch, embeddings):
                vector_buffer.append({
                    "id": f"seed_ch{chapter}_{global_idx}",
                    "values": embedding,
                    "metadata": {
                        "source": "pdf",
                        "title": source,
                        "url": "",
                        "chapter": chapter,
                        "chunk_index": global_idx,
                        "text": text,
                    }
                })
                global_idx += 1
                total_chunks += 1

            if len(vector_buffer) >= UPSERT_BATCH:
                index.upsert(vectors=vector_buffer)
                print(f"  Upserted {total_chunks} chunks so far...")
                vector_buffer = []

    if vector_buffer:
        index.upsert(vectors=vector_buffer)

    print(f"\nDone. {total_chunks} chunks from '{BOOK_TITLE}' upserted to Pinecone.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Embed a PDF book into Pinecone.")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--delete", action="store_true",
                        help="Delete existing PDF vectors before re-embedding")
    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Error: file not found: {args.pdf_path}")
        sys.exit(1)

    run(args.pdf_path, delete_first=args.delete)
