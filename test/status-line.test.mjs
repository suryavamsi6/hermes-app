// v0.11.2: a more varied live status line. Concrete, honest phrases from real tool events; a rotating
// pool of calm generic phrases only while nothing concrete is happening.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx -y esbuild@0.24.0 test/v080-entry.ts --bundle --format=esm --platform=node --outfile=node_modules/.cache/hm-status/s.js --log-level=error");
const m = await import("../node_modules/.cache/hm-status/s.js");

test("tool events map to specific phrases from their arguments", () => {
  const cases = [
    ["web_search", "best hiking boots 2026", "Searching the web for best hiking boots 2026"],
    ["web_search", undefined, "Searching the web"],
    ["web_extract", "https://www.example.com/docs/page", "Reading example.com"],
    ["browser_navigate", "news.ycombinator.com/item?id=1", "Reading news.ycombinator.com"],
    ["terminal", undefined, "Running a command"],
    ["terminal", "git status", "Running git status"],
    ["read_file", "/srv/app/main.py", "Reading main.py"],
    ["write_file", "/srv/app/notes.md", "Writing notes.md"],
    ["patch", "src/app.ts", "Editing app.ts"],
    ["mcp_github_list_issues", undefined, "Asking github"],
    ["mcp_fold_get_transactions", "last 7 days", "Asking fold: last 7 days"],
    ["memory", undefined, "Checking memory"],
    ["memory", "add: likes window seats", "Updating memory"],
    ["delegate_task", "summarise the logs", "Handing part of this to a helper"],
    ["send_message", "Forge", "Handing off to Forge"],
    ["some_new_tool", undefined, "Using some new tool"],
  ];
  for (const [tool, preview, want] of cases) assert.strictEqual(m.toolPhrase(tool, preview), want, tool);
  const base = { id: "a", role: "assistant", status: "streaming", text: "", steps: [] };
  assert.strictEqual(m.activityLine({ ...base, approval: { requestId: "r", generation: 0, title: "x" } }), "Waiting for your OK");
});

test("rotation only when nothing concrete is happening", () => {
  const base = { id: "a", role: "assistant", status: "streaming", text: "", steps: [] };
  assert.strictEqual(m.idleKind(base), "start");
  assert.strictEqual(m.idleKind({ ...base, steps: [{ id: "0", tool: "web_search", status: "completed" }] }), "wrapup");
  assert.strictEqual(m.idleKind({ ...base, steps: [{ id: "0", tool: "web_search", status: "running" }] }), null);
  assert.strictEqual(m.idleKind({ ...base, thought: "Checking the calendar." }), null);
  assert.strictEqual(m.idleKind({ ...base, approval: { requestId: "r", generation: 0, title: "x" } }), null);
  assert.strictEqual(m.idleKind({ ...base, reconnecting: true }), null);
  assert.strictEqual(m.idleKind({ ...base, text: "Hi" }), null);
  assert.strictEqual(m.idleKind({ ...base, status: "completed" }), null);
});

test("pools are big, calm and never claim a concrete action", () => {
  assert.ok(m.IDLE_PHRASES.start.length >= 30, `start pool has ${m.IDLE_PHRASES.start.length}`);
  const all = [...m.IDLE_PHRASES.start, ...m.IDLE_PHRASES.wrapup];
  assert.strictEqual(new Set(all.filter((p) => m.IDLE_PHRASES.start.includes(p))).size, m.IDLE_PHRASES.start.length, "no duplicates");
  for (const p of all) {
    assert.ok(p.length <= 28, `short: ${p}`);
    assert.doesNotMatch(p, /search|read|run|brows|fetch|open|check|download|send|call|email|web|file|!|\.\.\.|…/i, `doesn't claim an action: ${p}`);
  }
  for (const p of ["Chipping away", "Mulling it over", "Digging in"]) assert.ok(m.IDLE_PHRASES.start.includes(p), p);
  assert.ok(m.IDLE_PHRASES.wrapup.includes("Pulling it together"));
});

test("random phrases never repeat back to back (and avoid the last few)", () => {
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pool = m.idlePool("start");
  const recent = [];
  for (let i = 0; i < 500; i++) {
    const p = m.nextPhrase(pool, recent, rand);
    assert.ok(!recent.slice(-4).includes(p), `repeat of a recent phrase at ${i}: ${p}`);
    recent.push(p);
  }
  assert.ok(new Set(recent).size > 25, "covers most of the pool");
  // Tiny pools still never repeat immediately.
  const two = ["A", "B"]; let last = "A";
  for (let i = 0; i < 50; i++) { const p = m.nextPhrase(two, [last], rand); assert.notStrictEqual(p, last); last = p; }
  for (let i = 0; i < 50; i++) { const d = m.phraseDelay(rand); assert.ok(d >= 4000 && d <= 6000, String(d)); }
});

test("per-bot flavour joins the pool only for matching bots", () => {
  assert.ok(m.idlePool("start", { name: "Ledger", profile: "finance" }).includes("Crunching numbers"));
  assert.ok(!m.idlePool("start", { name: "Atlas", profile: "default" }).includes("Crunching numbers"));
  assert.ok(!m.idlePool("wrapup", { name: "Ledger", profile: "finance" }).includes("Crunching numbers"), "flavour isn't used while wrapping up");
});

test("the status row is a plain static line: no entering/exiting, no crossfade, polite live region", () => {
  const src = readFileSync("src/ui/activity-row.tsx", "utf8");
  assert.doesNotMatch(src, /\b(entering|exiting|layout)=\{/);
  assert.doesNotMatch(src, /useReducedMotion|Animated|Reanimated/); // nothing animates, so no motion gate is needed
  assert.match(src, /accessibilityLiveRegion="polite"/);
  assert.match(src, /numberOfLines=\{1\}/);
});
