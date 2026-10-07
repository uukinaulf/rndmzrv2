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
    const all = await Promise.all(SOURCES.map(async (src) => {
      const res = await fetch(src.feed, {
        headers: { "User-Agent": UA },
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      });
      if (!res.ok) throw new Error(`feed ${src.id} ${res.status}`);
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
        // kategori: samehadaku 1 (seri), kusonime 2 (Anime + judul) -> ambil yang spesifik
        const cats = [];
        const catRe = /<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g;
        let cm;
        while ((cm = catRe.exec(chunk))) cats.push(htmlDecode(cm[1]).trim());
        const cat = cats.filter((c) => c.toLowerCase() !== "anime").pop() || cats[0] || "Anime";
        items.push({
          title,
          link: g("link"),
          pub: g("pubDate"),
          cat,
          guid: g("guid") || g("link"),
          source: src.id,
          sourceLabel: src.label,
          kind: src.kind,
        });
      }
      return items;
    }));
    const items = all.flat();

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
async function handleEpisode(url) {
  const target = url.searchParams.get("u");
  if (!target) return Response.json({ error: "param u wajib" }, { status: 400 });
  let epUrl;
  try {
    epUrl = new URL(target);
  } catch {
    return Response.json({ error: "url invalid" }, { status: 400 });
  }

  const res = await fetch(epUrl, {
    headers: { "User-Agent": UA },
    cf: { cacheTtl: 3600, cacheEverything: true },
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
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
  // - kusonime: .smokeurlrh -> <strong>quality</strong> link | link ...
  const groups = [];
  const isKusonime = epUrl.hostname.includes("kusonime");

  if (isKusonime) {
    const kusoRe = /<div class="smokeurlrh"[^>]*>\s*<strong>([^<]*)<\/strong>([\s\S]*?)<\/div>/g;
    let km;
    while ((km = kusoRe.exec(html))) {
      const quality = htmlDecode(km[1]).trim();
      const links = [];
      const aRe = /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]*?)\s*<\/a>/g;
      let am;
      while ((am = aRe.exec(km[2]))) {
        const href = htmlDecode(am[1]).trim();
        const label = htmlDecode(am[2]).trim();
        if (label && href && !href.startsWith("#")) links.push({ label, href });
      }
      if (links.length) groups.push({ format: "Batch", quality, links });
    }
  } else {
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
        groups.push({ format, quality, links });
      }
    }
  }

  const payload = {
    title: url.searchParams.get("t") || "",
    thumbnail: thumb || "",
    groups: groups.map((g) => ({ quality: g.quality, format: g.format, links: g.links })),
    source: epUrl.href,
  };
  return Response.json(payload, { headers: { "cache-control": `public, max-age=${CACHE_TTL}` } });
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
    <p class="lede">Episode & batch terbaru sub Indo. <span id="count">0</span> rilis di tangan, di-scrape otomatis tiap 15 menit.</p>
  </section>

  <div id="filters" class="filters" aria-label="Filter sumber"></div>

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

<dialog id="modal" class="modal">
  <button class="modal-close" id="modalClose" type="button" aria-label="Tutup">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  </button>
  <div class="modal-body">
    <div class="modal-thumb"><img id="modalImg" alt="" width="640" height="360"></div>
    <div class="modal-info">
      <h2 id="modalTitle" class="modal-title"></h2>
      <p id="modalSource" class="modal-source mono"></p>
      <button id="modalOpen" class="btn-primary" type="button">
        Buka halaman asli
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </button>
    </div>
  </div>
  <div id="modalGroups" class="modal-groups"></div>
  <div id="modalLoading" class="modal-loading" role="status">Mengambil link download…</div>
</dialog>

<footer class="wrap footer">
  <p>Dibuat manual. Feed from samehadaku & kusonime.</p>
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
    allItems = items;
    count.textContent = items.length;
    status.textContent = "Sinkron " + (data.fetchedAt ? new Date(data.fetchedAt).toLocaleString("id-ID") : "");
    renderFilters(items);
    renderList(items);
  } catch (e) {
    list.hidden = true;
    empty.hidden = false;
    status.textContent = "Gagal memuat feed";
  }
}

function renderFilters(items) {
  const sources = [];
  for (const i of items) if (!sources.includes(i.sourceLabel)) sources.push(i.sourceLabel);
  $("#filters").innerHTML = '<button class="filter active" data-src="">Semua</button>' +
    sources.map((s) => '<button class="filter" data-src="' + esc(s) + '">' + esc(s) + "</button>").join("");
}

