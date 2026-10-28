// v0.8.0 logic: date dividers, readable routines, reconnect state, recovery and retry rules.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/v080-entry.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/v080.js --log-level=error");
const m = await import("/tmp/hm-test/v080.js");

const NOW = new Date(2026, 9, 25, 13, 0).getTime(); // Sun Oct 25 2026, 1 PM local
const at = (y, mo, d, h = 9) => new Date(y, mo, d, h).getTime();

test("day labels: Today, Yesterday, weekday within a week, then 'Oct 13' (year if different)", () => {
  assert.strictEqual(m.dayLabel(at(2026, 9, 25, 1), NOW), "Today");
  assert.strictEqual(m.dayLabel(at(2026, 9, 24, 23), NOW), "Yesterday");
  assert.strictEqual(m.dayLabel(at(2026, 9, 21), NOW), "Wednesday");
  assert.strictEqual(m.dayLabel(at(2026, 9, 13), NOW), "Oct 13");
  assert.strictEqual(m.dayLabel(at(2025, 11, 31), NOW), "Dec 31, 2025");
  assert.strictEqual(m.messageTime(at(2026, 9, 25, 12), NOW), "12:00 PM");
  assert.strictEqual(m.messageTime(at(2026, 9, 24, 0), NOW), "Yesterday, 12:00 AM");
});

test("rows are newest-first with one divider per day, none for undated history", () => {
  const turns = [
    { id: "u0", role: "user", text: "old, undated" },
    { id: "u1", role: "user", text: "hi", at: at(2026, 9, 13) },
    { id: "a1", role: "assistant", text: "hello", steps: [], status: "completed", at: at(2026, 9, 13, 10) },
    { id: "u2", role: "user", text: "today", at: at(2026, 9, 25, 9) },
    { id: "a2", role: "assistant", text: "yes", steps: [], status: "completed", at: at(2026, 9, 25, 9) },
    { id: "a3", role: "assistant", text: "and", steps: [], status: "completed", at: new Date(2026, 9, 25, 9, 4).getTime() },
    { id: "u4", role: "user", text: "later", at: new Date(2026, 9, 25, 9, 12).getTime() },
    { id: "u5", role: "user", text: "much later", at: new Date(2026, 9, 25, 12, 30).getTime() },
  ];
  const rows = m.buildRows(turns, NOW).map((r) => (r.kind === "day" ? `[${r.label}]` : r.time ? `${r.turn.id}@${r.time}` : r.turn.id));
  // New day or a 15+ minute gap -> "Today 12:30 PM" style divider; a burst ends with its last time.
  assert.deepStrictEqual(rows, ["u5", "[Today 12:30 PM]", "u4@9:12 AM", "a3@9:04 AM", "a2", "u2", "[Today 9:00 AM]",
    "a1", "[Oct 13, 10:00 AM]", "u1", "[Oct 13, 9:00 AM]", "u0"]);
});

test("routines never show [object Object]: schedule objects, object prompts, nested results", () => {
  const at = new Date(); at.setDate(at.getDate() + 1); at.setHours(8, 0, 0, 0); // 8 AM tomorrow in the runner's own zone
  const real = { id: "abc", name: "Morning brief", prompt: "Summarise my day", schedule: { kind: "cron", expr: "0 8 * * *", display: "0 8 * * *" },
    schedule_display: "0 8 * * *", enabled: true, state: "scheduled", next_run_at: at.toISOString(), last_run_at: null, last_status: null,
    deliver: "origin", repeat: { times: null, completed: 3 } };
  const j = m.toJob(real);
  assert.strictEqual(j.schedule, "0 8 * * *");
  assert.strictEqual(j.prompt, "Summarise my day");
  assert.strictEqual(j.paused, false);
  assert.match(j.nextRun, /8:00 AM/);
  const odd = m.toJob({ job: { id: 7, name: { text: "Weird" }, prompt: { content: [{ type: "text", text: "Check disks" }] },
    schedule: { kind: "interval", minutes: 30 }, last_status: { status: "ok", detail: "fine" }, last_run_at: 1761360000, enabled: false, paused_at: "x" } });
  for (const v of Object.values(odd)) assert.ok(!String(v).includes("[object"), `leaked: ${v}`);
  assert.strictEqual(odd.name, "Weird");
  assert.strictEqual(odd.prompt, "Check disks");
  assert.strictEqual(odd.schedule, "every 30m");
  assert.strictEqual(odd.lastStatus, "ok");
  assert.strictEqual(odd.paused, true);
  // enabled is authoritative: a stale paused_at on an enabled job is not "paused" (cron/jobs.py effective_job_state)
  assert.strictEqual(m.toJob({ id: "x", name: "n", enabled: true, paused_at: "2026-10-01", state: "paused" }).paused, false);
  assert.strictEqual(m.toJob({ id: "s", name: "", prompt: "", skills: ["daily-news"] }).prompt, "Skills: daily-news");
  assert.strictEqual(m.readable({ a: 1, b: "two", c: { d: 1 } }), "a: 1, b: two");
});

