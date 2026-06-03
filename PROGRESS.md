# AskZ47 — Build Progress & Handoff

_Last updated: 2026-06-03. Resume here next session._

## TL;DR
The full RAG chatbot works end-to-end in production on Webflow Cloud. Question → embed → Vectorize search → GLM-4.7-flash → grounded answer with cited, working source links. Reference-resolution + metadata-filtered retrieval are done (flagship enumeration questions now work). **Next priority: build the chat UI (Phase 4), then launch polish.**

## Status by phase
| Phase | Status |
|---|---|
| 1. Scaffold + Webflow Cloud deploy | ✅ live |
| AI path (Workers AI + Vectorize via REST) | ✅ validated |
| 2. Content indexer (890 items) | ✅ done |
| 3. Answer engine `/api/ask` | ✅ live & answering with citations |
| 4. Chat UI in Webflow Designer | ⬜ not started |
| 5. Launch polish | ⬜ not started |

## Live endpoints (deployed app)
- App base (mount path `/app`): `https://z47.webflow.io/app`
- Answer API: `https://z47.webflow.io/app/api/ask?q=...` (also POST `{ "question": "..." }`) → `{ answer, sources[] }`
- Diagnostic: `https://z47.webflow.io/app/api/ai-test` — **REMOVE before launch** (unauthenticated; can burn Workers AI quota)

## Key facts / config
- Webflow site: **z47** — Site ID `678518036ebf6d040622b6b3`; canonical host is **www.z47.com** (apex 404s on CMS pages)
- GitHub repo: `gouthamed-ui/askZ47` — **push to `main` auto-deploys** (GitHub-linked). SSH key configured locally (`~/.ssh/askz47_ed25519`), remote is SSH.
- Models: generation `@cf/zai-org/glm-4.7-flash` (A/B challenger `@cf/qwen/qwen3-30b-a3b-fp8`); embeddings `@cf/baai/bge-base-en-v1.5` (768-dim)
- Vectorize index: **`askz47-content`** (768-dim, cosine), in the user's Cloudflare account
- **Bindings DON'T work in Webflow Cloud** — runtime only exposes `ASSETS` + `COSMIC_MOUNT_PATH`. AI/Vectorize are reached via **Cloudflare REST API** with a token.
- Secrets:
  - Webflow Cloud dashboard env vars: `CF_ACCOUNT_ID`, `CF_API_TOKEN` (already set; runtime reads via `locals.runtime.env`)
  - Local `.env` (git-ignored): `WEBFLOW_SITE_ID`, `WEBFLOW_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`

## Indexed collections (5) — IDs + fields
| Key | CMS name | ID | Live items |
|---|---|---|---|
| podcast | Z47 Podcasts | `6786a86ae1b02795c7fce813` | 413 |
| news | News | `6786a8edbf5a0abc5aaf8705` | 213 |
| faq | Team FAQs | `6788f142ba1c6f795f358dda` | 146 |
| portfolio | Portfolios | `6786a963e157e55936dabdd5` | 88 |
| team | Teams | `6786a97c80991a02c593da30` | 30 |

URL bases: podcast `www.z47.com/z47-moments/`, news `/news/`, portfolio `/portfolio/`, team `/team/`, faq = none.

## How to run things (local)
```bash
# Re-index all content (idempotent; upserts by id)
node --env-file=.env scripts/index-content.mjs

# Test retrieval for a question
node --env-file=.env scripts/query-test.mjs "What fintech companies has Z47 backed?"

# Build the app locally (catch errors before push)
npm install --cache /tmp/npmcache-askz47   # first time (npm cache perms workaround)
npm run build

# Deploy = commit + push (auto-deploys)
git add -A && git commit -m "..." && git push origin main
```

## Code map
- `scripts/lib/content.mjs` — collection config, field map, HTML→text, Webflow pagination, embeddings, retry
- `scripts/index-content.mjs` — creates Vectorize index, indexes 5 collections
- `scripts/query-test.mjs` — retrieval smoke test
- `src/lib/rag.ts` — RAG core (embed → search → generate); runs in Webflow Cloud
- `src/pages/api/ask.ts` — chat endpoint
- `src/pages/api/ai-test.ts` — diagnostic (delete before launch)

## Done 2026-06-03 (reference resolution + filtered retrieval)
- Indexer resolves reference fields (sectors/focus-areas/tags/companies/people) into embedded text + metadata via a 7-collection name map (`buildNameMap`). Each doc now has `metadata.topics`.
- Each vector tagged `metadata.kind` (portfolio/team/news/podcast/faq); Vectorize **metadata index on `kind`** created (filterable).
- Answer engine: `routeKind()` intent routing → company/person questions retrieve **filtered to that collection** (topK 15) + general merge; `max_tokens` 2048; "enumerate all matches" prompt nudge.
- Verified: "who focuses on enterprise AI" → correctly names Ashwin Pandian. "fintech companies" → now retrieves Portfolio companies via the filter (was News-only).

## NEXT SESSION — start here
1. **Chat UI (Phase 4):** build the chat panel natively in Webflow Designer, wire to `/app/api/ask` (POST `{question}` → `{answer, sources}`). Render answer + clickable source links.
2. **Launch polish:** remove the public `/api/ai-test` diagnostic; add light rate-limiting on `/api/ask`; confirm mount path on production www.z47.com; final answer-quality pass across all 5 collections.
3. **(Optional) A/B the model:** GLM-4.7-flash vs `@cf/qwen/qwen3-30b-a3b-fp8` on real Z47 questions.

Note: Vectorize ingestion is async (~minutes) after re-indexing — `kind`/`topics` filters lag briefly before they're queryable.

## Known good (verified this session)
- Scapia question returns a full, accurate, cited funding history with working www URLs.
- "Founders first" and "What makes Z47 different" → excellent FAQ-grounded answers.
- 890 items indexed; embeddings 768-dim; Vectorize query + REST generation confirmed working inside Webflow Cloud.
