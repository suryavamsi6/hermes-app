test("/new, /reset and /clear start a fresh chat; /topics and /history still open Topics", () => {
  for (const t of ["/new", "/NEW", "/reset", "/clear"]) assert.deepStrictEqual(m.resolveSlash(t), { type: "new" }, t);
  for (const t of ["/topics", "/history", "/sessions", "/resume", "/topic"]) assert.deepStrictEqual(m.resolveSlash(t), { type: "open", screen: "topics" }, t);
  const cat = m.catalog();
  assert.strictEqual(cat.find((c) => c.name === "new").description, "Start a fresh chat with this bot");
  assert.ok(!cat.find((c) => c.name === "topics").aliases.includes("new"));
  assert.strictEqual(m.filterCommands(cat, "new")[0].name, "new");
  assert.strictEqual(m.filterCommands(cat, "reset")[0].name, "new");
  assert.strictEqual(m.routeOf("reset"), "app");

  const chat = readFileSync("app/bot/screen.tsx", "utf8");
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
  const chat = readFileSync("app/bot/screen.tsx", "utf8");
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
    const none = new LiveBackend({ baseUrl: "https://hermes.example", apiKey: *** });
    await assert.rejects(none.runCommand(bot, "s1", "/yolo", false), (e) => e.failure.kind === "no_bridge");
    const live = new LiveBackend({ baseUrl: "https://hermes.example", apiKey: *** bridgeKey: "b".repeat(40) });
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
