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
  const chat = readFileSync("app/bot/screen.tsx", "utf8");
  assert.match(chat, /commands=\{commands\} onSlash=\{onSlash\}/);
  assert.match(chat, /case "skill": onSend\(skillMessage\(a\.name, a\.arg\), images, files\); return "sent";/);
});

// v0.11.5: /new opened Topics in v0.11.4 (an alias of /topics). It now starts a fresh chat in place.