test("reconnect state shows while streaming, clears on reconnect or finish", () => {
  let t = m.initialTurn("a");
  t = m.reduce(t, { type: "reconnecting" });
  assert.strictEqual(t.reconnecting, true);
  t = m.reduce(t, { type: "reconnected" });
  assert.strictEqual(t.reconnecting, false);
  t = m.reduce(m.reduce(t, { type: "reconnecting" }), { type: "done", status: "completed" });
  assert.strictEqual(t.reconnecting, false);
  assert.strictEqual(m.reduce(t, { type: "reconnecting" }).reconnecting, false); // not after the end
});

test("/v1/runs events map to the same actions as the session stream", () => {
  const a = (ev, d) => m.toAction(ev, JSON.stringify({ run_id: "r1", ...d })).filter((x) => x.type !== "run");
  assert.deepStrictEqual(a("message.delta", { delta: "Hi" }), [{ type: "delta", text: "Hi" }]);
  assert.deepStrictEqual(a("tool.completed", { tool: "terminal", error: true }), [{ type: "tool", phase: "failed", tool: "terminal", preview: undefined }]);
  assert.deepStrictEqual(a("run.completed", { output: "Done." }), [{ type: "final", text: "Done." }, { type: "done", status: "completed", error: undefined }]);
  assert.strictEqual(a("run.interrupted", {})[0].status, "failed");
  const p = new m.SseParser().push("id: 7\ndata: {\"event\":\"message.delta\"}\n\n: keepalive\n\n");
  assert.deepStrictEqual(p, [{ event: "message", data: "{\"event\":\"message.delta\"}", id: "7" }]);
});

test("a lost reply is recovered from history; retry reuses the key only after a lost connection", () => {
  const h = [{ role: "user", text: "hi" }, { role: "assistant", text: "old" }, { role: "user", text: "status?" }, { role: "assistant", text: "All good" }];
  assert.strictEqual(m.recoverReply(h, "status?"), "All good");
  assert.strictEqual(m.recoverReply(h.slice(0, 3), "status?"), undefined); // not answered yet
  assert.strictEqual(m.recoverReply(h, "never sent"), undefined);
  assert.strictEqual(m.retryReusesKey({ status: "failed", errorCode: "connection_lost" }), true);
  assert.strictEqual(m.retryReusesKey({ status: "failed", errorCode: "interrupted" }), false);
  assert.strictEqual(m.retryReusesKey({ status: "cancelled" }), false);
});

test("live activity line: running tool, thinking summary, approval, fallback; none once text shows", () => {
  const base = { id: "a", role: "assistant", text: "", steps: [], status: "streaming" };
  assert.strictEqual(m.activityLine(base), "Thinking");
  assert.strictEqual(m.activityLine({ ...base, thought: "Checking GitHub for updates. Then summarise." }), "Checking GitHub for updates");
  assert.strictEqual(m.activityLine({ ...base, steps: [{ id: "0", tool: "terminal", status: "running", preview: "git status" }] }), "Running git status");
  assert.strictEqual(m.activityLine({ ...base, steps: [{ id: "0", tool: "read_file", status: "running", preview: "/srv/app/main.py" }] }), "Reading main.py");
  assert.strictEqual(m.activityLine({ ...base, steps: [{ id: "0", tool: "web_search", status: "completed" }] }), "Putting it together");
  assert.strictEqual(m.toolPhrase("mcp_github_list_issues"), "Asking github");
  assert.strictEqual(m.activityLine({ ...base, approval: { requestId: "r", generation: 0, title: "x" } }), "Waiting for your OK");
  assert.strictEqual(m.activityLine({ ...base, text: "Hi" }), null);
  assert.strictEqual(m.activityLine({ ...base, status: "completed" }), null);
});

