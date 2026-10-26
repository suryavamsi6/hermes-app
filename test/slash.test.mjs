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

// v0.11.6: every command Telegram accepts. Hermes's gateway command registry (hermes_cli/commands.py at the
// tested commit 4ea8d23c: commands that aren't cli_only, or are config-gated) with their aliases.
const TELEGRAM = {"start": [], "new": ["reset"], "topic": [], "save": [], "retry": [], "undo": [], "title": [], "branch": ["fork"], "compress": ["compact"], "rollback": [], "stop": [], "discard": [], "pause": [], "approve": [], "deny": [], "bg": [], "btw": [], "agents": ["tasks"], "queue": ["q"], "steer": ["s"], "goal": [], "heartbeat": ["hb"], "refine": [], "review": [], "loop": ["proactive"], "plan": [], "moa": [], "subgoal": [], "status": [], "egress": [], "context": ["ctx"], "whoami": [], "profile": [], "sethome": ["set-home"], "resume": [], "sessions": [], "model": [], "codex-runtime": ["codex_runtime"], "personality": [], "diff": [], "verbose": [], "footer": [], "yolo": [], "approvals": [], "reasoning": [], "fast": [], "voice": [], "busy": [], "autoprune": [], "skills": [], "memory": [], "bundles": [], "learn": [], "init": [], "suggestions": ["suggest"], "blueprint": ["bp"], "curator": [], "kanban": [], "reload-mcp": ["reload_mcp"], "reload-skills": ["reload_skills"], "commands": [], "help": [], "restart": [], "usage": [], "login": [], "topup": [], "insights": [], "platform": [], "update": [], "version": ["v"], "debug": []};
// Telegram commands Hermes's gateway refuses for any other client (gateway/session_commands.py: everything
// not in its read/control/setting/prompt lists gets unsupported_command), checked against a live gateway.
const REFUSED_BY_HERMES = ["start", "topic", "save", "retry", "undo", "branch", "compress", "rollback", "stop", "discard", "pause", "bg", "btw", "agents",
  "queue", "steer", "sethome", "resume", "sessions", "model", "reload-mcp", "reload-skills", "restart", "platform", "update", "new"];

test("every Telegram command is in the picker and routed: app, Hermes's handler, or explained", () => {
  assert.deepStrictEqual([...m.TELEGRAM].sort(), Object.keys(TELEGRAM).sort(), "the app's list is Telegram's list");
  const cat = m.catalog();
  for (const [name, aliases] of Object.entries(TELEGRAM)) {
    const row = cat.find((c) => c.name === name);
    assert.ok(row, `/${name} is in the picker`);
    for (const al of aliases) assert.ok(row.aliases?.includes(al), `/${al} is an alias of /${name}`);
    const route = m.routeOf(name);
    assert.ok(["app", "hermes", "no"].includes(route), name);
    // Hermes's handler is never asked for a command Hermes refuses from other apps.
    if (REFUSED_BY_HERMES.includes(name)) assert.notStrictEqual(route, "hermes", `/${name} can't go to Hermes`);
    for (const t of [name, ...aliases]) {
      const a = m.resolveSlash(`/${t} x`);
      assert.ok(a && a.type !== "unknown", `/${t} resolves`);
      if (route === "hermes") assert.deepStrictEqual([a.type, a.command], ["hermes", `/${name} x`], `/${t} runs as Hermes's /${name}`);
      if (route === "no") { assert.strictEqual(a.type, "unsupported"); assert.ok(m.explain(a).length > 60); }
    }
  }
  const counts = { app: 0, hermes: 0, no: 0 };
  for (const name of Object.keys(TELEGRAM)) counts[m.routeOf(name)]++;
  assert.deepStrictEqual(counts, { app: 13, hermes: 43, no: 15 });
});

