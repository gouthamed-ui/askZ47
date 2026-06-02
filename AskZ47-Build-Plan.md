# AskZ47 — AI Chatbot Build Plan

**Prepared by:** everything.design
**For:** z47.com (Z47 / formerly Matrix Partners India)
**Date:** 2 June 2026
**Status:** Architecture locked · awaiting account sign-off to begin build

---

## 1. Executive summary

AskZ47 is a conversational AI assistant for **z47.com** that answers visitor questions from Z47's own website content — portfolio companies, news, team, podcasts, and FAQs. It is modelled on the "Ask Us" experience at askus.dixonbaxi.com.

**The key point for sign-off:** the entire solution is built **inside Webflow** (Webflow Cloud), with **no external servers and no external AI vendor to manage**. There is no new infrastructure to onboard, no separate subscription to buy, and clean ownership — the whole thing lives with the Webflow site.

The AI runs on **Cloudflare Workers AI** (built into Webflow Cloud), which has a free daily allowance and minimal usage-based cost thereafter. At our traffic volume this is effectively free. Everything rides on the existing Webflow plan.

---

## 2. What it does

A visitor opens a chat panel on z47.com and asks, in plain language:

- *"What fintech companies has Z47 backed?"*
- *"Tell me about the Scapia investment."*
- *"Who on the team focuses on enterprise AI?"*
- *"What did Z47 say about founders first?"*

The assistant retrieves the most relevant Z47 content, generates a grounded answer, and links back to the source pages on z47.com.

---

## 3. Architecture — 100% inside Webflow

```
   Visitor on z47.com  ──►  native Webflow chat UI
            │ question  (same domain → no cross-origin calls)
            ▼
   ┌──────────────────────────────────────────────┐
   │   Webflow Cloud app  (runs on Webflow's edge) │
   │   1. embed the question        (Workers AI)   │
   │   2. find best matching content (Vectorize)   │
   │   3. generate the answer        (Claude API)  │
   │   4. return answer + source links             │
   └──────────────────────────────────────────────┘
            ▲
   Indexer (offline): Webflow CMS → searchable content
```

| Layer | Technology | Where it runs |
|---|---|---|
| Chat UI | Native Webflow design + small script | Webflow |
| App / endpoint | Webflow Cloud app (Astro) | **Webflow Cloud** |
| Content search | Cloudflare Vectorize | **Webflow Cloud** |
| Embeddings | Cloudflare Workers AI | **Webflow Cloud** |
| Answer generation | **Cloudflare Workers AI** (GLM-4.7-Flash) | **Webflow Cloud** |
| Content source | Webflow CMS (existing) | Webflow |

**Why this matters:** everything that *runs* lives in Webflow Cloud — including the AI. The app mounts on z47.com itself, so there are no cross-origin/security headaches, and there is **no external AI vendor or API key to manage**. The previously-considered external server (DigitalOcean) has been **removed from the plan entirely.**

> *Upgrade path:* if richer answer quality is ever wanted, the generation step can be swapped to a premium model (e.g. Anthropic Claude) with a one-line change — no re-architecture. Not needed for launch.

---

## 4. The content it draws from

A full audit of the z47.com CMS was completed (read-only). The site has **31 CMS collections**. The chatbot's first version (v1) indexes the **5 highest-value content collections (~920 items):**

| Collection | Items | Content |
|---|---|---|
| Podcasts ("Z47 Moments") | 422 | Articles, founder stories, podcast/video content |
| News | 222 | Press releases, funding announcements |
| Team FAQs | 147 | Question-and-answer content (ideal for a chatbot) |
| Portfolio | 88 | Company profiles, sectors, funding details |
| Team | 40 | People, roles, focus areas |

Later versions can fold in the India GenAi (265) and AI-Edge (166) datasets, plus YouTube transcripts.

---

## 5. Build roadmap

| Phase | What happens | Owner |
|---|---|---|
| **0. Account unlocks** | Confirm Webflow Cloud enabled, Claude API key, GitHub repo | **Client / agency** |
| **1. Scaffold** | Create the Webflow Cloud app + wire up the pieces | Agency |
| **2. Index content** | Load the 5 collections into the search engine | Agency |
| **3. Answer engine** | Build the question → search → Claude → answer flow | Agency |
| **4. Chat UI** | Design the chat panel natively in Webflow | Agency |
| **5. Launch v1** | Polish, source links, go live | Agency + review |
| **6. v2 (later)** | YouTube transcripts + jump-to-moment deep links | Agency |

