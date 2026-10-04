// Lokaler Ersatz für den Vorschau-Worker (nur für Tests): statische Dateien
// aus apps/web/dist-preview, /api/* liefert 503.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/dist-preview/", import.meta.url));
const port = Number(process.argv[2] ?? 4174);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path.startsWith("/api/") || path === "/health") {
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Demo ohne Server" }));
  }
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  try {
    const body = await readFile(file.startsWith(root) ? file : join(root, "index.html"));
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(200, { "Content-Type": types[".html"] });
    res.end(await readFile(join(root, "index.html")));
  }
}).listen(port, "127.0.0.1");
