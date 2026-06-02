import type { APIRoute } from "astro";

// Verifies the Cloudflare-REST path: reads CF_ACCOUNT_ID + CF_API_TOKEN env vars
// (added in the Webflow Cloud dashboard) and makes a tiny Workers AI REST call.
// Never returns secret values — only presence flags and the model's reply.
const GEN_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env as Env | undefined;
  const acct = env?.CF_ACCOUNT_ID;
  const token = env?.CF_API_TOKEN;

  const result: Record<string, unknown> = {
    envKeys: env ? Object.keys(env).sort() : null,
    hasCfAccountId: !!acct,
    hasCfApiToken: !!token,
  };

  if (acct && token) {
    try {
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${GEN_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Reply with exactly: REST AI works." }],
            max_tokens: 16,
          }),
        },
      );
      const data: any = await r.json();
      result.restStatus = r.status;
      result.restResponse = data?.result?.response ?? data?.errors ?? data;
    } catch (e: any) {
      result.restError = String(e?.message ?? e);
    }
  } else {
    result.note = "Add CF_ACCOUNT_ID and CF_API_TOKEN as env vars in the Webflow Cloud dashboard, then redeploy.";
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
