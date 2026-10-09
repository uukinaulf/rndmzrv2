// rndmzr worker
// - static assets otomatis (wrangler assets)
// - /rss  dan /rss.xml -> RSS XML rilisan anime (buat reader)
// - /api/rss          -> JSON rilisan anime (buat UI)
// - /anime            -> halaman UI daftar rilis
// - /                -> fallback ke static

const CACHE_TTL = 900; // 15 menit
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Sumber feed anime. `kind` menentukan parser download & thumb.
// samehadaku = episode (download-eps), kusonime = batch (smokeurlrh)
const SOURCES = [
  {
    id: "samehadaku",
    label: "Samehadaku",
    kind: "episode",
    feed: "https://v2.samehadaku.how/feed/",
    host: "samehadaku",
  },
  {
    id: "kusonime",
    label: "Kusonime",
    kind: "batch",
    feed: "https://kusonime.com/feed/",
    host: "kusonime",
  },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/rss" || url.pathname === "/rss.xml") {
      return handleRss(request, url, ctx);
    }
    if (url.pathname === "/api/episode") {
      return handleEpisode(url);
    }
    if (url.pathname === "/api/search") {
      return handleSearch(url);
    }
    if (url.pathname === "/api/rss") {
      try {
        const payload = await getItems(request, ctx);
        return Response.json(payload, { headers: { "cache-control": `public, max-age=${CACHE_TTL}` } });
      } catch (e) {
        return Response.json({ error: String(e && e.message || e) }, { status: 502 });
      }
    }
    if (url.pathname === "/anime" || url.pathname === "/anime/") {
      return new Response(renderPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

/* ---------- shared: fetch + parse feed ---------- */
let inflight = null;
async function getItems(request, ctx) {
  if (inflight) return inflight;
  inflight = (async () => {
    const results = await Promise.allSettled(SOURCES.map(async (src) => {
      try {
        const res = await fetch(src.feed, {
          headers: { "User-Agent": UA },
          cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
        });
        if (!res.ok) return [];
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
          const cats = [];
          const catRe = /<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g;
          let cm;
          while ((cm = catRe.exec(chunk))) cats.push(htmlDecode(cm[1]).trim());
          const cat = cats.filter((c) => c.toLowerCase() !== "anime").pop() || cats[0] || "Anime";
          const rawDesc = g("description");
          const synopsis = rawDesc
            ? htmlDecode(rawDesc).replace(/<[^>]+>/g, "").replace(/\s*The post .*$/i, "").trim()
            : "";
          items.push({
            title,
            link: g("link"),
            pub: g("pubDate"),
            cat,
            guid: g("guid") || g("link"),
            source: src.id,
            sourceLabel: src.label,
            kind: src.kind,
            synopsis,
          });
        }
        return items;
      } catch {
        return [];
      }
    }));
    const items = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);

    // resolve thumbnail tiap item paralel (feed kosong tanpa gambar)
    const thumbs = await Promise.all(items.map(async (it) => {
      try {
        const h = await fetch(it.link, { headers: { "User-Agent": UA }, cf: { cacheTtl: CACHE_TTL, cacheEverything: true } });
        if (!h.ok) return "";
        const body = await h.text();
        const og = /<meta[^>]+(?:property|name)="og:image"[^>]+content="([^"]+)"/.exec(body);
        if (og && og[1]) return htmlDecode(og[1]);
        const anm = /<img\b[^>]*class="[^"]*anmsa[^"]*"[^>]*src="([^"]+)"|<img\b[^>]*src="([^"]+)"[^>]*class="[^"]*anmsa[^"]*"/i.exec(body);
        return anm ? htmlDecode(anm[1] || anm[2]) : "";
      } catch {
        return "";
      }
    }));
    items.forEach((it, i) => { it.thumb = thumbs[i]; });

    // urut: terbaru dulu, gabung semua sumber
    items.sort((a, b) => (a.pub < b.pub ? 1 : -1));
    return { items, fetchedAt: new Date().toISOString() };
  })().finally(() => { inflight = null; });
  return inflight;
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

async function handleRss(request, url, ctx) {
  let payload;
  try {
    payload = await getItems(request, ctx);
  } catch (e) {
    return new Response("Gagal ambil feed upstream", { status: 502 });
  }
  const { items } = payload;
  const out =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `<title>Rilisan Anime Sub Indo (via rndmzr)</title>\n` +
    `<link>${escapeXml(url.origin + "/rss")}</link>\n` +
    `<description>Rilisan anime terbaru sub Indo dari Samehadaku & Kusonime.</description>\n` +
    `<language>id-ID</language>\n` +
    `<lastBuildDate>${escapeXml(items[0]?.pub || "")}</lastBuildDate>\n` +
    `<atom:link href="${escapeXml(url.origin + "/rss")}" rel="self" type="application/rss+xml"/>\n` +
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
  return new Response(out, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": `public, max-age=${CACHE_TTL}` },
  });
}

/* ---------- detail episode: thumbnail + link download ---------- */
const episodeCache = new Map();

