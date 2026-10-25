// LiveBackend against a fake Hermes that follows hermes-agent gateway/platforms/api_server.py:
// unique session titles (400 code=invalid_title), exact ?title= lookup incl. hidden rows,
// 201 {object:"hermes.session", session:{...}}, /p/<profile>/ -> 404 before auth when not served,
// and each profile accepting only its own API_SERVER_KEY.
import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 src/live-backend.ts --bundle --platform=node --format=esm --alias:expo/fetch=./test/fetch-shim.mjs --alias:react-native=./test/rn-shim.mjs --alias:expo-secure-store=./test/rn-shim.mjs --outfile=node_modules/.cache/hm-live/live.js --log-level=error");
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { LiveBackend } = await import("../node_modules/.cache/hm-live/live.js");

const KEYS = { default: "main-key-0123456789", jobwing: "jobwing-key-0123456789" };
let sessions, calls;
function fakeHermes() {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method ?? "GET";
    calls.push(`${method} ${u.pathname}${u.search}`);
    const m = u.pathname.match(/^\/p\/([^/]+)(\/.*)$/);
    const profile = m ? m[1] : "default"; const path = m ? m[2] : u.pathname;
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (!(profile in KEYS)) return json(404, { error: "Unknown or unconfigured profile" });
    if (init.headers?.Authorization !== `Bearer ${KEYS[profile]}`)
      return json(401, { error: { message: "Invalid gateway API key (API_SERVER_KEY)", type: "gateway_auth_error", code: "gateway_auth_failed" } });
    const rows = (sessions[profile] ??= []);
    if (path === "/api/sessions" && method === "GET") {
      const t = u.searchParams.get("title");
      const hidden = u.searchParams.get("include_hidden") === "true";
      const data = t ? rows.filter((s) => s.title === t && (hidden || !s.hidden)) : rows.filter((s) => !s.hidden).slice(0, 50);
      return json(200, { object: "list", data, limit: 50, offset: 0, has_more: false });
    }
    if (path === "/api/sessions" && method === "POST") {
      const { title } = JSON.parse(init.body || "{}");
      const owner = title != null && rows.find((s) => s.title === title);
      if (owner) return json(400, { error: { message: `Title '${title}' is already in use by session ${owner.id}`, type: "invalid_request_error", code: "invalid_title" } });
      const s = { id: `api_${rows.length + 1}`, title: title ?? null, source: "api_server" };
      rows.push(s);
      return json(201, { object: "hermes.session", session: s });
    }
    const g = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (g && method === "GET") {
      const s = rows.find((x) => x.id === decodeURIComponent(g[1]));
      return s ? json(200, { object: "hermes.session", session: s }) : json(404, { error: { message: "Session not found", code: "session_not_found" } });
    }
    if (path === "/v1/capabilities") return json(200, { object: "hermes.api_server.capabilities" });
    return json(404, { error: "no route " + path });
  };
}
const cfg = { baseUrl: "https://homelab.tail0000.ts.net", apiKey: KEYS.default, cfClientId: "", cfClientSecret: "" };
const hermes = { id: "default", profile: "default", name: "Hermes" };
beforeEach(() => { mem.clear(); calls = []; fakeHermes(); });

test("bug 1: reuses the existing (old, non-api_server, hidden) Bot Chat instead of creating a duplicate", async () => {
  sessions = { default: [
    ...Array.from({ length: 60 }, (_, i) => ({ id: `recent_${i}`, title: `Chat ${i}`, source: "api_server" })),
    { id: "20261015_153446_b94ccc", title: "Bot Chat", source: "desktop", hidden: true },
  ] };
  const be = new LiveBackend(cfg);
  assert.strictEqual(await be.botChatSession(hermes), "20261015_153446_b94ccc");
  assert.ok(!calls.some((c) => c.startsWith("POST")), "must not POST a second 'Bot Chat'");
  assert.strictEqual(mem.get("hermes.botchat.default"), "20261015_153446_b94ccc", "persisted per profile");
  calls = [];
  assert.strictEqual(await be.botChatSession(hermes), "20261015_153446_b94ccc");
  assert.ok(calls.every((c) => !c.includes("title=")), "second call uses the stored id");
});

test("no Bot Chat yet: creates one titled 'Bot Chat'", async () => {
  sessions = { default: [] };
  assert.strictEqual(await new LiveBackend(cfg).botChatSession(hermes), "api_1");
  assert.strictEqual(sessions.default[0].title, "Bot Chat");
});

test("title taken by a row the lookup can't see -> falls back to (and reuses) its own phone session", async () => {
  sessions = { default: [] };
  const origFetch = () => globalThis.fetch;
  fakeHermes(); const inner = origFetch();
  // the lookup finds nothing (e.g. archived), but the title is still taken
  globalThis.fetch = async (url, init = {}) => (String(url).includes("title=Bot%20Chat")
    ? new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 }) : inner(url, init));
  sessions.default.push({ id: "archived_bc", title: "Bot Chat" }, { id: "x", title: "Hermes · Hermes Mobile", hidden: false });
  const id = await new LiveBackend(cfg).botChatSession(hermes);
  assert.strictEqual(id, "x", "reuses its own earlier phone session by exact title");
});

test("Bot Chat refused phone turns -> abandonBotChat switches to a phone session and remembers it", async () => {
  sessions = { default: [{ id: "bc", title: "Bot Chat" }] };
  const be = new LiveBackend(cfg);
  assert.strictEqual(await be.botChatSession(hermes), "bc");
  await be.abandonBotChat(hermes);
  const id = await be.botChatSession(hermes);
  assert.notStrictEqual(id, "bc");
  assert.strictEqual(sessions.default.find((s) => s.id === id).title, "Hermes · Hermes Mobile");
  assert.strictEqual(await be.botChatSession(hermes), id);
});

test("stored session deleted on the server -> resolves again", async () => {
  sessions = { default: [{ id: "bc", title: "Bot Chat" }] };
  mem.set("hermes.botchat.default", "gone");
  assert.strictEqual(await new LiveBackend(cfg).botChatSession(hermes), "bc");
});

test("bug 2: profiles route through /p/<profile>/ with their own key; checkProfile explains failures", async () => {
  sessions = { jobwing: [{ id: "jw", title: "Bot Chat" }] };
  const be = new LiveBackend(cfg);
  await be.checkProfile("jobwing", KEYS.jobwing);
  await assert.rejects(be.checkProfile("jobwing", KEYS.default), /isn't jobwing's key/);
  await assert.rejects(be.checkProfile("ledger", "whatever"), /isn't serving a profile named "ledger"/);
  const jw = await be.addExistingBot({ id: "jobwing", profile: "jobwing", name: "JobWing", emoji: "", color: "#000", description: "", apiKey: KEYS.jobwing });
  calls = [];
  assert.strictEqual(await be.botChatSession(jw), "jw");
  assert.ok(calls.every((c) => c.includes(" /p/jobwing/")), calls.join("\n"));
  assert.deepStrictEqual((await be.listBots()).map((b) => b.profile), ["default", "jobwing"]);
});
