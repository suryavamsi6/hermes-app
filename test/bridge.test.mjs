// LiveBackend + hermes-bridge, end to end: the app's real LiveBackend talks to the real hermes-bridge
// package (../hermes-bridge) running in front of its fake Hermes dashboard, through a "/bridge" mount
// that strips the prefix like Tailscale Funnel. Chat calls go to a small fake Hermes API server that,
// like the real one, reads each profile's API_SERVER_KEY from that profile's .env on every request
// (here: the key the bridge just wrote). Checks key separation on every request.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";

const SRC = process.env.HERMES_BRIDGE_SRC ?? new URL("../../hermes-bridge", import.meta.url).pathname;
const skip = !existsSync(`${SRC}/src/hermes_bridge/app.py`) && "hermes-bridge source not found next to the app";
execSync("npx -y esbuild@0.24.0 src/live-backend.ts --bundle --platform=node --format=esm --alias:expo/fetch=./test/fetch-shim.mjs --alias:react-native=./test/rn-shim.mjs --alias:expo-secure-store=./test/rn-shim.mjs --outfile=node_modules/.cache/hm-live/live-bridge.js --log-level=error");
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { LiveBackend } = await import("../node_modules/.cache/hm-live/live-bridge.js");

const BASE = "https://homelab.tail0000.ts.net";
const MAIN = "main-key-0123456789";
const realFetch = globalThis.fetch;
let stack, bridgeUrl, bridgeKey, hasGateway, calls, hermesKeys, sessions;

before(async () => {
  if (skip) return;
  stack = spawn("python3", ["test/bridge_stack.py"], { env: { ...process.env, HERMES_BRIDGE_SRC: SRC }, stdio: ["pipe", "pipe", "inherit"] });
  const line = await new Promise((res) => createInterface({ input: stack.stdout }).once("line", res));
  ({ bridge: bridgeUrl, key: bridgeKey, gateway: hasGateway } = JSON.parse(line));
});
after(() => { stack?.stdin.end(); stack?.kill(); });

beforeEach(() => {
  mem.clear(); calls = []; sessions = {};
  hermesKeys = { default: MAIN };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method ?? "GET";
    const auth = init.headers?.Authorization;
    if (u.pathname.startsWith("/bridge/") && u.origin === BASE) {
      calls.push({ to: "bridge", method, path: u.pathname, auth });
      const res = await realFetch(bridgeUrl + u.pathname.slice("/bridge".length) + u.search, init);
      const text = await res.text();
      // The real API server reads the profile's .env per request: learn the keys the bridge writes.
      try { const j = JSON.parse(text); if (j?.api_key) hermesKeys[j.profile?.id ?? j.profile] = j.api_key; } catch {}
      return new Response(text, { status: res.status, headers: res.headers });
    }
    if (u.origin !== BASE) return realFetch(url, init); // e.g. the "wrong URL" test
    calls.push({ to: "hermes", method, path: u.pathname, auth });
    const m = u.pathname.match(/^\/p\/([^/]+)(\/.*)$/);
    const profile = m ? m[1] : "default"; const path = m ? m[2] : u.pathname;
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (!(profile in hermesKeys)) return json(404, { error: "Unknown or unconfigured profile" });
    if (auth !== `Bearer ${hermesKeys[profile]}`) return json(401, { error: { message: "Invalid gateway API key", code: "gateway_auth_failed" } });
    const rows = (sessions[profile] ??= []);
    if (path === "/api/sessions" && method === "GET") return json(200, { object: "list", data: rows.filter((s) => !u.searchParams.get("title") || s.title === u.searchParams.get("title")) });
    if (path === "/api/sessions" && method === "POST") { const s = { id: `s${rows.length + 1}`, title: JSON.parse(init.body || "{}").title }; rows.push(s); return json(201, { session: s }); }
    return json(404, { error: "no route " + path });
  };
});

const cfg = (extra = {}) => ({ baseUrl: BASE, apiKey: MAIN, cfClientId: "", cfClientSecret: "", bridgeKey, ...extra });
const keysSeparate = () => {
  for (const c of calls) {
    if (c.to === "bridge") assert.strictEqual(c.auth, `Bearer ${bridgeKey}`, `bridge call ${c.path} must carry only the bridge key`);
    else assert.notStrictEqual(c.auth, `Bearer ${bridgeKey}`, `Hermes call ${c.path} must never carry the bridge key`);
  }
};

