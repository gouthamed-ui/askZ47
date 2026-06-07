# AskZ47 — Build Progress & Handoff

_Last updated: 2026-06-07. Resume here next session._

## ⛔ RESUME HERE — the one blocker
**Cloudflare Workers AI free tier (10,000 neurons/day) is exhausted → live answers return `429` and the bot is paused.** Everything else is built and working. To continue:
1. **Upgrade the Cloudflare account to Workers Paid (~$5/mo).** Direct link: https://dash.cloudflare.com/0dae0dd23b1e4928c118e43c9ad3590d/workers/plans (or dash → Compute/Workers → Plans → Workers Paid). This removes the daily hard-cap (then ~$0.011/1k neurons usage); no redeploy needed — `/api/ask` just starts answering again.
2. Then run the **live end-to-end test** through the UI: open `https://z47.webflow.io/app`, ask the Scapia / fintech-companies / enterprise-AI-team questions, confirm grounded answers + working source links.
3. Then **launch polish** (see bottom).

## TL;DR
Full RAG chatbot works end-to-end on Webflow Cloud: question → embed → Vectorize search → LLM → grounded, cited answer with working z47.com source links. Reference-resolution + metadata-filtered retrieval done (enumeration questions work). Dixon-Baxi-style light-mode UI built. **Only blocker = the CF neuron limit above.**

## Status by phase
| Phase | Status |
|---|---|
| 1. Scaffold + Webflow Cloud deploy | ✅ live |
| AI path (Workers AI + Vectorize via REST) | ✅ validated |
| 2. Content indexer (891 items, refs resolved) | ✅ done |
| 3. Answer engine `/api/ask` (+ filtered retrieval) | ✅ live, validated |
| 4. Chat UI (code app at `/app`, NOT Webflow Designer) | ✅ built — light mode, Z47 brand |
| 5. Launch polish | ⬜ pending (after CF upgrade) |

## Live endpoints (deployed app)
- App / chat UI (mount path `/app`): `https://z47.webflow.io/app`
- Answer API: `https://z47.webflow.io/app/api/ask?q=...` (also POST `{ "question": "..." }`) → `{ answer, sources[] }`
- Diagnostic: `https://z47.webflow.io/app/api/ai-test` — **REMOVE before launch** (unauthenticated; can burn Workers AI quota)

## Key facts / config
- Webflow site: **z47** — Site ID `678518036ebf6d040622b6b3`; canonical host is **www.z47.com** (apex 404s on CMS pages)
- Cloudflare account ID: `0dae0dd23b1e4928c118e43c9ad3590d` (Workers AI + Vectorize used via REST)
- GitHub repo: `gouthamed-ui/askZ47` — **push to `main` auto-deploys** (GitHub-linked). SSH key configured locally (`~/.ssh/askz47_ed25519`), remote is SSH.
- Models: generation **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** (switched 06-05 — non-reasoning, cheaper). **`@cf/zai-org/glm-4.7-flash` is the premium "upgrade later" model** (reasoning, higher quality, more neurons — swap `GEN_MODEL` in `src/lib/rag.ts`). Embeddings `@cf/baai/bge-base-en-v1.5` (768-dim).
- Vectorize index: **`askz47-content`** (768-dim, cosine) + metadata index on `kind`.
- **Bindings DON'T work in Webflow Cloud** — runtime only exposes `ASSETS` + `COSMIC_MOUNT_PATH`. AI/Vectorize reached via **Cloudflare REST API** with a token.
- Secrets: Webflow Cloud dashboard env vars `CF_ACCOUNT_ID`, `CF_API_TOKEN` (set; read at runtime via `locals.runtime.env`). Local `.env` (git-ignored): `WEBFLOW_SITE_ID`, `WEBFLOW_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`.

## Indexed collections (5) — IDs
| Key | CMS name | ID | Live items |
|---|---|---|---|
| podcast | Z47 Podcasts | `6786a86ae1b02795c7fce813` | 414 |
| news | News | `6786a8edbf5a0abc5aaf8705` | 213 |
| faq | Team FAQs | `6788f142ba1c6f795f358dda` | 146 |
| portfolio | Portfolios | `6786a963e157e55936dabdd5` | 88 |
| team | Teams | `6786a97c80991a02c593da30` | 30 |

