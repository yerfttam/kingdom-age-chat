"""
Daily sync: check for new videos on the Kingdom Age YouTube channel,
fetch transcripts for any new ones, and embed them into Pinecone.

Safe to run repeatedly — skips videos already in videos.json,
transcripts.json, and embedded.json.
"""

import json
import os
import sys
import scrapetube
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
VIDEOS_FILE = os.path.join(DATA_DIR, 'videos.json')
TRANSCRIPTS_FILE = os.path.join(DATA_DIR, 'transcripts.json')
EMBEDDED_FILE = os.path.join(DATA_DIR, 'embedded.json')

CHANNEL_URL = "https://www.youtube.com/@kingdomage"


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def fetch_new_videos(existing_ids: set) -> list[dict]:
    """Fetch fresh video list from YouTube and return only new entries."""
    print(f"Fetching video list from {CHANNEL_URL} ...")
    raw = scrapetube.get_channel(channel_url=CHANNEL_URL)

    new_videos = []
    total_seen = 0
    for v in raw:
        total_seen += 1
        video_id = v.get("videoId")
        if video_id and video_id not in existing_ids:
            title = v.get("title", {}).get("runs", [{}])[0].get("text", "")
            new_videos.append({"video_id": video_id, "title": title})

    print(f"  Channel has {total_seen} total videos, {len(new_videos)} are new.")
    return new_videos


_ytt = YouTubeTranscriptApi()


def _fetch_transcript(video_id: str):
    try:
        transcript = _ytt.fetch(video_id)
        return " ".join(snippet.text for snippet in transcript if snippet.text)
    except Exception:
        return None


def fetch_transcripts_for(new_videos: list[dict], existing_transcripts: dict) -> list[dict]:
    new_transcripts = []
    skipped = 0

    for i, video in enumerate(new_videos, 1):
        video_id = video["video_id"]
        if video_id in existing_transcripts:
            continue

        print(f"  [{i}/{len(new_videos)}] Fetching transcript for {video_id} — {video['title'][:60]}")
        try:
            text = _fetch_transcript(video_id)
            if text:
                entry = {
                    "video_id": video_id,
                    "title": video["title"],
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "transcript": text,
                }
                new_transcripts.append(entry)
                existing_transcripts[video_id] = entry
            else:
                print(f"    No transcript available for {video_id}, skipping.")
                skipped += 1
        except Exception as e:
            print(f"    Error on {video_id}: {type(e).__name__}: {e}")
            skipped += 1

    print(f"  Fetched {len(new_transcripts)} new transcripts, {skipped} skipped.")
    return new_transcripts


def main():
    print("=== Kingdom Age Daily Sync ===\n")

    # Load existing data
    videos = load_json(VIDEOS_FILE, [])
    existing_video_ids = {v["video_id"] for v in videos}
    print(f"Existing videos: {len(existing_video_ids)}")

    transcripts = load_json(TRANSCRIPTS_FILE, [])
    existing_transcript_ids = {t["video_id"]: t for t in transcripts}
    print(f"Existing transcripts: {len(existing_transcript_ids)}")

    embedded_ids = set(load_json(EMBEDDED_FILE, []))
    print(f"Already embedded: {len(embedded_ids)}\n")

    # Step 1: Find new videos
    new_videos = fetch_new_videos(existing_video_ids)

    if not new_videos:
        print("\nNo new videos found. Nothing to do.")
        return

    # Save updated video list
    videos.extend(new_videos)
    save_json(VIDEOS_FILE, videos)
    print(f"Saved {len(new_videos)} new video(s) to videos.json\n")

    # Step 2: Fetch transcripts for new videos
    print("Fetching transcripts for new videos...")
    new_transcripts = fetch_transcripts_for(new_videos, existing_transcript_ids)

    if not new_transcripts:
        print("\nNo new transcripts to embed.")
        return

    # Save updated transcripts
    transcripts.extend(new_transcripts)
    save_json(TRANSCRIPTS_FILE, transcripts)
    print(f"Saved {len(new_transcripts)} new transcript(s) to transcripts.json\n")

    # Step 3: Embed new transcripts into Pinecone
    print("Embedding new transcripts into Pinecone...")
    sys.path.insert(0, os.path.dirname(__file__))
    from chunk_embed import chunk_and_embed
    chunk_and_embed(transcripts=new_transcripts)

    print(f"\n=== Sync complete. {len(new_videos)} new video(s) processed. ===")


if __name__ == "__main__":
    main()