test("Home lists every server profile; ones without a key on the phone need setup", { skip }, async () => {
  const be = new LiveBackend(cfg());
  const bots = await be.listBots();
  assert.deepStrictEqual(bots.map((b) => [b.profile, Boolean(b.needsKey)]), [["default", false], ["scout", true]]);
  assert.strictEqual(bots[0].name, "Hermes");
  assert.strictEqual(bots[1].name, "Scout");
  assert.strictEqual(be.notice(), null);
  assert.ok(be.supports("mcp") && be.supports("createBot") && !be.supports("deleteBot"));
  await assert.rejects(be.listSessions(bots[1]), /Set up chat/);
  keysSeparate();
});

test("Add bot creates a real profile, keeps its new key, and chat uses it right away", { skip }, async () => {
  const be = new LiveBackend(cfg());
  const bot = await be.createBot({ name: "Chef Bot", emoji: "🍳", color: "#123", description: "Meal plans", persona: "Cheerful sous-chef", toolsets: ["web"] });
  assert.strictEqual(bot.profile, "chef-bot");
  assert.match(bot.apiKey, /^[0-9a-f]{64}$/);
  const listed = (await be.listBots()).find((b) => b.profile === "chef-bot");
  assert.ok(listed && !listed.needsKey && listed.apiKey === bot.apiKey && listed.name === "Chef Bot" && listed.emoji === "🍳");
  const sid = await be.botChatSession(listed);
  assert.ok(sid);
  assert.ok(calls.some((c) => c.to === "hermes" && c.path.startsWith("/p/chef-bot/") && c.auth === `Bearer ${bot.apiKey}`));
  await assert.rejects(be.createBot({ name: "Chef Bot", emoji: "x", color: "#000", description: "", toolsets: [] }), /already exists/);
  await assert.rejects(be.createBot({ name: "???", emoji: "x", color: "#000", description: "", toolsets: [] }), /letters or digits/);
  keysSeparate();
});

test("Set up chat gives an existing profile a key on this phone", { skip }, async () => {
  const be = new LiveBackend(cfg());
  const scout = (await be.listBots()).find((b) => b.profile === "scout");
  const ready = await be.setupChat(scout);
  assert.match(ready.apiKey, /^[0-9a-f]{64}$/);
  assert.strictEqual((await be.listBots()).find((b) => b.profile === "scout").needsKey, false);
  await be.listSessions(ready); // accepted by Hermes with the new key
  await assert.rejects(be.setupChat((await be.listBots())[0]), /main API_SERVER_KEY/); // default is server-managed
  keysSeparate();
});

test("Plugins come with their tools; toggles only where Hermes allows, else the CLI command", { skip }, async () => {
  const be = new LiveBackend(cfg());
  const [hermes, scout] = await be.listBots();
  const [p] = await be.listPlugins(hermes);
  assert.deepStrictEqual([p.name, p.enabled, p.tools, p.toggleHint], ["web-tools", true, ["fetch", "search"], undefined]);
  const [q] = await be.listPlugins(scout);
  assert.strictEqual(q.toggleHint, "hermes -p scout plugins disable web-tools");
  await assert.rejects(be.setPluginEnabled(scout, "web-tools", false), /hermes -p scout plugins disable web-tools/);
  await be.setPluginEnabled(hermes, "web-tools", false);
  assert.strictEqual((await be.listPlugins(hermes))[0].enabled, false);
  keysSeparate();
});

