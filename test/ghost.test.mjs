// v0.11.2 regression: the "grey box" came back on v0.11.1. The chat showed one tall, empty bubble-coloured
// rectangle. Cause: a 3.9k-character reply (and a 2.6k-character user message just above it) each rendered
// as ONE native view about 3,000+ dp tall (~9,000+ px on a phone). Android draws a view that tall as its
// background with no content. LONG_REPLY (6k characters) didn't catch them, and user bubbles had no cap at
// all. Now every bubble is a stack of pieces of at most ~1.4k characters.
// The fixture is the real shape of that chat with every letter and digit randomised.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx -y esbuild@0.24.0 test/safety-entry.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/hm-ghost/g.js --log-level=error");
const m = await import("../node_modules/.cache/hm-ghost/g.js");
const fx = JSON.parse(readFileSync("test/fixtures/ghost-v0111.json", "utf8")).messages;
const norm = (s) => s.replace(/\s+/g, " ").trim();

test("the offending messages were under the old 6k guard (why it slipped through)", () => {
  for (const msg of fx) assert.strictEqual(m.clipLong(m.tidyText(msg.content)).clipped, false);
  assert.ok(fx.some((x) => x.content.length > 3500), "the tall reply is in the fixture");
});

test("every real message splits into pieces small enough to draw", () => {
  for (const msg of fx) {
    const text = m.tidyText(msg.content);
    const ps = m.pieces(text);
    if (text.length > m.PIECE) assert.ok(ps.length >= 2, `${msg.role} ${text.length} chars should split`);
    for (const p of ps) {
      const fenceOnly = /^```[^\n]*\n[\s\S]*\n```$/.test(p) && (p.match(/^```/gm) ?? []).length === 2;
      if (!fenceOnly) assert.ok(p.length <= m.PIECE, `piece of ${p.length} chars`);
      assert.ok(p.split("\n").length <= m.PIECE_LINES + 2, "piece line count");
    }
    assert.strictEqual(norm(ps.join("\n\n")), norm(text), "nothing lost or reordered");
  }
});

test("code fences are never cut open; huge fences re-fence each part", () => {
  const reply = fx.find((x) => x.content.includes("```"));
  for (const p of m.pieces(m.tidyText(reply.content), 400)) assert.strictEqual((p.match(/^```/gm) ?? []).length % 2, 0, p.slice(0, 60));
  const big = "Intro\n\n```js\n" + Array.from({ length: 130 }, (_, i) => `line ${i}`).join("\n") + "\n```\n\nAfter";
  const ps = m.pieces(big);
  assert.ok(ps.filter((p) => p.startsWith("```js")).length >= 3, "split into several js fences");
  for (const p of ps) assert.strictEqual((p.match(/^```/gm) ?? []).length % 2, 0);
  assert.ok(ps.join("\n").includes("line 129"));
});

test("prose pasted into a code fence wraps instead of making one ultra-wide view", () => {
  const reply = fx.find((x) => x.content.includes("```"));
  const code = reply.content.split("```")[1];
  assert.ok(code.split("\n").some((l) => l.length > 600), "fixture has the 600+ char line");
  assert.strictEqual(m.wrapsCode(code), true);
  assert.strictEqual(m.wrapsCode("const a = 1;\nconsole.log(a);"), false, "normal code still scrolls sideways");
});

test("one enormous paragraph splits at sentence or word breaks", () => {
  const para = Array.from({ length: 120 }, (_, i) => `Sentence number ${i} goes here.`).join(" ");
  const ps = m.pieces(para);
  assert.ok(ps.length >= 3);
  for (const p of ps) { assert.ok(p.length <= m.PIECE); assert.match(p, /\.$/); }
  const noSpaces = "x".repeat(5000);
  for (const p of m.pieces(noSpaces)) assert.ok(p.length <= m.PIECE);
  assert.deepStrictEqual(m.pieces("short"), ["short"]);
});

test("the chat renders replies and user messages as pieces, not one giant view", () => {
  const chat = readFileSync("app/bot/bits.tsx", "utf8");
  assert.match(chat, /<Markdown text=\{t\.text\}[^>]*wrap=\{/, "reply bubble uses Markdown's piece wrapper");
  assert.match(chat, /pieces\(t\.text\)/, "user bubble is split into pieces");
  assert.doesNotMatch(chat, /<MarkedText text=\{t\.text\}/, "no whole-message Text in a user bubble");
  const md = readFileSync("src/ui/markdown.tsx", "utf8");
  assert.match(md, /pieces\(shown\.text\)/);
  assert.match(md, /clipLong\(tidy\)/, "the 6k Show-the-rest guard stays");
});

test("replies with a sideways-scrolling block get a fixed-width bubble", () => {
  const short = "Here you go:\n\n```\nabc def\nghi jkl\nmno\n```\n\nThat's the short version.";
  const table = "Totals:\n\n| Category | Spent |\n|---|---:|\n| Food | 120 |\n\nAll under budget.";
  assert.strictEqual(m.scrollsSideways(short), true, "short code block scrolls sideways");
  assert.strictEqual(m.scrollsSideways(table), true, "tables scroll sideways");
  assert.strictEqual(m.scrollsSideways("> quoted\n>\n> ```\n> x = 1\n> ```"), true, "inside a quote");
  assert.strictEqual(m.scrollsSideways("- item\n\n  ```\n  y = 2\n  ```"), true, "inside a list");
  assert.strictEqual(m.scrollsSideways("Just prose, with `inline code` and **bold**."), false);
  const wrapped = "```\n" + "word ".repeat(60) + "\n```";
  assert.strictEqual(m.scrollsSideways(wrapped), false, "code that wraps doesn't scroll");
  const reply = fx.find((x) => x.content.includes("```"));
  assert.strictEqual(typeof m.scrollsSideways(reply.content), "boolean");
  const chat = readFileSync("app/bot/bits.tsx", "utf8");
  assert.match(chat, /const wide = !!t\.text && scrollsSideways\(t\.text\);/);
  assert.match(chat, /style=\{wide \? \{ width: "94%" \} : \{ maxWidth: "94%" \}\}/);
});
