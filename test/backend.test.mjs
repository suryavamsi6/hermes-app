import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 src/demo-backend.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/demo.js --log-level=error");
const { DemoBackend } = await import("/tmp/hm-test/demo.js");

test("demo roster has playful seeded bots with one Bot Chat each", async () => {
  const be = new DemoBackend();
  const bots = await be.listBots();
  assert.deepStrictEqual(bots.map((b) => b.name), ["Hermes", "Pi Ops", "Market"]);
  const sid = await be.botChatSession(bots[1]);
  const msgs = await be.chat(bots[1]).messages(sid);
  assert.ok(msgs.messages.length >= 2);
});

test("demo create bot, routines, MCP, plugins, memory all work offline", async () => {
  const be = new DemoBackend();
  const b = await be.createBot({ name: "Chef Bot", emoji: "🍵", color: "#000", description: "Plans meals", persona: "", toolsets: ["web"] });
  assert.strictEqual(b.id, "chef-bot");
  const sid = await be.botChatSession(b);
  assert.match((await be.chat(b).messages(sid)).messages[0].content, /Chef Bot/);
  const j = await be.createJob(b, { name: "Weekly plan", schedule: "0 10 * * 0", prompt: "Plan meals" });
  await be.setJobPaused(b, j.id, true);
  assert.strictEqual((await be.listJobs(b))[0].paused, true);
  await be.addMcp(b, { name: "notion", url: "https://x/mcp", authHeader: "Bearer t" });
  assert.strictEqual((await be.listMcp(b))[0].hasAuth, true);
  await be.installPlugin(b, "weather");
  assert.ok((await be.listPlugins(b)).find((p) => p.name === "weather").enabled);
  await be.setMemory(b, { memory: "likes dosa", user: "Alex" });
  assert.strictEqual((await be.getMemory(b)).memory, "likes dosa");
  assert.ok((await be.listToolsets(b)).find((t) => t.name === "web").enabled);
});

