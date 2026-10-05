// Logika filter murni — dipakai index.html dan test.mjs.
export const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

export function buildIndex(links, catLabel = (c) => c) {
  return new Map(links.map((l) => [
    l.url,
    norm([l.title, l.desc, l.url, hostOf(l.url), catLabel(l.cat), ...(l.tags || [])].join(" ")),
  ]));
}

export function filterLinks(links, index, { q = "", cat = "all", favOnly = false, favs = new Set() } = {}) {
  const terms = norm(q.trim()).split(/\s+/).filter(Boolean);
  return links
    .filter((l) => {
      if (cat !== "all" && l.cat !== cat) return false;
      if (favOnly && !favs.has(l.url)) return false;
      if (!terms.length) return true;
      const hay = index.get(l.url) || "";
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.title.localeCompare(b.title, "id"));
}
