import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

test("slash checks read the chat screen, not the route re-export", () => {
  const chat = readFileSync("app/bot/screen.tsx", "utf8");
  assert.match(chat, /commands=\{commands\} onSlash=\{onSlash\}/);
  assert.match(chat, /case "skill": onSend\(skillMessage\(a\.name, a\.arg\), images, files\); return "sent";/);
  const neu = /case "new":([\s\S]*?)case "search":/.exec(chat)?.[1] ?? "";
  assert.match(neu, /newChat\(bot\)/);
  assert.doesNotMatch(neu, /router\.|push\(/);
  assert.match(neu, /if \(busy\)/);
  const hermes = /case "hermes": \{([\s\S]*?)\n      \}\n      default:/.exec(chat)?.[1] ?? "";
  assert.match(hermes, /runCommand\(bot, a\.command, a\.profileWide\)/);
  assert.match(hermes, /commandReply\(bot, typed, answer\)/);
  assert.match(hermes, /if \(r\.type === "send"\)[\s\S]*onSend\(r\.message\)/);
  assert.match(hermes, /if \(a\.fallback && f\.kind !== "refused"\) \{ setNote\(null\); act\(bot, a\.fallback, typed\); return; \}/);
  assert.match(hermes, /setNote\(failureNote\(a\.name, f\)\)/);
  assert.doesNotMatch(hermes, /router\.|send\(bot, a\.command/);
});
