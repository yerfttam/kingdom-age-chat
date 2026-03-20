"""One-time script to upsert a Table of Contents chunk for The Seed into Pinecone."""
import os
from openai import OpenAI
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

TOC_TEXT = """The Seed by Immanuel Sun — Table of Contents:
Chapter 1: The Gospel of the Kingdom of God
Chapter 2: From the Image to the Likeness of God
Chapter 3: The Fall of Man
Chapter 4: The Cross
Chapter 5: Sonship
Chapter 6: Spiritual Life
Chapter 7: Spiritual Fruit and Spiritual Gifts
Chapter 8: Three Compartments of Man and the Work of Sanctification
Chapter 9: Disciplined into Holiness
Chapter 10: The Order of Melchizedek
Chapter 11: Ministry of the New Covenant
Chapter 12: The Body of Christ and Our Roles in It"""

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index(os.environ.get("PINECONE_INDEX_NAME", "kingdom-age"))

embedding = openai_client.embeddings.create(
    model="text-embedding-3-small",
    input=TOC_TEXT
).data[0].embedding

index.upsert(vectors=[{
    "id": "seed_toc_0",
    "values": embedding,
    "metadata": {
        "source": "pdf",
        "title": "The Seed — Table of Contents",
        "url": "",
        "chapter": 0,
        "chunk_index": 0,
        "text": TOC_TEXT,
    }
}])

print("TOC chunk upserted successfully.")
print(TOC_TEXT)