test("demo chat streams steps then text, and approvals resolve locally", async () => {
  const be = new DemoBackend();
  const [, piOps] = await be.listBots();
  const sid = await be.botChatSession(piOps);
  const actions = [];
  await new Promise((resolve) => {
    be.chat(piOps).streamTurn(sid, "delete old logs", (a) => {
      actions.push(a);
      if (a.type === "approval") be.chat(piOps).approve(a.approval.runId, a.approval.requestId, 1, "deny");
      if (a.type === "done") resolve();
    });
  });
  assert.ok(actions.some((a) => a.type === "approval"));
  assert.ok(actions.some((a) => a.type === "tool" && a.phase === "failed"));
  assert.match(actions.filter((a) => a.type === "delta").map((a) => a.text).join(""), /didn't delete/);
});

test("face personality is deterministic and differs between the seeded bots", async () => {
  execSync("npx -y esbuild@0.24.0 src/ui/face-personality.ts --format=esm --outfile=/tmp/hm-test/face.js --log-level=error");
  const { personality } = await import("/tmp/hm-test/face.js");
  assert.deepStrictEqual(personality("pi-ops"), personality("pi-ops"));
  const keys = ["hermes", "pi-ops", "market"].map((id) => JSON.stringify(personality(id)));
  assert.strictEqual(new Set(keys).size, 3);
  for (const id of ["hermes", "pi-ops", "market", "x"]) {
    const p = personality(id);
    assert.ok(p.blinkMin >= 1800 && p.blinkMax <= 6000 && p.blinkMin < p.blinkMax);
  }
});

test("appearance: every shape is a closed path that holds the face; contrast flips on light tiles", async () => {
  execSync("npx -y esbuild@0.24.0 src/appearance.ts --format=esm --outfile=/tmp/hm-test/appearance.js --log-level=error");
  const A = await import("/tmp/hm-test/appearance.js");
  assert.ok(A.SHAPES.length >= 6 && A.PALETTE.length >= 10);
  for (const sh of A.SHAPES) {
    const d = A.shapePath(sh);
    assert.match(d, /^M[\d.\s L-]+Z$/, sh);
    for (const [x, y] of A.shapePoints(sh)) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${sh} in box`);
    // eye centres, pupils' travel and mouth (as fractions of the tile, see bot-face.tsx) are inside the shape
    for (const [x, y] of [[50, 50], [33, 34], [67, 34], [36, 28], [64, 28], [40, 66], [60, 66], [50, 70]]) assert.ok(A.insideShape(sh, x, y), `${sh} holds ${x},${y}`);
  }
  assert.strictEqual(A.faceInk("#2a3f5c").fg, "#f7f7f7");
  assert.strictEqual(A.faceInk("#ffd66b").fg, "#121214");
  assert.strictEqual(A.faceInk("#8c7bff", "#1d2b4f").fg, "#f7f7f7");
  assert.strictEqual(A.faceInk("#7fe0b5").fg, "#121214");
});

test("appearance persists: demo store keeps it, live keeps it on the phone per profile", async () => {
  const be = new DemoBackend();
  const [hermes, piops, market] = await be.listBots();
  assert.strictEqual(new Set([hermes.shape, piops.shape, market.shape]).size, 3, "seeded bots get distinct shapes");
  await be.updateBot({ ...piops, shape: "ghost", color: "#7fe0b5", color2: undefined, eyes: "dot" });
  const again = (await be.listBots()).find((b) => b.id === "pi-ops");
  assert.deepStrictEqual([again.shape, again.color, again.eyes], ["ghost", "#7fe0b5", "dot"]);
  const b2 = await be.createBot({ name: "Cloudy", emoji: "🌿", color: "#8cc8ff", color2: "#1d6670", shape: "cloud", eyes: "tall", description: "", persona: "", toolsets: [] });
  assert.deepStrictEqual([b2.shape, b2.color2, b2.eyes], ["cloud", "#1d6670", "tall"]);

  const A = await import("/tmp/hm-test/appearance.js");
  const mem = new Map(); const kv = { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => void mem.set(k, v) };
  const bot = { id: "coder", profile: "coder", name: "Coder", emoji: "🐙", color: "#2a3f5c", description: "" };
  assert.deepStrictEqual(await A.withLook(kv, bot), bot, "no saved look = unchanged");
  await A.saveLook(kv, "coder", { ...bot, shape: "flower", color: "#ff7ab6", color2: "#4b3576", eyes: "wide" });
  assert.ok(mem.has("hermes.look.coder"));
  const loaded = await A.withLook(kv, bot);
  assert.deepStrictEqual([loaded.shape, loaded.color, loaded.color2, loaded.eyes, loaded.name], ["flower", "#ff7ab6", "#4b3576", "wide", "Coder"]);
});

test("selector store notifies only on change, and the high-refresh plugin patches MainActivity once", async () => {
  execSync("npx -y esbuild@0.24.0 src/store.ts --format=esm --outfile=node_modules/.cache/hm-test/store.mjs --log-level=error");
  const { createStore } = await import("../node_modules/.cache/hm-test/store.mjs");
  const s = createStore({ a: 1, b: { n: 0 } });
  let calls = 0; s.subscribe(() => calls++);
  s.set((x) => x); assert.strictEqual(calls, 0, "no-op update does not notify");
  const b = s.get().b; s.set((x) => ({ ...x, a: 2 }));
  assert.strictEqual(calls, 1); assert.strictEqual(s.get().b, b, "untouched slices keep identity, so selectors bail out");

  const { createRequire } = await import("node:module");
  const { patchMainActivity } = createRequire(import.meta.url)("../plugins/with-high-refresh-rate.js");
  const src = "class MainActivity : ReactActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(null)\n  }\n}\n";
  const once = patchMainActivity(src);
  assert.match(once, /super\.onCreate\(null\)\n    preferHighRefreshRate\(\)/);
  assert.match(once, /preferredDisplayModeId = best\.modeId/);
  assert.strictEqual(patchMainActivity(once), once, "idempotent across prebuilds");
});
