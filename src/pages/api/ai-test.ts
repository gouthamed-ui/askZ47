import type { APIRoute } from "astro";

// Diagnostic endpoint: confirms Workers AI runs inside Webflow Cloud.
// Tests both capabilities the chatbot needs:
//   1. text generation (the answer model)
//   2. text embeddings (for indexing + query-time search)
// Models here are known-good Workers AI slugs used to validate the BINDING.
// The plan's preferred generation model (GLM-4.7-Flash) is validated separately
// against the live catalog before we lock it in.
export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env as Env | undefined;

  if (!env?.AI) {
    return json({ ok: false, error: "AI binding not available in this runtime" }, 500);
  }

  const result: Record<string, unknown> = { ok: true };

  try {
    const gen: any = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [{ role: "user", content: "Reply with exactly: AI binding works." }],
      max_tokens: 20,
    });
    result.generation = gen?.response ?? gen;
  } catch (e: any) {
    result.generationError = String(e?.message ?? e);
  }

  try {
    const emb: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: ["Z47 backs early-stage founders in India."],
    });
    result.embeddingDims = emb?.data?.[0]?.length ?? null;
  } catch (e: any) {
    result.embeddingError = String(e?.message ?? e);
  }

  return json(result, 200);
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
