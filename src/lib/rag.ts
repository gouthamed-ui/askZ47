// RAG core for AskZ47: embed question -> Vectorize search -> grounded generation.
// Runs inside Webflow Cloud, calling Cloudflare Workers AI + Vectorize over REST
// (no native bindings available; creds come from CF_ACCOUNT_ID / CF_API_TOKEN env vars).

export const INDEX_NAME = "askz47-content";
export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
// gpt-oss-120b: strongest reasoning model in the CF catalog (128k ctx) and cheaper per
// token than Llama 3.3 70B. Its thinking trace returns separately in
// `choices[].message.reasoning_content` (we read only `content`), and it cites with
// fullwidth brackets 【n】 which we normalize to [n] below.
// Fallbacks: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" (fast, non-reasoning) or
// "@cf/google/gemma-4-26b-a4b-it" (cheap, 256k ctx, hybrid).
export const GEN_MODEL = "@cf/openai/gpt-oss-120b";

export interface Source {
  n: number;
  title: string;
  collection: string;
  kind: string | null;
  url: string | null;
  image: string | null;
  score: number;
}

const SYSTEM_PROMPT = `You are AskZ47, the assistant for z47.com — the website of Z47 (a venture capital firm, formerly Matrix Partners India).

Answer the visitor's question using ONLY the numbered SOURCES provided. Rules:
- Ground every claim in the sources. Do not invent facts, figures, dates, or company names.
- If the question asks which/what companies or people match a criterion (e.g. "fintech companies", "who focuses on AI"), list EVERY match the sources support — don't stop at two or three.
- If the sources don't contain the answer, say so plainly and suggest what Z47 content might help.
- Be concise and conversational (2–5 sentences, or a short list when enumerating).
- Write in plain text only — NO Markdown: no **bold**, no # headings, no "-"/"*" bullet characters. When you enumerate, put each item on its own line as a short phrase, e.g. "Oxyzo — supply-chain finance [1]".
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
      // gpt-oss reasons before answering; max_tokens must cover the hidden thinking trace
      // AND the final answer. "low" effort keeps latency/cost down — this is grounded
      // extraction, not hard logic. (Ignored by non-reasoning models like Llama.)
      max_tokens: 2048,
      temperature: 0.2,
      reasoning: { effort: "low" },
    }),
  });
  if (!r.ok) throw new Error(`generate ${r.status}: ${await r.text()}`);
  const d: any = await r.json();
  // Workers AI returns either { response } (Llama) or OpenAI-style { choices[].message.content }
  // (GLM/Qwen/gpt-oss). gpt-oss keeps its thinking in choices[].message.reasoning_content —
  // we ignore that and take only the final content.
  const res = d.result ?? {};
  let answer: string = (res.response ?? res.choices?.[0]?.message?.content ?? "").trim();
  // gpt-oss cites with fullwidth brackets 【n】 / 〔n〕; normalize to [n] so the UI's citation
  // markers (which match /\[(\d+)\]/) render. Handles grouped 【1, 2】 -> [1][2] too.
  answer = answer.replace(/[【〔]\s*([\d,\s]+)\s*[】〕]/g, (_m, nums: string) =>
    nums
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `[${s}]`)
      .join(""),
  );

  const sources: Source[] = used.map((m, i) => ({
    n: i + 1,
    title: m.metadata?.title ?? "",
    collection: m.metadata?.collection ?? "",
    kind: m.metadata?.kind ?? null,
    url: m.metadata?.url ?? null,
    image: m.metadata?.image ?? null,
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
    // Merge the collection-filtered set (for complete enumeration) with the top
    // unfiltered hits — the latter surface firm-level "about" docs that the kind
    // filter excludes (e.g. an AUM question that also says "portfolio"). Keep the
    // most relevant by score so neither intent starves the other.
    used = dedupe([...filtered, ...general])
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12);
  } else {
    const matches = await search(env, vector, { topK: 10 });
    const relevant = matches.filter((m: any) => m.score >= 0.45);
    used = (relevant.length ? relevant : matches).slice(0, 8);
  }

  return generate(env, question, used);
}
