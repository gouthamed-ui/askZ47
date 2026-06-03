// Offline indexer: Webflow CMS (5 collections) -> Workers AI embeddings -> Vectorize.
// Run: node --env-file=.env scripts/index-content.mjs
import {
  INDEX_NAME, EMBED_DIMS, COLLECTIONS,
  cfBase, cfHeaders, requireEnv, fetchLiveItems, buildDoc, embed, withRetry, buildNameMap,
} from "./lib/content.mjs";

const env = requireEnv();
const BATCH = 50; // items embedded + upserted per batch

async function ensureIndex() {
  const list = await fetch(`${cfBase(env)}/vectorize/v2/indexes`, { headers: cfHeaders(env) });
  const names = (await list.json()).result?.map((i) => i.name) || [];
  if (names.includes(INDEX_NAME)) {
    console.log(`✓ Vectorize index "${INDEX_NAME}" exists`);
    return;
  }
  const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes`, {
    method: "POST",
    headers: cfHeaders(env),
    body: JSON.stringify({
      name: INDEX_NAME,
      config: { dimensions: EMBED_DIMS, metric: "cosine" },
    }),
  });
  if (!r.ok) throw new Error(`Create index failed: ${r.status} ${await r.text()}`);
  console.log(`✓ Created Vectorize index "${INDEX_NAME}" (${EMBED_DIMS}d, cosine)`);
}

// Ensure a metadata index exists on `kind` so we can filter queries by collection.
// (Vectorize only indexes vectors upserted AFTER the metadata index is created — we re-upsert all below.)
async function ensureMetadataIndex() {
  const list = await fetch(
    `${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/metadata_index/list`,
    { headers: cfHeaders(env) },
  );
  const props = (await list.json()).result?.metadataIndexes?.map((m) => m.propertyName) || [];
  if (props.includes("kind")) {
    console.log('✓ Metadata index on "kind" exists');
    return;
  }
  const r = await fetch(
    `${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/metadata_index/create`,
    {
      method: "POST",
      headers: cfHeaders(env),
      body: JSON.stringify({ propertyName: "kind", indexType: "string" }),
    },
  );
  if (!r.ok) throw new Error(`Create metadata index failed: ${r.status} ${await r.text()}`);
  console.log('✓ Created metadata index on "kind"');
}

async function upsert(vectors) {
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");
  await withRetry(async () => {
    const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/x-ndjson" },
      body: ndjson,
    });
    if (!r.ok) throw new Error(`Upsert ${r.status}: ${await r.text()}`);
  }, "upsert batch");
}

async function run() {
  await ensureIndex();
  await ensureMetadataIndex();
  console.log("Building reference name map (sectors, focus areas, companies, people)…");
  const nameMap = await buildNameMap(env.WEBFLOW_API_TOKEN);
  console.log(`✓ Name map: ${nameMap.size} entries`);
  let grandTotal = 0;

  for (const col of COLLECTIONS) {
    const items = await fetchLiveItems(env.WEBFLOW_API_TOKEN, col.id);
    const docs = items.map((it) => buildDoc(col, it, nameMap)).filter((d) => d.text.length > 20);
    console.log(`\n${col.label}: ${items.length} live items -> ${docs.length} indexable`);
    if (docs[0]) console.log(`  sample url: ${docs[0].metadata.url ?? "(none)"}`);

    for (let i = 0; i < docs.length; i += BATCH) {
      const slice = docs.slice(i, i + BATCH);
      const vectors = await embed(env, slice.map((d) => d.text));
      const payload = slice.map((d, j) => ({ id: d.id, values: vectors[j], metadata: d.metadata }));
      await upsert(payload);
      grandTotal += slice.length;
      process.stdout.write(`  upserted ${Math.min(i + BATCH, docs.length)}/${docs.length}\r`);
    }
    console.log("");
  }

  console.log(`\n✅ Indexed ${grandTotal} items into "${INDEX_NAME}".`);
}

run().catch((e) => {
  console.error("\n✗ Indexing failed:", e.message);
  process.exit(1);
});
