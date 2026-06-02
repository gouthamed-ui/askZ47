import type { APIRoute } from "astro";

// Full-stack validation of the Cloudflare REST path from inside Webflow Cloud:
//   1. embeddings model (for indexing + query)
//   2. Vectorize reachability (list indexes)
//   3. text-generation catalog (confirm which models actually exist: GLM/Qwen/Llama)
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env as Env | undefined;
  const acct = env?.CF_ACCOUNT_ID;
  const token = env?.CF_API_TOKEN;
  const base = `https://api.cloudflare.com/client/v4/accounts/${acct}`;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const out: Record<string, unknown> = {};

  if (!acct || !token) {
    return json({ error: "CF env vars missing" }, 500);
  }

  // 1. Embeddings
  try {
    const r = await fetch(`${base}/ai/run/${EMBED_MODEL}`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ text: ["Z47 backs early-stage founders in India."] }),
    });
    const d: any = await r.json();
    out.embed = { status: r.status, dims: d?.result?.data?.[0]?.length ?? null };
  } catch (e: any) {
    out.embedError = String(e?.message ?? e);
  }

  // 2. Vectorize reachability
  try {
    const r = await fetch(`${base}/vectorize/v2/indexes`, { headers: auth });
    const d: any = await r.json();
    out.vectorize = {
      status: r.status,
      ok: d?.success ?? false,
      indexes: Array.isArray(d?.result) ? d.result.map((i: any) => i.name) : d?.errors,
    };
  } catch (e: any) {
    out.vectorizeError = String(e?.message ?? e);
  }

  // 3. Text-generation catalog — find GLM / Qwen / Llama slugs
  try {
    const r = await fetch(`${base}/ai/models/search?task=Text+Generation&per_page=200`, {
      headers: auth,
    });
    const d: any = await r.json();
    const names: string[] = Array.isArray(d?.result) ? d.result.map((m: any) => m.name) : [];
    out.textModels = {
      status: r.status,
      total: names.length,
      glmQwen: names.filter((n) => /glm|qwen/i.test(n)),
      llama33: names.filter((n) => /llama-3\.3/i.test(n)),
    };
  } catch (e: any) {
    out.catalogError = String(e?.message ?? e);
  }

  return json(out, 200);
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
