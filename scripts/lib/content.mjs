// Shared config + helpers for indexing and querying AskZ47 content.

export const INDEX_NAME = "askz47-content";
export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBED_DIMS = 768;

// The 5 v1 collections, with the fields worth embedding and the public URL shape.
// urlBase is a best guess at the z47.com path; verified against the live site before launch.
export const COLLECTIONS = [
  {
    key: "podcast",
    id: "6786a86ae1b02795c7fce813",
    label: "Z47 Moments / Podcast",
    titleField: "name",
    textFields: ["short-description", "body", "founder-testimonial"],
    urlBase: "https://www.z47.com/z47-moments/",
  },
  {
    key: "news",
    id: "6786a8edbf5a0abc5aaf8705",
    label: "News",
    titleField: "name",
    textFields: ["news-text"],
    urlBase: "https://www.z47.com/news/",
  },
  {
    key: "faq",
    id: "6788f142ba1c6f795f358dda",
    label: "Team FAQ",
    titleField: "name",
    textFields: ["body-richtext"],
    urlBase: null, // FAQs have no standalone page
  },
  {
    key: "portfolio",
    id: "6786a963e157e55936dabdd5",
    label: "Portfolio company",
    titleField: "name",
    textFields: ["short-description1", "funding-round", "year-invested", "year-started"],
    urlBase: "https://www.z47.com/portfolio/",
  },
  {
    key: "team",
    id: "6786a97c80991a02c593da30",
    label: "Team member",
    titleField: "name",
    textFields: ["designation", "quote", "short-description", "long-description-rich-text", "city"],
    urlBase: "https://www.z47.com/team/",
  },
];

const WF = "https://api.webflow.com/v2";
const wfHeaders = (t) => ({ Authorization: `Bearer ${t}`, "accept-version": "2.0.0" });

export function cfBase(env) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`;
}
export function cfHeaders(env) {
  return { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" };
}

// Retry a fetch-returning fn with exponential backoff (handles transient "fetch failed").
export async function withRetry(fn, label, tries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < tries) {
        const wait = 500 * 2 ** (attempt - 1);
        process.stdout.write(`\n  ⚠ ${label} failed (${e.message}); retry ${attempt}/${tries - 1} in ${wait}ms\n`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

export function requireEnv() {
  const env = {
    WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    CF_API_TOKEN: process.env.CF_API_TOKEN,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v || String(v).startsWith("replace-with"))
    .map(([k]) => k);
  if (missing.length) {
    console.error(`✗ Missing/placeholder env vars: ${missing.join(", ")} (fill them in .env)`);
    process.exit(1);
  }
  return env;
}

// Strip HTML to readable text and collapse whitespace.
export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fetch all LIVE (published) items of a collection, paginated.
export async function fetchLiveItems(token, collectionId) {
  const items = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const d = await withRetry(async () => {
      const r = await fetch(
        `${WF}/collections/${collectionId}/items/live?limit=${limit}&offset=${offset}`,
        { headers: wfHeaders(token) },
      );
      if (!r.ok) throw new Error(`Webflow list ${r.status}: ${await r.text()}`);
      return r.json();
    }, `list ${collectionId} @${offset}`);
    const batch = d.items || [];
    items.push(...batch);
    const total = d.pagination?.total ?? items.length;
    offset += limit;
    if (offset >= total || batch.length === 0) break;
  }
  return items;
}

// Build the document text + metadata for one CMS item.
export function buildDoc(col, item) {
  const f = item.fieldData || {};
  const title = f[col.titleField] || "(untitled)";
  const parts = [title];
  for (const field of col.textFields) {
    const txt = htmlToText(f[field]);
    if (txt) parts.push(txt);
  }
  const text = parts.join("\n\n").slice(0, 6000); // cap per-item input
  const slug = f.slug || "";
  const url = col.urlBase && slug ? col.urlBase + slug : null;
  const flat = text.replace(/\s+/g, " ").trim();
  return {
    id: `${col.key}:${item.id}`,
    text,
    metadata: {
      collection: col.label,
      title: String(title).slice(0, 200),
      ...(url ? { url } : {}),
      // content the answer model reads for grounding (Vectorize metadata cap is ~10KiB/vector)
      content: flat.slice(0, 2000),
    },
  };
}

// Embed an array of texts via Workers AI (bge). Returns array of vectors.
export async function embed(env, texts) {
  return withRetry(async () => {
    const r = await fetch(`${cfBase(env)}/ai/run/${EMBED_MODEL}`, {
      method: "POST",
      headers: cfHeaders(env),
      body: JSON.stringify({ text: texts }),
    });
    if (!r.ok) throw new Error(`Embed ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return d.result.data;
  }, "embed batch");
}
