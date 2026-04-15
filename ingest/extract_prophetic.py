"""
Scan Kingdom Age video transcripts for prophetic content — visions and dreams.

For each video, asks the LLM: "Does this transcript contain a vision or dream?"
If yes, extracts the details faithfully with no interpretation added by the LLM.

What is captured per entry:
  - video_id, video_title, video_url, video_date (from title if parseable)
  - speaker (if identifiable)
  - entry_type: "vision" or "dream"
  - narrative: faithful description as told by the speaker
  - interpretation: ONLY if the speaker explicitly offered one in the video; null otherwise

State tracked in prophetic_scan_log (Postgres) — fully resumable.

Usage:
    .venv/bin/python3 ingest/extract_prophetic.py
    .venv/bin/python3 ingest/extract_prophetic.py --limit 10
    .venv/bin/python3 ingest/extract_prophetic.py --dry-run --limit 5
    .venv/bin/python3 ingest/extract_prophetic.py --concurrency 6
"""

import argparse
import asyncio
import json
import logging
import os
import random
import re
import sys

import anthropic
import psycopg2
import psycopg2.pool
from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_DIR         = os.path.join(os.path.dirname(__file__), '..', 'data')
TRANSCRIPTS_FILE = os.path.join(DATA_DIR, 'transcripts.json')

# ---------------------------------------------------------------------------
# Model & concurrency
# ---------------------------------------------------------------------------
MODEL         = "claude-sonnet-4-6"
CONCURRENCY   = 4
MAX_RETRIES   = 5
BASE_DELAY    = 2.0
LLM_TIMEOUT   = 120.0

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
os.makedirs(DATA_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(DATA_DIR, 'prophetic_extract.log')),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB pool
# ---------------------------------------------------------------------------
_db_pool = None


def _init_db_pool():
    global _db_pool
    _db_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2, maxconn=12,
        dsn=os.environ["DATABASE_URL"]
    )
    logger.info("DB pool initialised.")


def _get_conn():
    return _db_pool.getconn()


def _put_conn(conn):
    _db_pool.putconn(conn)


def _close_pool():
    global _db_pool
    if _db_pool:
        _db_pool.closeall()
        _db_pool = None


