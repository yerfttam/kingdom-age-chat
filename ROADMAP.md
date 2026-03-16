# Kingdom Age Chat — Roadmap

## Content Expansion

### ✅ 1. Add kingdomage.org WordPress content *(completed 2026-03-16)*
- Exported 2,336 posts/pages from WordPress database via Flywheel phpMyAdmin
- Built `ingest/embed_wordpress.py` — strips HTML, chunks, embeds, upserts to Pinecone
- 825 posts embedded (1,511 skipped — too short/empty)
- Chunks tagged with `source: "wordpress"` metadata

### 2. Automate WordPress content sync
- Currently requires manual SQL export from Flywheel phpMyAdmin every time
- Options: schedule a DB export via Flywheel, or restore WordPress admin access and use the REST API
- Goal: daily sync similar to YouTube (`ingest/daily_sync.py`) so new posts appear automatically

### 2. Add the Bible as content
- Ingest full Bible text (ESV or KJV — confirm with ministry)
- Tag chunks with `source: "bible"`, `book`, `chapter`, `verse` metadata
- Allows the system to answer questions grounded in scripture, not just KA teachings
- Consider chunking by passage/pericope rather than fixed word count

---

## RAG Quality

### 3. Cohere reranking *(Step 4 of original plan)*
- After diversified retrieval (80 chunks, 2/video cap), re-score with Cohere rerank API
- Keep top 12–15 chunks — improves precision without sacrificing recall
- Estimated effort: small (1 API call added to `retrieve()`)

### 4. Re-embed with `text-embedding-3-large` *(Step 5 of original plan)*
- Current model: `text-embedding-3-small`
- Larger model produces higher-quality vectors, better semantic matching
- Requires full re-ingest of all ~50k vectors (~2 hrs)
- Do after Cohere reranking to validate it's worth the effort

---

## UX

*(nothing here yet)*

---

## Accounts & Personalization

### 5. Database — Supabase (PostgreSQL) *(prerequisite for everything below)*
- Set up Supabase project — provides PostgreSQL + Auth + table viewer + Python client
- Tables: `users`, `conversations`, `messages`, `queries`
- Enables persistent storage for auth, query history, and personalization

### 6. Google OAuth login *(Phase 1)*
- Google login/logout via Supabase Auth (single toggle in Supabase dashboard)
- Store user profile: email, name, avatar from Google
- JWT-based session — frontend stores token, sends with API requests
- Protected routes: logged-in users get richer experience, anonymous users still work

### 7. Persistent conversation history *(Phase 1)*
- Store conversations and messages in Supabase per user
- Conversation history survives browser refresh and device changes
- "New Chat" button starts a fresh conversation
- Optional: conversation list / history sidebar

### 8. Query logging per user *(Phase 1)*
- Log every query: user, question, model, timestamp, response time, num sources
- Admin reporting endpoint: most popular topics, query volume, active users
- CSV export for offline analysis

### 9. User personalization *(Phase 2)*
- Build a user profile from query history: topics they explore, depth of knowledge, role (pastor, layperson, etc.)
- Inject profile context into the system prompt so responses get progressively richer
- Example: *"This user frequently asks about the 7 Spirits and appears to have a pastoral background"*
- Profile builds automatically — no user input required

---

## Infrastructure

*(nothing here yet)*
