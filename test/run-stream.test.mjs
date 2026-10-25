// The resilient send path (src/run-stream.ts) against an in-process fake of Hermes's Runs API that
// follows api_server_runs.py: idempotent POST /v1/runs, seq-numbered SSE events resumable with
// Last-Event-ID, keepalive comments, a status endpoint, and a sweepable event buffer.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 src/run-stream.ts --bundle --format=esm --platform=node --outfile=/tmp/hm-test/run-stream.js --log-level=error");
const { followRun } = await import("/tmp/hm-test/run-stream.js");

const enc = new TextEncoder();
const SCRIPT = [
  { event: "message.delta", delta: "Hel" },
  { event: "tool.started", tool: "terminal", preview: "ls" },
  { event: "tool.completed", tool: "terminal", duration: 0.1, error: false },
  { event: "message.delta", delta: "lo " },
  { event: "message.delta", delta: "there" },
  { event: "run.completed", output: "Hello there", usage: {} },
];

class FakeHermes {
  constructor(opts = {}) {
    Object.assign(this, { tickMs: 5, script: SCRIPT, ...opts });
    this.runs = new Map(); this.keys = new Map(); this.userMessages = 0; this.posts = 0; this.eventRequests = []; this.dropped = 0;
  }
  json(status, body) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
  async fetch(url, init = {}) {
    const u = new URL(url); const method = init.method ?? "GET"; const h = init.headers ?? {};
    if (init.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (method === "POST" && u.pathname === "/v1/runs") {
      this.posts++;
      if (this.noRuns) return new Response("404: Not Found", { status: 404 });
      if (this.post5xx > 0) { this.post5xx--; return this.json(502, { error: "bad gateway" }); }
      const key = h["Idempotency-Key"]; const body = init.body;
      const prior = key && this.keys.get(key);
      if (prior) return prior.body === body ? this.json(202, { run_id: prior.runId, status: "started", replayed: true })
        : this.json(409, { error: { message: "conflict", code: "idempotency_key_conflict" } });
      const runId = `run_${this.runs.size + 1}`;
      this.userMessages++; // the server stores the user's message once per run
      const run = { id: runId, events: [], subs: new Set(), status: "running", output: undefined, swept: false };
      this.runs.set(runId, run);
      if (key) this.keys.set(key, { runId, body });
      this.script.forEach((e, i) => setTimeout(() => this.emit(run, e), this.tickMs * (i + 1)));
      if (this.loseAcceptance > 0) { this.loseAcceptance--; throw new TypeError("Software caused connection abort"); }
      return this.json(202, { run_id: runId, status: "started", replayed: false });
    }
    const m = u.pathname.match(/^\/v1\/runs\/([^/]+)(\/events)?$/);
    if (m) {
      const run = this.runs.get(m[1]);
      if (!run) return this.json(404, { error: { message: "Run not found", code: "run_not_found" } });
      if (!m[2]) return this.json(200, { object: "hermes.run", run_id: run.id, status: run.status, output: run.output });
      const last = Number(h["Last-Event-ID"] ?? -1);
      this.eventRequests.push(last);
      if (run.swept) return this.json(404, { error: { message: "Run not found", code: "run_not_found" } });
      if (this.eventsDown > 0) { this.eventsDown--; throw new TypeError("Network request failed"); }
      if (this.headerDelay) await new Promise((r) => setTimeout(r, this.headerDelay)); // slow first byte through a proxy
      let ctl; let sent = 0;
      const stallAfter = this.stallAfter; this.stallAfter = undefined; // only this connection goes half-open
      const sub = {
        send: (e) => {
          if (stallAfter !== undefined && sent >= stallAfter) return; // half-open socket: nothing arrives
          if (this.dropAfter !== undefined && sent >= this.dropAfter && this.dropped < (this.drops ?? 1)) {
            this.dropped++; run.subs.delete(sub); ctl.error(new TypeError("Software caused connection abort")); return;
          }
          sent++;
          ctl.enqueue(enc.encode(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`));
          if (/^run\.(completed|failed|cancelled)$/.test(e.event)) { run.subs.delete(sub); ctl.enqueue(enc.encode(": stream closed\n\n")); ctl.close(); }
        },
      };
      const body = new ReadableStream({ start: (c) => { ctl = c; c.enqueue(enc.encode(": open\n\n")); } });
      init.signal?.addEventListener("abort", () => { run.subs.delete(sub); try { ctl.error(Object.assign(new Error("aborted"), { name: "AbortError" })); } catch {} });
      queueMicrotask(() => { for (const e of run.events) if (e.seq > last) sub.send(e); if (run.status === "running") run.subs.add(sub); });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return this.json(404, {});
  }
  emit(run, e) {
    const ev = { ...e, run_id: run.id, seq: run.events.length, timestamp: Date.now() / 1000 };
    run.events.push(ev);
    if (e.event === "run.completed") { run.status = "completed"; run.output = e.output; }
    for (const s of [...run.subs]) s.send(ev);
  }
}

function send(server, extra = {}) {
  const actions = [];
  return new Promise((resolve) => {
    const handle = followRun(
      { url: (p) => `http://hermes.test${p}`, headers: (x = {}) => ({ Authorization: "Bearer k", ...x }), fetch: (u, i) => server.fetch(u, i) },
      { sessionId: "s1", input: "hi", key: "turn-1", backoff: [5, 5, 5, 5], stallMs: 60, pollMs: 10, reconnectDelayMs: 0, ...extra,
        onNoRunsApi: () => resolve({ actions, noRuns: true, handle }),
        onAction: (a) => { actions.push(a); if (a.type === "done") setTimeout(() => resolve({ actions, handle }), 20); } });
    extra.onHandle?.(handle);
  });
}
const textOf = (actions) => {
  let t = ""; for (const a of actions) { if (a.type === "delta") t += a.text; if (a.type === "final") t = a.text; } return t;
};
const done = (actions) => actions.filter((a) => a.type === "done");

test("a normal run streams deltas, tool steps and the final output", async () => {
  const hermes = new FakeHermes();
  const { actions } = await send(hermes);
  assert.strictEqual(textOf(actions), "Hello there");
  assert.deepStrictEqual(done(actions).map((a) => a.status), ["completed"]);
  assert.ok(actions.some((a) => a.type === "run" && a.runId === "run_1"));
  assert.deepStrictEqual(actions.filter((a) => a.type === "tool").map((a) => a.phase), ["started", "completed"]);
  assert.ok(!actions.some((a) => a.type === "reconnecting"));
  assert.strictEqual(hermes.userMessages, 1);
});

test("a dropped stream ('Software caused connection abort') resumes from Last-Event-ID without repeating text", async () => {
  const hermes = new FakeHermes({ dropAfter: 2 });
  const { actions } = await send(hermes);
  const deltas = actions.filter((a) => a.type === "delta").map((a) => a.text).join("");
  assert.strictEqual(deltas, "Hello there"); // no duplicated "Hel"
  assert.strictEqual(textOf(actions), "Hello there");
  assert.deepStrictEqual(done(actions).map((a) => a.status), ["completed"]);
  assert.ok(actions.some((a) => a.type === "reconnecting"));
  assert.ok(actions.some((a) => a.type === "reconnected"));
  assert.deepStrictEqual(hermes.eventRequests.slice(0, 2), [-1, 1]); // resumed after seq 1
  assert.strictEqual(hermes.userMessages, 1);
});

test("several drops in a row still finish the turn", async () => {
  const hermes = new FakeHermes({ dropAfter: 1, drops: 3, eventsDown: 1 });
  const { actions } = await send(hermes);
  assert.strictEqual(textOf(actions), "Hello there");
  assert.deepStrictEqual(done(actions).map((a) => a.status), ["completed"]);
});

test("a lost POST acceptance is retried with the same Idempotency-Key: one run, one user message", async () => {
  const hermes = new FakeHermes({ loseAcceptance: 1, post5xx: 1 });
  const { actions } = await send(hermes);
  assert.strictEqual(hermes.posts, 3);
  assert.strictEqual(hermes.runs.size, 1);
  assert.strictEqual(hermes.userMessages, 1);
  assert.strictEqual(textOf(actions), "Hello there");
});

test("retrying a failed turn with the same key replays the run instead of storing the message again", async () => {
  const hermes = new FakeHermes();
  await send(hermes);
  const { actions } = await send(hermes); // e.g. the user pressed Retry after the app gave up
  assert.strictEqual(hermes.userMessages, 1);
  assert.strictEqual(textOf(actions), "Hello there");
});

test("a half-open socket (no bytes, no keepalive) is detected by the watchdog and re-attached", async () => {
  const hermes = new FakeHermes({ stallAfter: 1 });
  const { actions } = await send(hermes);
  assert.strictEqual(textOf(actions), "Hello there");
  assert.ok(hermes.eventRequests.length >= 2);
});

test("when the event buffer was swept, the run status supplies the final answer", async () => {
  const hermes = new FakeHermes({ dropAfter: 1 });
  const orig = hermes.emit.bind(hermes);
  hermes.emit = (run, e) => { orig(run, e); if (hermes.dropped) run.swept = true; };
  const { actions } = await send(hermes);
  assert.strictEqual(textOf(actions), "Hello there");
  assert.deepStrictEqual(done(actions).map((a) => a.status), ["completed"]);
});

test("if Hermes stays unreachable, the turn fails with connection_lost after the retry budget", async () => {
  const hermes = new FakeHermes();
  hermes.fetch = async () => { throw new TypeError("Network request failed"); };
  const { actions } = await send(hermes);
  const [d] = done(actions);
  assert.strictEqual(d.status, "failed");
  assert.strictEqual(d.code, "connection_lost");
});

test("an older Hermes without /v1/runs triggers the session-stream fallback", async () => {
  const { noRuns } = await send(new FakeHermes({ noRuns: true }));
  assert.strictEqual(noRuns, true);
});

test("abort stops following and emits nothing more", async () => {
  const hermes = new FakeHermes({ tickMs: 20 });
  const actions = [];
  const handle = followRun(
    { url: (p) => `http://hermes.test${p}`, headers: (x = {}) => x, fetch: (u, i) => hermes.fetch(u, i) },
    { sessionId: "s1", input: "hi", key: "k", backoff: [5], onNoRunsApi() {}, onAction: (a) => actions.push(a) });
  await new Promise((r) => setTimeout(r, 30));
  handle();
  const n = actions.length;
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(actions.length, n);
  assert.ok(!actions.some((a) => a.type === "done"));
});

test("nudge skips the reconnect wait when the app returns to the foreground", async () => {
  const hermes = new FakeHermes({ dropAfter: 1 });
  let handle;
  const started = Date.now();
  const p = send(hermes, { backoff: [5000], onHandle: (h) => { handle = h; } });
  setTimeout(() => handle.nudge(), 60);
  const { actions } = await p;
  assert.strictEqual(textOf(actions), "Hello there");
  assert.ok(Date.now() - started < 2000, "waited for the backoff instead of the nudge");
});

test("a short drop never shows Reconnecting (debounced), and nothing shows while the app is in the background", async () => {
  const quick = await send(new FakeHermes({ dropAfter: 2 }), { reconnectDelayMs: 2000 });
  assert.strictEqual(textOf(quick.actions), "Hello there");
  assert.ok(!quick.actions.some((a) => a.type === "reconnecting" || a.type === "reconnected"));
  let handle;
  const bg = await send(new FakeHermes({ dropAfter: 2 }), { reconnectDelayMs: 0, onHandle: (h) => { handle = h; h.quiet(true); } });
  assert.ok(handle && !bg.actions.some((a) => a.type === "reconnecting"));
  assert.deepStrictEqual(done(bg.actions).map((a) => a.status), ["completed"]);
});

test("v0.10.2: home screen and back never shows Reconnecting when Hermes is reachable", async () => {
  // Fake AppState: the app goes to the background mid-reply, Android cuts the socket and blocks the
  // network for a few retries, then the app comes back. The events stream is slow to answer (a proxy
  // holding headers until the next keepalive), longer than the Reconnecting threshold.
  const hermes = new FakeHermes({ tickMs: 40, dropAfter: 1 });
  let handle;
  const p = send(hermes, { backoff: Array(40).fill(10), reconnectDelayMs: 60, onHandle: (h) => { handle = h; } });
  await new Promise((r) => setTimeout(r, 30));
  handle.quiet(true);                       // AppState -> background
  hermes.eventsDown = 20;                   // network blocked while in the background
  await new Promise((r) => setTimeout(r, 120));
  hermes.eventsDown = 0; hermes.headerDelay = 150;
  handle.quiet(false); handle.nudge();      // AppState -> active
  const { actions } = await p;
  assert.strictEqual(textOf(actions), "Hello there");
  assert.deepStrictEqual(done(actions).map((a) => a.status), ["completed"]);
  assert.ok(!actions.some((a) => a.type === "reconnecting"), "showed Reconnecting after returning to the app");
});

test("v0.10.2: a run that finished while the app was away completes straight from its status on return", async () => {
  const hermes = new FakeHermes({ tickMs: 5, stallAfter: 1 });
  let handle;
  const p = send(hermes, { stallMs: 100000, reconnectDelayMs: 30, onHandle: (h) => { handle = h; } });
  await new Promise((r) => setTimeout(r, 15)); handle.quiet(true);
  await new Promise((r) => setTimeout(r, 80)); // the run completes on the server meanwhile
  hermes.headerDelay = 500;                    // the events stream would be slow; status is quick
  const started = Date.now();
  handle.quiet(false); handle.nudge();
  const { actions } = await p;
  assert.strictEqual(textOf(actions), "Hello there");
  assert.ok(Date.now() - started < 400, "waited on the slow stream instead of the run status");
  assert.ok(!actions.some((a) => a.type === "reconnecting"));
});
