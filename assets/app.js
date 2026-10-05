import { LINKS, CATEGORIES } from "../data/links.js";
import { buildIndex, filterLinks, hostOf as host } from "./search.js";

const $ = (s) => document.querySelector(s);
const grid = $("#grid"), chips = $("#chips"), qInput = $("#q");
const emptyBox = $("#empty"), status = $("#status");
const toastEl = $("#toast");

const ICONS = {
  code: '<path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9.5" cy="15" r="1.2"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  zap: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};
const icon = (name, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.code}</svg>`;

const LS = { theme: "rndmzr:theme", fav: "rndmzr:fav", view: "rndmzr:view" };
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const catOf = (id) => CATEGORIES.find((c) => c.id === id);
const key = (l) => l.url;

let state = {
  q: "",
  cat: new URLSearchParams(location.search).get("cat") || "all",
  favOnly: false,
  view: store.get(LS.view, "grid"),
};
const favs = new Set(store.get(LS.fav, []));

const haystack = buildIndex(LINKS, (c) => catOf(c)?.label || c);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const needle = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${needle})`, "gi"), "<mark>$1</mark>");
}

const results = () => filterLinks(LINKS, haystack, { ...state, favs });

function card(l, q) {
  const c = catOf(l.cat);
  const isFav = favs.has(key(l));
  const initial = escapeHtml(l.title.trim()[0] || "?");
  return `<li class="card" data-url="${escapeHtml(l.url)}">
    <a class="card-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
      <span class="sr-only">Buka ${escapeHtml(l.title)}</span>
    </a>
    <div class="card-top">
      <span class="favicon" aria-hidden="true"><span>${initial}</span></span>
      <span>
        <span class="card-title">${highlight(l.title, q)}</span>
        <span class="host">${escapeHtml(host(l.url))}</span>
      </span>
      <button class="star" type="button" aria-pressed="${isFav}" aria-label="${isFav ? "Hapus dari" : "Tambah ke"} favorit: ${escapeHtml(l.title)}">
        <svg viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z"/></svg>
      </button>
    </div>
    <p class="card-desc">${highlight(l.desc, q)}</p>
    <div class="card-foot">
      <span class="tag cat-tag">${icon(c?.icon, 1.6)} ${escapeHtml(c?.label || l.cat)}</span>
      ${(l.tags || []).map((t) => `<span class="tag">${highlight(t, q)}</span>`).join("")}
      <span class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
    </div>
  </li>`;
}

function hydrateIcons(root) {
  root.querySelectorAll(".favicon").forEach((el) => {
    const url = el.closest(".card")?.dataset.url;
    if (!url) return;
    const img = new Image();
    img.loading = "lazy";
    img.alt = "";
    img.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host(url))}`;
    img.addEventListener("load", () => { el.replaceChildren(img); }, { once: true });
  });
}

function renderChips() {
  const count = (id) => LINKS.filter((l) => id === "all" || l.cat === id).length;
  const all = [{ id: "all", label: "Semua", icon: "sparkles" }, ...CATEGORIES];
  chips.innerHTML = all.map((c) => `<button class="chip" type="button" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${icon(c.icon, 1.7)}${escapeHtml(c.label)}<span class="n">${count(c.id)}</span></button>`).join("");
}

function render() {
  const list = results();
  const q = state.q.trim();
  grid.dataset.view = state.view;
  grid.innerHTML = list.map((l) => card(l, q)).join("");
  hydrateIcons(grid);

  emptyBox.hidden = list.length > 0;
  emptyBox.querySelector("p").innerHTML = q
    ? `Tidak ada hasil untuk <strong>${escapeHtml(q)}</strong>.`
    : "Tidak ada link untuk filter ini.";
  const bits = [`${list.length} dari ${LINKS.length} link`];
  if (state.cat !== "all") bits.push(catOf(state.cat)?.label);
  if (state.favOnly) bits.push("favorit");
  status.textContent = bits.join(" · ");

  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.cat !== "all") p.set("cat", state.cat);
  if (state.favOnly) p.set("fav", "1");
  const next = p.toString() ? `?${p}` : location.pathname;
  history.replaceState(null, "", next);
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2200);
}

/* ---- events ---- */
let rafId;
qInput.addEventListener("input", () => {
  state.q = qInput.value;
  $("#clearBtn").hidden = !state.q;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(render);
});
$("#clearBtn").addEventListener("click", () => { qInput.value = ""; state.q = ""; $("#clearBtn").hidden = true; render(); qInput.focus(); });
$("#resetBtn").addEventListener("click", () => { state = { ...state, q: "", cat: "all", favOnly: false }; qInput.value = ""; $("#clearBtn").hidden = true; $("#favOnly").checked = false; renderChips(); render(); qInput.focus(); });

chips.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.cat = btn.dataset.cat;
  renderChips();
  render();
  document.getElementById("grid").scrollIntoView({ block: "start", behavior: "smooth" });
});

$("#favOnly").addEventListener("change", (e) => { state.favOnly = e.target.checked; render(); });

grid.addEventListener("click", (e) => {
  const star = e.target.closest(".star");
  if (!star) return;
  e.preventDefault();
  const url = star.closest(".card").dataset.url;
  favs.has(url) ? favs.delete(url) : favs.add(url);
  store.set(LS.fav, [...favs]);
  const link = LINKS.find((l) => l.url === url);
  toast(favs.has(url) ? `Favorit: ${link.title}` : `Dihapus: ${link.title}`);
  render();
});

document.querySelectorAll(".view-toggle button").forEach((b) =>
  b.addEventListener("click", () => {
    state.view = b.dataset.view;
    store.set(LS.view, state.view);
    document.querySelectorAll(".view-toggle button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  })
);

$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set(LS.theme, next);
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#08090c" : "#f7f8fb";
});

$("#randomBtn").addEventListener("click", () => {
  const pool = results().length ? results() : LINKS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  toast(`Acak: ${pick.title}`);
  window.open(pick.url, "_blank", "noopener");
});

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (e.key === "/" && !typing) { e.preventDefault(); qInput.focus(); }
  else if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); qInput.focus(); qInput.select(); }
  else if (e.key === "Escape" && typing) { qInput.blur(); }
  else if (!typing && (e.key === "t" || e.key === "T")) { $("#themeBtn").click(); }
  else if (!typing && (e.key === "r" || e.key === "R")) { $("#randomBtn").click(); }
});

/* ---- init ---- */
(function init() {
  document.documentElement.dataset.theme =
    store.get(LS.theme, null) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.querySelector('meta[name="theme-color"]').content =
    document.documentElement.dataset.theme === "dark" ? "#08090c" : "#f7f8fb";

  const p = new URLSearchParams(location.search);
  state.q = p.get("q") || "";
  state.favOnly = p.get("fav") === "1";
  if (state.q) { qInput.value = state.q; $("#clearBtn").hidden = false; }
  $("#favOnly").checked = state.favOnly;
  document.querySelectorAll(".view-toggle button").forEach((x) => x.classList.toggle("active", x.dataset.view === state.view));

  $("#totalCount").textContent = LINKS.length;
  $("#catCount").textContent = CATEGORIES.length;
  renderChips();
  render();
})();