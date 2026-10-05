# rndmzr/links

Index link bermanfaat. Static, tanpa build, tanpa dependency runtime.

## Struktur
```
index.html          # shell + markup
assets/style.css    # design tokens + layout
assets/app.js       # render, filter, interaksi
assets/search.js    # logika filter murni (dipakai UI + test)
data/links.js       # ← SATU-SATUNYA file yang perlu diedit untuk tambah link
test.mjs            # node test.mjs
_headers            # header Cloudflare Pages (cache + CSP)
```

## Tambah link
Edit `data/links.js`:
```js
{ title: "Nama", url: "https://...", desc: "Kenapa berguna.", cat: "dev", tags: ["x"], featured: true }
```
`cat` harus salah satu id di `CATEGORIES`. Jalankan `node test.mjs` — gagal kalau url duplikat, bukan https, atau kategori salah.

## Dev
```bash
node test.mjs
python3 -m http.server 8000   # buka http://localhost:8000
```

## Deploy ke Cloudflare Pages
1. Push repo ke GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Build command: **kosong**. Build output directory: **`/`** (root repo).
4. Save & Deploy. Setiap push ke `main` auto-deploy.

Tanpa Git, langsung:
```bash
npx wrangler pages deploy . --project-name=rndmzr
```

## Fitur
- Pencarian instan (multi-term AND, lintas judul/deskripsi/tag/host/kategori), highlight hasil.
- Filter kategori (deep-link `?cat=dev`) + favorit (`?fav=1`) tersimpan di localStorage.
- Tema gelap/terang dengan deteksi preferensi sistem.
- Shortcut: `/` atau `Ctrl/⌘+K` cari, `T` tema, `R` link acak.
- Tampilan grid/list, state di URL (`?q=`, `?cat=`, `?fav=`) — bisa dibagikan.