test("Routines, MCP, skills, toolsets and memory go through the bridge", { skip }, async () => {
  const be = new LiveBackend(cfg());
  const [hermes, scout] = await be.listBots();
  const [job] = await be.listJobs(hermes);
  assert.deepStrictEqual([job.id, job.name, job.schedule, job.paused], ["j1", "Morning brief", "0 8 * * *", false]);
  await be.setJobPaused(hermes, "j1", true);
  await be.runJob(hermes, "j1");
  assert.ok(calls.some((c) => c.to === "bridge" && c.method === "POST" && c.path === "/bridge/v1/profiles/default/jobs/j1/pause"));
  assert.ok(calls.some((c) => c.to === "bridge" && c.path === "/bridge/v1/profiles/default/jobs/j1/trigger"));
  assert.deepStrictEqual(await be.listJobs(scout), []); // works without a chat key

  const [gh] = await be.listMcp(hermes);
  assert.deepStrictEqual([gh.name, gh.enabled, gh.hasAuth], ["github", true, true]);
  await be.addMcp(scout, { name: "hub", url: "https://mcp.example/mcp", authHeader: "Bearer tok-secret-123" });
  const hub = (await be.listMcp(scout)).find((s) => s.name === "hub");
  assert.ok(hub && hub.hasAuth && hub.url === "https://mcp.example/mcp");
  await be.setMcpEnabled(scout, "hub", false);
  await be.removeMcp(scout, "hub");
  assert.deepStrictEqual(await be.listMcp(scout), []);
  await be.restartGateway();

  assert.deepStrictEqual((await be.listSkills(hermes)).map((s) => [s.name, s.enabled]), [["web", true]]);
  await be.setSkill(hermes, "web", false);
  assert.strictEqual((await be.listToolsets(hermes))[0].name, "web-tools");
  const memo = await be.getMemoryStatus(hermes);
  assert.deepStrictEqual([memo.active, memo.files], ["", { memory: 10, user: 5 }]); // "" = built-in only
  keysSeparate();
  assert.ok(!calls.some((c) => c.to === "bridge" && /\/(env|files|pty|reveal)/.test(c.path)));
});

test("Bridge problems fall back to the phone's roster with a notice", { skip }, async () => {
  const wrong = new LiveBackend(cfg({ bridgeKey: "not-the-key-0000000000" }));
  assert.deepStrictEqual((await wrong.listBots()).map((b) => b.profile), ["default"]);
  assert.match(wrong.notice(), /refused the bridge key/);
  const down = new LiveBackend(cfg({ bridgeUrl: "http://127.0.0.1:9" }));
  assert.deepStrictEqual((await down.listBots()).map((b) => b.profile), ["default"]);
  assert.match(down.notice(), /Can't reach hermes-bridge/);
});

test("Without a bridge key: no bridge calls, manual add only", { skip }, async () => {
  const be = new LiveBackend(cfg({ bridgeKey: "" }));
  assert.deepStrictEqual((await be.listBots()).map((b) => b.profile), ["default"]);
  assert.ok(!be.supports("createBot") && !be.supports("mcp"));
  await assert.rejects(be.createBot({ name: "x", emoji: "x", color: "#000", description: "", toolsets: [] }), /hermes-bridge/);
  await assert.rejects(be.listMcp({ profile: "default" }), /hermes-bridge/);
  assert.strictEqual(calls.filter((c) => c.to === "bridge").length, 0);
});

// v0.11.6: slash commands run by Hermes's own handlers, through the real bridge and its fake gateway.
test("slash commands: Hermes's handler answers through the bridge; your server's commands join the picker", { skip: skip || false }, async (t) => {
  if (!hasGateway) return t.skip("this hermes-bridge has no gateway support (0.4+)");
  const live = new LiveBackend(cfg());
  const bot = { id: "default", profile: "default", name: "Hermes" };
  assert.deepStrictEqual(await live.runCommand(bot, "local-0123456789abcdef", "/title Trip plans", false), { type: "exec", output: "ran /title Trip plans" });
  assert.deepStrictEqual(await live.runCommand(bot, "local-0123456789abcdef", "/plan ship it", true), { type: "send", message: "[/plan] plan it: ship it" });
  await assert.rejects(live.runCommand(bot, "api_1_abc", "/yolo", false), (e) => e.failure?.kind === "not_owned");
  assert.deepStrictEqual((await live.serverCommands(bot)).map((c) => c.name), ["deploy", "weather"]);
  const bridgeCalls = calls.filter((c) => c.to === "bridge");
  assert.ok(bridgeCalls.every((c) => c.auth === `Bearer ${bridgeKey}`), "bridge key only");
  assert.ok(calls.filter((c) => c.to === "hermes").every((c) => c.auth !== `Bearer ${bridgeKey}`), "never to Hermes");
});
