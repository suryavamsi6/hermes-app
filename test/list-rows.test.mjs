// v0.10.4: nothing rendered inside the chat's inverted FlatList may use Reanimated layout animations
// (entering / exiting / layout). On Android a removed row whose subtree has an `exiting` view stays on
// screen as a ghost drawn over the list (the "grey box over the chat" bug). Row-only motion uses Rise
// (shared values), which can't outlive its row.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const LAYOUT_ANIM = /\b(entering|exiting|layout)=\{/;
const ROW_FILES = ["src/ui/activity-row.tsx", "src/ui/steps-row.tsx", "src/ui/approval-card.tsx", "src/ui/markdown.tsx", "src/ui/reactions.tsx"];

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
