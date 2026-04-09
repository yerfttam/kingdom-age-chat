"""
Build the Kingdom Age wiki from existing source content.

First pass (Sonnet): reads each source, generates wiki pages, writes to DB.
Refine pass (Opus):  reads each wiki page, improves it in place.

State is tracked in data/wiki_ingest.json so the script is fully resumable.

Usage:
    # First pass — all sources
    .venv/bin/python3 ingest/build_wiki.py

    # Limit to N sources (for validation / cost testing)
    .venv/bin/python3 ingest/build_wiki.py --limit 5

    # Specific source types
    .venv/bin/python3 ingest/build_wiki.py --source videos
    .venv/bin/python3 ingest/build_wiki.py --source pdf
    .venv/bin/python3 ingest/build_wiki.py --source wordpress --csv data/wordpress_posts.csv

    # Dry run — prints pages without writing to DB
    .venv/bin/python3 ingest/build_wiki.py --dry-run --limit 3

    # Refine pass — Opus improves all existing wiki pages
    .venv/bin/python3 ingest/build_wiki.py --refine
    .venv/bin/python3 ingest/build_wiki.py --refine --limit 10
"""

import argparse
import csv
import html
import json
import os
import re
import sys
import time

import psycopg2
from anthropic import Anthropic
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_DIR         = os.path.join(os.path.dirname(__file__), '..', 'data')
TRANSCRIPTS_FILE = os.path.join(DATA_DIR, 'transcripts.json')
WIKI_STATE_FILE  = os.path.join(DATA_DIR, 'wiki_ingest.json')
SCHEMA_FILE      = os.path.join(os.path.dirname(__file__), 'wiki_schema.md')

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
INGEST_MODEL = "claude-sonnet-4-6"   # first pass — volume
REFINE_MODEL = "claude-opus-4-6"     # second pass — quality

# ---------------------------------------------------------------------------
# PDF chapter ranges (from embed_pdf.py — kept in sync manually)
# ---------------------------------------------------------------------------
PDF_CHAPTER_RANGES = [
    (1,  10,  36),
    (2,  36,  60),
    (3,  60,  86),
    (4,  86, 114),
    (5, 114, 158),
    (6, 158, 182),
    (7, 182, 206),
    (8, 206, 224),
    (9, 224, 248),
    (10, 248, 284),
    (11, 284, 306),
    (12, 306, 326),
]

JUNK_THRESHOLD = 0.4


# ---------------------------------------------------------------------------
# State tracking
# ---------------------------------------------------------------------------

def load_state():
    if os.path.exists(WIKI_STATE_FILE):
        with open(WIKI_STATE_FILE) as f:
            return json.load(f)
    return {"videos": [], "pdf_chapters": [], "wordpress_posts": []}


def save_state(state):
    with open(WIKI_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ensure_tables(conn):
    """Create wiki tables if they don't exist (mirrors api/db.py init_db)."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS wiki_pages (
                id             SERIAL PRIMARY KEY,
                slug           TEXT UNIQUE NOT NULL,
                title          TEXT NOT NULL,
                category       TEXT NOT NULL,
                body           TEXT NOT NULL,
                sources        JSONB DEFAULT '[]',
                tags           TEXT[] DEFAULT '{}',
                search_vector  TSVECTOR,
                created_at     TIMESTAMPTZ DEFAULT NOW(),
                updated_at     TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS wiki_pages_search_idx
                ON wiki_pages USING GIN(search_vector)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS wiki_pages_category_idx
                ON wiki_pages (category)
        """)
        cur.execute("""
            CREATE OR REPLACE FUNCTION wiki_pages_search_vector_update()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.search_vector := to_tsvector('english', NEW.title || ' ' || NEW.body);
                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        """)
        cur.execute("DROP TRIGGER IF EXISTS wiki_pages_search_vector_trigger ON wiki_pages")
        cur.execute("""
            CREATE TRIGGER wiki_pages_search_vector_trigger
            BEFORE INSERT OR UPDATE ON wiki_pages
            FOR EACH ROW EXECUTE FUNCTION wiki_pages_search_vector_update()
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS wiki_ingest_log (
                id           SERIAL PRIMARY KEY,
                source_id    TEXT UNIQUE NOT NULL,
                source_type  TEXT NOT NULL,
                ingested_at  TIMESTAMPTZ DEFAULT NOW(),
                page_slugs   TEXT[] DEFAULT '{}'
            )
        """)
    conn.commit()
    print("DB tables ready.")