URL bases: podcast `www.z47.com/z47-moments/`, news `/news/`, portfolio `/portfolio/`, team `/team/`, faq = none.
Reference name-map collections (for sectors/focus/tags/companies/people): see `NAME_MAP_COLLECTIONS` in `scripts/lib/content.mjs`.

## How to run things (local)
```bash
# Re-index all content (idempotent; upserts by id). NOTE: heavy on neurons — see warning below.
node --env-file=.env scripts/index-content.mjs

# Test retrieval for a question
node --env-file=.env scripts/query-test.mjs "What fintech companies has Z47 backed?"

# Build the app locally (catch errors before push)
npm install --cache /tmp/npmcache-askz47   # first time (npm cache perms workaround)
npm run build

# Deploy = commit + push (auto-deploys)
git add -A && git commit -m "..." && git push origin main
```
> ⚠️ Re-indexing embeds all ~891 items and is the biggest neuron consumer. On the free tier a couple of full re-indexes exhausts the day. TODO: make the indexer incremental (only re-embed changed items). See memory `askz47-workers-ai-cost`.

## Code map
- `scripts/lib/content.mjs` — collection config, ref name-map, HTML→text, pagination, embeddings, retry
- `scripts/index-content.mjs` — creates Vectorize index + metadata index, indexes 5 collections
- `scripts/query-test.mjs` — retrieval smoke test
- `src/lib/rag.ts` — RAG core (embed → filtered search → generate); `GEN_MODEL` set here
- `src/pages/api/ask.ts` — chat endpoint (GET ?q= / POST {question})
- `src/pages/api/ai-test.ts` — diagnostic (DELETE before launch)
- `src/pages/index.astro` — **the chat UI** (Dixon-Baxi-style, light mode)
- `askus-dixonbaxi-layout.md` — reference breakdown of askus.dixonbaxi.com (design source)

## Done 2026-06-05 → 06-07 (UI + model switch)
- **Chat UI built** as the app's home page (`src/pages/index.astro`) — modeled on askus.dixonbaxi.com, in Z47 light-mode brand (white / Primary Black / **Primary Orange `#e8702a`**). Features: "Ask Z47 anything." multi-weight hero, rotating subtitle ticker, white→soft-orange activation wash, orange caret + citation markers, typewriter answer reveal with Stop button, source links, responsive (`≤600px` breakpoint). Calls `/api/ask` same-origin.
  - **UI is CODE, not a Webflow Designer page** — edit `index.astro` + push. (Production option B: rebuild natively in Webflow Designer calling the same `/api/ask`, so the marketing team can own it visually. Not done — decide at launch.)
  - Approx brand orange `#e8702a` used; swap for exact Z47 hex when confirmed.
- **Generation model switched** GLM-4.7-flash → Llama 3.3 70B (cheaper, non-reasoning); `max_tokens` 800. GLM stays as the documented upgrade.
- **Hit the CF neuron limit** during testing → see blocker at top. Filtered-retrieval was still validated neuron-free (kind=portfolio/team filters return the right sets with topics).
- **Client comms drafted (in chat, not yet saved as files):** (1) an update email to marketing heads Madhavi & Vineet; (2) a full client walkthrough/narration script. Ask the agent to save these to `client-update-email.md` / `client-walkthrough.md` if wanted.

## Launch polish (Phase 5 — after CF upgrade)
1. Remove the public `/api/ai-test` diagnostic.
2. Add light rate-limiting on `/api/ask` (abuse / cost guard).
3. Confirm/choose production placement on z47.com: mount path (e.g. `/ask`) + nav link, OR rebuild UI natively in Webflow Designer (option B above).
4. Make the indexer incremental (cut re-index neuron cost).
5. Final answer-quality pass across all 5 collections; optionally A/B Llama vs GLM vs Qwen3.
6. (v2 idea) "What's new at Z47" weekly panel; YouTube transcripts + jump-to-moment.

## Known good (verified)
- Scapia question → full, accurate, cited funding history with working www URLs.
- "Founders first" / "What makes Z47 different" → excellent FAQ-grounded answers.
- "Who focuses on enterprise AI" → correctly names Ashwin Pandian (ref resolution working).
- 891 items indexed; Vectorize query + REST generation confirmed working inside Webflow Cloud; metadata `kind` filter validated.
