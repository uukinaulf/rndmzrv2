import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import worker from "./src/index.js";

const PORT = parseInt(process.env.PORT || "38651", 10);
const PUBLIC_DIR = path.resolve("public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);
    console.log(`[DEV] ${req.method} ${url.pathname}${url.search}`);

    // Worker dynamic routes (/anime, /api/*, /rss, /rss.xml)
    if (
      url.pathname === "/anime" ||
      url.pathname === "/anime/" ||
      url.pathname.startsWith("/api/") ||
      url.pathname === "/rss" ||
      url.pathname === "/rss.xml"
    ) {
      const webReq = new Request(url.href, {
        method: req.method,
        headers: req.headers,
      });
      const webRes = await worker.fetch(webReq);
      const headers = Object.fromEntries(webRes.headers.entries());
      headers["cache-control"] = "no-store, no-cache, must-revalidate";
      headers["access-control-allow-origin"] = "*";
      res.writeHead(webRes.status, headers);
      const buf = Buffer.from(await webRes.arrayBuffer());
      res.end(buf);
      return;
    }

    // Static file resolution in public/
    let filePath = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(fs.readFileSync(filePath));
      return;
    }

    // Handle /anime without trailing slash
    if (url.pathname === "/anime" || url.pathname === "/anime/") {
      const animePath = path.join(PUBLIC_DIR, "anime", "index.html");
      if (fs.existsSync(animePath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(animePath));
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  } catch (err) {
    console.error("Dev server error:", err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(err));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rndmzr full dev server running at http://127.0.0.1:${PORT}`);
});