def upsert_page(cur, page, dry_run=False):
    """Insert or update a wiki page. On slug conflict, merge sources and update body."""
    slug     = page['slug']
    title    = page['title']
    category = page['category']
    body     = page['body']
    sources  = json.dumps(page.get('sources', []))
    tags     = page.get('tags', [])

    if dry_run:
        print(f"\n  [{category}] {title} ({slug})")
        print(f"  Tags: {', '.join(tags)}")
        print(f"  Sources: {page.get('sources', [])}")
        print(f"  Body preview: {body[:300].strip()}...")
        return

    cur.execute("""
        INSERT INTO wiki_pages (slug, title, category, body, sources, tags)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
        ON CONFLICT (slug) DO UPDATE SET
            title      = EXCLUDED.title,
            body       = EXCLUDED.body,
            sources    = (
                SELECT jsonb_agg(DISTINCT elem)
                FROM jsonb_array_elements(
                    wiki_pages.sources || EXCLUDED.sources
                ) AS elem
            ),
            tags       = EXCLUDED.tags,
            updated_at = NOW()
    """, (slug, title, category, body, sources, tags))


def log_ingest(cur, source_id, source_type, page_slugs):
    cur.execute("""
        INSERT INTO wiki_ingest_log (source_id, source_type, page_slugs)
        VALUES (%s, %s, %s)
        ON CONFLICT (source_id) DO UPDATE SET
            ingested_at = NOW(),
            page_slugs  = EXCLUDED.page_slugs
    """, (source_id, source_type, page_slugs))


