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
  ];
  const rows = m.buildRows(turns, NOW).map((r) => (r.kind === "day" ? `[${r.label}]` : r.turn.id));
  assert.deepStrictEqual(rows, ["a2", "u2", "[Today]", "a1", "u1", "[Oct 13]", "u0"]);
});

test("routines never show [object Object]: schedule objects, object prompts, nested results", () => {
  const real = { id: "abc", name: "Morning brief", prompt: "Summarise my day", schedule: { kind: "cron", expr: "0 8 * * *", display: "0 8 * * *" },
    schedule_display: "0 8 * * *", enabled: true, state: "scheduled", next_run_at: "2026-10-26T08:00:00+05:30", last_run_at: null, last_status: null,
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
