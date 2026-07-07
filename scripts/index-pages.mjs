// Crawl curated LIVE z47.com pages -> extract main text -> chunk -> embed -> upsert to Vectorize.
// These are hand-built Designer pages the CMS API can't see (about, practices, reports, programs…).
// Indexed with kind:"page" + the live URL so niche questions can cite/link the exact page.
//
//   node --env-file=.env scripts/index-pages.mjs
//
// Idempotent: stable `page:<slug>` ids (no collision with CMS `kind:<id>` or `static:*` ids).
// Nav/footer chrome is removed by a cross-page "boilerplate" filter — any line that appears on
// >=40% of pages is treated as shared chrome and dropped (robust to Webflow's div-based navs).
import { INDEX_NAME, cfBase, requireEnv, embed, withRetry, htmlToText } from "./lib/content.mjs";

const env = requireEnv();
const HOST = "https://www.z47.com"; // canonical host (apex 404s on some pages)
const UA = "AskZ47-indexer/1.0 (+https://www.z47.com)";

// Curated ~25 real content pages (see PROGRESS-2026-06-14.md). Excludes drafts, /dev/ staging,
// CMS detail_* templates, and utility pages. Verify-ambiguous ones resolved: /consumer (not
// /consumers), /zalpha-2026 (not /zalpha or /zalpha-details).
const PATHS = [
  "/", "/about", "/team", "/contact",
  "/fintech", "/consumer", "/software-ai", "/deeptech", "/frontier-tech",
  "/how-india-uses-ai", "/how-india-uses-ai/stats", "/how-india-uses-ai/startup-map",
  "/how-india-uses-ai/archetype-quiz", "/the-india-ai-edge",
  "/future-signals", "/land-expand", "/unstarted", "/newsletter", "/zalpha-2026",
  "/report/state-of-the-fintech-union-2024",
  "/report/digitizing-consumers-in-india-report-2023",
  "/report/digitizing-make-in-india-report-2025",
  "/portfolio", "/z47-moments", "/in-the-news",
  "/legal/privacy-policy", "/legal/terms-of-service", "/legal/disclaimer", "/legal/fund-details",
];

function getTitle(html, path) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let t = m ? m[1] : "";
  t = t.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&[^;]+;/g, " ").trim();
  t = t.replace(/\s*[|\-–—]\s*Z47.*$/i, "").trim(); // drop " | Z47" suffixes
  if (!t) t = path === "/" ? "Z47 Home" : (path.split("/").filter(Boolean).pop() || "Z47");
  return t.slice(0, 200);
}

// Remove head + non-content blocks (incl. semantic nav/header/footer) before text extraction.
function extractMain(html) {
  return String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
}

function toLines(text) {
  return text.split("\n").map((s) => s.trim()).filter((s) => s.length > 1);
}

// Split into ~target-sized chunks on paragraph boundaries; hard-split runaway paragraphs.
function chunkText(text, target = 1800) {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > target) { chunks.push(cur); cur = ""; }
    cur = cur ? cur + "\n" + p : p;
    while (cur.length > target * 1.5) { chunks.push(cur.slice(0, target)); cur = cur.slice(target); }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function slugId(path) {
  if (path === "/") return "home";
  return path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\//g, "-");
}

async function fetchPage(path) {
  return withRetry(async () => {
    const r = await fetch(HOST + path, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.text();
  }, `GET ${path}`, 3);
}

async function upsert(vectors) {
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");
  await withRetry(async () => {
    const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/x-ndjson" },
      body: ndjson,
    });
    if (!r.ok) throw new Error(`Upsert ${r.status}: ${await r.text()}`);
  }, "upsert pages");
}

async function run() {
  console.log(`Crawling ${PATHS.length} curated pages from ${HOST} …\n`);

  // 1. Fetch + extract every page.
  const pages = [];
  for (const path of PATHS) {
    try {
      const html = await fetchPage(path);
      const title = getTitle(html, path);
      const text = htmlToText(extractMain(html));
      pages.push({ path, url: HOST + path, title, lines: toLines(text) });
      process.stdout.write(`  ✓ ${path.padEnd(46)} ${String(text.length).padStart(6)} chars — ${title}\n`);
    } catch (e) {
      process.stdout.write(`  ⚠ skip ${path} (${e.message})\n`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // 2. Detect shared chrome: lines appearing on many pages = nav/footer/cookie boilerplate.
  const lineCount = new Map();
  for (const p of pages) for (const l of new Set(p.lines)) lineCount.set(l, (lineCount.get(l) || 0) + 1);
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const boiler = new Set([...lineCount].filter(([, c]) => c >= threshold).map(([l]) => l));
  console.log(`\nRemoving ${boiler.size} boilerplate lines (appear on >=${threshold}/${pages.length} pages).`);

  // 3. De-chrome + chunk into docs.
  const docs = [];
  for (const p of pages) {
    const clean = p.lines.filter((l) => !boiler.has(l)).join("\n");
    if (clean.replace(/\s+/g, " ").trim().length < 200) {
      console.log(`  ⚠ thin after cleanup, skipping ${p.path}`);
      continue;
    }
    const chunks = chunkText(clean, 1800);
    chunks.forEach((c, i) => {
      const body = c.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
      if (body.length < 80) return;
      docs.push({
        id: `page:${slugId(p.path)}${chunks.length > 1 ? "#" + i : ""}`,
        text: `${p.title}. ${body}`.slice(0, 6000),
        metadata: {
          collection: "Z47 Page",
          kind: "page",
          title: p.title,
          url: p.url,
          content: body.slice(0, 2000),
        },
      });
    });
  }
  console.log(`\nBuilt ${docs.length} chunks from ${pages.length} pages. Embedding + upserting…`);

  // 4. Embed + upsert in batches.
  const BATCH = 50;
  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);
    const vectors = await embed(env, slice.map((d) => d.text));
    const payload = slice.map((d, j) => ({ id: d.id, values: vectors[j], metadata: d.metadata }));
    await upsert(payload);
    process.stdout.write(`  upserted ${Math.min(i + BATCH, docs.length)}/${docs.length}\r`);
  }
  console.log(`\n✅ Indexed ${docs.length} page-chunks into "${INDEX_NAME}" (kind:"page").`);
  console.log("   NOTE: Vectorize indexes upserts async (~mins). Verify a bit later.");
}

run().catch((e) => {
  console.error("\n✗ Page crawl failed:", e.message);
  process.exit(1);
});
