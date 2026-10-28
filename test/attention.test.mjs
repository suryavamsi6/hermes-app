import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/attention-entry.ts --bundle --platform=node --format=esm --outfile=/tmp/hm-test/attention.js --log-level=error");
const m = await import("/tmp/hm-test/attention.js");

const turn = (id, extra = {}) => ({ id, role: "assistant", text: "", steps: [], status: "streaming", ...extra });
const chat = (turns, extra = {}) => ({ busy: false, loaded: true, turns, ...extra });

test("empty and loading chats still produce one truthful device-time item", () => {
  const empty = m.selectAttentionItems({}, new Date(2026, 9, 25, 13, 4).getTime(), { locale: "en-US" });
  assert.deepEqual(empty.items.map((x) => x.kind), ["time"]);
  assert.equal(empty.items[0].metric, "1:04 PM");
  assert.equal(empty.loading, false);
  const loading = m.selectAttentionItems({ bot: chat([], { loaded: false }) }, 0);
  assert.equal(loading.loading, true);
  assert.deepEqual(loading.counts, { approval: 0, running: 0, failed: 0, time: 1 });
});

test("approvals precede running and failures, stale approvals and split runs are excluded", () => {
  const a = turn("old", { status: "completed", approval: { title: "stale", requestId: "r", generation: 1 } });
  const b = turn("approval", { approval: { title: "stale approval", requestId: "r2", generation: 0 } });
  const c = turn("note", { note: true, status: "streaming" });
  const d = turn("open", { startedAt: 1000, steps: [{ id: "s", tool: "shell", status: "failed" }] });
  const e = turn("duplicate-open");
  const currentApproval = turn("current-approval", { approval: { title: "Confirm", detail: "Run task", requestId: "r3", generation: 0 } });
  const got = m.selectAttentionItems({ z: chat([a, b, c, d, e], { busy: true }), a: chat([currentApproval]) }, 61000);
  assert.deepEqual(got.items.map((x) => x.key), ["approval:a:current-approval", "running:z:duplicate-open", "time:device"]);
  assert.equal(got.items[0].title, "Confirm");
  assert.equal(got.items[0].detail, "Run task");
  assert.equal(got.items[1].metric, "Running");
});

test("multiple bots have deterministic order and real chat/steps destinations", () => {
  const approval = (id) => turn(id, { approval: { title: id, requestId: id, generation: 0 } });
  const failed = turn("f", { status: "failed", steps: [{ id: "step/1", tool: "terminal", status: "failed" }] });
  const got = m.selectAttentionItems({ z: chat([approval("z")]), a: chat([approval("a"), failed]) }, 1000);
  assert.deepEqual(got.items.map((x) => x.key), ["approval:a:a", "approval:z:z", "failed:a:f", "time:device"]);
  assert.equal(got.items[0].destination.path, "/bot/a");
  assert.equal(got.items[2].destination.path, "/steps/a/f");
  assert.deepEqual(got.items[2].steps, failed.steps);
  assert.deepEqual(got.counts, { approval: 2, running: 0, failed: 1, time: 1 });
});

test("failure selection requires failed status and actual failed steps", () => {
  const got = m.selectAttentionItems({ b: chat([
    turn("done", { status: "completed", steps: [{ id: "1", tool: "x", status: "failed" }] }),
    turn("none", { status: "failed", steps: [{ id: "2", tool: "y", status: "completed" }] }),
    turn("real", { status: "failed", steps: [{ id: "3", tool: "y", status: "failed" }, { id: "4", tool: "z", status: "failed" }] }),
  ]) }, 1000);
  assert.equal(got.items.find((x) => x.kind === "failed").metric, "2");
  assert.equal(got.counts.failed, 2);
});

test("elapsed metrics use only known starts and clamp clock skew", () => {
  assert.equal(m.formatElapsed(undefined, 90000), "Running");
  assert.equal(m.formatElapsed(100000, 90000), "0s");
  assert.equal(m.formatElapsed(0, 59000), "59s");
  assert.equal(m.formatElapsed(0, 60000), "1m");
  assert.equal(m.formatElapsed(0, 3660000), "1h 1m");
});

test("split streaming turns retain one trustworthy run start", () => {
  const initial = { ...m.initialTurn("a"), text: "already started", startedAt: 1234, prompt: "question" };
  const one = m.applyStream([initial], "a", [{ type: "interim", text: "Progress update", alreadyStreamed: false }], () => "b", 9999);
  assert.equal(one[0].startedAt, 1234);
  assert.equal(one[1].startedAt, 1234);
  assert.equal(one[2].startedAt, 1234);
  const two = m.applyStream([initial], "a", [{ type: "delta", text: " more" }, { type: "tool", phase: "started", tool: "shell" }], () => "c", 10000);
  assert.equal(two[1].startedAt, 1234);
});

test("selection reconciliation preserves keys and picks the nearest remaining neighbor", () => {
  const old = ["a", "b", "c"].map((key) => ({ key }));
  const next = ["a", "c"].map((key) => ({ key }));
  assert.equal(m.reconcileAttentionKey("c", old, next), "c");
  assert.equal(m.reconcileAttentionKey("b", old, next), "c");
  assert.equal(m.reconcileAttentionKey("missing", old, next), "a");
  assert.equal(m.reconcileAttentionKey("a", old, []), undefined);
});
