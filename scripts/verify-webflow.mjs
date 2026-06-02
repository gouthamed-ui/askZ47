// Verify the Webflow API connection using .env credentials.
// Usage: node --env-file=.env scripts/verify-webflow.mjs   (Node 20.6+)
//   or:  node scripts/verify-webflow.mjs                    (after `source .env` / exported vars)

const { WEBFLOW_SITE_ID, WEBFLOW_API_TOKEN } = process.env;

if (!WEBFLOW_SITE_ID || !WEBFLOW_API_TOKEN || WEBFLOW_API_TOKEN.startsWith("replace-with")) {
  console.error("✗ Missing WEBFLOW_SITE_ID or WEBFLOW_API_TOKEN. Fill them in .env first.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
  "accept-version": "2.0.0",
};

const site = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}`, { headers });
if (!site.ok) {
  console.error(`✗ Site request failed: ${site.status} ${site.statusText}`);
  console.error(await site.text());
  process.exit(1);
}
const siteData = await site.json();
console.log(`✓ Connected to Webflow site: ${siteData.displayName} (${siteData.shortName})`);
console.log(`  Domains: ${(siteData.customDomains ?? []).map((d) => d.url).join(", ") || "—"}`);

const collections = await fetch(
  `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/collections`,
  { headers },
);
if (collections.ok) {
  const { collections: list = [] } = await collections.json();
  console.log(`✓ CMS access OK — ${list.length} collection(s) visible.`);
} else {
  console.warn(`! CMS collections not accessible (${collections.status}). Check the token's CMS read scope.`);
}