Each phase ends with a concrete checkpoint that proves it works before moving on.

---

## 6. Pricing

**Headline:** No new product purchase. Webflow Cloud is included with the existing paid Webflow site plan and billed only on usage. The one new line item is Claude API usage, which is small.

| Cost item | Status | Notes |
|---|---|---|
| Webflow site plan | **Already paid** | z47.com is live on a paid plan |
| Webflow Cloud usage | New, usage-based | Metered on requests / CPU / storage — minimal at chatbot volume; generous included allowances |
| Workers AI (the LLM — GLM-4.7-Flash) | Included in Webflow Cloud | Free daily allowance (10k Neurons/day), then cents-level usage; **no separate vendor or key** |
| External server (DigitalOcean) | **Removed** | Eliminated by the all-Webflow approach |
| External AI vendor (Claude) | **Not required** | Available later as an optional upgrade only |

**Reference (Webflow 2026 pricing):** Site plans — Starter (free) / Basic ($15/mo) / Premium ($25/mo). Webflow Cloud usage follows the existing site-plan structure. z47's content profile fits the Premium / Team / Enterprise tier.

> Net new spend at launch is effectively **zero beyond the existing Webflow plan** — the AI runs within Webflow Cloud's included allowances at our volume.

---

## 7. What's needed to start (Phase 0 — account actions)

There are only **two** blockers, and both sit with the **client's Webflow account**:

1. **Confirm Webflow Cloud is enabled** on the z47 workspace.
   - Check: *Workspace settings → Webflow Cloud* (or the site's Hosting area).
   - This is the single most important confirmation — it determines that the whole approach is available on the current plan.
2. **A GitHub repository** for the app (Webflow Cloud deploys from GitHub).

Content access to the CMS is already in place — no action needed there.
No AI API key or external account is required — the AI runs inside Webflow Cloud.

---

## 8. Open decisions (minor — defaults chosen)

| Decision | Default | Alternative |
|---|---|---|
| AI model | **Workers AI — GLM-4.7-Flash** (Cloudflare's RAG-recommended model; 131k context, low cost, fast) | Qwen3-30B (A/B challenger at build); Claude/Gemini (premium upgrade) |
| App framework | **Astro** | Next.js |

Both can be changed later without rework. The model choice was audited against the live Workers AI catalog (June 2026) on RAG fit, context size, output cost, and latency — GLM-4.7-Flash won; the two finalists (GLM-4.7-Flash vs Qwen3-30B) will be A/B tested on real Z47 questions in the build phase.

---

## 9. Honest notes / considerations

- **The Webflow Cloud enablement check is the one true unknown.** Everything points to z47 qualifying (it's a substantial paid site), but it must be confirmed in the dashboard before the build starts.
- **The AI uses an open model (GLM-4.7-Flash) via Workers AI** — Cloudflare's own recommended model for retrieval/RAG. This is a notch below premium models (Claude/GPT) on raw open-ended reasoning, but because the chatbot answers from *retrieved Z47 content* (it synthesizes provided text rather than reasoning from scratch), the practical quality gap is small. A premium model can be added later as a drop-in upgrade if desired.
- **Exact Webflow Cloud / Workers AI usage rates** were not quoted here to avoid imprecision — they are metered and small at this scale, and can be pulled from live pricing if a hard figure is required.

---

## 10. Summary for decision-makers

> AskZ47 is an AI assistant built entirely inside our existing Webflow setup — no new servers, no new AI vendor, no new subscriptions, and clean ownership tied to the z47.com site. It answers visitor questions from our own portfolio, news, team, and podcast content. The AI runs within Webflow Cloud's included allowances, so net new spend at launch is effectively zero. To begin, we only need to confirm Webflow Cloud is enabled on our workspace and create a GitHub repo — then the build proceeds in clear, checkpointed phases.

---

*Document prepared for internal review. Architecture and roadmap are locked; figures marked "reference" or "estimate" can be firmed up on request.*