test("model picker: search filters by id or provider, groups keep provider order", () => {
  const ms = [{ id: "gpt-5.2", provider: "openai", providerName: "OpenAI", label: "" }, { id: "claude-sonnet-5", provider: "anthropic", providerName: "Anthropic", label: "" },
    { id: "gpt-5.2-mini", provider: "openai", providerName: "OpenAI", label: "" }];
  assert.deepStrictEqual(m.groupModels(ms).map((g) => [g.title, g.models.length]), [["OpenAI", 2], ["Anthropic", 1]]);
  assert.deepStrictEqual(m.groupModels(ms, "mini").flatMap((g) => g.models.map((x) => x.id)), ["gpt-5.2-mini"]);
  assert.deepStrictEqual(m.groupModels(ms, "anthropic").map((g) => g.title), ["Anthropic"]);
});

test("notification prefs: quiet hours wrap midnight, mute wins, approvals pierce quiet hours", () => {
  const p = { ...m.DEFAULT_PREFS, quietStart: 22, quietEnd: 7, bots: { b: { muted: true }, c: { replies: false } } };
  const night = new Date(2026, 9, 25, 23, 30), day = new Date(2026, 9, 25, 12, 0);
  assert.ok(m.inQuietHours(p, night) && m.inQuietHours(p, new Date(2026, 9, 26, 6, 59)) && !m.inQuietHours(p, day));
  assert.strictEqual(m.shouldNotify(p, "a", "reply", night), false);
  assert.strictEqual(m.shouldNotify(p, "a", "approval", night), true);
  assert.strictEqual(m.shouldNotify(p, "a", "reply", day), true);
  assert.strictEqual(m.shouldNotify(p, "b", "approval", day), false);
  assert.strictEqual(m.shouldNotify(p, "c", "reply", day), false);
  assert.deepStrictEqual(m.parsePrefs("not json"), m.DEFAULT_PREFS);
  assert.strictEqual(m.parsePrefs('{"appLock":true}').appLock, true);
});

