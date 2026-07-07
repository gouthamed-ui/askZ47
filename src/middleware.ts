// Keep the AskZ47 app (/app) out of search indexes. The app is mounted on the
// production domain (www.z47.com/app), so every response — the chat page AND the
// /api/* endpoints — gets X-Robots-Tag: noindex,nofollow so crawlers don't index
// the app or its answer API. Complements the <meta name="robots" content="noindex">
// in index.astro; pair with a `Disallow: /app` rule in the site robots.txt for
// full no-crawl.
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});
