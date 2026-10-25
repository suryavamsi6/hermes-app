// The chat Markdown parser (src/md.ts) and the tool-steps summary line.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/md-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/md.js --log-level=error");
const m = await import("/tmp/hm-test/md.js");

test("paragraphs, headings, rules and fenced code", () => {
  const b = m.parse("# Title\n\nline one\nline two\n\n---\n```bash\nls -la\n```\n");
  assert.deepStrictEqual(b.map((x) => x.k), ["h", "p", "hr", "code"]);
  assert.strictEqual(b[0].level, 1);
  assert.strictEqual(m.plain(b[1].c), "line one\nline two");
  assert.deepStrictEqual(b[3], { k: "code", lang: "bash", s: "ls -la" });
});

test("an unclosed fence runs to the end (a reply still streaming)", () => {
  const b = m.parse("look:\n```py\nprint(1)");
  assert.strictEqual(b[1].k, "code");
  assert.strictEqual(b[1].s, "print(1)");
});

test("inline: bold, italic, strike, code, links, bare URLs, escapes, entities", () => {
  const i = m.inline("**b** *i* _j_ ~~s~~ `x*y` [site](https://a.example/p) see https://b.example/q. \\*lit\\* a &amp; b");
  const kinds = i.filter((n) => n.k !== "text").map((n) => n.k);
  assert.deepStrictEqual(kinds, ["b", "i", "i", "s", "code", "link", "link"]);
  assert.strictEqual(i.find((n) => n.k === "code").s, "x*y");
  assert.strictEqual(i.filter((n) => n.k === "link")[1].href, "https://b.example/q");
  assert.ok(m.plain(i).endsWith(". *lit* a & b"));
});

test("snake_case words are not italic", () => {
  assert.deepStrictEqual(m.inline("call get_user_name now"), [{ k: "text", s: "call get_user_name now" }]);
});

test("lists: ordered start, nesting, loose items", () => {
  const [l] = m.parse("3. three\n4. four\n   - nested a\n   - nested b\n\n5. five");
  assert.strictEqual(l.k, "list");
  assert.strictEqual(l.ordered, true);
  assert.strictEqual(l.start, 3);
  assert.strictEqual(l.items.length, 3);
  assert.strictEqual(l.items[1][1].k, "list");
  assert.strictEqual(l.items[1][1].items.length, 2);
});

test("tables with alignment and escaped pipes; quotes", () => {
  const b = m.parse("| A | B |\n|:--|--:|\n| 1 | a \\| b |\n\n> quoted **bold**");
  assert.strictEqual(b[0].k, "table");
  assert.deepStrictEqual(b[0].align, ["left", "right"]);
  assert.strictEqual(m.plain(b[0].rows[0][1]), "a | b");
  assert.strictEqual(b[1].k, "quote");
  assert.strictEqual(b[1].c[0].c[1].k, "b");
});

test("steps summary names the first three tools", () => {
  const s = (tool) => ({ id: tool, tool, status: "completed" });
  assert.strictEqual(m.summary([s("terminal")]), "1 step · terminal");
  assert.strictEqual(m.summary([s("a"), s("b"), s("a"), s("c"), s("d")]), "5 steps · a, b, c +1");
});
