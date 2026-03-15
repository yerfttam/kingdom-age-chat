"""
Full ingestion pipeline — run this to index the entire channel.

Usage:
    python ingest/run.py              # full run
    python ingest/run.py --step videos      # only fetch video list
    python ingest/run.py --step transcripts # only fetch transcripts
    python ingest/run.py --step embed       # only chunk/embed/upsert
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fetch_videos import fetch_videos
from fetch_transcripts import fetch_transcripts
from chunk_embed import chunk_and_embed


def main(step: str = "all"):
    if step in ("all", "videos"):
        print("=== Step 1: Fetch video list ===")
        videos = fetch_videos()
    else:
        videos = None

    if step in ("all", "transcripts"):
        print("\n=== Step 2: Fetch transcripts ===")
        fetch_transcripts(videos)

    if step in ("all", "embed"):
        print("\n=== Step 3: Chunk, embed, upsert ===")
        chunk_and_embed()

    print("\nPipeline complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--step", default="all", choices=["all", "videos", "transcripts", "embed"])
    args = parser.parse_args()
    main(args.step)
