// The local site with its two functions: web/ as static files, web/api/tree.js at /api/tree and web/api/infer.js at
// /api/infer, called as Vercel calls them, handler(req, res). The repo's .env fills process.env first (a key already
// set wins). Port 8787, PORT overrides. Node only: `node tests/ui/serve.mjs`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = path.join(ROOT, "web");
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch { /* no .env: the functions answer as on a host without keys */ }
const require = createRequire(import.meta.url);
const API = { "/api/tree": require(path.join(WEB, "api", "tree.js")), "/api/infer": require(path.join(WEB, "api", "infer.js")) };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".gz": "application/gzip" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const fn = API[url.pathname.replace(/\/$/, "")];
  if (fn) {
    try { return await fn(req, res); } catch (e) { console.error(url.pathname, e.message); if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"server"}'); } return; }
  }
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.statusCode = 400; return res.end("bad path"); }
  const file = path.join(WEB, path.normalize(rel === "/" ? "/index.html" : rel));
  if (!file.startsWith(WEB + path.sep)) { res.statusCode = 403; return res.end("forbidden"); }
  fs.stat(file, (err, st) => {
    const f = !err && st.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(f, (e, buf) => {
      if (e) { res.statusCode = 404; res.setHeader("content-type", "text/plain; charset=utf-8"); return res.end("not found"); }
      res.setHeader("content-type", TYPES[path.extname(f).toLowerCase()] || "application/octet-stream");
      res.setHeader("cache-control", "no-store");
      res.end(buf);
    });
  });
});
const PORT = +process.env.PORT || 8787;
server.listen(PORT, () => console.log(`serve.mjs: http://localhost:${PORT} (web/ and /api/tree, /api/infer)`));