let activeSource = "";
$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest(".filter");
  if (b) applySource(b.dataset.src);
});
function renderList(items) {
  const list = $("#list"), count = $("#count"), empty = $("#empty");
  const shown = activeSource ? items.filter((i) => (i.sourceLabel || "") === activeSource) : items;
  shownItems = shown;
  count.textContent = shown.length;
  list.innerHTML = shown.map((i, idx) => \`
    <li class="row" data-i="\${idx}" style="animation-delay:\${Math.min(idx * 30, 400)}ms">
      <img class="row-thumb" src="\${esc(i.thumb || "")}" alt="" loading="lazy" \${i.thumb ? "" : "hidden"}>
      <span class="row-main">
        <span class="row-name">
          <span class="row-title">\${esc(i.title)}</span>
        </span>
        <span class="row-meta">
          <span class="pill">\${esc(i.sourceLabel || "")}</span>
          <span class="badge">\${esc(i.cat || "Anime")}</span>
          <time class="row-date">\${esc(fmt(i.pub))}</time>
        </span>
      </span>
      <span class="arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
      </span>
    </li>\`).join("");
  list.hidden = !shown.length;
  empty.hidden = !!shown.length;
}
function applySource(src) {
  activeSource = src;
  document.querySelectorAll("#filters .filter").forEach((b) => b.classList.toggle("active", b.dataset.src === src));
  renderList(allItems);
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

/* modal detail episode */
let allItems = [];
let shownItems = [];
let currentEp = null;
const modal = $("#modal");
const modalClose = $("#modalClose");
const modalImg = $("#modalImg");
const modalTitle = $("#modalTitle");
const modalSource = $("#modalSource");
const modalOpen = $("#modalOpen");
function modalGroups() { return $("#modalGroups"); }
function modalLoading(on) { $("#modalLoading").hidden = !on; }
const closeModal = () => { modal.close(); document.body.classList.remove("no-scroll"); };

function openEpisode(ep) {
  currentEp = ep;
  modalTitle.textContent = ep.title;
  modalSource.textContent = [ep.cat, ep.pub ? fmt(ep.pub) : ""].filter(Boolean).join(" · ");
  modalImg.src = "";
  modalImg.hidden = true;
  modalGroups().hidden = true;
  modalLoading(true);
  modal.showModal();
  document.body.classList.add("no-scroll");
  loadEpisode(ep);
}

async function loadEpisode(ep) {
  if (ep.detail) return renderDetail(ep.detail);
  try {
    const r = await fetch("/api/episode?u=" + encodeURIComponent(ep.link) + "&t=" + encodeURIComponent(ep.title));
    if (!r.ok) throw new Error("api");
    const d = await r.json();
    ep.detail = d;
    renderDetail(d);
  } catch {
    modalGroups().hidden = false;
    modalGroups().innerHTML = \`<div class="group"><p class="link-dead-txt">Gagal mengambil link download.</p></div>\`;
  } finally {
    modalLoading(false);
  }
}

function renderDetail(d) {
  if (d.thumbnail) {
    modalImg.src = d.thumbnail;
    modalImg.hidden = false;
  }
  modalGroups().hidden = !(d.groups && d.groups.length);
  modalGroups().innerHTML = (d.groups || []).map((g) => \`
    <div class="group">
      <h3 class="group-title">\${esc(g.format || "Format")} · \${esc(g.quality)}</h3>
      <div class="group-links">
        \${(g.links || []).map((l) => l.dead
          ? \`<span class="link dead" title="Link mati">\${esc(l.label)}</span>\`
          : \`<a class="link" href="\${esc(l.href)}" target="_blank" rel="noopener noreferrer">\${esc(l.label)}</a>\`
        ).join("")}
      </div>
    </div>\`).join("");
  modalLoading(false);
}

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
  if (e.key === "Escape" && modal.open) closeModal();
  if ((e.key === "t" || e.key === "T") && !/^(INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName || "")) $("#themeBtn").click();
});
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
  --line:#2c3245; --line-soft:#232a3b; --fg:#f3ead8; --fg-soft:#b3a98e; --fg-dim:#7d7257; --accent:#f05a3c; --accent-2:#f5d64c; --accent-fg:#12141c;
  --grad-split:linear-gradient(100deg,#f05a3c,#f5d64c);
  --paper-texture:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0 0.05 0'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");
}
*,*::before,*::after{box-sizing:border-box}
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
.icon-btn{display:grid;place-items:center;width:36px;height:36px;cursor:pointer;background:none;border:2px solid transparent;border-radius:4px;color:var(--fg-soft);transition:color .16s,background .16s,border-color .16s}
.icon-btn svg{width:17px;height:17px}
.icon-btn:hover{color:var(--fg);background:var(--surface-2);border-color:var(--line)}
[data-theme="dark"] .ico-sun,[data-theme="light"] .ico-moon{display:none}
.btn-paper{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:var(--paper);color:#181512;border:2px solid var(--midnight);border-radius:4px;transition:transform .16s}
.btn-paper svg{width:13px;height:13px}
.btn-paper:hover{transform:translateY(-1px)}
.bill{padding:clamp(40px,6vw,72px) 0 22px;position:relative}
.eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-family:var(--font-mono);font-size:12px;letter-spacing:.05em;color:var(--fg-dim)}
h1{font-size:clamp(40px,8vw,92px);line-height:.98;letter-spacing:-.03em;font-weight:900;margin:0;text-wrap:balance}
h1 em{font-style:normal;display:inline-block;color:var(--accent);transform:rotate(-2deg) translateY(2px);text-shadow:2px 2px 0 var(--midnight)}
.lede{margin:16px 0 0;color:var(--fg-soft);font-size:17px;max-width:54ch}
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
.modal{border:0;border-radius:4px;background:var(--bg);color:var(--fg);padding:0;width:100%;max-width:640px;box-shadow:0 24px 80px rgba(0,0,0,.45);position:relative;border:2px solid var(--midnight)}
.modal::backdrop{background:rgba(20,16,10,.55);backdrop-filter:blur(3px)}
.modal[open]{animation:modalIn .22s cubic-bezier(.25,1,.5,1)}
@keyframes modalIn{from{opacity:0;transform:translateY(12px) scale(.98)}}
.modal-close{position:absolute;top:12px;right:12px;z-index:2;width:32px;height:32px;display:grid;place-items:center;border-radius:4px;border:2px solid var(--line);background:var(--bg-soft);color:var(--fg-soft);cursor:pointer}
.modal-close svg{width:15px;height:15px}
.modal-close:hover{color:var(--fg)}
.modal-body{display:flex;gap:18px;padding:20px;align-items:flex-start}
.modal-thumb{flex:none;width:200px;border-radius:4px;overflow:hidden;background:var(--surface-2);aspect-ratio:16/9}
.modal-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.modal-thumb[hidden]{display:none}
.modal-info{flex:1;min-width:0}
.modal-title{font-size:19px;line-height:1.3;letter-spacing:-.01em;margin:0 0 6px;font-weight:900}
.modal-source{color:var(--fg-dim);margin:0 0 14px}
.btn-primary{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:0;border-radius:4px;background:var(--ink,#1a1a1a);color:#f3ead8;font-weight:800;font-size:13px;cursor:pointer;border:2px solid var(--ink)}
.btn-primary svg{width:15px;height:15px}
.modal-groups{display:flex;flex-direction:column;gap:14px;padding:0 20px 20px;max-height:52vh;overflow:auto}
.group{border-top:1px solid var(--line-soft);padding-top:14px}
.group-title{font-size:13px;font-weight:700;letter-spacing:.02em;margin:0 0 9px;color:var(--fg-soft);font-family:var(--font-mono)}
.group-links{display:flex;flex-wrap:wrap;gap:8px}
.link{display:inline-flex;align-items:center;padding:7px 13px;border-radius:4px;border:2px solid var(--line);background:var(--bg-soft);font-size:13px;font-weight:600;color:var(--fg);transition:border-color .15s,color .15s}
a.link:hover{border-color:var(--accent);color:var(--accent)}
a.link{text-decoration:none}
.link.dead{opacity:.45;color:var(--fg-dim);text-decoration:line-through;cursor:default}
.link-dead-txt{color:var(--fg-dim);margin:0;font-size:14px}
.modal-loading{padding:6px 20px 22px;color:var(--fg-dim);font-size:13px;display:flex;align-items:center;gap:9px}
.modal-loading[hidden]{display:none}
.modal-loading::before{content:"";width:13px;height:13px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.modal-body{flex-direction:column}.modal-thumb{width:100%}}
.footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:72px;padding-block:40px;border-top:3px double var(--line);font-size:13px;color:var(--fg-soft)}
@media(max-width:640px){.row-title{font-size:14px}.row-thumb{width:72px;height:44px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
