// Static server with SPA fallback for a web export: node static.mjs <dir> <port>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const [dir, port] = [process.argv[2], Number(process.argv[3])];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".ico": "image/x-icon" };
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const p of [path, path + ".html", "/index.html"]) {
    try { const body = await readFile(join(dir, p)); res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }); return res.end(body); } catch {}
  }
  res.writeHead(404).end();
}).listen(port, () => console.log("serving", dir, "on", port));
