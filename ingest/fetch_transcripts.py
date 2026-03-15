"""
Fetch transcripts for all videos.
Skips videos with no captions. Saves to data/transcripts.json (resumable).
"""

import json
import os
import time
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
from tqdm import tqdm

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
VIDEOS_FILE = os.path.join(DATA_DIR, 'videos.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'transcripts.json')


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
    api = YouTubeTranscriptApi()

    for video in tqdm(videos, desc="Fetching transcripts"):
        video_id = video['video_id']

        if video_id in existing:
            continue

        try:
            fetched = api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
            full_text = ' '.join(seg.text for seg in fetched)
            results.append({
                'video_id': video_id,
                'title': video['title'],
                'url': f"https://www.youtube.com/watch?v={video_id}",
                'transcript': full_text
            })
        except (TranscriptsDisabled, NoTranscriptFound):
            skipped += 1
        except Exception as e:
            print(f"\nError on {video_id}: {e}")
            skipped += 1

        # Save progress every 50 videos
        if len(results) % 50 == 0:
            _save(results)

        time.sleep(0.3)  # gentle rate limiting

    _save(results)
    print(f"\nDone. {len(results)} transcripts saved, {skipped} skipped (no captions).")
    return results


def _save(results):
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    fetch_transcripts()
