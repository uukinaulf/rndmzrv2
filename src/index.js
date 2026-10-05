// rndmzr worker
// - static assets otomatis (wrangler assets)
// - /rss dan /rss.xml -> RSS rilisan anime dari samehadaku (via upstream)

const UPSTREAM_FEED = "https://v2.samehadaku.how/feed/";
const CACHE_TTL = 900; // 15 menit

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // RSS proxy
    if (url.pathname === "/rss" || url.pathname === "/rss.xml") {
      return handleRss(request, url, ctx);
    }

    // static assets
    return env.ASSETS.fetch(request);
  },
};

async function handleRss(request, url, ctx) {
  const cacheKey = new Request(url.origin + url.pathname);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(UPSTREAM_FEED, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });
  if (!res.ok) return new Response("Gagal ambil feed upstream", { status: 502 });
  const xml = await res.text();

  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const chunk = m[1];
    const g = (name) => {
      const r = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`);
      const x = r.exec(chunk);
      return x ? htmlDecode(x[1]).trim() : "";
    };
    const title = g("title");
    if (!title) continue;
    items.push({
      title,
      link: g("link"),
      pub: g("pubDate"),
      cat: g("category") || "Anime",
      guid: g("guid") || g("link"),
    });
  }

  if (!items.length) return new Response("Gagal ambil feed upstream", { status: 502 });

  const origin = url.origin;
  const out =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `<title>Rilisan Anime Sub Indo — Samehadaku (via rndmzr)</title>\n` +
    `<link>${escapeXml(origin + "/rss")}</link>\n` +
    `<description>Rilisan anime terbaru sub Indo dari samehadaku.</description>\n` +
    `<language>id-ID</language>\n` +
    `<lastBuildDate>${escapeXml(items[0].pub || "")}</lastBuildDate>\n` +
    `<atom:link href="${escapeXml(origin + "/rss")}" rel="self" type="application/rss+xml"/>\n` +
    items.map((i) =>
      `  <item>\n` +
      `    <title>${escapeXml(i.title)}</title>\n` +
      `    <link>${escapeXml(i.link)}</link>\n` +
      `    <guid isPermaLink="false">${escapeXml(i.guid)}</guid>\n` +
      (i.pub ? `    <pubDate>${escapeXml(i.pub)}</pubDate>\n` : "") +
      `    <category>${escapeXml(i.cat)}</category>\n` +
      `    <description><![CDATA[Episode rilis baru ${escapeXml(i.title)} sub Indo]]></description>\n` +
      `  </item>\n`
    ).join("") +
    `</channel>\n</rss>\n`;

  const resp = new Response(out, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

function htmlDecode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
