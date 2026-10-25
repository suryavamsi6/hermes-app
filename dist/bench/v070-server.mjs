// Screenshot rig for 0.7.0 live mode: one origin (no CORS) serving the web build, /bridge/* proxied to the
// real hermes-bridge (+ its fake dashboard, via test/bridge_stack.py), and a minimal fake Hermes API.
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const WEB = "/tmp/web-live", PORT = 8799, MAIN = "main-key-0123456789";
const stack = spawn("python3", ["test/bridge_stack.py"], { cwd: "/workspace/hermes-mobile", stdio: ["pipe", "pipe", "inherit"] });
const { bridge, key } = JSON.parse(await new Promise((r) => createInterface({ input: stack.stdout }).once("line", r)));
const keys = { default: MAIN };
const now = Math.floor(Date.now() / 1000);
const sessions = { default: [{ id: "bc1", title: "Bot Chat", messages: [
  { role: "user", content: "Is the bridge working?", timestamp: now - 400 },
  { role: "assistant", content: "Yes. I can see **2 profiles** and your routines from here.", timestamp: now - 380 }] }] };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json" };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const body = await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
  const json = (s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
  if (u.pathname.startsWith("/bridge/")) {
    const r = await fetch(bridge + u.pathname.slice(7) + u.search, { method: req.method, headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" }, body: body || undefined });
    const t = await r.text();
    try { const j = JSON.parse(t); if (j?.api_key) keys[j.profile?.id ?? j.profile] = j.api_key; } catch {}
    res.writeHead(r.status, { "content-type": "application/json" }); return res.end(t);
  }
  const m = u.pathname.match(/^\/p\/([^/]+)(\/.*)$/);
  const prof = m ? m[1] : "default", path = m ? m[2] : u.pathname;
  if (path.startsWith("/api/") || path.startsWith("/v1/")) {
    if (!(prof in keys)) return json(404, { error: "Unknown or unconfigured profile" });
    if (req.headers.authorization !== `Bearer ${keys[prof]}`) return json(401, { error: { message: "Invalid gateway API key", code: "gateway_auth_failed" } });
    const rows = (sessions[prof] ??= []);
    if (path === "/v1/capabilities") return json(200, { object: "hermes.api_server.capabilities" });
    if (path === "/api/model/options") return json(200, { providers: [{ slug: "nous", name: "Nous", models: ["hermes-4-405b", "hermes-4-70b"] }] });
    if (path === "/api/sessions" && req.method === "GET") { const t = u.searchParams.get("title"); return json(200, { object: "list", data: rows.filter((s) => !t || s.title === t) }); }
    if (path === "/api/sessions" && req.method === "POST") { const s = { id: `s${prof}${rows.length}`, title: JSON.parse(body || "{}").title, messages: [] }; rows.push(s); return json(201, { session: s }); }
    const sm = path.match(/^\/api\/sessions\/([^/]+)(\/messages)?$/);
    if (sm) { const s = rows.find((x) => x.id === sm[1]); if (!s) return json(404, { error: { code: "session_not_found", message: "nope" } }); return json(200, sm[2] ? { object: "list", data: s.messages } : { session: s }); }
    return json(404, { error: "no route " + path });
  }
  let f = join(WEB, u.pathname);
  try { const d = await readFile(f); res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); return res.end(d); }
  catch { try { f = join(WEB, u.pathname + ".html"); const d = await readFile(f); res.writeHead(200, { "content-type": "text/html" }); return res.end(d); }
    catch { res.writeHead(200, { "content-type": "text/html" }); return res.end(await readFile(join(WEB, "index.html"))); } }
}).listen(PORT, () => console.log(JSON.stringify({ ready: PORT, key })));
