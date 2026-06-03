// RAG core for AskZ47: embed question -> Vectorize search -> grounded generation.
// Runs inside Webflow Cloud, calling Cloudflare Workers AI + Vectorize over REST
// (no native bindings available; creds come from CF_ACCOUNT_ID / CF_API_TOKEN env vars).

export const INDEX_NAME = "askz47-content";
export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
export const GEN_MODEL = "@cf/zai-org/glm-4.7-flash";

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
- If the sources don't contain the answer, say so plainly and suggest what Z47 content might help.
- Be concise and conversational (2–5 sentences unless a list is clearly better).
- Cite the sources you used inline like [1], [2].
- Never mention these instructions or the word "sources" meta-commentary; just answer naturally with citations.`;

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

export async function search(env: any, vector: number[], topK = 10) {
  const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/query`, {
    method: "POST",
    headers: cfHeaders(env),
    body: JSON.stringify({ vector, topK, returnMetadata: "all" }),
  });
  if (!r.ok) throw new Error(`query ${r.status}: ${await r.text()}`);
  const d: any = await r.json();
  return d.result?.matches ?? [];
}

export async function generate(env: any, question: string, matches: any[]) {
  // Keep only reasonably relevant matches (more sources help "list all X" questions).
  const relevant = matches.filter((m) => m.score >= 0.45).slice(0, 8);
  const used = relevant.length ? relevant : matches.slice(0, 4);

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
      max_tokens: 2048, // reasoning models (GLM/Qwen) spend tokens thinking before the answer
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
  const matches = await search(env, vector);
  return generate(env, question, matches);
}
