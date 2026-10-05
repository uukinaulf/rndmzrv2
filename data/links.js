// Katalog link. Format: { title, url, desc, cat, tags[], featured? }
// ponytail: array statis, no CMS. Ganti ke fetch('/links.json') kalau data > 500 entri / perlu edit tanpa deploy.
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
  { title: "MDN Web Docs", url: "https://developer.mozilla.org", desc: "Referensi HTML, CSS, JS paling akurat. Selalu jadi sumber pertama.", cat: "dev", tags: ["html", "css", "js"], featured: true },
  { title: "Can I use", url: "https://caniuse.com", desc: "Cek dukungan browser untuk fitur web sebelum dipakai produksi.", cat: "dev", tags: ["browser", "compat"] },
  { title: "Regex101", url: "https://regex101.com", desc: "Debug regex dengan penjelasan per token dan test case.", cat: "dev", tags: ["regex", "tools"] },
  { title: "DevDocs", url: "https://devdocs.io", desc: "Ratusan dokumentasi API dalam satu antarmuka cepat, offline-ready.", cat: "dev", tags: ["docs", "offline"], featured: true },
  { title: "Carbon", url: "https://carbon.now.sh", desc: "Screenshot kode yang rapi untuk presentasi atau media sosial.", cat: "dev", tags: ["snippet", "image"] },
  { title: "JSON Crack", url: "https://jsoncrack.com", desc: "Visualisasi JSON jadi graf, enak buat struktur data kompleks.", cat: "dev", tags: ["json", "visual"] },
  { title: "Astro Docs", url: "https://docs.astro.build", desc: "Framework konten-first, island architecture, output statis.", cat: "dev", tags: ["static", "framework"] },
  { title: "Hono", url: "https://hono.dev", desc: "Web framework ultra-ringan, jalan di Workers, Deno, Bun, Node.", cat: "dev", tags: ["edge", "api"] },

  { title: "roadmap.sh", url: "https://roadmap.sh", desc: "Peta belajar terstruktur untuk backend, frontend, DevOps, dan lainnya.", cat: "learn", tags: ["roadmap", "karier"], featured: true },
  { title: "freeCodeCamp", url: "https://www.freecodecamp.org", desc: "Kurikulum gratis dengan sertifikasi dan latihan praktik.", cat: "learn", tags: ["kursus", "gratis"] },
  { title: "JavaScript.info", url: "https://javascript.info", desc: "Penjelasan JS modern dari dasar sampai lanjutan, contoh jelas.", cat: "learn", tags: ["javascript", "buku"] },
  { title: "Exercism", url: "https://exercism.org", desc: "Latihan coding dengan review mentor manusia, 60+ bahasa.", cat: "learn", tags: ["latihan", "mentor"] },
  { title: "CS50", url: "https://cs50.harvard.edu/x/", desc: "Kuliah ilmu komputer Harvard, gratis, kualitas tinggi.", cat: "learn", tags: ["cs", "universitas"] },
  { title: "The Odin Project", url: "https://www.theodinproject.com", desc: "Kurikulum full-stack open source berbasis proyek.", cat: "learn", tags: ["fullstack", "proyek"] },
  { title: "System Design Primer", url: "https://github.com/donnemartin/system-design-primer", desc: "Dasar desain sistem skala besar untuk interview dan kerja nyata.", cat: "learn", tags: ["arsitektur", "interview"] },

  { title: "Refactoring UI", url: "https://www.refactoringui.com", desc: "Prinsip desain praktis untuk developer non-desainer.", cat: "design", tags: ["prinsip", "buku"] },
  { title: "Tailwind CSS", url: "https://tailwindcss.com", desc: "Utility-first CSS, dokumentasi terbaik di kelasnya.", cat: "design", tags: ["css", "utility"], featured: true },
  { title: "shadcn/ui", url: "https://ui.shadcn.com", desc: "Komponen aksesibel berbasis Radix, disalin bukan diinstal.", cat: "design", tags: ["komponen", "radix"] },
  { title: "Coolors", url: "https://coolors.co", desc: "Generator palet warna cepat, lengkap dengan cek kontras.", cat: "design", tags: ["warna", "palet"] },
  { title: "Lucide Icons", url: "https://lucide.dev", desc: "Set ikon SVG konsisten, tree-shakeable, lisensi ISC.", cat: "design", tags: ["ikon", "svg"] },
  { title: "Fontshare", url: "https://www.fontshare.com", desc: "Font gratis kualitas komersial, tanpa lisensi ribet.", cat: "design", tags: ["font", "tipografi"] },
  { title: "Realtime Colors", url: "https://realtimecolors.com", desc: "Uji palet dan font langsung di mockup landing page.", cat: "design", tags: ["palet", "preview"] },
  { title: "Haikei", url: "https://haikei.app", desc: "Generator SVG background: blob, wave, mesh gradient.", cat: "design", tags: ["svg", "background"] },

  { title: "Hugging Face", url: "https://huggingface.co", desc: "Model, dataset, dan demo ML. Pusat ekosistem open model.", cat: "ai", tags: ["model", "dataset"], featured: true },
  { title: "OpenRouter", url: "https://openrouter.ai", desc: "Satu API untuk ratusan LLM, ada model gratis.", cat: "ai", tags: ["llm", "api"] },
  { title: "Prompt Engineering Guide", url: "https://www.promptingguide.ai", desc: "Teknik prompting dari dasar sampai riset terbaru.", cat: "ai", tags: ["prompt", "panduan"] },
  { title: "Papers with Code", url: "https://paperswithcode.com", desc: "Paper ML plus implementasi kode dan benchmark.", cat: "ai", tags: ["riset", "paper"] },
  { title: "Ollama", url: "https://ollama.com", desc: "Jalankan LLM lokal dengan satu perintah.", cat: "ai", tags: ["lokal", "llm"] },
  { title: "Google AI Studio", url: "https://aistudio.google.com", desc: "Uji dan prototipe model Gemini, ada tier gratis.", cat: "ai", tags: ["gemini", "playground"] },

  { title: "Cloudflare Pages", url: "https://pages.cloudflare.com", desc: "Hosting statis gratis, bandwidth tak terbatas, edge global.", cat: "infra", tags: ["hosting", "static"], featured: true },
  { title: "Fly.io", url: "https://fly.io", desc: "Deploy app container dekat user, ada free allowance.", cat: "infra", tags: ["container", "edge"] },
  { title: "Railway", url: "https://railway.app", desc: "Deploy dari repo Git tanpa konfigurasi ribet.", cat: "infra", tags: ["paas", "deploy"] },
  { title: "Coolify", url: "https://coolify.io", desc: "Self-host PaaS open source, alternatif Heroku/Vercel.", cat: "infra", tags: ["selfhost", "paas"] },
  { title: "srv.us", url: "https://srv.us", desc: "Tunnel SSH instan untuk expose port lokal ke internet.", cat: "infra", tags: ["tunnel", "ssh"] },
  { title: "Uptime Kuma", url: "https://github.com/louislam/uptime-kuma", desc: "Monitoring uptime self-hosted dengan notifikasi.", cat: "infra", tags: ["monitoring", "selfhost"] },

  { title: "PostgreSQL Docs", url: "https://www.postgresql.org/docs/", desc: "Dokumentasi resmi Postgres, referensi SQL paling lengkap.", cat: "data", tags: ["sql", "postgres"] },
  { title: "Use The Index, Luke", url: "https://use-the-index-luke.com", desc: "Panduan tuning index SQL yang mudah dicerna.", cat: "data", tags: ["index", "performa"] },
  { title: "Prisma", url: "https://www.prisma.io", desc: "ORM TypeScript dengan type-safety end to end.", cat: "data", tags: ["orm", "typescript"] },
  { title: "Drizzle ORM", url: "https://orm.drizzle.team", desc: "ORM ringan bergaya SQL, cocok untuk edge runtime.", cat: "data", tags: ["orm", "edge"] },
  { title: "DuckDB", url: "https://duckdb.org", desc: "OLAP in-process, query CSV/Parquet tanpa server.", cat: "data", tags: ["analytics", "sql"] },
  { title: "Metabase", url: "https://www.metabase.com", desc: "BI dashboard self-hosted, tim non-teknis bisa pakai.", cat: "data", tags: ["bi", "dashboard"] },

  { title: "Have I Been Pwned", url: "https://haveibeenpwned.com", desc: "Cek kebocoran kredensial email dan password.", cat: "sec", tags: ["breach", "kredensial"], featured: true },
  { title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/", desc: "Daftar risiko keamanan web paling kritis.", cat: "sec", tags: ["owasp", "web"] },
  { title: "Bitwarden", url: "https://bitwarden.com", desc: "Password manager open source, sinkron lintas perangkat.", cat: "sec", tags: ["password", "open source"] },
  { title: "CryptPad", url: "https://cryptpad.fr", desc: "Dokumen kolaboratif terenkripsi end to end.", cat: "sec", tags: ["enkripsi", "kolaborasi"] },
  { title: "SSL Labs Test", url: "https://www.ssllabs.com/ssltest/", desc: "Audit konfigurasi TLS server, nilai A sampai F.", cat: "sec", tags: ["tls", "audit"] },

  { title: "Excalidraw", url: "https://excalidraw.com", desc: "Whiteboard sketsa untuk diagram arsitektur dan brainstorm.", cat: "prod", tags: ["diagram", "whiteboard"], featured: true },
  { title: "Obsidian", url: "https://obsidian.md", desc: "Catatan markdown lokal dengan graph dan plugin.", cat: "prod", tags: ["catatan", "markdown"] },
  { title: "Raycast", url: "https://raycast.com", desc: "Launcher macOS dengan ekstensi dan AI command.", cat: "prod", tags: ["macos", "launcher"] },
  { title: "Squoosh", url: "https://squoosh.app", desc: "Kompres gambar di browser, tanpa upload ke server.", cat: "prod", tags: ["gambar", "kompresi"] },
  { title: "Stirling PDF", url: "https://stirlingpdf.io", desc: "Toolkit PDF lengkap, self-hostable.", cat: "prod", tags: ["pdf", "selfhost"] },
  { title: "Cron Express", url: "https://crontab.guru", desc: "Terjemahkan ekspresi cron jadi bahasa manusia.", cat: "prod", tags: ["cron", "tools"] },
];