# ---------------------------------------------------------------------------
# DB helpers (sync, run via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _ensure_tables_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prophetic_entries (
                    id               SERIAL PRIMARY KEY,
                    video_id         TEXT NOT NULL,
                    video_title      TEXT NOT NULL,
                    video_url        TEXT NOT NULL,
                    video_date       DATE,
                    speaker          TEXT,
                    entry_type       TEXT NOT NULL CHECK (entry_type IN ('vision', 'dream')),
                    narrative        TEXT NOT NULL,
                    interpretation   TEXT,
                    created_at       TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS prophetic_entries_video_idx
                    ON prophetic_entries (video_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS prophetic_entries_type_idx
                    ON prophetic_entries (entry_type)
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS prophetic_scan_log (
                    id           SERIAL PRIMARY KEY,
                    video_id     TEXT UNIQUE NOT NULL,
                    scanned_at   TIMESTAMPTZ DEFAULT NOW(),
                    found_count  INTEGER DEFAULT 0
                )
            """)
        conn.commit()
        logger.info("Tables ready.")
    finally:
        _put_conn(conn)


def _get_scanned_ids_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT video_id FROM prophetic_scan_log")
            return {r[0] for r in cur.fetchall()}
    finally:
        _put_conn(conn)


def _insert_entries_sync(video_id, video_title, video_url, video_date, entries):
    """Insert extracted prophetic entries and log the scan."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            for e in entries:
                cur.execute("""
                    INSERT INTO prophetic_entries
                        (video_id, video_title, video_url, video_date,
                         speaker, entry_type, narrative, interpretation)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    video_id,
                    video_title,
                    video_url,
                    video_date,
                    e.get('speaker'),
                    e['type'],
                    e['narrative'],
                    e.get('interpretation'),
                ))
            cur.execute("""
                INSERT INTO prophetic_scan_log (video_id, found_count)
                VALUES (%s, %s)
                ON CONFLICT (video_id) DO UPDATE SET
                    scanned_at  = NOW(),
                    found_count = EXCLUDED.found_count
            """, (video_id, len(entries)))
        conn.commit()
    finally:
        _put_conn(conn)


def _get_stats_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM prophetic_scan_log")
            scanned = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM prophetic_entries")
            total_entries = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM prophetic_entries WHERE entry_type = 'vision'")
            visions = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM prophetic_entries WHERE entry_type = 'dream'")
            dreams = cur.fetchone()[0]
        return {
            "scanned": scanned,
            "total_entries": total_entries,
            "visions": visions,
            "dreams": dreams,
        }
    finally:
        _put_conn(conn)


# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a faithful scribe for the Kingdom Age prophetic archive.
Kingdom Age is a Christian ministry. During their meetings, teachers and community
members sometimes share visions or dreams they have received from God.

Your ONLY job is to determine whether the transcript below contains a vision or dream,
and if so, to record exactly what was described — faithfully, precisely, without adding
any interpretation of your own.

DEFINITIONS:
- A VISION is a supernatural visual or spiritual experience described by the speaker —
  something they "saw" in the spirit, during prayer, or in a waking spiritual experience.
- A DREAM is a supernatural experience the speaker received during sleep.
- Do NOT include general theological metaphors, sermon illustrations, or Scripture imagery
  unless the speaker is explicitly describing a personal vision or dream they received.

EXTRACTION RULES:
1. Narrative: record the vision/dream exactly as the speaker described it. Use their own
   words as closely as possible. Do not summarize or editorialize.
2. Speaker: identify who shared the vision/dream if they are named or clearly identifiable
   from context. Use null if unknown.
3. Date: do not infer a date — it will be extracted from metadata separately.
4. Interpretation: ONLY include this field if the speaker explicitly offered their own
   interpretation or said "this means..." / "I believe this represents..." etc.
   If no interpretation was offered, return null. NEVER provide your own interpretation.
5. If there are multiple visions/dreams in the transcript, return each as a separate entry.
6. If there is NO vision or dream in the transcript, return an empty array [].

Return ONLY a valid JSON array. Each entry must have:
  {
    "type": "vision" or "dream",
    "speaker": "Name" or null,
    "narrative": "...",
    "interpretation": "..." or null
  }

No prose, no markdown fences, no explanation — only the JSON array.
"""


# ---------------------------------------------------------------------------
# Retry wrapper
# ---------------------------------------------------------------------------

RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.APITimeoutError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
)


async def _with_retry(coro_fn, description="call"):
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await coro_fn()
        except RETRYABLE as e:
            if attempt == MAX_RETRIES:
                logger.error("  %s: giving up after %d attempts: %s",
                             description, MAX_RETRIES + 1, e)
                return None
            delay = BASE_DELAY * (2 ** attempt) + random.uniform(0, 1)
            logger.warning("  %s: %s — retry %d/%d in %.0fs",
                           description, type(e).__name__,
                           attempt + 1, MAX_RETRIES, delay)
            await asyncio.sleep(delay)
        except Exception as e:
            logger.error("  %s: non-retryable error: %s: %s",
                         description, type(e).__name__, e)
            return None
    return None


# ---------------------------------------------------------------------------
# Async LLM call
# ---------------------------------------------------------------------------

async def extract_prophetic(client, semaphore, src):
    """Ask the LLM if this transcript has prophetic content. Returns list of entries or None."""
    user_msg = "Video: {}\nTitle: {}\nURL: {}\n\nTranscript:\n{}".format(
        src['video_id'], src['title'], src['url'], src['text']
    )

    async def _call():
        async with semaphore:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
                timeout=LLM_TIMEOUT,
            )
        return _parse_json_array(response.content[0].text)

    return await _with_retry(_call, description=src['video_id'])


def _parse_json_array(text):
    text = re.sub(r'^```[a-z]*\n?', '', text.strip(), flags=re.MULTILINE)
    text = re.sub(r'\n?```$', '', text.strip(), flags=re.MULTILINE)
    text = text.strip()
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if not match:
        return []
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        logger.warning("JSON parse error: %s", e)
        return []


def _parse_date_from_title(title):
    """Try to extract a date from a video title like '01-14-2025' or '01.14.2025'."""
    match = re.search(r'(\d{2})[-.](\d{2})[-.](\d{4})', title)
    if match:
        m, d, y = match.groups()
        try:
            from datetime import date
            return date(int(y), int(m), int(d))
        except ValueError:
            pass
    return None


