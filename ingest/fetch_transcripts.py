"""
Fetch transcripts for all videos.
Skips videos with no captions. Saves to data/transcripts.json (resumable).
Handles YouTube rate limiting with exponential backoff.
"""

import json
import os
import time
import http.cookiejar
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled, NoTranscriptFound,
    RequestBlocked, IpBlocked, VideoUnavailable
)
from tqdm import tqdm

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
VIDEOS_FILE = os.path.join(DATA_DIR, 'videos.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'transcripts.json')
COOKIES_FILE = os.path.join(DATA_DIR, 'cookies.txt')

DELAY = 1.5          # seconds between requests
SAVE_EVERY = 20      # save progress every N successful fetches
MAX_RETRIES = 4      # retries on rate limit


def fetch_one(api, video_id: str, languages: list) -> list:
    """Fetch transcript with exponential backoff on rate limit."""
    delay = 30
    for attempt in range(MAX_RETRIES):
        try:
            return api.fetch(video_id, languages=languages)
        except (RequestBlocked, IpBlocked):
            if attempt == MAX_RETRIES - 1:
                raise
            print(f"\n  Rate limited. Waiting {delay}s before retry ({attempt + 1}/{MAX_RETRIES})...")
            time.sleep(delay)
            delay *= 2
    return []


def fetch_transcripts(videos: list[dict] = None) -> list[dict]:
    if videos is None:
        with open(VIDEOS_FILE) as f:
            videos = json.load(f)

    # Load existing progress
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            saved = json.load(f)
        existing = {r['video_id']: r for r in saved}
        print(f"Resuming — {len(existing)} transcripts already fetched.")

    results = list(existing.values())
    skipped = 0
    new_since_save = 0

    # Load cookies + browser headers to bypass bot detection
    http_client = None
    if os.path.exists(COOKIES_FILE):
        jar = http.cookiejar.MozillaCookieJar()
        jar.load(COOKIES_FILE, ignore_discard=True, ignore_expires=True)
        cookies = {c.name: c.value for c in jar}
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        http_client = httpx.Client(cookies=cookies, headers=headers)
        print(f"Using cookies + browser headers ({len(cookies)} cookies loaded)")

    api = YouTubeTranscriptApi(http_client=http_client)

    for video in tqdm(videos, desc="Fetching transcripts"):
        video_id = video['video_id']

        if video_id in existing:
            continue

        try:
            fetched = fetch_one(api, video_id, languages=['en', 'en-US', 'en-GB'])
            full_text = ' '.join(seg.text for seg in fetched)
            results.append({
                'video_id': video_id,
                'title': video['title'],
                'url': f"https://www.youtube.com/watch?v={video_id}",
                'transcript': full_text
            })
            existing[video_id] = results[-1]
            new_since_save += 1

        except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable):
            skipped += 1
        except (RequestBlocked, IpBlocked) as e:
            print(f"\n  Giving up on {video_id} after {MAX_RETRIES} retries (IP blocked).")
            skipped += 1
        except Exception as e:
            print(f"\n  Error on {video_id}: {type(e).__name__}: {e}")
            skipped += 1

        if new_since_save >= SAVE_EVERY:
            _save(results)
            new_since_save = 0

        time.sleep(DELAY)

    _save(results)
    print(f"\nDone. {len(results)} transcripts saved, {skipped} skipped.")
    return results


def _save(results):
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    fetch_transcripts()
