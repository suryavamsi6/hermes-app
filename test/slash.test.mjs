// v0.11.4: slash commands. Hermes's API server has no command handling (a "/status" sent over /v1/runs
// reached the model as plain text), so the app parses and runs them itself, and shows a picker on "/".
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx -y esbuild@0.24.0 src/slash.ts --format=esm --outfile=node_modules/.cache/hm-slash/s.mjs --log-level=error");
const m = await import("../node_modules/.cache/hm-slash/s.mjs");
const SKILLS = [{ name: "Server Health", description: "Check disks, memory and services", enabled: true },
  { name: "trip-planner", description: "Plan a trip\nstep by step", enabled: true }, { name: "old-skill", description: "x", enabled: false },
  { name: "status", description: "a skill named like a built-in", enabled: true }];

test("parsing: commands vs normal text", () => {
  assert.deepStrictEqual(m.parseSlash("/status"), { name: "status", arg: "" });
  assert.deepStrictEqual(m.parseSlash("  /Model  gpt-5 mini "), { name: "model", arg: "gpt-5 mini" });
  assert.deepStrictEqual(m.parseSlash("/steer keep it\nshort"), { name: "steer", arg: "keep it\nshort" });
  for (const t of ["hello /status", "/ status", "//status", "/etc/hosts is broken", "/", "", "/😀"]) assert.strictEqual(m.parseSlash(t), null, t);
  assert.strictEqual(m.unescapeSlash("//status please"), "/status please");
  assert.strictEqual(m.unescapeSlash("plain"), "plain");
});

test("dispatch: app commands, aliases, skills, Hermes-only and unknown", () => {
  const r = (t) => m.resolveSlash(t, SKILLS);
  assert.deepStrictEqual(r("/stop"), { type: "stop" });
  assert.deepStrictEqual(r("/cancel"), { type: "stop" });
  assert.deepStrictEqual(r("/help"), { type: "help" });
  assert.deepStrictEqual(r("/commands"), { type: "help" });
  assert.deepStrictEqual(r("/status"), { type: "status" }, "a built-in wins over a skill with the same name");
  assert.deepStrictEqual(r("/approve"), { type: "approve", choice: "once" });
  assert.deepStrictEqual(r("/approve session"), { type: "approve", choice: "session" });
  assert.deepStrictEqual(r("/approve always"), { type: "approve", choice: "always" });
  assert.deepStrictEqual(r("/deny"), { type: "approve", choice: "deny" });
  assert.deepStrictEqual(r("/model sonnet"), { type: "model", query: "sonnet" });
  assert.deepStrictEqual(r("/steer be brief"), { type: "steer", text: "be brief" });
  assert.strictEqual(r("/steer").type, "missing");
  assert.deepStrictEqual(r("/cron"), { type: "open", screen: "routines" });
  assert.deepStrictEqual(r("/new"), { type: "open", screen: "topics" });
  assert.deepStrictEqual(r("/server-health check the NAS"), { type: "skill", name: "Server Health", slug: "server-health", arg: "check the NAS" });
  assert.deepStrictEqual(r("/trip-planner"), { type: "skill", name: "trip-planner", slug: "trip-planner", arg: "" });
  assert.deepStrictEqual(r("/old-skill"), { type: "unknown", name: "old-skill" }, "disabled skills aren't commands");
  assert.deepStrictEqual(r("/compress"), { type: "hermes", name: "compress" });
  assert.deepStrictEqual(r("/frobnicate"), { type: "unknown", name: "frobnicate" });
  assert.strictEqual(r("just text"), null);
  assert.match(m.explain(r("/compress")), /Hermes's own chat.*wasn't sent.*\/\//s);
  assert.match(m.explain(r("/frobnicate")), /no \/frobnicate command/);
});

test("skill turns use Hermes's wording and show as the command you typed", () => {
  const msg = m.skillMessage("Server Health", "check the NAS");
  assert.match(msg, /^\[IMPORTANT: The user has invoked the "Server Health" skill, indicating they want you to follow its instructions\./);
  assert.match(msg, /skill_view\(name="Server Health"\)/);
  assert.match(msg, /\n\nUser instruction: check the NAS$/);
  assert.strictEqual(m.skillDisplay(msg), "/server-health check the NAS");
  assert.strictEqual(m.skillDisplay(m.skillMessage("trip-planner", "")), "/trip-planner");
  // The turn Hermes itself builds for a skill command from Telegram/CLI displays the same way.
  const native = '[IMPORTANT: The user has invoked the "arxiv" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]\n\n# arXiv\n...\n\nUser instruction: find papers on RLHF';
  assert.strictEqual(m.skillDisplay(native), "/arxiv find papers on RLHF");
  assert.strictEqual(m.skillDisplay("hello"), null);
});

test("catalog: app commands first, then enabled skills, no clashes", () => {
  const cat = m.catalog(SKILLS);
  const names = cat.map((c) => c.name);
  assert.strictEqual(new Set(names).size, names.length, "unique");
  assert.ok(names.indexOf("help") < names.indexOf("server-health"));
  assert.ok(names.includes("trip-planner") && !names.includes("old-skill"));
  assert.strictEqual(cat.filter((c) => c.name === "status").length, 1);
  assert.strictEqual(cat.find((c) => c.name === "trip-planner").description, "Plan a trip step by step", "one line");
  assert.ok(m.catalog().length >= 15, "built-in fallback list without a server");
  for (const c of cat) { assert.ok(c.description.length > 3 && c.description.length <= 90, c.name); assert.match(c.name, /^[a-z0-9-]+$/); }
});

test("picker: shows on '/' until a space, filtered and ranked as you type", () => {
  assert.strictEqual(m.pickerQuery("/"), "");
  assert.strictEqual(m.pickerQuery("/sta"), "sta");
  assert.strictEqual(m.pickerQuery("/status now"), null, "closes once you type arguments");
  assert.strictEqual(m.pickerQuery("hi /"), null);
  const cat = m.catalog(SKILLS);
  assert.ok(m.filterCommands(cat, "").length <= 8);
  assert.deepStrictEqual(m.filterCommands(cat, "st").map((c) => c.name).slice(0, 2), ["status", "stop"]);
  assert.strictEqual(m.filterCommands(cat, "ser")[0].name, "server-health", "name prefix first");
  assert.strictEqual(m.filterCommands(cat, "cron")[0].name, "routines", "aliases match");
  assert.ok(m.filterCommands(cat, "disk").some((c) => c.name === "server-health"), "descriptions match");
  assert.deepStrictEqual(m.filterCommands(cat, "zzzz"), []);
});

test("the composer runs commands instead of sending or steering them; the picker has no row animations", () => {
  const src = readFileSync("src/ui/composer.tsx", "utf8");
  assert.match(src, /if \(typed\.startsWith\("\/"\) && !typed\.startsWith\("\/\/"\)\) \{ tapHaptic\(\); if \(slash\(typed\)\) return; \}\n    if \(mode === "stop"\)/, "before stop/steer/send");
  assert.match(src, /if \(picks\.length && !picks\.some\(\(c\) => c\.name === query\?\.toLowerCase\(\)\)\) return pick\(picks\[0\]\);/, "Send on a partial name picks the top row");
  const picker = readFileSync("src/ui/slash-picker.tsx", "utf8");
  assert.doesNotMatch(picker, /\b(entering|exiting|layout)=\{/);
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  assert.match(chat, /commands=\{commands\} onSlash=\{onSlash\}/);
  assert.match(chat, /case "skill": onSend\(skillMessage\(a\.name, a\.arg\), images, files\); return "sent";/);
});
