// The steps pill must survive leaving the chat. syncChat rebuilds turns from history, and history
// keeps tool_calls on the assistant row. A rebuild that drops them hides the pill.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/steps-pill-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/steps-pill.js --log-level=error");
const m = await import("/tmp/hm-test/steps-pill.js");

const history = { data: [
  { role: "user", content: "check the repo", timestamp: 1761400000 },
  { role: "assistant", content: "Done.", timestamp: 1761400002, tool_calls: [
    { id: "c1", function: { name: "terminal", arguments: '{"command":"git status"}' } },
    { id: "c2", function: { name: "web_search", arguments: '{"query":"hermes"}' } },
  ] },
  { role: "tool", tool_call_id: "c1", tool_name: "terminal", content: "clean" },
  { role: "tool", tool_call_id: "c2", tool_name: "web_search", content: '{"error":"boom"}' },
] };

test("leaving the chat and coming back keeps the steps pill", () => {
  const rows = m.parseMessages(history);
  const lists = m.stepsFromHistory(history);
  assert.equal(rows.length, 2);
  assert.equal(lists.length, 2);
  const steps = lists[1];
  assert.deepEqual(steps.map((s) => [s.tool, s.status, s.preview]), [
    ["terminal", "completed", "git status"],
    ["web_search", "failed", "hermes"],
  ]);
  const shown = [
    { id: "u1", role: "user", text: "check the repo" },
    { id: "a1", role: "assistant", text: "Done.", steps: steps, status: "completed" },
  ];
  const rebuilt = rows.map((row, i) => row.role === "assistant"
    ? { ...shown[i], text: row.text, steps: m.withKeptSteps(shown, row).steps }
    : { id: `u${i}`, role: "user", text: row.text });
  assert.equal(rebuilt[1].steps.length, 2);
  assert.equal(rebuilt[1].steps[0].tool, "terminal");
});

test("a reply with no tool calls still has no pill", () => {
  const raw = { data: [
    { role: "user", content: "hi", timestamp: 1 },
    { role: "assistant", content: "hello", timestamp: 2 },
  ] };
  assert.deepEqual(m.stepsFromHistory(raw), [[], []]);
  const kept = m.withKeptSteps([{ id: "a", role: "assistant", text: "hello", steps: [], status: "completed" }], { role: "assistant", text: "hello" });
  assert.deepEqual(kept.steps, []);
});
