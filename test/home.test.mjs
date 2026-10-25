// Home list helpers: compact relative times and message timestamps parsed from Hermes /messages.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/home-entry.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/hm-home/home.js --log-level=error");
const { relTime, parseMessages } = await import("../node_modules/.cache/hm-home/home.js");

test("relTime gives Grok-style compact times", () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();
  assert.equal(relTime(undefined, now), "");
  assert.equal(relTime(now - 20e3, now), "now");
  assert.equal(relTime(now - 5 * 60e3, now), "5m");
  assert.equal(relTime(now - 3 * 3600e3, now), "3h");
  assert.equal(relTime(new Date(2026, 9, 24, 23, 0).getTime(), now), "Yesterday");
  assert.equal(relTime(now + 60e3, now), "now"); // clock skew never shows negatives
  assert.notEqual(relTime(new Date(2026, 9, 21, 9, 0).getTime(), now), "");
});

test("parseMessages reads Hermes unix-second timestamps as ms and drops tool/empty rows", () => {
  const rows = parseMessages({ object: "list", data: [
    { role: "user", content: "hi", timestamp: 1761400000.5 },
    { role: "tool", content: "x", timestamp: 1761400001 },
    { role: "assistant", content: [{ type: "text", text: "hey" }], timestamp: "1761400002" },
    { role: "assistant", content: "", timestamp: 1 },
    { role: "assistant", content: "no time" },
  ] });
  assert.deepEqual(rows, [
    { role: "user", text: "hi", at: 1761400000500 },
    { role: "assistant", text: "hey", at: 1761400002000 },
    { role: "assistant", text: "no time", at: undefined },
  ]);
});