test("dispatch: app commands, Hermes's handlers with fallbacks, skills, unsupported and unknown", () => {
  const r = (t) => m.resolveSlash(t, SKILLS);
  assert.deepStrictEqual(r("/stop"), { type: "stop" });
  assert.deepStrictEqual(r("/cancel"), { type: "stop" });
  assert.deepStrictEqual(r("/approve"), { type: "approve", choice: "once" });
  assert.deepStrictEqual(r("/approve session"), { type: "approve", choice: "session" });
  assert.deepStrictEqual(r("/approve always"), { type: "approve", choice: "always" });
  assert.deepStrictEqual(r("/deny"), { type: "approve", choice: "deny" });
  assert.deepStrictEqual(r("/model sonnet"), { type: "model", query: "sonnet" });
  assert.deepStrictEqual(r("/steer be brief"), { type: "steer", text: "be brief" });
  assert.deepStrictEqual(r("/s be brief"), { type: "steer", text: "be brief" });
  assert.strictEqual(r("/steer").type, "missing");
  assert.deepStrictEqual(r("/save md"), { type: "export" });
  assert.deepStrictEqual(r("/restart"), { type: "restart" });
  assert.deepStrictEqual(r("/cron"), { type: "open", screen: "routines" });
  assert.deepStrictEqual(r("/tools"), { type: "open", screen: "skills" });
  // Hermes's own handler, with what the app does when the bridge can't run it.
  assert.deepStrictEqual(r("/status"), { type: "hermes", name: "status", command: "/status", profileWide: false, fallback: { type: "status" } },
    "a built-in wins over a skill with the same name");
  assert.deepStrictEqual(r("/yolo"), { type: "hermes", name: "yolo", command: "/yolo", profileWide: false });
  assert.deepStrictEqual(r("/v"), { type: "hermes", name: "version", command: "/version", profileWide: true });
  assert.deepStrictEqual(r("/title Trip plans"), { type: "hermes", name: "title", command: "/title Trip plans", profileWide: false, fallback: { type: "rename", title: "Trip plans" } });
  assert.deepStrictEqual(r("/title"), { type: "hermes", name: "title", command: "/title", profileWide: false }, "no rename without a name");
  assert.deepStrictEqual(r("/memory").fallback, { type: "open", screen: "memory" });
  assert.deepStrictEqual(r("/skills").fallback, { type: "open", screen: "skills" });
  assert.deepStrictEqual(r("/insights 7").fallback, { type: "open", screen: "activity" });
  assert.deepStrictEqual(r("/help").fallback, { type: "help" });
  assert.strictEqual(r("/reasoning high").command, "/reasoning high");
  assert.deepStrictEqual(r("/server-health check the NAS"), { type: "skill", name: "Server Health", slug: "server-health", arg: "check the NAS" });
  assert.deepStrictEqual(r("/trip-planner"), { type: "skill", name: "trip-planner", slug: "trip-planner", arg: "" });
  assert.deepStrictEqual(r("/old-skill"), { type: "unknown", name: "old-skill" }, "disabled skills aren't commands");
  assert.strictEqual(r("/compact").type, "unsupported");
  assert.deepStrictEqual(r("/frobnicate"), { type: "unknown", name: "frobnicate" });
  assert.strictEqual(r("just text"), null);
  assert.match(m.explain(r("/compress")), /doesn't work from the app.*compresses long chats by itself.*wasn't sent.*\/\//s);
  assert.match(m.explain(r("/bg x")), /separate event/);
  assert.match(m.explain(r("/frobnicate")), /no \/frobnicate command/);
  // Your server's own commands (quick commands, plugin commands) run with Hermes too.
  assert.deepStrictEqual(m.resolveSlash("/deploy now", [], [{ name: "deploy", description: "Run deploy.sh" }]),
    { type: "hermes", name: "deploy", command: "/deploy now", profileWide: false });
  assert.strictEqual(m.resolveSlash("/deploy").type, "unknown");
});

test("why a command didn't run, in words", () => {
  assert.match(m.failureNote("yolo", { kind: "no_bridge" }), /hermes-bridge.*Settings/);
  assert.match(m.failureNote("yolo", { kind: "old_bridge" }), /hermes-bridge 0\.4 or newer/);
  assert.match(m.failureNote("yolo", { kind: "not_owned" }), /Bot Chat.*phone session/);
  assert.match(m.failureNote("yolo", { kind: "unavailable", message: "Hermes's gateway isn't running." }), /^Couldn't run \/yolo: Hermes's gateway/);
  assert.strictEqual(m.failureNote("voice", { kind: "refused", message: "Hermes doesn't run this command for this chat." }), "/voice: Hermes doesn't run this command for this chat.");
  // Prompt commands Hermes builds (/plan, /learn) show as the command in the chat.
  assert.strictEqual(m.skillDisplay("[/plan — plan mode]\n\nFor this turn, you are in PLAN MODE"), "/plan");
  assert.strictEqual(m.skillDisplay("[/learn] The user wants you to learn"), "/learn");
  assert.strictEqual(m.skillDisplay("[not a command] hi"), null);
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
  assert.ok(names.indexOf("new") < names.indexOf("compress"), "what you use most first, unsupported ones after");
  assert.ok(names.includes("trip-planner") && !names.includes("old-skill"));
  assert.strictEqual(cat.filter((c) => c.name === "status").length, 1);
  assert.strictEqual(cat.find((c) => c.name === "trip-planner").description, "Plan a trip step by step", "one line");
  assert.ok(m.catalog().length >= 80, "every Telegram command plus app extras, without a server");
  const server = m.catalog([], [{ name: "/deploy", description: "Run deploy.sh" }, { name: "status", description: "clash" }, { name: "weather" }]);
  assert.deepStrictEqual(server.filter((c) => ["deploy", "weather"].includes(c.name)).map((c) => [c.name, c.kind, c.description]),
    [["deploy", "hermes", "Run deploy.sh"], ["weather", "hermes", "A command from your Hermes server"]]);
  assert.strictEqual(server.filter((c) => c.name === "status").length, 1, "a server command can't shadow a built-in");
  for (const c of cat) { assert.ok(c.description.length > 3 && c.description.length <= 90, c.name); assert.match(c.name, /^[a-z0-9-]+$/); }
});

test("picker: shows on '/' until a space, filtered and ranked as you type", () => {
  assert.strictEqual(m.pickerQuery("/"), "");
  assert.strictEqual(m.pickerQuery("/sta"), "sta");
  assert.strictEqual(m.pickerQuery("/status now"), null, "closes once you type arguments");
  assert.strictEqual(m.pickerQuery("hi /"), null);
  const cat = m.catalog(SKILLS);
  assert.strictEqual(m.filterCommands(cat, "").length, cat.length, "'/' alone shows every command (the picker scrolls)");
  assert.deepStrictEqual(m.filterCommands(cat, "st").map((c) => c.name).slice(0, 3), ["stop", "status", "steer"]);
  assert.strictEqual(m.filterCommands(cat, "ctx")[0].name, "context", "Telegram aliases match");
  assert.strictEqual(m.filterCommands(cat, "ser")[0].name, "server-health", "name prefix first");
  assert.strictEqual(m.filterCommands(cat, "cron")[0].name, "routines", "aliases match");
  assert.ok(m.filterCommands(cat, "yolo").every((c) => c.description), "every row has a description");
  assert.ok(m.filterCommands(cat, "disk").some((c) => c.name === "server-health"), "descriptions match");
  assert.deepStrictEqual(m.filterCommands(cat, "zzzz"), []);
});

test("the composer runs commands instead of sending or steering them; the picker has no row animations", () => {
  const src = readFileSync("src/ui/composer.tsx", "utf8");
  assert.match(src, /if \(typed\.startsWith\("\/"\) && !typed\.startsWith\("\/\/"\)\) \{ tapHaptic\(\); if \(slash\(typed\)\) return; \}\n    if \(mode === "stop"\)/, "before stop/steer/send");
  assert.match(src, /if \(picks\.length && !picks\.some\(\(c\) => c\.name === query\?\.toLowerCase\(\) \|\| c\.aliases\?\.includes\(query\?\.toLowerCase\(\) \?\? ""\)\)\) return pick\(picks\[0\]\);/, "Send on a partial name picks the top row; a full name or alias runs as typed");
  const picker = readFileSync("src/ui/slash-picker.tsx", "utf8");
  assert.doesNotMatch(picker, /\b(entering|exiting|layout)=\{/);
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  assert.match(chat, /commands=\{commands\} onSlash=\{onSlash\}/);
  assert.match(chat, /case "skill": onSend\(skillMessage\(a\.name, a\.arg\), images, files\); return "sent";/);
});

// v0.11.5: /new opened Topics in v0.11.4 (an alias of /topics). It now starts a fresh chat in place.
test("/new, /reset and /clear start a fresh chat; /topics and /history still open Topics", () => {
  for (const t of ["/new", "/NEW", "/reset", "/clear"]) assert.deepStrictEqual(m.resolveSlash(t), { type: "new" }, t);
  for (const t of ["/topics", "/history", "/sessions", "/resume", "/topic"]) assert.deepStrictEqual(m.resolveSlash(t), { type: "open", screen: "topics" }, t);
  const cat = m.catalog();
  assert.strictEqual(cat.find((c) => c.name === "new").description, "Start a fresh chat with this bot");
  assert.ok(!cat.find((c) => c.name === "topics").aliases.includes("new"));
  assert.strictEqual(m.filterCommands(cat, "new")[0].name, "new");
  assert.strictEqual(m.filterCommands(cat, "reset")[0].name, "new");
  assert.strictEqual(m.routeOf("reset"), "app");

  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  const branch = /case "new":([\s\S]*?)case "search":/.exec(chat)?.[1] ?? "";
  assert.match(branch, /newChat\(bot\)/, "/new calls the new-chat action");
  assert.doesNotMatch(branch, /router\.|push\(/, "/new doesn't navigate");
  assert.match(branch, /if \(busy\)/, "not while a reply is running");
  const state = readFileSync("src/app-state.tsx", "utf8");
  assert.match(state, /await backend\.newBotChat\(bot\);\n    await loadChat\(bot, true\);/, "new session, then the (empty) chat is reloaded");
});

test("/new in the demo: a new empty session becomes the bot's chat", async () => {
  execSync("npx -y esbuild@0.24.0 src/demo-backend.ts --bundle --format=esm --platform=node --outfile=node_modules/.cache/hm-slash/demo.mjs --log-level=error --external:react-native --external:expo-*");
  const { DemoBackend } = await import("../node_modules/.cache/hm-slash/demo.mjs");
  const d = new DemoBackend();
  const [bot] = await d.listBots();
  const before = await d.botChatSession(bot);
  assert.ok(JSON.stringify(await d.chat(bot).messages(before)).length > 20);
  const id = await d.newBotChat(bot);
  assert.notStrictEqual(id, before);
  assert.strictEqual(await d.botChatSession(bot), id);
  assert.deepStrictEqual((await d.chat(bot).messages(id)).messages, []);
});

// v0.11.6: commands Hermes runs go through the backend (hermes-bridge), and their answer shows in the chat.
test("the chat runs Hermes's commands through the backend and shows the answer as a local reply", () => {
  const chat = readFileSync("app/bot/[botId].tsx", "utf8");
  const branch = /case "hermes": \{([\s\S]*?)\n      \}\n      default:/.exec(chat)?.[1] ?? "";
  assert.match(branch, /runCommand\(bot, a\.command, a\.profileWide\)/);
  assert.match(branch, /commandReply\(bot, typed, answer\)/, "the answer becomes a reply in the chat");
  assert.match(branch, /if \(r\.type === "send"\)[\s\S]*onSend\(r\.message\)/, "/plan-style commands send Hermes's prompt as the next turn");
  assert.match(branch, /if \(a\.fallback && f\.kind !== "refused"\) \{ setNote\(null\); act\(bot, a\.fallback, typed\); return; \}/, "the app's own version when the bridge can't");
  assert.match(branch, /setNote\(failureNote\(a\.name, f\)\)/);
  assert.doesNotMatch(branch, /router\.|send\(bot, a\.command/, "a command is never sent to the model as text");
  const state = readFileSync("src/app-state.tsx", "utf8");
  assert.match(state, /filter\(\(t\) => !t\.local && /, "local command replies don't count as transcript changes");
  assert.match(state, /if \(!backend\?\.runCommand\) throw new CommandError\(\{ kind: "no_bridge" \}\);/);
});

test("live: commands go to the bridge; an old bridge, a phone session and refusals are told apart", async () => {
  execSync("npx -y esbuild@0.24.0 src/live-backend.ts --bundle --platform=node --format=esm --alias:expo/fetch=./test/fetch-shim.mjs --alias:react-native=./test/rn-shim.mjs --alias:expo-secure-store=./test/rn-shim.mjs --outfile=node_modules/.cache/hm-slash/live.mjs --log-level=error");
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { LiveBackend } = await import("../node_modules/.cache/hm-slash/live.mjs");
  const realFetch = globalThis.fetch;
  const seen = [];
  let reply = () => [200, { type: "exec", output: "ok" }];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    seen.push([init.method ?? "GET", u.pathname, body?.session_id, body?.command]);
    if (u.pathname.startsWith("/api/sessions")) return new Response(JSON.stringify({ data: [{ id: "local-bc", title: "Bot Chat" }] }), { status: 200 });
    const [status, j] = reply(body);
    return new Response(JSON.stringify(j), { status });
  };
  try {
    const bot = { id: "default", profile: "default", name: "Hermes" };
    const none = new LiveBackend({ baseUrl: "https://hermes.example", apiKey: "k".repeat(20) });
    await assert.rejects(none.runCommand(bot, "s1", "/yolo", false), (e) => e.failure.kind === "no_bridge");
    const live = new LiveBackend({ baseUrl: "https://hermes.example", apiKey: "k".repeat(20), bridgeKey: "b".repeat(40) });
    assert.deepStrictEqual(await live.runCommand(bot, "local-bc", "/yolo", false), { type: "exec", output: "ok" });
    assert.deepStrictEqual(seen.at(-1), ["POST", "/bridge/v1/profiles/default/commands/run", "local-bc", "/yolo"]);
    reply = () => [404, { error: { code: "not_found", message: "No such bridge endpoint." } }];
    await assert.rejects(live.runCommand(bot, "s1", "/yolo", false), (e) => e.failure.kind === "old_bridge");
    reply = () => [503, { error: { code: "commands_unavailable", message: "Hermes's gateway isn't running for this profile." } }];
    await assert.rejects(live.runCommand(bot, "s1", "/yolo", false), (e) => e.failure.kind === "unavailable" && /isn't running/.test(e.failure.message));
    reply = () => [422, { error: { code: "command_unsupported", message: "Hermes doesn't run this command for this chat." } }];
    await assert.rejects(live.runCommand(bot, "s1", "/voice tts", false), (e) => e.failure.kind === "refused");
    // A phone session: chat commands say so; profile-wide ones run in the Bot Chat.
    reply = (b) => (b.session_id === "api_1" ? [404, { error: { code: "session_not_owned", message: "x" } }] : [200, { type: "exec", output: "v1" }]);
    await assert.rejects(live.runCommand(bot, "api_1", "/yolo", false), (e) => e.failure.kind === "not_owned");
    assert.deepStrictEqual(await live.runCommand(bot, "api_1", "/version", true), { type: "exec", output: "v1", ranIn: "bot-chat" });
    assert.deepStrictEqual(seen.at(-1).slice(2), ["local-bc", "/version"]);
  } finally { globalThis.fetch = realFetch; }
});

test("demo: commands answer in Hermes's shape", async () => {
  const { DemoBackend } = await import("../node_modules/.cache/hm-slash/demo.mjs");
  const d = new DemoBackend();
  const [bot] = await d.listBots();
  assert.match((await d.runCommand(bot, "chat-x", "/yolo")).output, /YOLO mode \*\*ON\*\*/);
  assert.match((await d.runCommand(bot, "chat-x", "/yolo")).output, /OFF/);
  assert.strictEqual((await d.runCommand(bot, "chat-x", "/plan ship it")).type, "send");
});
