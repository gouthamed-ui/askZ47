import type { APIRoute } from "astro";
import { answerQuestion } from "../../lib/rag";

// AskZ47 chat endpoint. GET ?q=... (easy testing) or POST { question }.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });

export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams.get("q");
  return handle(q, locals);
};

export const POST: APIRoute = async ({ request, locals }) => {
  let q: string | null = null;
  try {
    const body = (await request.json()) as { question?: string };
    q = body?.question ?? null;
  } catch {
    /* ignore */
  }
  return handle(q, locals);
};

async function handle(question: string | null, locals: any) {
  const env = locals?.runtime?.env;
  if (!env?.CF_ACCOUNT_ID || !env?.CF_API_TOKEN) {
    return json({ error: "Server not configured (missing Cloudflare credentials)." }, 500);
  }
  if (!question || !question.trim()) {
    return json({ error: "Provide a question (?q=... or POST { question })." }, 400);
  }
  try {
    const { answer, sources } = await answerQuestion(env, question.trim());
    return json({ question, answer, sources });
  } catch (e: any) {
    return json({ error: "Failed to answer.", detail: String(e?.message ?? e) }, 500);
  }
}
