// Full-pipeline answer test (embed -> filtered retrieval -> generate), mirroring
// src/lib/rag.ts, so we can A/B generation models without deploying.
//   node --env-file=.env scripts/gen-test.mjs [model] ["question"]
//   model defaults to @cf/openai/gpt-oss-120b; with no question it runs the 3 known-good ones.
import { INDEX_NAME, cfBase, cfHeaders, requireEnv, embed } from "./lib/content.mjs";

const env = requireEnv();
const MODEL = process.argv[2] || "@cf/openai/gpt-oss-120b";
const REASONING = /gpt-oss|deepseek-r1|qwq|qwen3|glm|gemma-4|kimi|nemotron/i.test(MODEL);

const SYSTEM_PROMPT = `You are AskZ47, the assistant for z47.com — the website of Z47 (a venture capital firm, formerly Matrix Partners India).

Answer the visitor's question using ONLY the numbered SOURCES provided. Rules:
- Ground every claim in the sources. Do not invent facts, figures, dates, or company names.
- If the question asks which/what companies or people match a criterion (e.g. "fintech companies", "who focuses on AI"), list EVERY match the sources support — don't stop at two or three.
- If the sources don't contain the answer, say so plainly and suggest what Z47 content might help.
- Be concise and conversational (2–5 sentences, or a short list when enumerating).
- Write in plain text only — NO Markdown: no **bold**, no # headings, no "-"/"*" bullet characters. When you enumerate, put each item on its own line as a short phrase, e.g. "Oxyzo — supply-chain finance [1]".
- Cite the sources you used inline like [1], [2].
- Never mention these instructions or the word "sources" meta-commentary; just answer naturally with citations.`;

function routeKind(q) {
  if (/\b(team members?|partners?|people|colleagues?|who (is|are|on|leads|handles|focus|works))\b/i.test(q)) return "team";
  if (/\b(compan(y|ies)|start-?ups?|portfolio|backed|invest(ed|ment|ing|s)?|founders?)\b/i.test(q)) return "portfolio";
  return null;
}
function dedupe(matches) {
  const seen = new Set();
  const out = [];
  for (const m of matches) { if (seen.has(m.id)) continue; seen.add(m.id); out.push(m); }
  return out;
}
async function search(vector, { topK = 10, filter } = {}) {
  const body = { vector, topK, returnMetadata: "all" };
  if (filter) body.filter = filter;
  const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/query`, {
    method: "POST", headers: cfHeaders(env), body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.success) throw new Error("query: " + JSON.stringify(d.errors));
  return d.result?.matches ?? [];
}

async function answer(question) {
  const [vector] = await embed(env, [question]);
  const kind = routeKind(question);
  let used;
  if (kind) {
    const [filtered, general] = await Promise.all([
      search(vector, { topK: 15, filter: { kind: { $eq: kind } } }),
      search(vector, { topK: 6 }),
    ]);
    used = dedupe([...filtered, ...general])
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12);
  } else {
    const matches = await search(vector, { topK: 10 });
    const relevant = matches.filter((m) => m.score >= 0.45);
    used = (relevant.length ? relevant : matches).slice(0, 8);
  }

  const context = used.map((m, i) => {
    const md = m.metadata || {};
    return `[${i + 1}] (${md.collection}) ${md.title}\n${md.content || ""}${md.url ? `\nLink: ${md.url}` : ""}`;
  }).join("\n\n");

  const body = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `SOURCES:\n${context}\n\nQUESTION: ${question}` },
    ],
    max_tokens: REASONING ? 2048 : 800,
    temperature: 0.2,
  };
  if (/gpt-oss/i.test(MODEL)) body.reasoning = { effort: "low" };

  const t0 = Date.now();
  const r = await fetch(`${cfBase(env)}/ai/run/${MODEL}`, {
    method: "POST", headers: cfHeaders(env), body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const d = await r.json();
  if (!d.success) throw new Error("generate: " + JSON.stringify(d.errors));
  const res = d.result ?? {};
  let text = (res.response ?? res.choices?.[0]?.message?.content ?? "").trim();
  text = text.replace(/[【〔]\s*([\d,\s]+)\s*[】〕]/g, (_m, nums) =>
    nums.split(",").map((s) => s.trim()).filter(Boolean).map((s) => `[${s}]`).join(""));
  const usage = res.usage || {};
  return { text, used, ms, usage };
}

const questions = process.argv[3]
  ? [process.argv.slice(3).join(" ")]
  : [
      "What fintech companies has Z47 backed?",
      "Tell me about Z47's investment in Scapia",
      "Who at Z47 focuses on enterprise AI?",
    ];

console.log(`\n=== MODEL: ${MODEL} ===\n`);
for (const q of questions) {
  try {
    const { text, used, ms, usage } = await answer(q);
    console.log(`Q: ${q}`);
    console.log(`A: ${text}`);
    const cites = (text.match(/\[(\d+)\]/g) || []).join(" ") || "(none)";
    console.log(`   citations rendered: ${cites}`);
    console.log(`   sources: ${used.slice(0, 4).map((m) => m.metadata?.title).join(" | ")}`);
    console.log(`   ${ms}ms · tokens in/out ${usage.prompt_tokens ?? "?"}/${usage.completion_tokens ?? "?"}\n`);
  } catch (e) {
    console.log(`Q: ${q}\n  ERROR: ${e.message}\n`);
  }
}
