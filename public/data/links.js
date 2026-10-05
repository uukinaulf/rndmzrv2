// Katalog link. Format: { title, url, desc, cat, tags[], featured? }
// Koleksi minimal 10 link sample. Ganti ke fetch('/links.json') kalau data > 500 entri.
export const CATEGORIES = [
  { id: "dev", label: "Dev & Code", icon: "code" },
  { id: "learn", label: "Belajar", icon: "book" },
  { id: "design", label: "Desain & UI", icon: "palette" },
  { id: "ai", label: "AI & ML", icon: "sparkles" },
  { id: "infra", label: "Infra & Deploy", icon: "server" },
  { id: "data", label: "Data & DB", icon: "database" },
  { id: "sec", label: "Keamanan", icon: "shield" },
  { id: "prod", label: "Produktivitas", icon: "zap" },
];

export const LINKS = [
  { title: "MDN Web Docs", url: "https://developer.mozilla.org", desc: "Referensi HTML, CSS, JS paling akurat. Sumber pertama.", cat: "dev", tags: ["html", "css", "js"], featured: true },
  { title: "DevDocs", url: "https://devdocs.io", desc: "Dokumentasi API dalam satu antarmuka cepat, offline-ready.", cat: "dev", tags: ["docs", "offline"] },

  { title: "roadmap.sh", url: "https://roadmap.sh", desc: "Peta belajar terstruktur untuk backend, frontend, DevOps.", cat: "learn", tags: ["roadmap", "karier"], featured: true },
  { title: "JavaScript.info", url: "https://javascript.info", desc: "Penjelasan JS modern dari dasar sampai lanjutan.", cat: "learn", tags: ["javascript", "buku"] },

  { title: "Tailwind CSS", url: "https://tailwindcss.com", desc: "Utility-first CSS, dokumentasi terbaik.", cat: "design", tags: ["css", "utility"], featured: true },

  { title: "Hugging Face", url: "https://huggingface.co", desc: "Model, dataset, demo ML. Pusat ekosistem open model.", cat: "ai", tags: ["model", "dataset"], featured: true },

  { title: "Cloudflare Pages", url: "https://pages.cloudflare.com", desc: "Hosting statis gratis, edge global.", cat: "infra", tags: ["hosting", "static"], featured: true },

  { title: "PostgreSQL Docs", url: "https://www.postgresql.org/docs/", desc: "Referensi SQL paling lengkap.", cat: "data", tags: ["sql", "postgres"] },

  { title: "Have I Been Pwned", url: "https://haveibeenpwned.com", desc: "Cek kebocoran kredensial email dan password.", cat: "sec", tags: ["breach", "kredensial"], featured: true },

  { title: "Excalidraw", url: "https://excalidraw.com", desc: "Whiteboard sketsa untuk diagram arsitektur.", cat: "prod", tags: ["diagram", "whiteboard"], featured: true },
];