async function handleEpisode(url) {
  const target = url.searchParams.get("u");
  if (!target) return Response.json({ error: "param u wajib" }, { status: 400 });
  let epUrl;
  try {
    epUrl = new URL(target);
  } catch {
    return Response.json({ error: "url invalid" }, { status: 400 });
  }

  const cacheKey = epUrl.href;
  const cached = episodeCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL * 1000) {
    return Response.json(cached.data, {
      headers: { "cache-control": `public, max-age=${CACHE_TTL}` },
    });
  }

  let res;
  try {
    res = await fetch(epUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
  } catch (e) {
    return Response.json({ error: `timeout upstream (${e && e.message || e})` }, { status: 504 });
  }
  if (!res.ok) return Response.json({ error: `gagal ambil halaman (${res.status})` }, { status: 502 });
  const html = await res.text();

  // thumbnail: <img ... class="anmsa" ... src="..."> (src bisa sebelum/sesudah class)
  let thumb = "";
  const anmsaRe = /<img\b[^>]*class="[^"]*anmsa[^"]*"[^>]*src="([^"]+)"|<img\b[^>]*src="([^"]+)"[^>]*class="[^"]*anmsa[^"]*"/gi;
  const am = anmsaRe.exec(html);
  if (am) thumb = htmlDecode(am[1] || am[2]);
  if (!thumb) {
    const ogRe = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i;
    const om = ogRe.exec(html);
    if (om) thumb = htmlDecode(om[1]);
  }

  // parser link download berdasarkan situs:
  // - samehadaku: .download-eps -> format + quality + host links
  // - kusonime: .smokeddl (.smokettlrh) -> .smokeurlrh -> <strong>quality</strong> link | link ...
  const groups = [];
  const isKusonime = epUrl.hostname.includes("kusonime");
  let synopsis = "";
  let score = "";
  let status = "";
  let duration = "";

  if (isKusonime) {
    const clearIdx = html.indexOf('<div class="clear"></div>');
    const smokeIdx = html.indexOf('class="smokeddl');

    if (clearIdx !== -1) {
      const beforeClear = html.slice(Math.max(0, clearIdx - 1500), clearIdx);
      const scoreM = beforeClear.match(/<p><b>Score<\/b>\s*:\s*([^<]+)<\/p>/i);
      const statusM = beforeClear.match(/<p><b>Status<\/b>\s*:\s*([^<]+)<\/p>/i);
      const durM = beforeClear.match(/<p><b>Duration<\/b>\s*:\s*([^<]+)<\/p>/i);
      if (scoreM) score = scoreM[1].trim();
      if (statusM) status = statusM[1].trim();
      if (durM) duration = durM[1].trim();

      const endIdx = smokeIdx !== -1 && smokeIdx > clearIdx ? smokeIdx : html.length;
      const content = html.slice(clearIdx, endIdx);
      const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => htmlDecode(m[1]).replace(/<[^>]+>/g, "").trim())
        .filter((t) => {
          if (t.length < 25) return false;
          const cleanT = t.replace(/^["'\u201C\u2018\s]+/, "");
          if (/^(?:credit|download|bila|link|peringatan|kenapa|lapor|tonton|note)\b/i.test(cleanT)) return false;
          return true;
        })
        .map((t) => t.replace(/\s*Fix\s+\d+.*$/i, "").trim());
      synopsis = paragraphs.slice(0, 3).join("\n\n");
    }

    const dlbodz = html.split(/<div class="smokeddl[^"]*">/);
    if (dlbodz.length > 1) {
      for (let i = 1; i < dlbodz.length; i++) {
        const chunk = dlbodz[i];
        const ttlMatch = chunk.match(/<div class="smokettlrh"[^>]*>([\s\S]*?)<\/div>/i);
        const rawTtl = ttlMatch ? ttlMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        let section = "";
        let shortSec = "";
        if (rawTtl) {
          section = rawTtl
            .replace(/^Download\s+/i, "")
            .replace(/\s+(?:Batch\s+)?(?:BD\s+)?(?:Subtitle|Sub)\s+Indo(?:nesia)?.*$/i, "")
            .trim();

          const sMatch = section.match(/(?:Season\s*(\d+)|S(\d+)|\(Season\s*(\d+)\)|Season\s*(IV|III|II|I|V|VI))/i);
          const partMatch = section.match(/(?:Part|Cour)\s*([\d\-]+)/i);
          const epMatch = section.match(/(?:Episode|Eps?\.?)\s*([\d\-]+)/i) || section.match(/(\d{2,4}\s*-\s*\d{2,4})/);
          if (sMatch) {
            const sVal = sMatch[1] || sMatch[2] || sMatch[3] || sMatch[4];
            shortSec = `Season ${sVal}`;
            if (partMatch) shortSec += ` Part ${partMatch[1]}`;
          } else if (partMatch) {
            shortSec = `Part ${partMatch[1]}`;
          } else if (epMatch) {
            shortSec = `Eps ${epMatch[1].replace(/\s+/g, "")}`;
          } else {
            shortSec = section.length > 20 ? section.slice(0, 18) + "…" : section;
          }
        }

        const smokeRe = /<div class="smokeurlrh"[^>]*>\s*<strong>([^<]*)<\/strong>([\s\S]*?)<\/div>/g;
        let km;
        while ((km = smokeRe.exec(chunk))) {
          const quality = htmlDecode(km[1]).trim();
          const links = [];
          const aRe = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>/g;
          let am;
          while ((am = aRe.exec(km[2]))) {
            const href = htmlDecode(am[1]).trim();
            const label = htmlDecode(am[2]).replace(/<[^>]+>/g, "").trim();
            if (label && href && !href.startsWith("#")) links.push({ label, href });
          }
          if (links.length) {
            groups.push({
              section: section || "Batch",
              shortSection: shortSec || (section || "Batch"),
              format: section || "Batch",
              quality,
              links,
            });
          }
        }
      }
    }

    if (!groups.length) {
      const kusoRe = /<div class="smokeurlrh"[^>]*>\s*<strong>([^<]*)<\/strong>([\s\S]*?)<\/div>/g;
      let km;
      while ((km = kusoRe.exec(html))) {
        const quality = htmlDecode(km[1]).trim();
        const links = [];
        const aRe = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>/g;
        let am;
        while ((am = aRe.exec(km[2]))) {
          const href = htmlDecode(am[1]).trim();
          const label = htmlDecode(am[2]).replace(/<[^>]+>/g, "").trim();
          if (label && href && !href.startsWith("#")) links.push({ label, href });
        }
        if (links.length) {
          groups.push({
            section: "Batch",
            shortSection: "Batch",
            format: "Batch",
            quality,
            links,
          });
        }
      }
    }
  } else {
    const descMatch = html.match(/<div class="(?:desc|entry-content|sinopsis|series-synopsis)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const scopeHtml = descMatch ? descMatch[1] : (html.indexOf('class="download-eps"') !== -1 ? html.slice(0, html.indexOf('class="download-eps"')) : "");
    if (scopeHtml) {
      const paragraphs = [...scopeHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => htmlDecode(m[1]).replace(/<[^>]+>/g, "").trim())
        .filter((t) => t.length > 30 && !/^(?:download|link|peringatan)\b/i.test(t));
      if (paragraphs.length) synopsis = paragraphs.slice(0, 2).join("\n\n");
    }

    const fmtRe = /<div class="download-eps"[^>]*>\s*<p><b>([^<]*)<\/b><\/p>\s*<ul>([\s\S]*?)<\/ul>/g;
    let fm;
    while ((fm = fmtRe.exec(html))) {
      const format = htmlDecode(fm[1]).trim();
      const ulInner = fm[2];
      const liRe = /<li>\s*<strong>([^<]*)<\/strong>\s*<div class="download-eps-links">([\s\S]*?)<\/div>\s*<\/li>/g;
      let lm;
      while ((lm = liRe.exec(ulInner))) {
        const quality = lm[1].trim();
        const links = [];
        const spanRe = /<span>(?:(?:<strike>([^<]*)<\/strike>)|\s*<a[^>]+href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>)/g;
        let sm;
        while ((sm = spanRe.exec(lm[2]))) {
          if (sm[1] !== undefined) links.push({ label: htmlDecode(sm[1]).trim(), dead: true });
          else links.push({ label: htmlDecode(sm[3]).trim(), href: htmlDecode(sm[2]) });
        }
        groups.push({
          section: format,
          shortSection: format,
          format,
          quality,
          links,
        });
      }
    }
  }

  const payload = {
    title: url.searchParams.get("t") || "",
    thumbnail: thumb || "",
    synopsis: synopsis || "",
    score: score || "",
    status: status || "",
    duration: duration || "",
    groups: groups.map((g) => ({
      quality: g.quality,
      format: g.format,
      section: g.section || "",
      shortSection: g.shortSection || "",
      links: g.links,
    })),
    source: epUrl.href,
  };
  episodeCache.set(cacheKey, { data: payload, time: Date.now() });
  return Response.json(payload, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
      "access-control-allow-origin": "*",
    },
  });
}

/* ---------- pencarian arsip web (kusonime + feed) ---------- */
async function handleSearch(url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return Response.json({ query: "", items: [], total: 0 });

  const results = [];
  const seen = new Set();

  // 1. Cari di katalog arsip Kusonime (3.500+ anime)
  try {
    const kRes = await fetch("https://kusonime.com/?s=" + encodeURIComponent(q), {
      headers: { "User-Agent": UA },
    });
    if (kRes.ok) {
      const html = await kRes.text();
      const koverRe = /<div class="kover">[\s\S]*?<div class="thumb">\s*<a href="([^"]+)" title="([^"]+)">[\s\S]*?<img\b[^>]*src="([^"]+)"[\s\S]*?<div class="content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
      let km;
      while ((km = koverRe.exec(html))) {
        const link = km[1];
        if (seen.has(link)) continue;
        seen.add(link);
        const title = htmlDecode(km[2]).trim();
        const thumb = km[3] || "";
        const content = km[4] || "";
        const genres = [];
        const gRe = /<a[^>]+href="https:\/\/kusonime\.com\/genres\/[^"]+"[^>]*>([^<]+)<\/a>/g;
        let gm;
        while ((gm = gRe.exec(content))) genres.push(htmlDecode(gm[1]).trim());
        const cat = genres.slice(0, 2).join(", ") || "Batch";

        results.push({
          title,
          link,
          thumb,
          cat,
          source: "kusonime",
          sourceLabel: "Kusonime",
          kind: "batch",
        });
      }
    }
  } catch (e) {
    console.error("search error:", e.message);
  }

  // 2. Tambah dari cache feed rilis lokal jika cocok
  try {
    const feed = await getItems();
    const qNorm = q.toLowerCase();
    for (const item of feed.items || []) {
      if (item.title.toLowerCase().includes(qNorm)) {
        if (!seen.has(item.link)) {
          seen.add(item.link);
          results.unshift(item);
        }
      }
    }
  } catch {}

  return Response.json(
    { query: q, items: results, total: results.length },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${CACHE_TTL}`,
      },
    }
  );
}

/* ---------- halaman UI /anime ---------- */
function renderPage() {
  return `<!doctype html>
<html lang="id" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rndmzr — Rilisan Anime</title>
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f3ead8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<script>
  const savedTheme = localStorage.getItem('rndmzr:theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
</script>
<style>${PAGE_CSS}</style>
</head>
<body>
<a class="skip" href="#list">Lewati ke daftar rilis</a>

<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11.7 4.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.3-1.3"/></svg></span>
      <span class="brand-text">rndmzr<em>/anime</em></span>
    </a>
    <div class="topbar-actions">
      <button id="themeBtn" class="icon-btn" type="button" aria-label="Ganti tema" title="Ganti tema (T)">
        <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      </button>
      <a class="btn-paper" href="/" title="Direktori Link Dev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11.7 4.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.3-1.3"/></svg>
        <span>Link Dev</span>
      </a>
      <a class="btn-paper" href="/rss" title="RSS mentah untuk reader">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg>
        <span>RSS</span>
      </a>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="bill">
    <h1>Rilisan <em>anime</em></h1>
    <p class="lede">Episode &amp; batch terbaru sub Indo. <span id="count">0</span> rilis di tangan, di-scrape otomatis tiap 15 menit.</p>
  </section>

  <div class="scope-nav" role="tablist" aria-label="Cakupan Pencarian">
    <button id="scopeFeed" class="scope-tab active" type="button" role="tab" aria-selected="true">
      <span class="scope-icon">⚡</span>
      <span>Rilisan Terbaru</span>
      <span id="feedCountBadge" class="scope-badge mono">0</span>
    </button>
    <button id="scopeWeb" class="scope-tab" type="button" role="tab" aria-selected="false">
      <span class="scope-icon">🌐</span>
      <span>Cari Seluruh Web</span>
      <span class="scope-badge mono">3.500+ Judul</span>
    </button>
  </div>

  <div class="search-bar">
    <div class="search">
      <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="Cari anime, episode, judul…" autocomplete="off" spellcheck="false" aria-label="Cari anime" aria-controls="list">
      <button id="searchWebSubmit" class="search-submit-btn" type="button" hidden>Cari Web ↵</button>
      <kbd class="hint-key" aria-hidden="true">/</kbd>
      <button id="clearBtn" class="clear-btn" type="button" aria-label="Bersihkan pencarian" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div id="webSuggest" class="web-suggest" hidden>
      <span class="web-suggest-label mono">Populer:</span>
      <button class="suggest-chip" type="button" data-q="Naruto">Naruto</button>
      <button class="suggest-chip" type="button" data-q="One Piece">One Piece</button>
      <button class="suggest-chip" type="button" data-q="Bleach">Bleach</button>
      <button class="suggest-chip" type="button" data-q="Jujutsu Kaisen">Jujutsu Kaisen</button>
      <button class="suggest-chip" type="button" data-q="Solo Leveling">Solo Leveling</button>
      <button class="suggest-chip" type="button" data-q="Attack on Titan">Attack on Titan</button>
      <button class="suggest-chip" type="button" data-q="Kimetsu no Yaiba">Demon Slayer</button>
      <button class="suggest-chip" type="button" data-q="Re:Zero">Re:Zero</button>
    </div>
  </div>

  <div id="filters" class="filters" aria-label="Filter sumber"></div>

  <p id="status" class="status sr-status" role="status" aria-live="polite"></p>

  <ul id="list" class="list">
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
  </ul>

  <div id="empty" class="empty" hidden>
    <p id="emptyMsg">Tidak ada rilisan yang cocok.</p>
    <button id="resetBtn" class="btn-paper" type="button" hidden>Reset filter &amp; cari</button>
  </div>
</main>

<dialog id="modal" class="modal">
  <div class="modal-card">
    <div class="modal-header">
      <div class="modal-stub-tag">
        <span class="modal-pass-label mono">TICKET PASS</span>
        <span id="modalSourceBadge" class="modal-source-badge">KUSONIME</span>
      </div>
      <button class="modal-close" id="modalClose" type="button" aria-label="Tutup modal (ESC)" title="Tutup (ESC)">
        <span class="modal-close-key mono">ESC</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="modal-perforation" aria-hidden="true">
      <span class="modal-notch notch-left"></span>
      <span class="modal-dash-line"></span>
      <span class="modal-notch notch-right"></span>
    </div>

    <div class="modal-hero">
      <div class="modal-thumb-wrap">
        <img id="modalImg" class="modal-thumb-img" alt="" width="320" height="180">
      </div>
      <div class="modal-main-meta">
        <div class="modal-cat-row">
          <span id="modalCat" class="modal-cat-pill mono">Batch Sub Indo</span>
          <span id="modalScore" class="modal-score-pill mono" hidden>★ <span id="modalScoreVal"></span></span>
          <span id="modalStatus" class="pill mono" hidden></span>
          <span id="modalDate" class="modal-date mono"></span>
        </div>
        <h2 id="modalTitle" class="modal-title"></h2>
        <div class="modal-cta-row">
          <button id="modalOpen" class="btn-primary" type="button">
            <span>Buka Halaman Asli</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
          </button>
          <button id="modalCopyBtn" class="btn-paper" type="button" title="Salin link rilis">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span id="modalCopyTxt">Salin Link</span>
          </button>
        </div>
      </div>
    </div>

    <div id="modalSynopsisWrap" class="modal-synopsis-wrap" hidden>
      <div class="modal-synopsis-head">
        <span class="modal-synopsis-label mono">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          SINOPSIS
        </span>
        <button id="modalSynopsisToggle" class="modal-synopsis-toggle mono" type="button" hidden>
          <span id="modalSynopsisToggleTxt">Baca Selengkapnya</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      <p id="modalSynopsis" class="modal-synopsis-text clamped"></p>
    </div>

    <div id="modalSectionBar" class="modal-quality-bar" hidden>
      <span class="modal-quality-label mono">SEASON / BAGIAN:</span>
      <div id="modalSectionTabs" class="modal-quality-tabs"></div>
    </div>

    <div id="modalQualityBar" class="modal-quality-bar" hidden>
      <span class="modal-quality-label mono">RESOLUSI:</span>
      <div id="modalQualityTabs" class="modal-quality-tabs"></div>
    </div>

    <div class="modal-body">
      <div id="modalLoading" class="modal-loading-state" role="status">
        <div class="modal-spinner" aria-hidden="true"></div>
        <div class="modal-loading-text">
          <strong>Mengambil link download &amp; mirror…</strong>
          <span class="mono">Memeriksa Google Drive, Acefile, Mega &amp; mirror upstream</span>
        </div>
      </div>
      <div id="modalGroups" class="modal-groups"></div>
    </div>

    <div class="modal-footer">
      <span class="mono modal-footer-note">rndmzr // tiket rilis resmi &amp; mirror terverifikasi</span>
      <span class="modal-barcode mono" aria-hidden="true">||| | |||| || ||| |||| |</span>
    </div>
  </div>
</dialog>

<nav class="mobile-bottom-dock" aria-label="Navigasi Bawah">
  <a class="dock-btn" href="/">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
    <span>Link</span>
  </a>
  <button class="dock-btn" id="dockSearchBtn" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span>Cari</span>
  </button>
  <a class="dock-btn active" href="/anime">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
    <span>Anime</span>
  </a>
  <button class="dock-btn" id="dockThemeBtn" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    <span>Tema</span>
  </button>
</nav>

<footer class="wrap footer">
  <p>Dibuat manual. Feed from samehadaku & kusonime.</p>
  <p class="mono">Data di-refresh otomatis · <kbd>/</kbd> cari · <kbd>T</kbd> tema</p>
</footer>

<script type="module">
const $ = (s) => document.querySelector(s);
const fmt = (d) => {
  if (!d || isNaN(+new Date(d))) return "";
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

function escRx(s) {
  let out = "";
  for (const c of s) {
    if ("$.*+?^(){}[]|\\/".indexOf(c) !== -1) out += "\\\\";
    out += c;
  }
  return out;
}

function highlight(text, terms) {
  if (!terms || !terms.length) return esc(text);
  const pattern = terms.map(escRx).filter(Boolean).join("|");
  if (!pattern) return esc(text);
  const parts = String(text || "").split(new RegExp("(" + pattern + ")", "gi"));
  return parts.map((part) => {
    if (!part) return "";
    const isMatch = terms.some((t) => norm(t) === norm(part));
    return isMatch ? "<mark>" + esc(part) + "</mark>" : esc(part);
  }).join("");
}

const qInput = $("#q");
const clearBtn = $("#clearBtn");
const resetBtn = $("#resetBtn");
const emptyMsg = $("#emptyMsg");
const emptyBox = $("#empty");
const listEl = $("#list");
const countEl = $("#count");
const statusEl = $("#status");

const scopeFeedBtn = $("#scopeFeed");
const scopeWebBtn = $("#scopeWeb");
const feedCountBadge = $("#feedCountBadge");
const searchWebSubmit = $("#searchWebSubmit");
const webSuggest = $("#webSuggest");
const filtersEl = $("#filters");

let allItems = [];
let shownItems = [];
let activeSource = new URLSearchParams(location.search).get("src") || "";
let currentScope = new URLSearchParams(location.search).get("scope") === "web" ? "web" : "feed";
const initialQ = new URLSearchParams(location.search).get("q") || "";
if (initialQ) {
  qInput.value = initialQ;
  clearBtn.hidden = false;
}

const webSearchCache = new Map();
let searchDebounceTimer = null;

function syncUrl() {
  const url = new URL(location.href);
  const q = qInput.value.trim();
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (activeSource && currentScope === "feed") url.searchParams.set("src", activeSource);
  else url.searchParams.delete("src");
  if (currentScope === "web") url.searchParams.set("scope", "web");
  else url.searchParams.delete("scope");
  history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
}

function filterItems(items, q, source) {
  const terms = norm(q.trim()).split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (source && (i.sourceLabel || "").toLowerCase() !== source.toLowerCase()) return false;
    if (!terms.length) return true;
    const hay = norm([i.title, i.cat, i.sourceLabel].join(" "));
    return terms.every((t) => hay.includes(t));
  });
}

function extractSeasonBadge(title) {
  const m = (title || "").match(/(?:Season\s*[\d\-]+|S[\d\-]+|Part\s*[\d\-]+|Cour\s*[\d\-]+)/i);
  return m ? \`<span class="badge badge-season mono">\${esc(m[0])}</span>\` : "";
}

function renderList() {
  if (currentScope === "web") return;
  const q = qInput.value.trim();
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const shown = filterItems(allItems, q, activeSource);
  shownItems = shown;
  countEl.textContent = shown.length;

  if (!shown.length) {
    listEl.hidden = true;
    emptyBox.hidden = false;
    if (q) {
      emptyMsg.innerHTML = 'Tidak ada di rilisan terbaru yang cocok dengan <strong>' + esc(q) + '</strong>.<div style="margin-top:14px;"><button id="switchWebSearchBtn" class="btn-primary" type="button"><span>Cari &ldquo;' + esc(q) + '&rdquo; di Seluruh Web (3.500+ Anime)</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg></button></div>';
      $("#switchWebSearchBtn")?.addEventListener("click", () => setScope("web", true));
    } else {
      emptyMsg.innerHTML = "Tidak ada rilisan untuk filter ini.";
    }
    resetBtn.hidden = !q && !activeSource;
    resetBtn.textContent = "Reset filter & cari";
    statusEl.textContent = "0 rilis ditemukan";
    return;
  }

  listEl.hidden = false;
  emptyBox.hidden = true;
  statusEl.textContent = shown.length + " rilis ditemukan";
  listEl.innerHTML = shown.map((i, idx) => \`
    <li class="row" data-i="\${idx}" style="animation-delay:\${Math.min(idx * 30, 400)}ms">
      <img class="row-thumb" src="\${esc(i.thumb || "")}" alt="" loading="lazy" \${i.thumb ? "" : "hidden"}>
      <span class="row-main">
        <span class="row-name">
          <span class="row-title">\${highlight(i.title, terms)}</span>
        </span>
        <span class="row-meta">
          <span class="pill">\${esc(i.sourceLabel || "")}</span>
          \${extractSeasonBadge(i.title)}
          <span class="badge">\${esc(i.cat || "Anime")}</span>
          <time class="row-date">\${esc(fmt(i.pub))}</time>
        </span>
      </span>
      <span class="arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </span>
    </li>\`).join("");
}

function renderFilters(items) {
  const sources = [];
  for (const i of items) if (!sources.includes(i.sourceLabel)) sources.push(i.sourceLabel);
  const matched = sources.find((s) => s.toLowerCase() === activeSource.toLowerCase());
  if (matched) activeSource = matched;
  else if (activeSource && !sources.includes(activeSource)) activeSource = "";

  filtersEl.innerHTML = '<button class="filter' + (!activeSource ? ' active' : '') + '" data-src="">Semua</button>' +
    sources.map((s) => '<button class="filter' + (activeSource === s ? ' active' : '') + '" data-src="' + esc(s) + '">' + esc(s) + "</button>").join("");
}

function applySource(src) {
  activeSource = src;
  document.querySelectorAll("#filters .filter").forEach((b) => b.classList.toggle("active", b.dataset.src === src));
  syncUrl();
  renderList();
}

filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest(".filter");
  if (b) applySource(b.dataset.src);
});

function setScope(scope, execute = true) {
  currentScope = scope;
  const isWeb = scope === "web";
  scopeFeedBtn.classList.toggle("active", !isWeb);
  scopeFeedBtn.setAttribute("aria-selected", String(!isWeb));
  scopeWebBtn.classList.toggle("active", isWeb);
  scopeWebBtn.setAttribute("aria-selected", String(isWeb));

  filtersEl.hidden = isWeb;
  searchWebSubmit.hidden = !isWeb;

  if (isWeb) {
    qInput.placeholder = "Cari di seluruh arsip web (mis. Naruto, Bleach, Re:Zero)…";
    const q = qInput.value.trim();
    webSuggest.hidden = !!q;
    if (execute && q) {
      triggerWebSearch(q);
    } else if (!q) {
      renderWebEmptyPrompt();
    }
  } else {
    qInput.placeholder = "Cari anime, episode, judul…";
    webSuggest.hidden = true;
    renderList();
  }
  syncUrl();
}

scopeFeedBtn.addEventListener("click", () => setScope("feed"));
scopeWebBtn.addEventListener("click", () => setScope("web"));

webSuggest.addEventListener("click", (e) => {
  const chip = e.target.closest(".suggest-chip");
  if (!chip) return;
  const q = chip.dataset.q || chip.textContent.trim();
  qInput.value = q;
  clearBtn.hidden = false;
  webSuggest.hidden = true;
  triggerWebSearch(q);
});

searchWebSubmit.addEventListener("click", () => {
  const q = qInput.value.trim();
  if (q) triggerWebSearch(q);
});

function renderWebEmptyPrompt() {
  shownItems = [];
  countEl.textContent = "3.500+";
  listEl.hidden = true;
  emptyBox.hidden = false;
  emptyMsg.innerHTML = "Ketik judul anime di kotak cari atau klik salah satu rekomendasi di atas untuk mencari di seluruh katalog web.";
  resetBtn.hidden = true;
  statusEl.textContent = "Siap mencari di arsip web";
}

async function triggerWebSearch(query) {
  const q = query.trim();
  if (!q) {
    renderWebEmptyPrompt();
    return;
  }
  syncUrl();
  webSuggest.hidden = true;

  if (webSearchCache.has(q.toLowerCase())) {
    renderWebResults(webSearchCache.get(q.toLowerCase()), q);
    return;
  }

  statusEl.textContent = 'Mencari "' + q + '" di seluruh web…';
  emptyBox.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = \`
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
  \`;

  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(q));
    if (!res.ok) throw new Error("search_error");
    const data = await res.json();
    const items = data.items || [];
    webSearchCache.set(q.toLowerCase(), items);
    renderWebResults(items, q);
  } catch (err) {
    const localFiltered = filterItems(allItems, q, "");
    if (localFiltered.length) {
      renderWebResults(localFiltered, q);
      statusEl.textContent = localFiltered.length + " judul ditemukan di arsip lokal";
      return;
    }
    listEl.hidden = true;
    emptyBox.hidden = false;
    emptyMsg.innerHTML = "Gagal memuat hasil pencarian web. Coba periksa koneksi.";
    resetBtn.hidden = false;
    resetBtn.textContent = "Coba lagi";
    statusEl.textContent = "Gagal mencari web";
  }
}

function renderWebResults(items, query) {
  shownItems = items;
  countEl.textContent = items.length;
  const terms = norm(query).split(/\\s+/).filter(Boolean);

  if (!items.length) {
    listEl.hidden = true;
    emptyBox.hidden = false;
    emptyMsg.innerHTML = 'Tidak ada hasil di arsip web untuk <strong>' + esc(query) + '</strong>.<br><span style="font-size:13px;color:var(--fg-dim);margin-top:6px;display:inline-block;">Coba cek ejaan judul atau gunakan nama bahasa Inggris / alternatif.</span>';
    resetBtn.hidden = false;
    resetBtn.textContent = "Bersihkan pencarian";
    statusEl.textContent = "0 hasil ditemukan di web";
    return;
  }

  listEl.hidden = false;
  emptyBox.hidden = true;
  statusEl.textContent = items.length + " judul ditemukan di arsip web";
  listEl.innerHTML = items.map((i, idx) => \`
    <li class="row" data-i="\${idx}" style="animation-delay:\${Math.min(idx * 25, 300)}ms">
      <img class="row-thumb" src="\${esc(i.thumb || "")}" alt="" loading="lazy" \${i.thumb ? "" : "hidden"}>
      <span class="row-main">
        <span class="row-name">
          <span class="row-title">\${highlight(i.title, terms)}</span>
        </span>
        <span class="row-meta">
          <span class="pill">\${esc(i.sourceLabel || "Web")}</span>
          \${extractSeasonBadge(i.title)}
          <span class="badge">\${esc(i.cat || "Batch")}</span>
          <time class="row-date">\${esc(i.pub ? fmt(i.pub) : "Arsip Komplit")}</time>
        </span>
      </span>
      <span class="arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </span>
    </li>\`).join("");
}

qInput.addEventListener("input", () => {
  clearBtn.hidden = !qInput.value;
  syncUrl();
  if (currentScope === "web") {
    webSuggest.hidden = !!qInput.value.trim();
    clearTimeout(searchDebounceTimer);
    const q = qInput.value.trim();
    if (!q) {
      renderWebEmptyPrompt();
    } else {
      searchDebounceTimer = setTimeout(() => triggerWebSearch(q), 350);
    }
  } else {
    renderList();
  }
});

qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const q = qInput.value.trim();
    if (currentScope === "web") {
      clearTimeout(searchDebounceTimer);
      if (q) triggerWebSearch(q);
    } else {
      if (!shownItems.length && q) {
        setScope("web", true);
      }
    }
  }
});

clearBtn.addEventListener("click", () => {
  qInput.value = "";
  clearBtn.hidden = true;
  qInput.focus();
  syncUrl();
  if (currentScope === "web") {
    webSuggest.hidden = false;
    renderWebEmptyPrompt();
  } else {
    renderList();
  }
});

resetBtn.addEventListener("click", () => {
  qInput.value = "";
  clearBtn.hidden = true;
  applySource("");
  qInput.focus();
  if (currentScope === "web") {
    webSuggest.hidden = false;
    renderWebEmptyPrompt();
  }
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(location.search);
  qInput.value = params.get("q") || "";
  clearBtn.hidden = !qInput.value;
  activeSource = params.get("src") || "";
  const scopeParam = params.get("scope") === "web" ? "web" : "feed";
  document.querySelectorAll("#filters .filter").forEach((b) => b.classList.toggle("active", b.dataset.src === activeSource));
  setScope(scopeParam, true);
});

async function load() {
  try {
    const r = await fetch("/api/rss");
    if (!r.ok) throw new Error("api");
    const data = await r.json();
    const items = data.items || [];
    allItems = items;
    feedCountBadge.textContent = items.length;
    statusEl.textContent = "Sinkron " + (data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("id-ID") : "");
    renderFilters(items);
    if (currentScope === "web") {
      setScope("web", !!qInput.value.trim());
    } else {
      renderList();
    }
  } catch (e) {
    if (currentScope === "feed") {
      listEl.hidden = true;
      emptyBox.hidden = false;
      emptyMsg.textContent = "Gagal mengambil rilis. Coba muat ulang.";
      resetBtn.hidden = true;
      statusEl.textContent = "Gagal memuat feed";
    }
  }
}

load();
setInterval(load, 15 * 60 * 1000);

/* theme */
const LS = "rndmzr:theme";
document.documentElement.dataset.theme =
  localStorage.getItem(LS) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(LS, next);
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#101216" : "#f4f6fb";
});

/* modal detail episode & batch */
let currentEp = null;
let currentDetail = null;
let currentSectionFilter = "ALL";
let currentQualityFilter = "ALL";
let episodeAbortController = null;

const modal = $("#modal");
const modalClose = $("#modalClose");
const modalImg = $("#modalImg");
const modalTitle = $("#modalTitle");
const modalSourceBadge = $("#modalSourceBadge");
const modalCat = $("#modalCat");
const modalDate = $("#modalDate");
const modalOpen = $("#modalOpen");
const modalCopyBtn = $("#modalCopyBtn");
const modalCopyTxt = $("#modalCopyTxt");
const modalSectionBar = $("#modalSectionBar");
const modalSectionTabs = $("#modalSectionTabs");
const modalQualityBar = $("#modalQualityBar");
const modalQualityTabs = $("#modalQualityTabs");
const modalGroupsEl = $("#modalGroups");
const modalLoadingEl = $("#modalLoading");
const modalSynopsisWrap = $("#modalSynopsisWrap");
const modalSynopsis = $("#modalSynopsis");
const modalSynopsisToggle = $("#modalSynopsisToggle");
const modalSynopsisToggleTxt = $("#modalSynopsisToggleTxt");
const modalScore = $("#modalScore");
const modalScoreVal = $("#modalScoreVal");
const modalStatus = $("#modalStatus");

const closeModal = () => {
  if (episodeAbortController) {
    episodeAbortController.abort();
    episodeAbortController = null;
  }
  modal.close();
  document.body.classList.remove("no-scroll");
};

function renderSynopsis(text) {
  if (!modalSynopsisWrap) return;
  const t = (text || "").trim();
  if (!t) {
    modalSynopsisWrap.hidden = true;
    return;
  }
  modalSynopsisWrap.hidden = false;
  modalSynopsis.textContent = t;
  modalSynopsis.classList.add("clamped");
  if (modalSynopsisToggle) {
    const isLong = t.length > 180;
    modalSynopsisToggle.hidden = !isLong;
    modalSynopsisToggle.classList.remove("expanded");
    if (modalSynopsisToggleTxt) modalSynopsisToggleTxt.textContent = "Baca Selengkapnya";
  }
}

function openEpisode(ep) {
  currentEp = ep;
  currentDetail = null;
  currentSectionFilter = "ALL";
  currentQualityFilter = "ALL";

  modalTitle.textContent = ep.title;
  modalSourceBadge.textContent = ep.sourceLabel || "Anime";
  modalCat.textContent = ep.cat || (ep.kind === "batch" ? "Batch Sub Indo" : "Episode Sub Indo");
  modalDate.textContent = ep.pub ? fmt(ep.pub) : "Katalog Arsip";

  modalImg.src = ep.thumb || "";
  modalImg.hidden = !ep.thumb;

  if (modalScore) modalScore.hidden = true;
  if (modalStatus) modalStatus.hidden = true;
  renderSynopsis(ep.synopsis || ep.detail?.synopsis || "");

  if (modalSectionBar) modalSectionBar.hidden = true;
  modalQualityBar.hidden = true;
  modalGroupsEl.hidden = true;
  modalLoadingEl.hidden = false;
  modalCopyTxt.textContent = "Salin Link";

  modal.showModal();
  document.body.classList.add("no-scroll");
  loadEpisode(ep);
}

async function loadEpisode(ep) {
  if (ep.detail && Array.isArray(ep.detail.groups) && ep.detail.groups.some((g) => g.shortSection)) {
    renderDetail(ep.detail);
    return;
  }

  if (episodeAbortController) {
    episodeAbortController.abort();
  }
  episodeAbortController = new AbortController();
  const timeoutId = setTimeout(() => {
    if (episodeAbortController) episodeAbortController.abort("timeout");
  }, 9000);

  try {
    const r = await fetch(
      "/api/episode?u=" + encodeURIComponent(ep.link) + "&t=" + encodeURIComponent(ep.title) + "&_t=" + Date.now(),
      { signal: episodeAbortController.signal, cache: "no-store" }
    );
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error("api_" + r.status);
    const d = await r.json();
    ep.detail = d;
    renderDetail(d);
  } catch (err) {
    clearTimeout(timeoutId);
    modalLoadingEl.hidden = true;
    modalGroupsEl.hidden = false;
    if (modalSectionBar) modalSectionBar.hidden = true;
    modalQualityBar.hidden = true;
    const isTimeout = err?.name === "AbortError" || String(err).includes("timeout");
    modalGroupsEl.innerHTML = \`
      <div class="download-card" style="text-align:center;padding:24px;">
        <p class="link-dead-txt" style="margin-bottom:14px;">
          \${isTimeout
            ? "Waktu pengambilan link habis (upstream lambat merespons)."
            : "Link download otomatis tidak dapat dimuat langsung."}
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button id="modalRetryBtn" class="btn-primary" type="button">
            <span>Coba Lagi</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
          </button>
          <button id="modalFallbackOpenBtn" class="btn-paper" type="button">
            <span>Buka Halaman Asli</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
          </button>
        </div>
      </div>
    \`;
    modalGroupsEl.querySelector("#modalRetryBtn")?.addEventListener("click", () => {
      modalLoadingEl.hidden = false;
      modalGroupsEl.hidden = true;
      loadEpisode(ep);
    });
    modalGroupsEl.querySelector("#modalFallbackOpenBtn")?.addEventListener("click", () => {
      if (ep?.link) window.open(ep.link, "_blank", "noopener");
    });
  }
}

function getGroupSection(g) {
  if (g.shortSection && g.shortSection !== "Batch") return g.shortSection;
  const raw = g.section || g.format || "";
  const sMatch = raw.match(/(?:Season\s*(\d+)|S(\d+)|\(Season\s*(\d+)\)|Season\s*(IV|III|II|I|V|VI))/i);
  const partMatch = raw.match(/(?:Part|Cour)\s*([\d\-]+)/i);
  const epMatch = raw.match(/(?:Episode|Eps?\.?)\s*([\d\-]+)/i) || raw.match(/(\d{2,4}\s*-\s*\d{2,4})/);
  if (sMatch) {
    const sVal = sMatch[1] || sMatch[2] || sMatch[3] || sMatch[4];
    let res = 'Season ' + sVal;
    if (partMatch) res += ' Part ' + partMatch[1];
    return res;
  }
  if (partMatch) return 'Part ' + partMatch[1];
  if (epMatch) return 'Eps ' + epMatch[1].replace(/\s+/g, '');
  return raw && raw !== "Batch" ? (raw.length > 20 ? raw.slice(0, 18) + '…' : raw) : "";
}

function renderDetail(d) {
  currentDetail = d;
  if (d.thumbnail && !modalImg.src) {
    modalImg.src = d.thumbnail;
    modalImg.hidden = false;
  }

  if (d.synopsis) {
    renderSynopsis(d.synopsis);
  }
  if (d.score && modalScore && modalScoreVal) {
    modalScoreVal.textContent = d.score;
    modalScore.hidden = false;
  }
  if (d.status && modalStatus) {
    modalStatus.textContent = d.status;
    modalStatus.hidden = false;
  }

  const groups = d.groups || [];
  if (!groups.length) {
    modalLoadingEl.hidden = true;
    modalGroupsEl.hidden = false;
    modalGroupsEl.innerHTML = \`<div class="download-card"><p class="link-dead-txt">Tidak ditemukan mirror aktif otomatis. Buka halaman asli sumber untuk melihat link.</p></div>\`;
    return;
  }

  groups.forEach((g) => {
    if (!g.shortSection || g.shortSection === "Batch") {
      g.shortSection = getGroupSection(g);
    }
  });

  currentSectionFilter = "ALL";
  currentQualityFilter = "ALL";

  // Section / Season tabs
  const sectionMap = new Map();
  groups.forEach((g) => {
    const s = g.shortSection || "";
    if (s && s !== "Batch") {
      sectionMap.set(s, (sectionMap.get(s) || 0) + 1);
    }
  });

  const uniqueSections = Array.from(sectionMap.keys());
  if (modalSectionBar) {
    if (uniqueSections.length > 1) {
      modalSectionBar.hidden = false;
      modalSectionTabs.innerHTML = \`
        <button class="q-tab active" data-sec="ALL" type="button">Semua Season (\${groups.length})</button>
        \${uniqueSections.map((s) => \`<button class="q-tab" data-sec="\${esc(s)}" type="button">\${esc(s)} (\${sectionMap.get(s)})</button>\`).join("")}
      \`;
    } else {
      modalSectionBar.hidden = true;
    }
  }

  // Quality / Resolution tabs
  const qualitySet = new Set();
  groups.forEach((g) => {
    const qRaw = (g.quality || "").trim();
    if (qRaw) qualitySet.add(qRaw);
  });
  const qualities = Array.from(qualitySet);

  if (qualities.length > 1) {
    modalQualityBar.hidden = false;
    modalQualityTabs.innerHTML = \`
      <button class="q-tab active" data-q="ALL" type="button">Semua Resolusi</button>
      \${qualities.map((q) => \`<button class="q-tab" data-q="\${esc(q)}" type="button">\${esc(q)}</button>\`).join("")}
    \`;
  } else {
    modalQualityBar.hidden = true;
  }

  renderGroupsList(groups);
  modalLoadingEl.hidden = true;
  modalGroupsEl.hidden = false;
}

function renderGroupsList(groups) {
  const filtered = groups.filter((g) => {
    const s = g.shortSection || g.section || "";
    const matchSec = currentSectionFilter === "ALL" ||
      s === currentSectionFilter ||
      (g.format && g.format.includes(currentSectionFilter));
    const matchQ = currentQualityFilter === "ALL" ||
      (g.quality || "").toLowerCase() === currentQualityFilter.toLowerCase();
    return matchSec && matchQ;
  });

  if (!filtered.length) {
    modalGroupsEl.innerHTML = \`
      <div class="download-card" style="text-align:center;padding:24px;">
        <p class="link-dead-txt">Tidak ada link untuk filter ini.</p>
        <button class="btn-paper" style="margin-top:10px;" id="resetModalFilters" type="button">Reset Filter</button>
      </div>\`;
    modalGroupsEl.querySelector("#resetModalFilters")?.addEventListener("click", () => {
      currentSectionFilter = "ALL";
      currentQualityFilter = "ALL";
      if (modalSectionTabs) {
        modalSectionTabs.querySelectorAll(".q-tab").forEach((b) => b.classList.toggle("active", b.dataset.sec === "ALL"));
      }
      modalQualityTabs.querySelectorAll(".q-tab").forEach((b) => b.classList.toggle("active", b.dataset.q === "ALL"));
      renderGroupsList(groups);
    });
    return;
  }

  modalGroupsEl.innerHTML = filtered.map((g) => {
    const liveLinksCount = (g.links || []).filter((l) => !l.dead).length;
    const secBadge = (g.shortSection && g.shortSection !== "Batch")
      ? \`<button class="badge badge-season" data-sec="\${esc(g.shortSection)}" type="button" title="Filter \${esc(g.shortSection)}">\${esc(g.shortSection)}</button>\`
      : "";
    return \`
      <div class="download-card">
        <div class="download-card-head">
          <div class="download-format-title">
            \${secBadge}
            <span class="badge" style="background:var(--midnight);color:#f3ead8;border:none;">\${esc(g.quality || "Standar")}</span>
            <span class="download-format-sub mono">\${esc(g.format || "Batch")}</span>
          </div>
          <span class="download-mirror-count mono">\${liveLinksCount} Mirror</span>
        </div>
        <div class="download-links-wrap">
          \${(g.links || []).map((l) => l.dead
            ? \`<span class="mirror-pill dead" title="Link mati di sumber upstream">
                <span>\${esc(l.label)}</span>
                <span class="mirror-dead-tag">MATI</span>
              </span>\`
            : \`<a class="mirror-pill" href="\${esc(l.href)}" target="_blank" rel="noopener noreferrer">
                <span>\${esc(l.label)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
              </a>\`
          ).join("")}
        </div>
      </div>
    \`;
  }).join("");
}

modalGroupsEl.addEventListener("click", (e) => {
  const seasonBtn = e.target.closest(".badge-season");
  if (seasonBtn && currentDetail) {
    const sec = seasonBtn.dataset.sec;
    if (sec) {
      currentSectionFilter = sec;
      if (modalSectionTabs) {
        modalSectionTabs.querySelectorAll(".q-tab").forEach((b) => b.classList.toggle("active", b.dataset.sec === sec));
      }
      renderGroupsList(currentDetail.groups || []);
    }
  }
});

if (modalSectionTabs) {
  modalSectionTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".q-tab");
    if (!tab || !currentDetail) return;
    currentSectionFilter = tab.dataset.sec;
    modalSectionTabs.querySelectorAll(".q-tab").forEach((b) => b.classList.toggle("active", b === tab));
    renderGroupsList(currentDetail.groups || []);
  });
}

if (modalSynopsisToggle) {
  modalSynopsisToggle.addEventListener("click", () => {
    const isClamped = modalSynopsis.classList.toggle("clamped");
    modalSynopsisToggle.classList.toggle("expanded", !isClamped);
    if (modalSynopsisToggleTxt) {
      modalSynopsisToggleTxt.textContent = isClamped ? "Baca Selengkapnya" : "Sembunyikan";
    }
  });
}

modalQualityTabs.addEventListener("click", (e) => {
  const tab = e.target.closest(".q-tab");
  if (!tab || !currentDetail) return;
  currentQualityFilter = tab.dataset.q;
  modalQualityTabs.querySelectorAll(".q-tab").forEach((b) => b.classList.toggle("active", b === tab));
  renderGroupsList(currentDetail.groups || []);
});

modalCopyBtn.addEventListener("click", async () => {
  if (!currentEp?.link) return;
  try {
    await navigator.clipboard.writeText(currentEp.link);
    modalCopyTxt.textContent = "Tersalin! ✓";
    setTimeout(() => { modalCopyTxt.textContent = "Salin Link"; }, 2000);
  } catch {
    modalCopyTxt.textContent = "Gagal Salin";
  }
});

$("#list").addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (!row) return;
  const ep = shownItems[Number(row.dataset.i)];
  if (ep) openEpisode(ep);
});

modalOpen.addEventListener("click", () => { if (currentEp) window.open(currentEp.link, "_blank", "noopener"); });
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
modal.addEventListener("close", () => document.body.classList.remove("no-scroll"));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (modal.open) {
      closeModal();
    } else if (document.activeElement === qInput) {
      if (qInput.value) {
        qInput.value = "";
        clearBtn.hidden = true;
        syncUrl();
        if (currentScope === "web") renderWebEmptyPrompt();
        else renderList();
      } else {
        qInput.blur();
      }
    }
    return;
  }
  const isMod = e.ctrlKey || e.metaKey;
  if ((e.key === "/" || (isMod && e.key.toLowerCase() === "k")) && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") && !modal.open) {
    e.preventDefault();
    qInput.focus();
    qInput.select();
    return;
  }
  if ((e.key === "t" || e.key === "T") && !/^(INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName || "") && !modal.open) {
    $("#themeBtn").click();
  }
});

const dockSearchBtn = $("#dockSearchBtn");
if (dockSearchBtn) dockSearchBtn.addEventListener("click", () => { qInput.focus(); qInput.scrollIntoView({ block: "center", behavior: "smooth" }); });
const dockThemeBtn = $("#dockThemeBtn");
if (dockThemeBtn) dockThemeBtn.addEventListener("click", () => $("#themeBtn").click());
</script>
</body>
</html>`;
}

const PAGE_CSS = String.raw`
:root { --font-display: "Archivo", ui-sans-serif, system-ui, sans-serif; --font-mono: "Space Mono", monospace; --paper:#f3ead8; --fountain-red:#e8452c; --fountain-yolk:#f5d64c; --midnight:#1b2a52; }
[data-theme="light"] {
  color-scheme: light; --bg:#f3ead8; --bg-soft:#efe3cf; --surface:rgba(255,251,243,.72); --surface-2:#e8dcc6;
  --line:#d8cbb4; --line-soft:#e4d8c2; --fg:#181512; --fg-soft:#4f4a40; --fg-dim:#6f6a5f; --accent:#e8452c; --accent-2:#f5d64c; --accent-fg:#f3ead8; --accent-soft:rgba(232,69,44,.08);
  --grad-split:linear-gradient(100deg,#e8452c,#f5d64c);
  --paper-texture:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 0 0.25  0 0 0 0 0.14 0'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");
}
[data-theme="dark"] {
  color-scheme: dark; --bg:#12141c; --bg-soft:#161a26; --surface:#1b2130; --surface-2:#212a3d;
  --line:#2c3245; --line-soft:#232a3b; --fg:#f3ead8; --fg-soft:#b3a98e; --fg-dim:#7d7257; --accent:#f05a3c; --accent-2:#f5d64c; --accent-fg:#12141c; --accent-soft:rgba(240,90,60,.14);
  --grad-split:linear-gradient(100deg,#f05a3c,#f5d64c);
  --paper-texture:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0 0.05 0'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");
}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none !important}
.modal-quality-bar[hidden]{display:none !important}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:400 16px/1.55 var(--font-display);-webkit-font-smoothing:antialiased;}
a{color:inherit;text-decoration:none}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:5px}
.sr-only,.skip:not(:focus){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.skip:focus{position:fixed;z-index:100;top:12px;left:12px;padding:10px 16px;background:var(--accent);color:var(--accent-fg);border-radius:4px;font-weight:700;letter-spacing:.02em}
.sr-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.wrap{width:100%;max-width:940px;margin-inline:auto;padding-inline:clamp(16px,4vw,32px)}
.mono{font-family:var(--font-mono);font-size:12px}
.pill{flex:none;font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:1px 6px;background:var(--surface-2);letter-spacing:.02em;text-transform:uppercase}
.stamp{display:inline-grid;place-items:center;min-width:26px;height:20px;padding:0 6px;border:2px solid var(--accent);background:var(--accent);color:var(--accent-fg);font-weight:800;transform:rotate(-3deg);border-radius:2px}
.rule{width:34px;height:0;border-top:2px solid var(--fg-dim);opacity:.5}
.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);border-bottom:3px solid var(--midnight)}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;height:60px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.02em}
.brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:4px;background:linear-gradient(140deg,#1b2a52,#223664);color:#f3ead8;transform:rotate(-4deg)}
.brand-mark svg{width:16px;height:16px}
.brand-text em{font-style:normal;color:var(--fg-dim);font-weight:500}
.topbar-actions{display:flex;align-items:center;gap:8px}
.icon-btn,.btn-paper{height:38px;box-sizing:border-box;border-radius:4px;border:1.5px solid var(--line);display:inline-flex;align-items:center;justify-content:center;transition:all .16s}
.icon-btn{width:38px;padding:0;cursor:pointer;background:var(--bg-soft);color:var(--fg-soft)}
.icon-btn svg{width:18px;height:18px}
.icon-btn:hover{color:var(--fg);border-color:var(--accent);transform:translateY(-1px)}
[data-theme="dark"] .ico-sun,[data-theme="light"] .ico-moon{display:none}
.btn-paper{padding:0 14px;gap:7px;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;background:var(--bg-soft);color:var(--fg);border-color:var(--line);text-decoration:none}
.btn-paper svg{width:14px;height:14px}
.btn-paper:hover{color:var(--accent);border-color:var(--accent);transform:translateY(-1px)}
.bill{padding:clamp(40px,6vw,72px) 0 22px;position:relative}
.eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-family:var(--font-mono);font-size:12px;letter-spacing:.05em;color:var(--fg-dim)}
h1{font-size:clamp(40px,8vw,92px);line-height:.98;letter-spacing:-.03em;font-weight:900;margin:0;text-wrap:balance}
h1 em{font-style:normal;display:inline-block;color:var(--accent);transform:rotate(-2deg) translateY(2px);text-shadow:2px 2px 0 var(--midnight)}
.lede{margin:16px 0 0;color:var(--fg-soft);font-size:17px;max-width:54ch}
.search-bar{margin:18px 0 0}
.search{position:relative;display:flex;align-items:center;gap:10px;padding:3px 8px 3px 16px;background:var(--bg-soft);border:2px solid var(--midnight);border-radius:4px;transition:border-color .16s,box-shadow .16s}
[data-theme="dark"] .search{border-color:var(--accent-2)}
.search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.search-ico{flex:none;width:17px;height:17px;color:var(--fg-dim)}
.search input{flex:1;min-width:0;height:42px;border:0;background:none;outline:none;font-size:15px;color:var(--fg)}
.search input::placeholder{color:var(--fg-dim)}
.search input::-webkit-search-cancel-button{display:none}
.hint-key{flex:none;padding:3px 8px;border:2px solid var(--line);border-radius:4px;font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--fg-dim);line-height:1}
.search:focus-within .hint-key{opacity:0}
.clear-btn{display:grid;place-items:center;width:32px;height:32px;flex:none;cursor:pointer;background:none;border:0;border-radius:4px;color:var(--fg-dim)}
.clear-btn svg{width:16px;height:16px}
.clear-btn:hover{color:var(--fg)}
mark{background:var(--accent-2);color:#181512;padding:0 2px;border-radius:2px}
.empty p{margin:0 0 16px}
kbd{font-family:var(--font-mono);font-size:11px;padding:2px 5px;border:1px solid var(--line);border-radius:3px;background:var(--surface-2);color:var(--fg-dim)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 6px}
.filter{padding:7px 14px;border-radius:4px;border:2px solid var(--midnight);background:transparent;color:var(--fg-soft);font-size:13px;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:.03em;transition:color .15s,border-color .15s}
.filter:hover{border-color:var(--accent);color:var(--fg);transform:rotate(-1deg)}
.filter.active{background:var(--midnight);border-color:var(--midnight);color:#f3ead8;font-weight:900}
.list{list-style:none;padding:0;margin:20px 0 0}
.row{position:relative;display:flex;align-items:center;gap:14px;padding:12px 0;border-top:2px solid var(--line);animation:rise .3s cubic-bezier(.25,1,.5,1) both;cursor:pointer}
@keyframes rise{from{opacity:0;transform:translateY(6px)}}
.row:hover{background:var(--bg-soft)}
.row:focus-within{background:var(--bg-soft)}
.row-thumb{flex:none;width:88px;height:52px;object-fit:cover;border-radius:4px;background:var(--surface-2);display:block;border:2px solid var(--line)}
.row-thumb[hidden]{display:none}
.row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.row-title{font-size:16px;font-weight:800;line-height:1.4;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word;letter-spacing:-.01em}
.row-title:hover{color:var(--accent)}
.row-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{flex:none;font-family:var(--font-mono);font-size:10px;color:var(--accent-2);border:1px solid var(--line);border-radius:999px;padding:2px 8px;background:var(--surface);white-space:nowrap;font-weight:700}
.row-date{font-family:var(--font-mono);font-size:11px;color:var(--fg-dim);white-space:nowrap}
.arrow{position:absolute;top:50%;right:10px;transform:translateY(-50%);color:var(--fg-dim);opacity:0;transition:opacity .16s,transform .16s}
.arrow svg{width:15px;height:15px;display:block}
.row:hover .arrow{opacity:1;transform:translate(2px,-50%)}
.skeleton{height:54px;background:var(--surface-2);border-radius:4px;margin:6px 0;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
.empty{padding:60px 20px;text-align:center;color:var(--fg-soft);border:2px dashed var(--line);border-radius:8px}
.no-scroll{overflow:hidden}
/* Scope Nav */
.scope-nav{display:flex;gap:8px;margin:20px 0 10px;border-bottom:2px solid var(--line);padding-bottom:12px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.scope-tab{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:4px;border:2px solid var(--midnight);background:var(--bg-soft);color:var(--fg-soft);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .15s ease}
.scope-tab:hover{border-color:var(--accent);color:var(--fg)}
.scope-tab.active{background:var(--midnight);color:#f3ead8;border-color:var(--midnight)}
[data-theme="dark"] .scope-tab.active{background:var(--accent);border-color:var(--accent);color:#12141c}
.scope-icon{font-size:14px;line-height:1}
.scope-badge{font-family:var(--font-mono);font-size:10px;padding:2px 7px;border-radius:999px;background:var(--surface-2);color:var(--fg-dim);font-weight:700}
.scope-tab.active .scope-badge{background:rgba(255,255,255,.2);color:#f3ead8}
[data-theme="dark"] .scope-tab.active .scope-badge{background:rgba(0,0,0,.25);color:#12141c}

/* Search bar extras */
.search-submit-btn{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:4px;border:1.5px solid var(--midnight);background:var(--midnight);color:#f3ead8;font-size:11px;font-family:var(--font-mono);font-weight:700;cursor:pointer;transition:all .15s ease;white-space:nowrap;margin-right:4px}
[data-theme="dark"] .search-submit-btn{background:var(--accent);border-color:var(--accent);color:#12141c}
.search-submit-btn:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.web-suggest{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px}
.web-suggest-label{font-size:11px;font-weight:700;color:var(--fg-dim)}
.suggest-chip{padding:4px 10px;border-radius:4px;border:1.5px solid var(--line);background:var(--bg-soft);color:var(--fg-soft);font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;transition:all .14s ease}
.suggest-chip:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px)}

/* Redesigned Modal (Inspection Ticket Pass) */
.modal{border:0;padding:0;background:transparent;width:calc(100% - 32px);max-width:680px;box-shadow:0 28px 80px rgba(0,0,0,.5);position:relative}
.modal::backdrop{background:rgba(15,18,26,.75);backdrop-filter:blur(6px)}
.modal[open]{animation:modalIn .22s cubic-bezier(.25,1,.5,1)}
@keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.98)}}

.modal-card{position:relative;background:var(--bg);border:2px solid var(--midnight);border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
[data-theme="dark"] .modal-card{border-color:var(--line)}

.modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--bg-soft);border-bottom:1.5px solid var(--line)}
.modal-stub-tag{display:flex;align-items:center;gap:9px}
.modal-pass-label{font-size:11px;font-weight:700;color:var(--fg-dim);letter-spacing:.05em}
.modal-source-badge{font-family:var(--font-mono);font-size:10px;font-weight:800;padding:2px 8px;border-radius:3px;background:var(--accent);color:var(--accent-fg);text-transform:uppercase}

.modal-close{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:4px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--fg-soft);cursor:pointer;font-family:var(--font-mono);font-size:11px;font-weight:700;transition:all .14s ease}
.modal-close svg{width:14px;height:14px}
.modal-close:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px)}

.modal-perforation{position:relative;height:14px;display:flex;align-items:center;margin:-7px 0;z-index:2}
.modal-notch{position:absolute;width:18px;height:18px;border-radius:50%;background:rgba(15,18,26,.85);border:2px solid var(--midnight);z-index:3}
[data-theme="light"] .modal-notch{background:#0e1117}
.modal-notch.notch-left{left:-9px}
.modal-notch.notch-right{right:-9px}
.modal-dash-line{width:100%;border-top:2px dashed var(--line);margin:0 12px}

.modal-hero{display:flex;gap:18px;padding:18px 20px 14px}
.modal-thumb-wrap{flex:none;width:180px;aspect-ratio:16/9;border-radius:4px;overflow:hidden;border:2px solid var(--line);background:var(--surface-2);position:relative}
.modal-thumb-img{width:100%;height:100%;object-fit:cover;display:block}
.modal-thumb-img[hidden]{display:none}

.modal-main-meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.modal-cat-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.modal-cat-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--fg-soft)}
.modal-date{font-size:11px;color:var(--fg-dim)}
.modal-title{font-size:19px;font-weight:800;line-height:1.3;margin:2px 0 8px;letter-spacing:-.01em;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.modal-cta-row{display:flex;align-items:center;gap:8px;margin-top:auto;flex-wrap:wrap}

.btn-primary{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border:0;border-radius:4px;background:var(--midnight);color:#f3ead8;font-weight:800;font-size:13px;cursor:pointer;border:2px solid var(--midnight);transition:all .15s ease}
[data-theme="dark"] .btn-primary{background:var(--accent);border-color:var(--accent);color:#12141c}
.btn-primary:hover{opacity:.92;transform:translateY(-1px)}
.btn-primary svg{width:15px;height:15px}

.modal-quality-bar{display:flex;align-items:center;gap:10px;padding:8px 20px;background:var(--bg-soft);border-top:1.5px solid var(--line);border-bottom:1.5px solid var(--line);overflow-x:auto;-webkit-overflow-scrolling:touch}
.modal-quality-label{font-size:10px;font-weight:700;color:var(--fg-dim);white-space:nowrap}
.modal-quality-tabs{display:flex;gap:6px}
.q-tab{padding:3px 10px;border-radius:4px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg-soft);font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;transition:all .14s ease;white-space:nowrap}
.q-tab:hover{border-color:var(--accent);color:var(--accent)}
.q-tab.active{background:var(--midnight);color:#f3ead8;border-color:var(--midnight)}
[data-theme="dark"] .q-tab.active{background:var(--accent);border-color:var(--accent);color:#12141c}

.modal-score-pill{display:inline-flex;align-items:center;gap:3px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--fountain-yolk);background:rgba(245,214,76,.15);border:1px solid rgba(245,214,76,.4);padding:1px 6px;border-radius:3px}
[data-theme="dark"] .modal-score-pill{background:rgba(245,214,76,.12);border-color:rgba(245,214,76,.3)}

.modal-synopsis-wrap{padding:12px 20px 14px;background:var(--bg-soft);border-top:1.5px solid var(--line);border-bottom:1.5px solid var(--line);transition:background .15s ease}
.modal-synopsis-wrap[hidden]{display:none !important}
.modal-synopsis-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.modal-synopsis-label{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--fg-dim);text-transform:uppercase;display:inline-flex;align-items:center}
.modal-synopsis-toggle{background:none;border:none;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;transition:opacity .14s ease}
.modal-synopsis-toggle:hover{opacity:.8}
.modal-synopsis-toggle svg{width:12px;height:12px;transition:transform .2s ease}
.modal-synopsis-toggle.expanded svg{transform:rotate(180deg)}
.modal-synopsis-text{font-size:13px;line-height:1.6;color:var(--fg-soft);margin:0;white-space:pre-line}
.modal-synopsis-text.clamped{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

.modal-body{padding:16px 20px;max-height:45vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.modal-loading-state{display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg-soft);border-radius:4px;border:1.5px solid var(--line)}
.modal-spinner{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:spin .8s linear infinite;flex:none}
.modal-loading-text{display:flex;flex-direction:column;gap:2px;font-size:13px}
.modal-loading-text span{color:var(--fg-dim);font-size:11px}

.badge-season{background:var(--accent);color:#fff;border:none;font-weight:700;letter-spacing:.02em;cursor:pointer;padding:2px 8px;border-radius:3px;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;transition:transform .12s ease,opacity .12s ease;display:inline-flex;align-items:center}
.badge-season:hover{opacity:.9;transform:scale(1.04)}
[data-theme="dark"] .badge-season{background:var(--accent);color:#12141c}
.download-format-sub{font-size:12px;color:var(--fg-dim)}
.download-card{border:1.5px solid var(--line);border-radius:4px;background:var(--bg-soft);padding:12px 14px}
.download-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.download-format-title{display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--fg)}
.download-mirror-count{font-size:10px;color:var(--fg-dim);background:var(--surface-2);padding:2px 6px;border-radius:3px}

.download-links-wrap{display:flex;flex-wrap:wrap;gap:8px}
.mirror-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:1.5px solid var(--line);background:var(--surface);font-size:12px;font-weight:700;color:var(--fg);text-decoration:none;transition:all .14s ease}
.mirror-pill svg{width:13px;height:13px;color:var(--fg-dim)}
.mirror-pill:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px);background:var(--bg-soft);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.mirror-pill:hover svg{color:var(--accent)}
.mirror-pill.dead{opacity:.45;text-decoration:line-through;cursor:not-allowed;border-color:var(--line-soft)}
.mirror-dead-tag{font-family:var(--font-mono);font-size:9px;padding:1px 4px;border-radius:2px;background:var(--line);color:var(--fg-dim);text-decoration:none}

.modal-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-top:1.5px solid var(--line);background:var(--bg-soft);font-size:11px}
.modal-footer-note{color:var(--fg-dim)}
.modal-barcode{letter-spacing:.15em;font-weight:700;opacity:.45;font-size:12px}

@media(max-width:640px){
  .modal-hero{flex-direction:column}
  .modal-thumb-wrap{width:100%}
  .modal-title{font-size:16px}
  .modal-cta-row{width:100%}
  .modal-cta-row button{flex:1;justify-content:center}
}

.mobile-bottom-dock {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(56px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(16px);
  border-top: 1.5px solid var(--line);
  z-index: 50;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
}
@media (max-width: 959px) {
  .mobile-bottom-dock { display: grid; }
  body { padding-bottom: 64px; }
}
.dock-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 100%;
  background: none;
  border: none;
  color: var(--fg-dim);
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s ease;
}
.dock-btn svg { width: 18px; height: 18px; }
.dock-btn:hover, .dock-btn.active { color: var(--accent); }

.footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:72px;padding-block:40px;border-top:3px double var(--line);font-size:13px;color:var(--fg-soft)}
@media(max-width:640px){.row-title{font-size:14px}.row-thumb{width:72px;height:44px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
