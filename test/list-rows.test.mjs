// v0.10.4: nothing rendered inside the chat's inverted FlatList may use Reanimated layout animations
// (entering / exiting / layout). On Android a removed row whose subtree has an `exiting` view stays on
// screen as a ghost drawn over the list (the "grey box over the chat" bug). Row-only motion uses Rise
// (shared values), which can't outlive its row.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const LAYOUT_ANIM = /\b(entering|exiting|layout)=\{/;
const ROW_FILES = ["src/ui/activity-row.tsx", "src/ui/steps-row.tsx", "src/ui/approval-card.tsx", "src/ui/markdown.tsx", "src/ui/reactions.tsx",
  "src/ui/bot-face.tsx", "src/ui/notice-chip.tsx", "src/ui/motion.tsx"];

test("chat row components have no layout animations", () => {
  for (const f of ROW_FILES) assert.ok(!LAYOUT_ANIM.test(readFileSync(f, "utf8")), `${f} uses entering/exiting/layout`);
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  // Everything from the row components down to the jump button (which floats outside the list).
  const rows = chat.slice(chat.indexOf("function SwipeQuote"), chat.indexOf("function JumpButton"));
  assert.ok(rows.length > 1000, "row section not found");
  assert.ok(!LAYOUT_ANIM.test(rows), "a chat row uses entering/exiting/layout");
});

test("the chat list keeps rows as plain cells (no clipped subviews)", () => {
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  assert.match(chat, /removeClippedSubviews=\{false\}/);
});

test("v0.11.0: the bot face runs on shared values only: no JS timers, no per-frame React state", () => {
  const face = readFileSync("src/ui/bot-face.tsx", "utf8");
  assert.ok(!/\bset(Timeout|Interval)\(/.test(face), "bot-face uses a JS timer");
  assert.ok(!/requestAnimationFrame/.test(face), "bot-face drives frames from JS");
  assert.ok(!/from "react-native";[^\n]*\bAnimated\b/.test(face) && !/\bAnimated\.Value\b/.test(face), "bot-face uses the old JS Animated API");
  assert.match(face, /useLiveSurface\(/, "ambient motion must check the app/screen is visible");
  assert.match(face, /useReduceMotion\(/, "the face must honour Reduce Motion");
});
