// v0.11.2: after Send the chat didn't move to your new message. The list pinned the rows on screen
// (maintainVisibleContentPosition) so your message landed out of view under the composer, and the only
// jump happened when you were >320px up, before the new row existed. Steers never scrolled at all.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx -y esbuild@0.24.0 src/chat-follow.ts --format=esm --outfile=node_modules/.cache/hm-follow/f.mjs --log-level=error");
const { ChatFollow, AT_BOTTOM, SETTLE_MS } = await import("../node_modules/.cache/hm-follow/f.mjs");

function setup() {
  let t = 1000, scrolls = 0;
  const f = new ChatFollow(() => { scrolls++; }, () => t);
  return { f, tick: (ms) => { t += ms; }, scrolls: () => scrolls };
}

test("sending always scrolls to the newest message, even from far up", () => {
  for (const y of [0, 30, 200, 5000]) {
    const { f, scrolls } = setup();
    f.scrolled(y);
    f.sent();
    assert.strictEqual(scrolls(), 1, `immediate scroll from ${y}`);
    assert.strictEqual(f.anchor(), undefined, "no pinning while the send scrolls down");
    f.rowsChanged(); // your message rendered
    assert.strictEqual(scrolls(), 2, `scrolls again once the row exists (from ${y})`);
    f.rowsChanged(); // streamed tokens: no extra forced scrolls
    assert.strictEqual(scrolls(), 2);
  }
});

test("the smooth scroll back down doesn't re-pin halfway", () => {
  const { f, tick } = setup();
  f.scrolled(3000);
  f.sent();
  assert.strictEqual(f.scrolled(1500), false, "mid-animation offsets keep following");
  assert.ok(f.following());
  f.scrolled(0);
  tick(SETTLE_MS + 1);
  assert.ok(f.following(), "landed at the bottom: keeps following the reply");
});

test("at the bottom the list follows streaming; scrolled up it never yanks you", () => {
  const { f, scrolls } = setup();
  assert.ok(f.following());
  assert.strictEqual(f.anchor(), undefined, "at the bottom: new rows and tokens show up in place");
  assert.strictEqual(f.scrolled(AT_BOTTOM + 200), true, "scrolling up flips to pinned");
  assert.deepStrictEqual(f.anchor(), { minIndexForVisible: 0 }, "scrolled up: visible rows stay put");
  f.rowsChanged(); f.rowsChanged();
  assert.strictEqual(scrolls(), 0, "incoming rows/tokens never scroll you");
});

test("if you scroll up before your message renders, the late row doesn't drag you back", () => {
  const { f, tick, scrolls } = setup();
  f.sent();
  tick(SETTLE_MS + 1);
  f.scrolled(900);
  f.rowsChanged();
  assert.strictEqual(scrolls(), 1);
});

test("the chat screen wires sends and steers to the follower", () => {
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  assert.match(chat, /maintainVisibleContentPosition=\{follow\.current!\.anchor\(\)\}/);
  assert.doesNotMatch(chat, /autoscrollToTopThreshold/);
  const send = chat.slice(chat.indexOf("const onSend"), chat.indexOf("const onStop"));
  assert.match(send, /toLatest\(\); void send\(/, "onSend scrolls on every send (text and attachments)");
  assert.match(send, /toLatest\(\);\s*try \{ await steer\(/, "onSteer scrolls too");
  assert.doesNotMatch(send, /awayRef\.current\) jump/, "no longer only when far up");
  assert.match(chat, /useEffect\(\(\) => \{ follow\.current!\.rowsChanged\(\); \}, \[rows\]\)/);
});
