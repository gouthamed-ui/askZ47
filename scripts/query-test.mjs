// Quick retrieval test: embed a question, query Vectorize, print top matches.
// Run: node --env-file=.env scripts/query-test.mjs "your question here"
import { INDEX_NAME, cfBase, cfHeaders, requireEnv, embed } from "./lib/content.mjs";

const env = requireEnv();
const question = process.argv.slice(2).join(" ") || "What fintech companies has Z47 backed?";

const [vec] = await embed(env, [question]);

const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/query`, {
  method: "POST",
  headers: cfHeaders(env),
  body: JSON.stringify({ vector: vec, topK: 6, returnMetadata: "all" }),
});
const d = await r.json();
if (!d.success) {
  console.error("Query failed:", JSON.stringify(d.errors));
  process.exit(1);
}

console.log(`\nQ: ${question}\n`);
for (const m of d.result.matches) {
  const md = m.metadata || {};
  console.log(`[${m.score.toFixed(3)}] ${md.collection} — ${md.title}`);
  console.log(`   ${md.url || "(no url)"}`);
  console.log(`   ${(md.content || "").slice(0, 160)}…\n`);
}