def _validate_entry(e):
    return (
        isinstance(e, dict)
        and e.get('type') in ('vision', 'dream')
        and isinstance(e.get('narrative'), str)
        and len(e.get('narrative', '')) > 20
    )


# ---------------------------------------------------------------------------
# Source loader
# ---------------------------------------------------------------------------

def load_video_sources():
    if not os.path.exists(TRANSCRIPTS_FILE):
        logger.error("Transcripts file not found: %s", TRANSCRIPTS_FILE)
        return []
    with open(TRANSCRIPTS_FILE) as f:
        transcripts = json.load(f)
    return [
        {
            "video_id": t['video_id'],
            "title":    t.get('title', t['video_id']),
            "url":      t.get('url', 'https://www.youtube.com/watch?v={}'.format(t['video_id'])),
            "text":     t.get('transcript', ''),
        }
        for t in transcripts
        if t.get('transcript', '').strip()
    ]


# ---------------------------------------------------------------------------
# Main ingest loop
# ---------------------------------------------------------------------------

async def run_extract(sources, dry_run=False, limit=None, concurrency=CONCURRENCY):
    client = AsyncAnthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        max_retries=0,
    )
    semaphore = asyncio.Semaphore(concurrency)

    if not dry_run:
        await asyncio.to_thread(_ensure_tables_sync)
        done = await asyncio.to_thread(_get_scanned_ids_sync)
    else:
        done = set()

    pending = [s for s in sources if s['video_id'] not in done]
    if limit:
        pending = pending[:limit]

    total_videos   = len(sources)
    already_done   = len(done)
    logger.info("%d videos to scan (%d already done, %d total).",
                len(pending), already_done, total_videos)

    if not pending:
        return

    found_total = 0
    pbar = tqdm(total=len(pending), desc="Scanning for prophetic content")

    async def process_one(src):
        nonlocal found_total
        vid = src['video_id']
        entries_raw = await extract_prophetic(client, semaphore, src)

        if entries_raw is None:
            logger.warning("  %s: LLM error — will retry next run", vid)
            pbar.update(1)
            return

        entries = [e for e in entries_raw if _validate_entry(e)]

        if entries:
            logger.info("  %s: %d entry/entries found — %s",
                        vid, len(entries), [e['type'] for e in entries])
            found_total += len(entries)
        else:
            logger.debug("  %s: no prophetic content", vid)

        if dry_run:
            if entries:
                print("\n--- {} ---".format(src['title']))
                for e in entries:
                    print("  Type:    {}".format(e['type']))
                    print("  Speaker: {}".format(e.get('speaker', 'unknown')))
                    print("  Narrative: {}...".format(e['narrative'][:200]))
                    if e.get('interpretation'):
                        print("  Interpretation: {}".format(e['interpretation'][:200]))
            pbar.update(1)
            return

        video_date = _parse_date_from_title(src['title'])
        await asyncio.to_thread(
            _insert_entries_sync,
            vid, src['title'], src['url'], video_date, entries
        )
        pbar.update(1)

    await asyncio.gather(*[process_one(src) for src in pending])
    pbar.close()

    logger.info("Scan complete. Videos scanned: %d, Prophetic entries found: %d",
                len(pending), found_total)

    if not dry_run:
        stats = await asyncio.to_thread(_get_stats_sync)
        logger.info("DB totals — Scanned: %d / %d videos | Entries: %d (%d visions, %d dreams)",
                    stats['scanned'], total_videos,
                    stats['total_entries'], stats['visions'], stats['dreams'])


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Scan transcripts for prophetic content (visions and dreams)."
    )
    parser.add_argument('--limit',       type=int, help='Max videos to process')
    parser.add_argument('--concurrency', type=int, default=CONCURRENCY,
                        help='Max concurrent API calls (default: {})'.format(CONCURRENCY))
    parser.add_argument('--dry-run',     action='store_true',
                        help='Print results without writing to DB')
    args = parser.parse_args()

    sources = load_video_sources()
    if not sources:
        logger.error("No transcripts found. Run fetch_transcripts.py first.")
        sys.exit(1)

    if not args.dry_run:
        _init_db_pool()

    try:
        asyncio.run(run_extract(
            sources,
            dry_run=args.dry_run,
            limit=args.limit,
            concurrency=args.concurrency,
        ))
    finally:
        _close_pool()


if __name__ == "__main__":
    main()
