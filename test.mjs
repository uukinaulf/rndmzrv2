// Jalankan: node test.mjs
import assert from "node:assert/strict";
import { LINKS, CATEGORIES } from "./data/links.js";
import { buildIndex, filterLinks, norm, hostOf } from "./assets/search.js";

// --- integritas data ---
const ids = new Set(CATEGORIES.map((c) => c.id));
const seen = new Set();
for (const l of LINKS) {
  assert.ok(ids.has(l.cat), `kategori tak dikenal: ${l.title} (${l.cat})`);
  assert.match(l.url, /^https:\/\//, `url harus https: ${l.url}`);
  assert.ok(l.title && l.desc, `field kosong: ${l.url}`);
  assert.ok(!seen.has(l.url), `url duplikat: ${l.url}`);
  seen.add(l.url);
}

// --- filter ---
const label = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const index = buildIndex(LINKS, label);
const run = (opts) => filterLinks(LINKS, index, opts);

assert.equal(run({}).length, LINKS.length, "tanpa filter = semua link");
assert.ok(run({ cat: "dev" }).every((l) => l.cat === "dev"), "filter kategori bocor");
assert.equal(run({ cat: "dev" }).length, LINKS.filter((l) => l.cat === "dev").length);

const mdn = run({ q: "mdn" });
assert.equal(mdn.length, 1, "pencarian judul harus tepat satu");
assert.equal(mdn[0].url, "https://developer.mozilla.org");

assert.ok(run({ q: "postgres" }).some((l) => l.cat === "data"), "cari via tag/kategori");
assert.equal(run({ q: "zzzznotexist" }).length, 0, "query sampah harus kosong");
assert.ok(run({ q: "  " }).length === LINKS.length, "query whitespace = semua");

// multi-term = AND: tak ada link yang punya kedua kata ini sekaligus
assert.equal(run({ q: "mdn excalidraw" }).length, 0, "multi-term harus AND, bukan OR");
assert.equal(run({ q: "mdn css" }).length, 1, "AND harus tetap cocok lintas field");

// favorit
const favs = new Set([LINKS[0].url]);
assert.deepEqual(run({ favOnly: true, favs }).map((l) => l.url), [LINKS[0].url]);
assert.equal(run({ favOnly: true }).length, 0, "favOnly tanpa favs = kosong");

// featured di atas
const top = run({ cat: "ai" })[0];
assert.ok(top.featured, "featured harus di urutan pertama");

// helper
assert.equal(norm("Café Ünïcode"), "cafe unicode");
assert.equal(hostOf("https://www.example.com/a?b=1"), "example.com");
assert.equal(hostOf("bukan-url"), "bukan-url");

console.log(`OK — ${LINKS.length} link, ${CATEGORIES.length} kategori, semua assertion lolos.`);
