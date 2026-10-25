// v0.10.2: link schemes, whitespace tidy-up, and long-reply clipping.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/safety-entry.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/hm-safety/s.js --log-level=error");
const { safeHref, tidyText, clipLong, newReplies, parseWatch } = await import("../node_modules/.cache/hm-safety/s.js");

test("only http(s), mailto and tel links open", () => {
  assert.equal(safeHref("https://x.com/a"), "https://x.com/a");
  assert.equal(safeHref("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(safeHref("www.example.com"), "https://www.example.com");
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "intent://scan#Intent;end", "file:///data/data/x", "content://x", "hermes://bot/x", "data:text/html,hi"]) assert.equal(safeHref(bad), undefined, bad);
});

test("a reply that is mostly blank lines can't make a giant empty bubble", () => {
  assert.equal(tidyText("Hi\n\n\n\n\n\nthere   \n\n\n"), "Hi\n\nthere");
  assert.equal(tidyText("\n".repeat(5000)), "");
});

test("huge replies render clipped at a paragraph with the rest on demand", () => {
  const para = "x".repeat(1000);
  const long = Array(12).fill(para).join("\n\n");
  const c = clipLong(long);
  assert.ok(c.clipped && c.text.length <= 6000 && c.text.endsWith("x"));
  assert.deepEqual(clipLong("short"), { text: "short", clipped: false });
});

test("background check: only assistant replies after the mark count", () => {
  const h = [
    { role: "user", text: "hi", at: 2000 }, { role: "assistant", text: "old", at: 1000 },
    { role: "assistant", text: "new", at: 3000 }, { role: "assistant", text: "   ", at: 4000 }, { role: "assistant", text: "no time" },
  ];
  assert.deepEqual(newReplies(h, 1500).map((m) => m.text), ["new"]);
  assert.equal(parseWatch("garbage"), null);
  assert.deepEqual(parseWatch(JSON.stringify({ since: 5, chats: [{ botId: "a", sid: "s" }, { botId: 1 }] })), { since: 5, chats: [{ botId: "a", sid: "s" }] });
});