test("activity log and plan come from session tool calls", () => {
  const raw = { data: [
    { role: "user", content: "hi", timestamp: 1761360000 },
    { role: "assistant", content: "", timestamp: 1761360001, tool_calls: [
      { id: "c1", function: { name: "terminal", arguments: '{"command":"git status"}' } },
      { id: "c2", function: { name: "todo", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", tool_name: "terminal", content: '{"error":"boom"}' },
    { role: "tool", tool_call_id: "c2", tool_name: "todo", content: '{"todos":[{"id":"1","content":"Check repo","status":"completed"},{"id":"2","content":"Report","status":"in_progress"}]}' },
  ] };
  const log = m.activityLog(raw);
  assert.deepStrictEqual(log.map((e) => [e.tool, e.summary, !!e.failed]), [["todo", "Planning the next steps", false], ["terminal", "Running git status", true]]);
  assert.strictEqual(log[1].at, 1761360001000);
  assert.deepStrictEqual(m.currentPlan(raw).map((p) => p.status), ["completed", "in_progress"]);
  assert.strictEqual(m.currentPlan({ data: [] }), null);
});

test("history refresh keeps uniquely matched local steps and refuses ambiguous duplicate replies", () => {
  const failure = { id: "local", tool: "terminal", status: "failed" };
  assert.deepStrictEqual(m.withKeptSteps([{ role: "assistant", text: "same", steps: [failure] }], { role: "assistant", text: "same" }, []).steps, [failure]);
  const indexed = [{ id: "history", tool: "search", status: "completed" }];
  assert.deepStrictEqual(m.withKeptSteps([
    { role: "assistant", text: "same", steps: [failure] },
    { role: "assistant", text: "same", steps: [] },
  ], { role: "assistant", text: "same" }, indexed).steps, indexed);
});

test("changed history keeps only unambiguous matching turn IDs and adds new turns", () => {
  const shown = [
    { id: "user-old", role: "user", text: "first" },
    { id: "assistant-old", role: "assistant", text: "reply" },
  ];
  const next = m.loadTurns({ data: [
    { role: "user", content: "first" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "next" },
  ] }, shown).turns;
  assert.ok(next[2].id);
  assert.deepStrictEqual(next.slice(0, 2).map((turn) => turn.id), ["user-old", "assistant-old"]);
  assert.ok(!["user-old", "assistant-old"].includes(next[2].id));
  const duplicate = m.preserveHistoryIds([{ id: "new", role: "assistant", text: "reply" }], [
    { id: "one", role: "assistant", text: "reply" }, { id: "two", role: "assistant", text: "reply" },
  ]);
  assert.equal(duplicate[0].id, "new");
});

test("history refresh skips changed in-flight snapshots and an empty new-chat history resets turns", () => {
  const turns = [{ id: "old", role: "user", text: "old session" }];
  assert.equal(m.historyRefreshCanApply(turns, turns, false), true);
  assert.equal(m.historyRefreshCanApply(turns, [...turns, { id: "live", role: "assistant", text: "running" }], false), false);
  assert.equal(m.historyRefreshCanApply(turns, turns, true), false);
  assert.deepEqual(m.loadTurns({ data: [] }, turns).turns, []);
});

test("unknown history tool results do not attach to another call", () => {
  const steps = m.stepsFromHistory({ data: [
    { role: "assistant", content: "working", tool_calls: [{ id: "known", function: { name: "terminal", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "missing", tool_name: "terminal", content: '{"error":"unmatched"}' },
    { role: "user", content: "next" },
  ] });
  assert.equal(steps[0][0].status, "completed");
  assert.equal(steps[0][0].result, undefined);
});

test("v0.10.1: a failed routine carries its error and Home links straight to it", () => {
  const j = m.toJob({ id: "j1", name: "Brief", prompt: "x", enabled: true, last_status: "error", last_error: "RuntimeError: provider timeout" });
  assert.strictEqual(j.lastError, "RuntimeError: provider timeout");
  assert.ok(m.isFailing(j));
  assert.ok(!m.isFailing({ ...j, paused: true }));
  assert.ok(!m.isFailing(m.toJob({ id: "ok", name: "n", prompt: "x", last_status: "ok" })));
  assert.strictEqual(m.failedRoutinesLink([{ botId: "default", jobId: "j 1" }]), "/routines?bot=default&job=j%201");
  assert.strictEqual(m.failedRoutinesLink([{ botId: "a", jobId: "1" }, { botId: "b", jobId: "2" }]), "/routines?failed=1");
});

test("v0.10.1: Settings explains why notifications can't show", () => {
  assert.ok(m.describeNotifStatus({ permission: "granted", canAskAgain: true, channel: "on" }).ok);
  const blocked = m.describeNotifStatus({ permission: "denied", canAskAgain: false, channel: "on" });
  assert.ok(!blocked.ok && blocked.fixInSettings);
  const chOff = m.describeNotifStatus({ permission: "granted", canAskAgain: true, channel: "off" });
  assert.ok(!chOff.ok && /channel/.test(chOff.text));
  assert.match(m.describeNotifStatus({ permission: "undetermined", canAskAgain: true, channel: "missing" }).text, /allow/);
});

test("v0.10.5: the loading skeleton shows only for a first load with nothing to show, never with messages", () => {
  assert.strictEqual(m.chatBody({ loaded: false, turns: [] }), "skeleton");
  assert.strictEqual(m.chatBody({ loaded: false, turns: [{}] }), "list");             // messages win, even mid-refresh
  assert.strictEqual(m.chatBody({ loaded: false, error: "boom", turns: [] }), "empty"); // error + Retry, not a stuck placeholder
  assert.strictEqual(m.chatBody({ loaded: true, turns: [] }), "empty");
  assert.strictEqual(m.chatBody({ loaded: true, turns: [{}] }), "list");
  assert.strictEqual(m.chatBody({ loaded: false, turns: [] }, true), "setup");
});
