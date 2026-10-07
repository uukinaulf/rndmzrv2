---
name: rndmzr
description: Link hub developer Indonesia dalam dunia poster psychedelic Fillmore Handbill
colors:
  paper: "#f3ead8"
  ink: "#181512"
  vermilion: "#e8452c"
  yolk: "#f5d64c"
  midnight: "#1b2a52"
  hairline: "#d8cbb4"
  dark-bg: "#12141c"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 8vw, 92px)"
    fontWeight: 900
    lineHeight: "0.98"
    letterSpacing: "-0.03em"
  mono:
    fontFamily: "Space Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0.02em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.55"
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "24px"
  xl: "40px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
---

# rndmzr — Design System

Dunia visual Fillmore Handbill: letterpress gig poster psychedelic San Francisco 1966–1971 dalam mode operate. Utilitas link hub dev tetap fungsional di bawah perlakuan visual tebal.

## 1. Visual World

- **Inspirasi:** Poster handbill The Fillmore (Bill Graham, Wes Wilson, Victor Moscoso).
- **Dasar:** Kertas berserat hangat `#f3ead8` sebagai default, midnight `#12141c` sebagai night mode.
- **Tinta:** Midnight `#1b2a52` untuk border/rule, vermilion `#e8452c` untuk aksi/aksen, yolk `#f5d64c` untuk highlight sekunder.
- **Signature Move:** Baris featured membawa strip tinta split-fountain (`linear-gradient(100deg, #e8452c, #f5d64c)`), reverse-out text gelap, tampil sebagai headliner konser.

## 2. Typography

- **Display:** Archivo Black/900 dengan tracking ketat (`-0.03em`) dan line-height padat (`0.98`). Miring 2 derajat pada kata penekanan (`em`).
- **Body:** Archivo 400/16px untuk lede dan deskripsi link.
- **Data/Meta:** Space Mono untuk hitungan status, badge kategori, kbd shortcuts, dan timestamp scraper.

## 3. Elevation & Borders

- Tanpa drop shadow generik (kecuali depth minimal 2px).
- Struktur dibentuk oleh rule hairline `#d8cbb4` (2px) dan border solid `#1b2a52`.
- Transisi status: rotasi mikro (-1deg sampai -2deg) pada chip aktif, meniru cap stempel kertas.

## 4. Components

- **Chip Filter:** Border solid 2px, all-caps monospace, bergeser sudut saat aktif.
- **Row Link:** Baris lembaran cetak dengan link stretch, fav icon, tags monospace.
- **Lead Row:** Headliner satu kolom dengan split-fountain gradient ink.
- **Top Bar:** Sticky 60px dengan border bawah tebal tinta midnight.
- **Modal Anime:** Sheet bersih dibatasi border midnight 2px dengan backdrop warm dim.
