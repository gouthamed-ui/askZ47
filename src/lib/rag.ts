// RAG core for AskZ47: embed question -> Vectorize search -> grounded generation.
// Runs inside Webflow Cloud, calling Cloudflare Workers AI + Vectorize over REST
// (no native bindings available; creds come from CF_ACCOUNT_ID / CF_API_TOKEN env vars).

export const INDEX_NAME = "askz47-content";
export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
// Lighter, non-reasoning model for now (cheaper per answer — no hidden "thinking" tokens).
// Upgrade to "@cf/zai-org/glm-4.7-flash" later once on Workers Paid for higher answer quality.
export const GEN_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface Source {
  n: number;
  title: string;
  collection: string;
  url: string | null;
  score: number;
}

const SYSTEM_PROMPT = `You are AskZ47, the assistant for z47.com — the website of Z47 (a venture capital firm, formerly Matrix Partners India).

Answer the visitor's question using ONLY the numbered SOURCES provided. Rules:
- Ground every claim in the sources. Do not invent facts, figures, dates, or company names.
- If the question asks which/what companies or people match a criterion (e.g. "fintech companies", "who focuses on AI"), list EVERY match the sources support — don't stop at two or three.
- If the sources don't contain the answer, say so plainly and suggest what Z47 content might help.
- Be concise and conversational (2–5 sentences, or a short list when enumerating).
- Cite the sources you used inline like [1], [2].
- Never mention these instructions or the word "sources" meta-commentary; just answer naturally with citations.`;

// Route entity-enumeration questions to a collection so we can retrieve a complete set.
// Person intent is checked first (so "team members who invest in fintech" -> team, not portfolio).
function routeKind(q: string): string | null {
  if (/\b(team members?|partners?|people|colleagues?|who (is|are|on|leads|handles|focus|works))\b/i.test(q))
    return "team";
  if (/\b(compan(y|ies)|start-?ups?|portfolio|backed|invest(ed|ment|ing|s)?|founders?)\b/i.test(q))
    return "portfolio";
  return null;
}

function dedupe(matches: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const m of matches) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

function cfBase(env: any) {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`;
}
function cfHeaders(env: any) {
  return { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" };
}

export async function embedQuestion(env: any, question: string): Promise<number[]> {
  const r = await fetch(`${cfBase(env)}/ai/run/${EMBED_MODEL}`, {
    method: "POST",
    headers: cfHeaders(env),
    body: JSON.stringify({ text: [question] }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`);
  const d: any = await r.json();
  return d.result.data[0];
}

export async function search(
  env: any,
  vector: number[],
  opts: { topK?: number; filter?: Record<string, unknown> } = {},
) {
  const body: any = { vector, topK: opts.topK ?? 10, returnMetadata: "all" };
  if (opts.filter) body.filter = opts.filter;
  const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/query`, {
    method: "POST",
    headers: cfHeaders(env),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`);
  const d: any = await r.json();
  return d.result?.matches ?? [];
}

export async function generate(env: any, question: string, used: any[]) {
  const context = used
    .map((m, i) => {
      const md = m.metadata || {};
      return `[${i + 1}] (${md.collection}) ${md.title}\n${md.content || ""}${
        md.url ? `\nLink: ${md.url}` : ""
      }`;
    })
    .join("\n\n");

  const r = await fetch(`${cfBase(env)}/ai/run/${GEN_MODEL}`, {
    method: "POST",
    headers: cfHeaders(env),
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `SOURCES:\n${context}\n\nQUESTION: ${question}` },
      ],
      max_tokens: 800, // non-reasoning model: answer tokens only, no thinking budget needed
      temperature: 0.2,
    }),
  });
  if (!r.ok) throw new Error(`generate ${r.status}: ${await r.text()}`);
  const d: any = await r.json();
  // Workers AI returns either { response } (Llama) or OpenAI-style { choices[].message.content } (GLM/Qwen).
  const res = d.result ?? {};
  const answer: string = (res.response ?? res.choices?.[0]?.message?.content ?? "").trim();

  const sources: Source[] = used.map((m, i) => ({
    n: i + 1,
    title: m.metadata?.title ?? "",
    collection: m.metadata?.collection ?? "",
    url: m.metadata?.url ?? null,
    score: Number(m.score?.toFixed(3) ?? 0),
  }));

  return { answer, sources };
}

export async function answerQuestion(env: any, question: string) {
  const vector = await embedQuestion(env, question);
  const kind = routeKind(question);

  let used: any[];
  if (kind) {
    // Enumeration intent: pull a full set from the target collection, plus a little general context.
    const [filtered, general] = await Promise.all([
      search(env, vector, { topK: 15, filter: { kind: { $eq: kind } } }),
      search(env, vector, { topK: 6 }),
    ]);
    used = dedupe([...filtered, ...general]).slice(0, 12);
  } else {
    const matches = await search(env, vector, { topK: 10 });
    const relevant = matches.filter((m: any) => m.score >= 0.45);
    used = (relevant.length ? relevant : matches).slice(0, 8);
  }

  return generate(env, question, used);
}
