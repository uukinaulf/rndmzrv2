// rndmzr worker
// - static assets otomatis (wrangler assets)
// - /rss  dan /rss.xml -> RSS XML rilisan anime (buat reader)
// - /api/rss          -> JSON rilisan anime (buat UI)
// - /anime            -> halaman UI daftar rilis
// - /                -> fallback ke static

const UPSTREAM_FEED = "https://v2.samehadaku.how/feed/" ;
const CACHE_TTL = 900; // 15 menit

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/rss" || url.pathname === "/rss.xml") {
      return handleRss(request, url, ctx);
    }
    if (url.pathname === "/api/rss") {
      try {
        const payload = await getItems(request, ctx);
        return Response.json(payload, { headers: { "cache-control": `public, max-age=${CACHE_TTL}` } });
      } catch (e) {
        return Response.json({ error: String(e && e.message || e) }, { status: 502 });
      }
    }
    if (url.pathname === "/anime") {
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
    const res = await fetch(UPSTREAM_FEED, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

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
    if (!items.length) throw new Error("feed kosong");
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
    `<title>Rilisan Anime Sub Indo — Samehadaku (via rndmzr)</title>\n` +
    `<link>${escapeXml(url.origin + "/rss")}</link>\n` +
    `<description>Rilisan anime terbaru sub Indo dari samehadaku.</description>\n` +
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

/* ---------- halaman UI /anime ---------- */
function renderPage() {
  return `<!doctype html>
<html lang="id" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rndmzr — Rilisan Anime</title>
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#101216">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style>
</head>
<body>
<a class="skip" href="#list">Lewati ke daftar rilis</a>
<div class="bg" aria-hidden="true"><span class="glow g1"></span><span class="glow g2"></span></div>

<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11.7 4.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.3-1.3"/></svg></span>
      <span class="brand-text">rndmzr<em>/anime</em></span>
    </a>
    <div class="topbar-actions">
      <button id="themeBtn" class="icon-btn" type="button" aria-label="Ganti tema" title="Ganti tema (T)">
        <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      </button>
      <a class="btn-outline" href="/rss" title="RSS mentah untuk reader">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg>
        <span>RSS</span>
      </a>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <p class="eyebrow"><span class="dot"></span><span id="count">0</span> rilis terbaru</p>
    <h1>Rilisan <span class="grad">anime</span></h1>
    <p class="lede">Episode baru sub Indo dari samehadaku. Di-scrape otomatis tiap 15 menit.</p>
  </section>

  <p id="status" class="status sr-status" role="status" aria-live="polite"></p>

  <ul id="list" class="list">
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
    <li class="skeleton"></li>
  </ul>

  <div id="empty" class="empty" hidden>
    <p>Gagal mengambil rilis. Coba muat ulang.</p>
  </div>
</main>

<footer class="wrap footer">
  <p>Dibuat manual. Feed dari samehadaku.</p>
  <p class="mono">Data di-refresh otomatis</p>
</footer>

<script type="module">
const $ = (s) => document.querySelector(s);
const fmt = (d) => {
  if (!d || isNaN(+new Date(d))) return "";
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function load() {
  const list = $("#list"), status = $("#status"), count = $("#count"), empty = $("#empty");
  try {
    const r = await fetch("/api/rss");
    if (!r.ok) throw new Error("api");
    const data = await r.json();
    const items = data.items || [];
    count.textContent = items.length;
    status.textContent = "Sinkron " + (data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("id-ID") : "");
    list.innerHTML = items.map((i, idx) => \`
      <li class="row" style="animation-delay:\${Math.min(idx * 30, 400)}ms">
        <a class="row-link" href="\${esc(i.link)}" target="_blank" rel="noopener noreferrer" title="Buka \${esc(i.title)}"></a>
        <span class="badge">\${esc(i.cat || "Anime")}</span>
        <span class="row-main">
          <span class="row-title">\${esc(i.title)}</span>
        </span>
        <time class="row-date">\${esc(fmt(i.pub))}</time>
        <span class="arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
        </span>
      </li>\`).join("");
    list.hidden = !items.length;
    empty.hidden = !!items.length;
  } catch (e) {
    list.hidden = true;
    empty.hidden = false;
    status.textContent = "Gagal memuat feed";
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
document.addEventListener("keydown", (e) => {
  if ((e.key === "t" || e.key === "T") && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) $("#themeBtn").click();
});
</script>
</body>
</html>`;
}

const PAGE_CSS = String.raw`
:root { --font-sans: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; --font-mono: "Space Mono", monospace; }
[data-theme="dark"] {
  color-scheme: dark; --bg:#101216; --surface:#171a20; --surface-2:#1e222a; --line:#262b34; --line-soft:#1d2128;
  --fg:#eef1f6; --fg-soft:#a3adc0; --fg-dim:#6d7689; --accent:#7d9aff; --accent-2:#93a8ff; --accent-fg:#0c101c; --accent-soft:rgba(125,154,255,.15);
}
[data-theme="light"] {
  color-scheme: light; --bg:#fafbfc; --surface:#fff; --surface-2:#f1f3f7; --line:#e3e6ee; --line-soft:#ebedf3;
  --fg:#161a23; --fg-soft:#4b5568; --fg-dim:#80899b; --accent:#4f6bf0; --accent-2:#6f8df4; --accent-fg:#fff; --accent-soft:rgba(79,107,240,.1);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:400 16px/1.55 var(--font-sans);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:5px}
.sr-only,.skip:not(:focus){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.skip:focus{position:fixed;z-index:100;top:12px;left:12px;padding:10px 16px;background:var(--accent);color:var(--accent-fg);border-radius:10px;font-weight:600}
.sr-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.wrap{width:100%;max-width:860px;margin-inline:auto;padding-inline:clamp(16px,4vw,28px)}
.mono{font-family:var(--font-mono);font-size:12px}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.glow{position:absolute;border-radius:50%;filter:blur(90px)}
.g1{width:55vw;height:55vw;top:-28vw;left:-20vw;background:rgba(125,154,255,.14)}
.g2{width:45vw;height:45vw;top:4vw;right:-24vw;background:rgba(147,168,255,.1)}
.topbar{position:sticky;top:0;z-index:20;backdrop-filter:blur(12px);background:color-mix(in oklab,var(--bg) 84%,transparent);border-bottom:1px solid var(--line-soft)}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;height:58px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:-.02em}
.brand-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:10px;background:linear-gradient(145deg,var(--accent),var(--accent-2));color:var(--accent-fg)}
.brand-mark svg{width:15px;height:15px}
.brand-text em{font-style:normal;color:var(--fg-dim);font-weight:500}
.topbar-actions{display:flex;align-items:center;gap:8px}
.icon-btn{display:grid;place-items:center;width:34px;height:34px;cursor:pointer;background:none;border:1px solid transparent;border-radius:10px;color:var(--fg-soft);transition:color .16s,background .16s}
.icon-btn svg{width:16px;height:16px}
.icon-btn:hover{color:var(--fg);background:var(--surface-2)}
[data-theme="dark"] .ico-sun,[data-theme="light"] .ico-moon{display:none}
.btn-outline{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;cursor:pointer;background:var(--surface);border:1px solid var(--line);border-radius:999px;font-size:13px;font-weight:500;color:var(--fg-soft,#a3adc0);transition:color .16s,border-color .16s}
.btn-outline svg{width:14px;height:14px}
.btn-outline:hover{color:var(--fg);border-color:var(--accent)}
.hero{padding:clamp(34px,5vw,58px) 0 20px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;font-family:var(--font-mono,monospace);font-size:11.5px;letter-spacing:.03em;color:var(--fg-dim)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--accent-2);box-shadow:0 0 0 3px var(--accent-soft)}
h1{font-size:clamp(30px,5.4vw,46px);line-height:1.08;letter-spacing:-.03em;font-weight:700;margin:0}
.grad{background:linear-gradient(100deg,var(--accent),var(--accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{margin:10px 0 0;color:var(--fg-soft)}
.list{list-style:none;padding:0;margin:20px 0 0;border-top:1px solid var(--line-soft)}
.row{position:relative;display:flex;align-items:flex-start;gap:14px;padding:14px 8px;border-bottom:1px solid var(--line-soft);animation:rise .3s cubic-bezier(.25,1,.5,1) both}
@keyframes rise{from{opacity:0;transform:translateY(6px)}}
.row:hover{background:var(--surface-2)}
.row:focus-within{background:var(--surface-2)}
.row-link{position:absolute;inset:0;border-radius:10px}
.row:hover .row-link{border:1px solid var(--line);outline:none}
.badge{flex:none;font-family:var(--font-mono);font-size:10px;color:var(--accent-2);border:1px solid var(--line);border-radius:999px;padding:3px 8px;background:var(--surface);white-space:nowrap;margin-top:2px}
.row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.row-title{font-size:14.5px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
.row-title:hover{color:var(--accent)}
.row-date{flex:none;font-family:var(--font-mono);font-size:11px;color:var(--fg-dim);text-align:right;margin-top:3px;white-space:nowrap}
.arrow{flex:none;color:var(--fg-dim);opacity:0;transition:opacity .16s,transform .16s}
.arrow svg{width:15px;height:15px;display:block}
.row:hover .arrow{opacity:1;transform:translate(2px,-1px)}
.skeleton{height:54px;background:var(--surface-2);border-radius:10px;margin:6px 0;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
.empty{padding:60px 20px;text-align:center;color:var(--fg-soft)}
.footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:72px;padding-block:28px;border-top:1px solid var(--line-soft);font-size:13px;color:var(--fg-dim)}
@media(max-width:640px){
  .badge{display:none}
  .row-date{display:none}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
