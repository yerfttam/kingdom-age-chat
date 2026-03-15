"""
Fetch all video IDs and metadata from a YouTube channel.
Saves results to data/videos.json (resumable).
"""

import json
import os
import scrapetube

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_FILE = os.path.join(DATA_DIR, 'videos.json')

CHANNEL_URL = "https://www.youtube.com/@kingdomage"


def fetch_videos(channel_url: str = CHANNEL_URL) -> list[dict]:
    os.makedirs(DATA_DIR, exist_ok=True)

    if os.path.exists(OUTPUT_FILE):
        print(f"Found existing {OUTPUT_FILE}, loading...")
        with open(OUTPUT_FILE) as f:
            videos = json.load(f)
        print(f"Loaded {len(videos)} videos from cache.")
        return videos

    print(f"Fetching all videos from {channel_url} ...")
    raw = scrapetube.get_channel(channel_url=channel_url)

    videos = []
    for v in raw:
        video_id = v.get("videoId")
        title = v.get("title", {}).get("runs", [{}])[0].get("text", "")
        videos.append({"video_id": video_id, "title": title})
        if len(videos) % 100 == 0:
            print(f"  {len(videos)} videos found...")

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(videos, f, indent=2)

    print(f"Done. {len(videos)} videos saved to {OUTPUT_FILE}")
    return videos


if __name__ == "__main__":
    fetch_videos()
