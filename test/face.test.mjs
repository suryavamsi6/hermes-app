// v0.11.0: bot face expressions come only from real chat state, and Reduce Motion / hidden surfaces
// stop all ambient motion while the static pose still shows the state.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/face-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/face-state.js --log-level=error");
const m = await import("/tmp/hm-test/face-state.js");

const user = { id: "u1", role: "user", text: "hi" };
const reply = (o = {}) => ({ id: "a1", role: "assistant", text: "", steps: [], status: "streaming", ...o });
const chat = (turns, o = {}) => ({ busy: false, turns, ...o });

test("face mood: idle with nothing going on, listening only when asked to and nothing else is happening", () => {
  assert.strictEqual(m.faceMood(undefined), "idle");
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "completed", text: "ok" })])), "idle");
  assert.strictEqual(m.faceMood(chat([]), { listening: true }), "listening");
  assert.strictEqual(m.faceMood(chat([user, reply()], { busy: true }), { listening: true }), "thinking", "a live run outranks listening");
});

test("face mood: thinking until something comes back, then working (tool running or reply streaming)", () => {
  assert.strictEqual(m.faceMood(chat([user, reply()], { busy: true })), "thinking");
  assert.strictEqual(m.faceMood(chat([user, reply({ steps: [{ id: "0", tool: "terminal", status: "running" }] })], { busy: true })), "working");
  assert.strictEqual(m.faceMood(chat([user, reply({ steps: [{ id: "0", tool: "terminal", status: "completed" }] })], { busy: true })), "thinking", "between tools: preparing, not working");
  assert.strictEqual(m.faceMood(chat([user, reply({ text: "Here's" })], { busy: true })), "working");
  // busy but the newest assistant turn is an old finished one (new turn not created yet): thinking, never "working"
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "completed", text: "old" }), user], { busy: true })), "thinking");
});

test("face mood: waiting only while a live run actually holds an approval (or is queued)", () => {
  const approval = { requestId: "r", generation: 1, title: "Run a terminal command" };
  assert.strictEqual(m.faceMood(chat([user, reply({ approval })], { busy: true })), "waiting");
  // the run ended (done clears approval, but even a stale one on a finished turn must not show "waiting")
  assert.strictEqual(m.faceMood(chat([user, reply({ approval, status: "completed", text: "done" })])), "idle");
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "queued" })])), "waiting");
});

test("face mood: success only from the short happy flag, error only from a real failure", () => {
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "completed", text: "ok" })]), { happy: true }), "success");
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "failed", error: "boom" })])), "error");
  assert.strictEqual(m.faceMood(chat([], { error: "couldn't load" })), "error");
  assert.strictEqual(m.faceMood(chat([user, reply({ status: "cancelled" })])), "idle", "stopping a reply is not an error");
  assert.strictEqual(m.faceMood(chat([user, reply()], { busy: true }), { happy: true }), "thinking", "never celebrate while still running");
});

test("face mood priority: approval and queued first, then busy, success, error, listening and idle", () => {
  const approval = { requestId: "r", generation: 1, title: "Run" };
  assert.strictEqual(m.faceMood(chat([reply({ approval })], { busy: true }), { happy: true, listening: true }), "waiting");
  assert.strictEqual(m.faceMood(chat([reply({ status: "queued" })], { busy: true }), { happy: true }), "waiting");
  assert.strictEqual(m.faceMood(chat([reply()], { busy: true }), { happy: true, listening: true }), "thinking");
  assert.strictEqual(m.faceMood(chat([reply({ text: "draft" })], { busy: true })), "working");
  assert.strictEqual(m.faceMood(chat([reply({ status: "completed" })]), { happy: true, listening: true }), "success");
  assert.strictEqual(m.faceMood(chat([reply({ status: "failed" })]), { listening: true }), "error");
  assert.strictEqual(m.faceMood(chat([]), { listening: true }), "listening");
  assert.strictEqual(m.faceMood(chat([])), "idle");
});

test("turn mood (status-line face) and words for every mood", () => {
  assert.strictEqual(m.turnMood(reply()), "thinking");
  assert.strictEqual(m.turnMood(reply({ steps: [{ id: "0", tool: "web_search", status: "running" }] })), "working");
  assert.strictEqual(m.turnMood(reply({ approval: { requestId: "r", generation: 1, title: "x" } })), "waiting");
  assert.strictEqual(m.turnMood(reply({ status: "failed" })), "error");
  assert.strictEqual(m.moodLabel("idle"), null);
  for (const mood of m.FACE_MOODS.filter((x) => x !== "idle")) assert.ok(m.moodLabel(mood), `${mood} has a label (state not shown by motion alone)`);
  assert.strictEqual(m.moodLabel("waiting"), "needs your OK");
  assert.strictEqual(m.moodLabel("waiting", { approval: false }), "waiting…");
  assert.strictEqual(m.moodLabel("working", { reconnecting: true }), "reconnecting…");
  assert.strictEqual(m.moodLabel("error"), "needs attention");
});