def fetch_all_wiki_pages(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT slug, title, category, body, sources, tags FROM wiki_pages ORDER BY id")
        rows = cur.fetchall()
    pages = []
    for row in rows:
        pages.append({
            "slug":     row[0],
            "title":    row[1],
            "category": row[2],
            "body":     row[3],
            "sources":  row[4] if row[4] else [],
            "tags":     row[5] if row[5] else [],
        })
    return pages


def update_page_body(cur, slug, body):
    cur.execute(
        "UPDATE wiki_pages SET body = %s, updated_at = NOW() WHERE slug = %s",
        (body, slug)
    )


# ---------------------------------------------------------------------------
# LLM calls
# ---------------------------------------------------------------------------

def load_schema():
    with open(SCHEMA_FILE) as f:
        return f.read()


INGEST_SYSTEM = """\
You are building a knowledge wiki for Kingdom Age, a Christian ministry led by Immanuel Sun.

Your job: read the source document below and extract wiki pages from it.

Follow the schema exactly:

{schema}

Return ONLY a valid JSON array of page objects — no prose, no markdown fences, no explanation.
Each object must have: slug, title, category, body, tags, sources.

If the source has no substantive content worth adding to the wiki, return [].
"""

REFINE_SYSTEM = """\
You are improving an existing Kingdom Age wiki page. Kingdom Age is a Christian ministry led by Immanuel Sun.

Your job: rewrite the page body to improve:
- Theological precision — preserve Immanuel Sun's specific meanings (seed, kingdom, organic, sonship are not generic terms)
- Clarity and concision — remove redundancy, tighten prose
- Cross-references — add [[slug]] links where relevant concepts exist
- Key Points — ensure each bullet is distinct and non-redundant
- Prophetic pages — ensure the vision narrative is preserved faithfully before the theological interpretation

Do NOT add new factual claims that aren't supported by the existing content.
Do NOT change the slug, title, category, tags, or sources fields.
Return ONLY the improved body text (markdown) — nothing else.

Schema for reference:

{schema}
"""


def call_ingest(client, schema, source_type, source_id, title, url, text):
    """Call Sonnet to extract wiki pages from a source."""
    system = INGEST_SYSTEM.format(schema=schema)

    source_header = "Source type: {}\nTitle: {}\nURL: {}\nSource ID: {}\n\n{}".format(
        source_type, title, url, source_id, text
    )

    try:
        response = client.messages.create(
            model=INGEST_MODEL,
            max_tokens=8096,
            system=system,
            messages=[{"role": "user", "content": source_header}]
        )
        return parse_json_array(response.content[0].text)
    except Exception as e:
        print(f"    LLM error for {source_id}: {e}")
        return None


def call_refine(client, schema, page):
    """Call Opus to improve an existing wiki page body."""
    system = REFINE_SYSTEM.format(schema=schema)

    user = "Existing page:\n\nSlug: {}\nTitle: {}\nCategory: {}\nTags: {}\nSources: {}\n\n{}".format(
        page['slug'],
        page['title'],
        page['category'],
        ', '.join(page['tags']),
        ', '.join(page['sources']) if isinstance(page['sources'], list) else str(page['sources']),
        page['body']
    )

    try:
        response = client.messages.create(
            model=REFINE_MODEL,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"    LLM error refining {page['slug']}: {e}")
        return None


def parse_json_array(text):
    """Extract a JSON array from LLM output, tolerating markdown fences."""
    # Strip markdown code fences if present
    text = re.sub(r'^```[a-z]*\n?', '', text.strip(), flags=re.MULTILINE)
    text = re.sub(r'\n?```$', '', text.strip(), flags=re.MULTILINE)
    text = text.strip()

    # Find the outermost [ ... ]
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        print(f"    JSON parse error: {e}")
        return []


# ---------------------------------------------------------------------------
# Source loaders
# ---------------------------------------------------------------------------

def load_video_sources(limit=None):
    """Load transcripts from data/transcripts.json."""
    if not os.path.exists(TRANSCRIPTS_FILE):
        print(f"Transcripts file not found: {TRANSCRIPTS_FILE}")
        return []
    with open(TRANSCRIPTS_FILE) as f:
        transcripts = json.load(f)
    if limit:
        transcripts = transcripts[:limit]
    return [
        {
            "source_id":   t['video_id'],
            "source_type": "video",
            "title":       t.get('title', t['video_id']),
            "url":         t.get('url', ''),
            "text":        t.get('transcript', ''),
        }
        for t in transcripts
        if t.get('transcript', '').strip()
    ]


def load_pdf_sources(pdf_path):
    """Extract chapter texts from The Seed PDF."""
    try:
        from pypdf import PdfReader
    except ImportError:
        print("pypdf not installed. Run: .venv/bin/pip install pypdf")
        return []

    if not os.path.exists(pdf_path):
        print(f"PDF not found: {pdf_path}")
        return []

    reader = PdfReader(pdf_path)
    total  = len(reader.pages)
    sources = []

    for (chapter, start, end) in PDF_CHAPTER_RANGES:
        parts = []
        for idx in range(start, min(end, total)):
            raw = reader.pages[idx].extract_text() or ""
            raw = raw.strip()
            if raw and not _is_junk_page(raw):
                parts.append(raw)
        text = " ".join(parts)
        if text.strip():
            sources.append({
                "source_id":   "seed_ch{}".format(chapter),
                "source_type": "pdf",
                "title":       "The Seed, Chapter {}".format(chapter),
                "url":         "",
                "text":        text,
            })

    return sources


def load_wordpress_sources(csv_path, limit=None):
    """Load posts from a WordPress CSV export."""
    if not csv_path or not os.path.exists(csv_path):
        print(f"WordPress CSV not found: {csv_path}")
        return []

    posts = []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            post_id = row.get('ID', '').strip()
            title   = row.get('post_title', '').strip()
            content = row.get('post_content', '').strip()
            guid    = row.get('guid', '').strip()

            if not post_id or not title or not content:
                continue

            cleaned = _clean_html(content)
            if len(cleaned.split()) < 30:
                continue

            url = guid if guid.startswith('http') else ''
            posts.append({
                "source_id":   "wp_{}".format(post_id),
                "source_type": "wordpress",
                "title":       html.unescape(title),
                "url":         url,
                "text":        cleaned,
            })

    if limit:
        posts = posts[:limit]
    return posts


def _is_junk_page(text):
    words = text.split()
    if not words:
        return True
    junk = sum(1 for w in words if set(w) <= set('_-0123456789 '))
    return (junk / len(words)) > JUNK_THRESHOLD


def _clean_html(raw):
    text = re.sub(r'<!--.*?-->', '', raw, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ---------------------------------------------------------------------------
# First pass — ingest
# ---------------------------------------------------------------------------

def run_ingest(sources, state, state_key, dry_run=False):
    client  = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    schema  = load_schema()
    done    = set(state.get(state_key, []))
    pending = [s for s in sources if s['source_id'] not in done]

    print(f"\n{len(pending)} {state_key} to process ({len(done)} already done).")

    if not pending:
        return

    conn = None if dry_run else get_db_conn()

    if conn:
        ensure_tables(conn)

    try:
        for src in tqdm(pending, desc="Building wiki"):
            sid = src['source_id']
            pages = call_ingest(
                client, schema,
                src['source_type'], sid,
                src['title'], src['url'], src['text']
            )

            llm_failed = pages is None
            if llm_failed:
                tqdm.write(f"  {sid}: LLM error — skipping (will retry next run)")
                time.sleep(0.5)
                continue
            elif not pages:
                tqdm.write(f"  {sid}: no pages extracted")
            else:
                tqdm.write(f"  {sid}: {len(pages)} page(s) — {[p.get('slug','?') for p in pages]}")

            if not dry_run and conn:
                slugs = []
                with conn.cursor() as cur:
                    for page in pages:
                        if not _valid_page(page):
                            tqdm.write(f"    Skipping malformed page: {page.get('slug', '?')}")
                            continue
                        upsert_page(cur, page)
                        slugs.append(page['slug'])
                    log_ingest(cur, sid, src['source_type'], slugs)
                conn.commit()

            done.add(sid)
            state[state_key] = list(done)
            save_state(state)

            # Brief pause to avoid rate limiting
            time.sleep(0.5)

    finally:
        if conn:
            conn.close()


def _valid_page(page):
    required = ['slug', 'title', 'category', 'body']
    return all(page.get(k) for k in required)


# ---------------------------------------------------------------------------
# Second pass — refine with Opus
# ---------------------------------------------------------------------------

def run_refine(limit=None, dry_run=False):
    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    schema = load_schema()

    conn   = get_db_conn()
    pages  = fetch_all_wiki_pages(conn)

    if limit:
        pages = pages[:limit]

    print(f"\nRefining {len(pages)} wiki pages with {REFINE_MODEL}...")

    try:
        for page in tqdm(pages, desc="Refining wiki"):
            improved_body = call_refine(client, schema, page)

            if not improved_body:
                tqdm.write(f"  {page['slug']}: skipped (no response)")
                continue

            tqdm.write(f"  {page['slug']}: refined ({len(improved_body)} chars)")

            if not dry_run:
                with conn.cursor() as cur:
                    update_page_body(cur, page['slug'], improved_body)
                conn.commit()

            time.sleep(1.0)  # Opus rate limits are tighter

    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Build or refine the Kingdom Age wiki.")
    parser.add_argument('--source',  choices=['videos', 'pdf', 'wordpress', 'all'], default='all')
    parser.add_argument('--csv',     help='Path to WordPress CSV export')
    parser.add_argument('--pdf',     default='The Seed/the-seed_print_final_10-22-2022.pdf',
                        help='Path to The Seed PDF')
    parser.add_argument('--limit',   type=int, help='Max sources (or pages for --refine) to process')
    parser.add_argument('--dry-run', action='store_true', help='Print pages without writing to DB')
    parser.add_argument('--refine',  action='store_true', help='Run Opus refine pass on existing wiki pages')
    args = parser.parse_args()

    if args.refine:
        run_refine(limit=args.limit, dry_run=args.dry_run)
        return

    state = load_state()

    if args.source in ('videos', 'all'):
        limit = args.limit if args.source == 'videos' else None
        sources = load_video_sources(limit=limit)
        run_ingest(sources, state, 'videos', dry_run=args.dry_run)

    if args.source in ('pdf', 'all'):
        pdf_path = os.path.join(os.path.dirname(__file__), '..', args.pdf)
        sources  = load_pdf_sources(pdf_path)
        if args.limit and args.source == 'pdf':
            sources = sources[:args.limit]
        run_ingest(sources, state, 'pdf_chapters', dry_run=args.dry_run)

    if args.source in ('wordpress', 'all'):
        limit   = args.limit if args.source == 'wordpress' else None
        sources = load_wordpress_sources(args.csv, limit=limit)
        run_ingest(sources, state, 'wordpress_posts', dry_run=args.dry_run)

    print("\nDone.")


if __name__ == "__main__":
    main()
