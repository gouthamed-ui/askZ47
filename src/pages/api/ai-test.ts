import type { APIRoute } from "astro";

// Diagnostic: report exactly what the Webflow Cloud runtime injects, so we know
// which Cloudflare bindings are actually available (Workers AI? Vectorize? KV? D1?).
export const GET: APIRoute = async ({ locals }) => {
  const runtime = (locals as any).runtime;
  const env = runtime?.env as Record<string, unknown> | undefined;

  const result: Record<string, unknown> = {
    runtimePresent: !!runtime,
    envKeys: env ? Object.keys(env).sort() : null,
    hasAI: !!env?.AI,
    hasVectorize: !!env?.VECTORIZE,
  };

  // If an AI binding exists under any name, try a tiny call to confirm it works.
  if (env?.AI) {
    try {
      const gen: any = await (env.AI as any).run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [{ role: "user", content: "Reply with exactly: AI works." }],
        max_tokens: 16,
      });
      result.generation = gen?.response ?? gen;
    } catch (e: any) {
      result.generationError = String(e?.message ?? e);
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
