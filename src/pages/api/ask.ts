import type { APIRoute } from "astro";
import { answerQuestion } from "../../lib/rag";

// AskZ47 chat endpoint. GET ?q=... (easy testing) or POST { question }.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });

// --- Best-effort rate limit (abuse / Workers-AI cost guard) ---------------
// NOTE: Webflow Cloud runs on Cloudflare Workers, where this Map lives only
// within a single isolate (requests fan out across multiple, short-lived
// isolates). So this blunts naive bursts from one client but is NOT a hard
// global cap. The real cost ceiling is the Workers AI usage/budget limit set
// in the Cloudflare dashboard — keep that as the backstop.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15; // questions per IP per minute
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anon"
  );
}

// Returns seconds-until-reset if limited, else 0.
function rateLimited(ip: string): number {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now >= rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5000) {
      // prune expired entries so the map can't grow unbounded
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    return 0;
  }
  rec.count++;
  return rec.count > MAX_PER_WINDOW ? Math.ceil((rec.resetAt - now) / 1000) : 0;
}

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });

export const GET: APIRoute = async ({ url, locals, request }) => {
  const q = url.searchParams.get("q");
  return handle(q, locals, request);
};

export const POST: APIRoute = async ({ request, locals }) => {
  let q: string | null = null;
  try {
    const body = (await request.json()) as { question?: string };
    q = body?.question ?? null;
  } catch {
    /* ignore */
  }
  return handle(q, locals, request);
};

async function handle(question: string | null, locals: any, request: Request) {
  const env = locals?.runtime?.env;
  if (!env?.CF_ACCOUNT_ID || !env?.CF_API_TOKEN) {
    return json({ error: "Server not configured (missing Cloudflare credentials)." }, 500);
  }
  if (!question || !question.trim()) {
    return json({ error: "Provide a question (?q=... or POST { question })." }, 400);
  }

  const retryAfter = rateLimited(clientIp(request));
  if (retryAfter) {
    return json(
      { error: "Too many questions — please wait a moment and try again." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  try {
    const { answer, sources } = await answerQuestion(env, question.trim());
    return json({ question, answer, sources });
  } catch (e: any) {
    return json({ error: "Failed to answer.", detail: String(e?.message ?? e) }, 500);
  }
}
