// Index a CURATED static content pack (firm overview, stats, practices, FAQs, programs,
// reports, team titles) into the same Vectorize index as the CMS content. These fill
// firm-level gaps the CMS-derived index handles poorly (AUM/stats, theses, identity, org).
//
//   node --env-file=.env scripts/index-static.mjs
//
// Idempotent: every doc has a stable `static:*` id (no collision with CMS `kind:<id>` ids),
// so re-running upserts in place. Source: the Z47 LLM + AEO content pack.
import { INDEX_NAME, cfBase, cfHeaders, requireEnv, embed, withRetry } from "./lib/content.mjs";

const env = requireEnv();
const W = "https://www.z47.com"; // canonical host (apex 404s on CMS pages)

// kind values reuse the CMS filter vocabulary where it helps retrieval routing:
//   "team"      -> picked up by team-intent filtered retrieval
//   "portfolio" -> picked up by company/portfolio-intent filtered retrieval
//   "about"     -> firm-level reference; surfaces via general (unfiltered) search
const DOCS = [
  {
    id: "static:overview",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "About Z47 — India-focused venture capital firm",
    content:
      "Z47 (formerly Matrix Partners India) is an India-focused venture capital firm operating since 2006 that backs missionary founders building for a developed India by 2047. It is a tribe of former founders and operators turned investors who partner with companies from Seed to Series B across Fintech, Consumer, Software & AI, and DeepTech, plus pre-seed via its DeVC platform. Tagline: Founders First. Developed Nation Building. Positioning: early partners to missionary founders building a developed nation. Z47 operates with a 'founders first' philosophy — providing experience, expertise and empathy alongside capital — serving as a first port of call, brainstorming partner, advisor, coach and confidante. Contact: namaste@z47.com.",
  },
  {
    id: "static:stats",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "Z47 facts and figures — AUM, investments, unicorns, fund size",
    content:
      "Z47 is a venture capital firm operating since 2006, formerly known as Matrix Partners India. Founder and Investor: Avnish Bajaj. Assets under management: $3.5 billion. Investments to date: 150+ since 2006. Unicorns in portfolio: 10. Active portfolio companies: 100+. Investment stage (main fund): Seed to Series B. Pre-seed platform: DeVC. Practice areas: Fintech, Consumer, Software & AI, DeepTech. Geographic focus: India. Contact: namaste@z47.com. Website: https://www.z47.com.",
  },
  {
    id: "static:name-mission",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "What the name Z47 means and the Matrix Partners India rebrand",
    content:
      "The name Z47 refers to the firm's mission: helping build India as a developed nation by the year 2047. Every investment is framed as a step toward that mission. Z47 is the rebrand of Matrix Partners India, which has operated since 2006. As part of the transition the firm's long-running startup show 'Matrix Moments' was rebranded to 'Zero to Infinity'.",
  },
  {
    id: "static:founder",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "Who founded Z47 — Avnish Bajaj",
    content:
      "Avnish Bajaj is Z47's Founder and Investor. He hosts the firm's flagship founder podcast 'Unstarted' and features prominently in Z47's content and community programs. Z47 was formerly Matrix Partners India and has operated since 2006.",
  },
  {
    id: "static:values",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "Z47's core values and five pillars",
    content:
      "Z47 calls itself a 'founders first' firm. Beyond capital, the team acts as a first port of call, brainstorming partner, advisor, coach and confidante — supporting founders from hiring to hyper-scaling. Z47 operates around five pillars: Founders First, True Partnerships, Thoughtful Action, Purpose Driven, and Growth Mindset.",
  },
  {
    id: "static:stage-process",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "What stage Z47 invests at, and how founders can pitch",
    content:
      "Z47's main fund invests from Seed to Series B. Pre-seed checks are written through DeVC, the firm's dedicated pre-seed platform led by Rahul Mathur (Vice President, DeVC). The firm enters early-stage partnerships where it can best support founders in hiring, go-to-market and scaling. Founders can pitch Z47 at namaste@z47.com or via the contact page https://www.z47.com/contact — pre-seed founders may route through DeVC; Seed to Series B founders go through the main fund's practice teams.",
  },
  {
    id: "static:practice-fintech",
    kind: "about", collection: "Z47 Practice — Fintech", url: `${W}/fintech`,
    title: "Z47 Fintech practice",
    content:
      "Fintech is one of Z47's four core practices. Thesis: 'We're not chasing the next fintech wave. We're helping build the tide.' Focus: lending, payments, credit/BNPL, wealth, banking and consumption products for Emergent India and India's affluent segment, including phygital models that blend distribution trust with digital UX — accessible and affordable for every Indian. Fintech portfolio companies include Razorpay, OneCard, Scapia, Finnable, Stable Money, Five Star Business Finance, Seeds Fincap, Oolka, InPrime Finserv, Dezerv, Jupiter, Nakad, Oxyzo, Mswipe and Liquiloans.",
  },
  {
    id: "static:practice-consumer",
    kind: "about", collection: "Z47 Practice — Consumer", url: `${W}/consumer`,
    title: "Z47 Consumer practice",
    content:
      "Consumer is one of Z47's four core practices. Thesis: 'India isn't just consuming more — it's consuming differently.' Focus: brands and platforms that are culturally fluent, tech-enabled and globally ambitious — using AI to personalise, storytelling to differentiate and trust to scale across how Indians eat, shop and travel. Consumer portfolio companies include Ola, Practo, Country Delight, Dailyhunt, Limeroad, Foxtale, The Whole Truth, Stanza Living, Testbook, Treebo, W for Women, Zupee, Trampoline, Woo, Oziva and Mosaic Wellness.",
  },
  {
    id: "static:practice-software-ai",
    kind: "about", collection: "Z47 Practice — Software & AI", url: `${W}/software-ai`,
    title: "Z47 Software & AI practice",
    content:
      "Software & AI is one of Z47's four core practices. Thesis: 'It's time to build AI-native software companies from India. Agile, global-first, and designed to replace legacy incumbents.' Focus: AI-native software across infrastructure, tools and vertical SaaS — founders rewriting the enterprise and software stack for the AI age against the backdrop of a $240B IT-BPO sector facing direct AI disruption. Software & AI portfolio companies include Atomicwork, MoEngage, SuperOps.ai, Rocketlane, SiftHub, GreyLabs, Aampe, Toddle, Murf AI and 100ms.",
  },
  {
    id: "static:practice-deeptech",
    kind: "about", collection: "Z47 Practice — DeepTech", url: `${W}/deeptech`,
    title: "Z47 DeepTech practice",
    content:
      "DeepTech is one of Z47's four core practices. Thesis: 'India's economic rise and technological sovereignty will be built in hardware, manufacturing, and frontier infrastructure.' Focus: advanced manufacturing, global supply chains, hardware, supply chain infrastructure, agri-tech, logistics, cross-border supply chains and B2B marketplaces — alongside AI infrastructure, semiconductors, energy, EVs, defence and space tech. DeepTech portfolio companies include OfBusiness, Captain Fresh, Bijnis, Vegrow, LoadShare, FarMart, ZippMat, SevenLoop (formerly Ximkart), Wootz.work, WizCommerce (formerly SourceWiz), Cirkla, Ola Electric, Neysa and Krutrim.",
  },
  {
    id: "static:sectors",
    kind: "about", collection: "Z47 Overview", url: `${W}/portfolio`,
    title: "What sectors Z47 invests in",
    content:
      "Z47 invests across four practice areas: Fintech, Consumer, Software & AI, and DeepTech. Each practice is led by operators with domain depth, targeting founders building for a developed India by 2047. Pre-seed investments are made through DeVC. Spanning AI-native software and vertical SaaS, culturally fluent consumer brands, inclusive financial products for Emergent India, and advanced manufacturing, semiconductors, space tech and indigenous AI infrastructure.",
  },
  {
    id: "static:beyond-capital",
    kind: "about", collection: "Z47 Overview", url: `${W}/about`,
    title: "What Z47 does beyond writing a cheque",
    content:
      "Z47 describes itself as a 'founders first' investor. Beyond capital, the team serves as a first port of call, brainstorming partner, advisor, coach and confidante — supporting founders across hiring, go-to-market, operations and scaling. The operators-turned-investors model is core to its partnership approach, helping founders go further, faster from hiring to hyper-scaling.",
  },
  {
    id: "static:featured-companies",
    kind: "portfolio", collection: "Z47 Portfolio", url: `${W}/portfolio`,
    title: "Z47's most well-known portfolio companies",
    content:
      "Z47's most well-known / spotlight portfolio companies: Ola (India's largest mobility platform; Consumer); Razorpay (India's first full-stack financial solutions company; Fintech); OfBusiness (tech-driven SME financing with raw-material fulfillment; DeepTech); Five Star Business Finance (NBFC for small-business and housing loans, now publicly listed; Fintech); Ola Electric (indigenous EV infrastructure at scale; DeepTech); Krutrim (India-first AI infrastructure and foundational models; DeepTech); Neysa (AI cloud and networking infrastructure; DeepTech); MoEngage (customer engagement platform; Software & AI); Atomicwork (AI-native enterprise service management; Software & AI); Jupiter (digital-first neobanking; Fintech); OneCard (mobile-first credit card; Fintech); Practo (consumer healthcare; Consumer); Country Delight (D2C fresh dairy; Consumer). Z47 has 150+ investments and 10 unicorns.",
  },
  {
    id: "static:reports",
    kind: "about", collection: "Z47 Reports & Research", url: `${W}/z47-moments`,
    title: "Z47 reports and research publications",
    content:
      "Z47 publishes sector research reports: State of the Fintech Union 2024 (https://www.z47.com/report/state-of-the-fintech-union-2024); Digitizing Consumers in India Report 2023 (https://www.z47.com/report/digitizing-consumers-in-india-report-2023); Digitizing Make in India Report 2025 (https://www.z47.com/report/digitizing-make-in-india-report-2025). Additional essays and insights are published under Z47 Moments at https://www.z47.com/z47-moments, and the firm runs a newsletter at https://www.z47.com/newsletter.",
  },
  {
    id: "static:program-unstarted",
    kind: "about", collection: "Z47 Programs — Unstarted", url: `${W}/unstarted`,
    title: "Unstarted — Z47's founder podcast",
    content:
      "Unstarted is Z47's founder podcast, hosted by Avnish Bajaj. Described as 'for founders, by founders', it goes beyond highlight reels into the real wrong turns, pivots, regulatory setbacks and non-linear paths behind successful companies. Guests have included founders from Dream11, Meesho, Foxtale and boAt. Episodes are audio on Spotify and video on YouTube, typically 30–45 minutes. Submit questions at https://www.z47.com/unstarted/ask.",
  },
  {
    id: "static:program-zalpha",
    kind: "about", collection: "Z47 Programs — Zalpha", url: `${W}/zalpha`,
    title: "Zalpha — Z47's portfolio showcase",
    content:
      "Zalpha is Z47's portfolio showcase — an intimate gathering bringing together fearless portfolio founders with operators and investors across fintech, software & AI, consumer and deeptech. It positions Z47's portfolio as companies accelerating India's path to a developed nation by 2047. The 2026 edition lives at https://www.z47.com/zalpha-2026.",
  },
  {
    id: "static:programs-other",
    kind: "about", collection: "Z47 Programs", url: `${W}/z47-moments`,
    title: "Z47 content and community programs",
    content:
      "Z47's content and community programs: 'Zero to Infinity' is Z47's long-running startup show (formerly 'Matrix Moments') covering company-building, founder journeys and operating playbooks. 'Z47 Moments' (https://www.z47.com/z47-moments) is the index of founder stories, thesis pieces, portfolio deep-dives and recaps. 'The India AI Edge' (https://www.z47.com/the-india-ai-edge) is Z47's narrative on India's position in the global AI shift. 'Future Signals' (https://www.z47.com/future-signals) is an early-signal tracker. 'Land & Expand' (https://www.z47.com/land-expand) is a playbook for expansion-stage founders. Newsletter signup: https://www.z47.com/newsletter.",
  },
  {
    id: "static:team",
    kind: "team", collection: "Z47 Team", url: `${W}/team`,
    title: "Z47 team and leadership",
    content:
      "Z47 Investments team: Avnish Bajaj (Founder and Investor); Aakash Kumar, Rajat Agarwal, Rajinder Balaraman, Tarun Davda, Vikram Vaidyanathan (Managing Directors); Anish Patil (Principal); Ashwin Pandian, Kishan Kashyap (Vice Presidents); Dhairen Tohliani (Associate Vice President); Aniket Mishra, Nipun Singhal (Associates); Yashasvi Madhogaria (Senior Analyst, DeepTech). Operations team: Rohan Dixit (MD, Finance); Rupali Sharma (MD, Human Capital); Priyank Shrivastava (SVP, Finance); Mayukh Datta (Director and Head of Legal); Vijay Pillai (Director, Corporate Development); Madhav Toshniwal (VP, Finance); Rahul Mathur (VP, DeVC); Rohit Kumar, Prajwal Kumar (VP, Human Capital); Vineet Kanabar, Madhavi Varanasi (VP, Marketing); Girish Shenoy (AVP, Corporate Development); Kanchana Sharalaya (AVP, Legal).",
  },
];

async function upsert(vectors) {
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");
  await withRetry(async () => {
    const r = await fetch(`${cfBase(env)}/vectorize/v2/indexes/${INDEX_NAME}/upsert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/x-ndjson" },
      body: ndjson,
    });
    if (!r.ok) throw new Error(`Upsert ${r.status}: ${await r.text()}`);
  }, "upsert static");
}

async function run() {
  console.log(`Indexing ${DOCS.length} curated docs into "${INDEX_NAME}"…`);
  const texts = DOCS.map((d) => `${d.title}. ${d.content}`);
  const vectors = await embed(env, texts);
  const payload = DOCS.map((d, i) => ({
    id: d.id,
    values: vectors[i],
    metadata: {
      collection: d.collection,
      kind: d.kind,
      title: d.title.slice(0, 200),
      url: d.url,
      content: d.content.slice(0, 2000),
    },
  }));
  await upsert(payload);
  console.log(`✅ Upserted ${payload.length} curated docs.`);
  for (const d of DOCS) console.log(`   ${d.id}  [${d.kind}]  ${d.title}`);
}

run().catch((e) => {
  console.error("\n✗ Static indexing failed:", e.message);
  process.exit(1);
});
