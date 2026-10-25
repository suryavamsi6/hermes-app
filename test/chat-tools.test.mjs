// Pure chat helpers (src/chat-tools.ts): run input, search, export, edit-and-resend, steering.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/chat-tools-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/chat-tools.js --log-level=error");
const m = await import("/tmp/hm-test/chat-tools.js");

const a = (over = {}) => ({ id: "a1", role: "assistant", text: "", steps: [], status: "streaming", ...over });

test("buildInput: plain text stays a string; photos become data-URL parts after the text", () => {
  assert.strictEqual(m.buildInput("hello"), "hello");
  assert.strictEqual(m.buildInput(""), "");
  const parts = m.buildInput("look", ["data:image/png;base64,AAA", "data:image/jpeg;base4,BBB"]);
  assert.deepStrictEqual(parts, [
    { type: "text", text: "look" },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    { type: "image_url", image_url: { url: "data:image/jpeg;base4,BBB" } },
  ]);
  assert.strictEqual(m.buildInput("", ["data:image/png;base64,AAA"]).length, 1); // photos only, no empty text part
});

test("findMatches: case-insensitive, counts repeats, needs 2+ chars, oldest first", () => {
  const turns = [
    { id: "u1", role: "user", text: "Deploy the API" },
    { id: "a1", role: "assistant", text: "deploying… deployed. DEPLOY ok", steps: [], status: "completed" },
    { id: "u2", role: "user", text: "thanks" },
  ];
  assert.deepStrictEqual(m.findMatches(turns, "deploy"), [{ id: "u1", count: 1 }, { id: "a1", count: 3 }]);
  assert.deepStrictEqual(m.findMatches(turns, "  Deploy  "), [{ id: "u1", count: 1 }, { id: "a1", count: 3 }]);
  assert.deepStrictEqual(m.findMatches(turns, "d"), []); // too short
  assert.deepStrictEqual(m.findMatches(turns, "nope"), []);
});

test("chatToMarkdown: turns, stamps, photos, steers and failures; skips unfinished empty replies", () => {
  const now = new Date(2026, 9, 25, 13, 5).getTime();
  const at = new Date(2026, 9, 25, 9).getTime();
  const md = m.chatToMarkdown("Forge", [
    { id: "u1", role: "user", text: "clean the logs", at },
    { id: "u2", role: "user", text: "", images: ["/local/1.jpg", "/local/2.jpg"], at },
    a({ id: "a2", text: "done", status: "completed", steers: ["also check disks"], at }),
    a({ id: "a3", text: "", status: "streaming" }), // skipped: nothing to show
    a({ id: "a4", text: "half", status: "failed", error: "x" }),
  ], now);
  assert.match(md, /^# Chat with Forge\n/);
  assert.match(md, /_Exported 2026-10-25 13:05_/);
  assert.match(md, /## You · 2026-10-25 09:00\n\nclean the logs/);
  assert.match(md, /_\[2 photos\]_/);
  assert.match(md, /## Forge · 2026-10-25 09:00\n\n> Added while answering: also check disks\n\ndone/);
  assert.ok(!md.includes("streaming"));
  assert.match(md, /half\n\n_\(failed\)_/);
  assert.ok(md.endsWith("\n"));
});

test("editableLast: the last user message when nothing runs after it; nothing while streaming or photo-only", () => {
  assert.deepStrictEqual(m.editableLast([{ id: "u1", role: "user", text: "hi" }]), { userId: "u1", text: "hi" });
  assert.deepStrictEqual(
    m.editableLast([{ id: "u1", role: "user", text: "hi" }, a({ id: "a1", status: "completed", text: "hello" }), { id: "u2", role: "user", text: "again" }]),
    { userId: "u2", text: "again" });
  assert.strictEqual(m.editableLast([{ id: "u1", role: "user", text: "hi" }, a({ id: "a1" })]), undefined); // reply still streaming
  assert.strictEqual(m.editableLast([{ id: "u1", role: "user", text: "", imageCount: 1 }]), undefined); // photo-only can't be edited
  assert.strictEqual(m.editableLast([]), undefined);
});

test("runningTurn and canSteer: only a streaming /v1/runs reply takes steering", () => {
  const streaming = a({ id: "a1", runId: "r1" });
  assert.strictEqual(m.runningTurn([streaming])?.id, "a1");
  assert.strictEqual(m.runningTurn([a({ id: "a1", status: "completed" })]), undefined);
  assert.strictEqual(m.runningTurn([{ id: "u1", role: "user", text: "hi" }]), undefined);
  assert.strictEqual(m.canSteer(streaming), true);
  assert.strictEqual(m.canSteer(a({ id: "a1" })), false); // no run id (legacy session stream)
  assert.strictEqual(m.canSteer(a({ id: "a1", runId: "r1", status: "completed" })), false);
  assert.strictEqual(m.canSteer(a({ id: "a1", runId: "r1", approval: { requestId: "q", generation: 0, title: "t" } })), false);
});
