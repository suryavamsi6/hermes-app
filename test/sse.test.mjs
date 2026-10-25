import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 src/sse.ts src/chat-model.ts --format=esm --outdir=/tmp/hm-test --log-level=error");
const { SseParser } = await import("/tmp/hm-test/sse.js");
const { reduce, initialTurn, toAction } = await import("/tmp/hm-test/chat-model.js");

test("sse parser handles keepalive, split chunks, CRLF", () => {
  const p = new SseParser();
  const ev = [...p.push(': keepalive\n\nevent: assistant.delta\ndata: {"delta":"Hel'), ...p.push('lo"}\n\nevent: run.completed\r\ndata: {}\r\n\r\n')];
  assert.deepStrictEqual(ev.map((e) => e.event), ["assistant.delta", "run.completed"]);
  assert.strictEqual(JSON.parse(ev[0].data).delta, "Hello");
});

test("turn reducer collects text, steps and approval", () => {
  let t = initialTurn("a1");
  for (const a of toAction("tool.started", '{"tool":"terminal","preview":"ls","run_id":"r1"}')) t = reduce(t, a);
  t = reduce(t, { type: "approval", approval: { requestId: "p1", generation: 2, title: "terminal" } });
  assert.strictEqual(t.approval?.runId, "r1");
  for (const a of toAction("tool.completed", '{"tool":"terminal","preview":"README.md"}')) t = reduce(t, a);
  t = reduce(t, { type: "delta", text: "Done" });
  for (const a of toAction("run.completed", "{}")) t = reduce(t, a);
  assert.strictEqual(t.text, "Done");
  assert.strictEqual(t.steps.length, 1);
  assert.strictEqual(t.steps[0].status, "completed");
  assert.strictEqual(t.status, "completed");
  assert.strictEqual(t.approval, undefined);
});

test("server event shapes: tool_name, assistant.completed, error, run.queued (hermes-agent api_server.py)", () => {
  let t = initialTurn("a2");
  for (const [ev, data] of [
    ["run.started", '{"run_id":"run_1","seq":1}'],
    ["tool.started", '{"tool_name":"terminal","preview":"ls","run_id":"run_1"}'],
    ["tool.completed", '{"tool_name":"terminal","preview":"ok","run_id":"run_1"}'],
    ["assistant.delta", '{"delta":"Hel","run_id":"run_1"}'],
    ["assistant.completed", '{"content":"Hello there","run_id":"run_1"}'],
    ["run.completed", '{"completed":true,"run_id":"run_1"}'],
  ]) for (const a of toAction(ev, data)) t = reduce(t, a);
  assert.strictEqual(t.steps[0].tool, "terminal");
  assert.strictEqual(t.steps[0].status, "completed");
  assert.strictEqual(t.text, "Hello there", "final content wins (the only text on the Bot Chat path)");
  assert.strictEqual(t.status, "completed");

  let e = initialTurn("a3");
  for (const [ev, data] of [["error", '{"message":"Bot Chat admission refused: bot_chat_not_local","code":"bot_chat_not_local"}'], ["done", "{}"], ["run.failed", "{}"]])
    for (const a of toAction(ev, data)) e = reduce(e, a);
  assert.strictEqual(e.status, "failed");
  assert.strictEqual(e.errorCode, "bot_chat_not_local");

  let q = initialTurn("a4");
  for (const a of toAction("run.queued", '{"status":"queued","delivery_id":"d1"}')) q = reduce(q, a);
  assert.strictEqual(q.status, "queued");
});