test("reduced motion: no loops, blinks, glances, breathing, celebration or tap reaction for any mood", () => {
  for (const mood of m.FACE_MOODS) {
    const f = m.faceMotion(mood, { reduced: true, active: true });
    assert.deepStrictEqual(f, { blink: false, glance: false, breathe: false, loop: "none", celebrate: false }, mood);
  }
  assert.deepStrictEqual(m.motionPolicy({ reduced: true }), { transitions: false, ambient: false, flourish: false });
  assert.strictEqual(m.dur(200, m.motionPolicy({ reduced: true })), 0, "transitions become instant");
  assert.strictEqual(m.dur(200, m.motionPolicy({ reduced: false })), 200);
});

test("reduced motion still shows the state: every non-idle mood has a distinct static pose", () => {
  const key = (p) => JSON.stringify(p);
  const seen = new Set(m.FACE_MOODS.map((x) => key(m.POSE[x])));
  assert.strictEqual(seen.size, m.FACE_MOODS.length, "poses are all different");
  assert.strictEqual(m.POSE.success.joy, 1);
  assert.strictEqual(m.POSE.error.worry, 1);
});

test("hidden surface (backgrounded / covered / animate off): nothing ambient runs", () => {
  for (const mood of m.FACE_MOODS) {
    const f = m.faceMotion(mood, { reduced: false, active: false });
    assert.ok(!f.blink && !f.glance && !f.breathe && f.loop === "none" && !f.celebrate, mood);
  }
  assert.deepStrictEqual(m.motionPolicy({ reduced: false, active: false }), { transitions: true, ambient: false, flourish: false });
});

test("visible motion per mood: idle lives a little; each busy mood has its own loop; success hops once", () => {
  const on = (x) => m.faceMotion(x, { reduced: false, active: true });
  assert.ok(on("idle").blink && on("idle").glance && on("idle").breathe);
  assert.strictEqual(on("thinking").loop, "drift");
  assert.strictEqual(on("working").loop, "nod");
  assert.strictEqual(on("waiting").loop, "check");
  assert.ok(on("success").celebrate && !on("success").blink);
  assert.ok(!on("listening").glance, "listening keeps its eyes on you");
});

test("layer geometry scales shallow depth for 32, 52 and hero faces", () => {
  const small = m.faceLayerGeometry(32), row = m.faceLayerGeometry(52), hero = m.faceLayerGeometry(128);
  assert.ok(small.depth < row.depth && row.depth < hero.depth);
  assert.ok(small.depth <= 2.5, "small chat avatars keep a restrained rim");
  assert.strictEqual(hero.depth, 5, "hero depth is capped");
  for (const g of [small, row, hero]) {
    assert.strictEqual(g.faceY, 0);
    assert.strictEqual(g.backY, g.depth);
    assert.strictEqual(g.shadowY, g.depth * 1.65);
    assert.ok(g.eyeY < 0 && Math.abs(g.eyeY) < g.depth);
  }
});

test("idle rhythm: deterministic per bot, uneven, within calm bounds, and different between bots", () => {
  const a = m.rhythm("atlas"), b = m.rhythm("forge"), c = m.rhythm("nova");
  assert.deepStrictEqual(m.rhythm("atlas"), a);
  for (const r of [a, b, c]) {
    for (const g of r.blinks) assert.ok(g >= 2000 && g <= 7000, `blink gap ${g}`);
    assert.ok(new Set(r.blinks).size > 1, "blink gaps are uneven");
    assert.ok(r.breath >= 3000 && r.breath <= 5000);
    for (const gl of r.glances) assert.ok(Math.abs(gl.x) <= 1 && Math.abs(gl.y) <= 1 && gl.wait >= 3000);
  }
  assert.notDeepStrictEqual(a.blinks, b.blinks);
  assert.notDeepStrictEqual(b.blinks, c.blinks);
  assert.notStrictEqual(m.rhythm("atlas", undefined, 0.1).start, m.rhythm("atlas", undefined, 0.7).start, "per-mount phase desyncs identical bots");
});
