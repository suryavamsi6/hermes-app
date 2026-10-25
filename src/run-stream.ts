// Sends one chat turn through Hermes's Runs API and follows it to the end, surviving dropped
// connections. Why this exists ("Software caused connection abort"): the old path streamed the reply on
// the same request that started it (POST /api/sessions/{id}/chat/stream), and when Android tore that
// socket down (app backgrounded, Samsung sleep, Wi-Fi <-> mobile) Hermes treated it as the client leaving
// and interrupted the run, so the reply was lost and the app showed a red error. A /v1/runs run is
// detached from HTTP: it keeps going server-side, its events are buffered with sequence numbers, and
// GET /v1/runs/{id}/events resumes from Last-Event-ID. So a drop only costs a quiet reconnect.
//
//   1. POST /v1/runs with an Idempotency-Key. Retried on network/5xx errors with the SAME key and body,
//      which Hermes answers with the same run (replayed: true), so the user message is stored once.
//   2. Follow GET /v1/runs/{id}/events, de-duplicating by seq. Hermes sends ": keepalive" every 10 s, so
//      no bytes for `stallMs` means a half-open socket: drop it and reconnect.
//   3. If the event buffer is gone (swept after 5 min with no listener, or the server restarted), poll
//      GET /v1/runs/{id} for the final output instead.
// Only when all of that fails does the turn end as failed, with code "connection_lost".
import { toAction, type TurnAction } from "./chat-model";
import { HermesError, toHermesError } from "./errors";
import { SseParser } from "./sse";

export type RunTarget = {
  url: (path: string) => string;
  headers: (extra?: Record<string, string>) => Record<string, string>;
  fetch: (url: string, init: any) => Promise<Response>;
};
/** One part of a multimodal message, in the canonical shape Hermes's API server accepts
 *  (gateway/platforms/api_server.py _normalize_multimodal_content): text, or an image as a data: URL. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
/** A turn's input: plain text, or text plus images. */
export type TurnInput = string | ContentPart[];
export const inputText = (i: TurnInput) => (typeof i === "string" ? i : i.map((p) => (p.type === "text" ? p.text : "")).join("\n").trim());

export type RunOptions = {
  sessionId: string; input: TurnInput; model?: string; provider?: string;
  /** Idempotency-Key (1-255 visible ASCII). Reuse it to resume the same turn after a failure. */
  key: string;
  onAction: (a: TurnAction) => void;
  /** The server has no /v1/runs (older Hermes): the caller falls back to the session stream. */
  onNoRunsApi: () => void;
  /** Waits between reconnect attempts; their count is the retry budget per phase (~90 s by default). */
  backoff?: number[];
  stallMs?: number;
  pollMs?: number;
  /** Give up polling a run that is still going after this long (it may be waiting on something). */
  pollMaxMs?: number;
  /** Only report "reconnecting" once a connection problem has lasted this long (default 3 s), so a
   *  short blip, or the socket Android drops when the app goes to the background, stays invisible. */
  reconnectDelayMs?: number;
};
/** Call to abort. nudge(): back in the foreground. quiet(on): the app is in the background, so
 *  connection trouble is expected and never shown as "Reconnecting". */
export type RunHandle = (() => void) & { nudge: () => void; quiet: (on: boolean) => void };

const TERMINAL = new Set(["completed", "failed", "cancelled", "interrupted"]);
const DEFAULT_BACKOFF = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000];

class Retryable extends Error {}
class NoRunsApi extends Error {}

/** True for errors worth retrying: no response at all, or a gateway hiccup. */
const transientStatus = (s: number) => s === 408 || s === 425 || s === 429 || s >= 500;

export function newRunKey(): string {
  return `hm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function followRun(t: RunTarget, o: RunOptions): RunHandle {
  const backoff = o.backoff ?? DEFAULT_BACKOFF;
  const stallMs = o.stallMs ?? 25000;
  const pollMs = o.pollMs ?? 3000;
  const pollMaxMs = o.pollMaxMs ?? 30 * 60 * 1000;
  const outer = new AbortController();
  let inner: AbortController | null = null;
  let lastByte = Date.now();
  let wake: (() => void) | null = null;

  const sleep = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); outer.signal.removeEventListener("abort", done); wake = null; resolve(); };
    const timer = setTimeout(done, ms);
    wake = done;
    outer.signal.addEventListener("abort", done);
  });

  // Nothing is reported after the turn's terminal action (a resume-time status check can finish the
  // turn while a stream is still winding down).
  let ended = false;
  const emit = (a: TurnAction) => { if (ended) return; if (a.type === "done") ended = true; o.onAction(a); };
  let currentRun: string | undefined;
  let nudging = false;

  // "Reconnecting" is debounced: trouble must persist reconnectDelayMs (and the app must be in the
  // foreground) before the turn shows it; recovering earlier shows nothing at all.
  const reconnectDelayMs = o.reconnectDelayMs ?? 3000;
  let shown = false, troubled = false, background = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  const show = () => { showTimer = undefined; if (troubled && !background && !shown && !outer.signal.aborted) { shown = true; emit({ type: "reconnecting" }); } };
  const setReconnecting = (on: boolean) => {
    if (on) {
      if (troubled) return;
      troubled = true;
      if (reconnectDelayMs <= 0) show(); else showTimer = setTimeout(show, reconnectDelayMs);
      return;
    }
    troubled = false;
    clearTimeout(showTimer); showTimer = undefined;
    if (shown) { shown = false; emit({ type: "reconnected" }); }
  };

  async function admit(): Promise<string> {
    // Multimodal input goes as a one-message list; /v1/runs takes the last message's content as the turn.
    const input = typeof o.input === "string" ? o.input : [{ role: "user", content: o.input }];
    const body = JSON.stringify({ input, session_id: o.sessionId,
      ...(o.model ? { model: o.model } : {}), ...(o.provider ? { provider: o.provider } : {}) });
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await t.fetch(t.url("/v1/runs"), { method: "POST", body, signal: outer.signal,
          headers: t.headers({ "Content-Type": "application/json", "Idempotency-Key": o.key }) });
        const text = await res.text();
        if (res.status === 404 || res.status === 405) {
          // A real 404 from an old server has no Hermes error body; a profile miss is a real error.
          if (!/unconfigured profile|run_not_found/i.test(text)) throw new NoRunsApi();
        }
        if (transientStatus(res.status)) throw new Retryable(`HTTP ${res.status}`);
        if (!res.ok) throw toHermesError(res.status, "/v1/runs", text);
        const runId = JSON.parse(text)?.run_id;
        if (typeof runId !== "string") throw new HermesError(res.status, "/v1/runs", undefined, "no run_id in response");
        return runId;
      } catch (e) {
        if (outer.signal.aborted || e instanceof HermesError || e instanceof NoRunsApi) throw e;
        if (attempt >= backoff.length) throw e;
        setReconnecting(true);
        await sleep(backoff[attempt]);
        if (outer.signal.aborted) throw e;
      }
    }
  }

  /** Follows the event stream. Returns true when a terminal event arrived, false when the buffer is
   *  gone or the retry budget ran out (the caller then polls the run status). */
  async function follow(runId: string): Promise<boolean> {
    let lastSeq = -1;
    let failures = 0;
    let emptyCloses = 0;
    while (!outer.signal.aborted) {
      const ctl = new AbortController();
      inner = ctl;
      const onOuter = () => ctl.abort();
      outer.signal.addEventListener("abort", onOuter);
      let stall: ReturnType<typeof setTimeout> | undefined;
      const arm = () => { lastByte = Date.now(); clearTimeout(stall); stall = setTimeout(() => ctl.abort(), stallMs); };
      let gotEvent = false;
      try {
        arm();
        const res = await t.fetch(t.url(`/v1/runs/${encodeURIComponent(runId)}/events`), { signal: ctl.signal,
          headers: t.headers({ Accept: "text/event-stream", ...(lastSeq >= 0 ? { "Last-Event-ID": String(lastSeq) } : {}) }) });
        if (res.status === 404) return false;
        if (transientStatus(res.status) || !res.body) throw new Retryable(`HTTP ${res.status}`);
        if (!res.ok) throw toHermesError(res.status, "/v1/runs/events", await res.text());
        setReconnecting(false);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
            let d: any;
            try { d = JSON.parse(ev.data); } catch { continue; }
            const seq = Number(d?.seq ?? ev.id);
            if (Number.isFinite(seq)) { if (seq <= lastSeq) continue; lastSeq = seq; }
            gotEvent = true;
            const name = typeof d?.event === "string" ? d.event : ev.event;
            if (name === "run.queued") continue; // waiting in the session's queue; the run continues
            for (const a of toAction(name, ev.data)) {
              emit(a);
              if (a.type === "done") return true;
            }
          }
        }
        // Closed without a terminal event: a server-side close (shutdown, overflow). Reconnect; if it
        // keeps closing with nothing new, stop and poll the status instead.
        if (gotEvent) { emptyCloses = 0; failures = 0; } else if (++emptyCloses >= 2) return false;
        throw new Retryable("stream closed");
      } catch (e) {
        if (outer.signal.aborted) return true;
        if (e instanceof HermesError) throw e;
        if (gotEvent) failures = 0;
        // Dropped on purpose by nudge() (a socket that died while the phone slept): reconnect now,
        // it isn't a network failure.
        if (nudging) { nudging = false; continue; }
        // In the background Android blocks the network; waiting there mustn't use up the retry budget.
        if (background) { setReconnecting(true); await sleep(backoff[Math.min(failures, backoff.length - 1)]); continue; }
        if (failures >= backoff.length) return false;
        setReconnecting(true);
        await sleep(backoff[failures++]);
      } finally {
        clearTimeout(stall);
        outer.signal.removeEventListener("abort", onOuter);
        if (inner === ctl) inner = null;
      }
    }
    return true;
  }

  async function poll(runId: string): Promise<void> {
    const started = Date.now();
    let failures = 0;
    let approvalShown = "";
    while (!outer.signal.aborted) {
      try {
        const res = await t.fetch(t.url(`/v1/runs/${encodeURIComponent(runId)}`), { signal: outer.signal, headers: t.headers() });
        const text = await res.text();
        if (res.status === 404) {
          emit({ type: "done", status: "failed", code: "run_unknown", error: "Hermes no longer knows this run" });
          return;
        }
        if (transientStatus(res.status)) throw new Retryable(`HTTP ${res.status}`);
        if (!res.ok) throw toHermesError(res.status, "/v1/runs/{id}", text);
        failures = 0;
        setReconnecting(false);
        const st = JSON.parse(text);
        const status = String(st?.status ?? "");
        if (status === "waiting_for_approval" && st.approval && typeof st.approval === "object") {
          const raw = JSON.stringify({ run_id: runId, ...st.approval });
          if (raw !== approvalShown) { approvalShown = raw; toAction("approval.request", raw).forEach(o.onAction); }
        }
        if (TERMINAL.has(status)) {
          if (status === "completed") {
            if (typeof st.output === "string" && st.output) emit({ type: "final", text: st.output });
            emit({ type: "done", status: "completed" });
          } else if (status === "cancelled") emit({ type: "done", status: "cancelled" });
          else emit({ type: "done", status: "failed", error: typeof st.error === "string" ? st.error : `the run ${status}`, code: status === "interrupted" ? "interrupted" : undefined });
          return;
        }
        if (Date.now() - started > pollMaxMs) {
          emit({ type: "done", status: "failed", code: "connection_lost", error: "Hermes is still working on this; check back later" });
          return;
        }
        await sleep(pollMs);
      } catch (e) {
        if (outer.signal.aborted) return;
        if (e instanceof HermesError) throw e;
        if (background) { setReconnecting(true); await sleep(backoff[Math.min(failures, backoff.length - 1)]); continue; }
        if (failures >= backoff.length) throw e;
        setReconnecting(true);
        await sleep(backoff[failures++]);
      }
    }
  }

  /** Back in the foreground: one quick status check, independent of the (possibly slow) stream.
   *  Reaching Hermes clears any connection trouble; a run that finished while away ends right here. */
  async function probe(runId: string) {
    const ctl = new AbortController();
    const onOuter = () => ctl.abort();
    outer.signal.addEventListener("abort", onOuter);
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await t.fetch(t.url(`/v1/runs/${encodeURIComponent(runId)}`), { signal: ctl.signal, headers: t.headers() });
      if (!res.ok) return;
      const st = JSON.parse(await res.text());
      if (outer.signal.aborted || ended) return;
      setReconnecting(false);
      const status = String(st?.status ?? "");
      if (status === "completed" && typeof st.output === "string" && st.output) {
        emit({ type: "final", text: st.output }); emit({ type: "done", status: "completed" }); outer.abort(); wake?.();
      } else if (status === "cancelled") { emit({ type: "done", status: "cancelled" }); outer.abort(); wake?.(); }
      else if (status === "failed" || status === "interrupted") {
        emit({ type: "done", status: "failed", error: typeof st.error === "string" ? st.error : `the run ${status}`, code: status === "interrupted" ? "interrupted" : undefined });
        outer.abort(); wake?.();
      }
    } catch {} finally { clearTimeout(timer); outer.signal.removeEventListener("abort", onOuter); }
  }

  (async () => {
    const runId = await admit();
    if (outer.signal.aborted) return;
    currentRun = runId;
    emit({ type: "run", runId });
    if (await follow(runId)) return;
    if (outer.signal.aborted) return;
    await poll(runId);
  })().catch((e) => {
    if (outer.signal.aborted) return;
    if (e instanceof NoRunsApi) return o.onNoRunsApi();
    if (e instanceof HermesError) return emit({ type: "done", status: "failed", error: e.detail, code: e.code ?? String(e.status) });
    emit({ type: "done", status: "failed", code: "connection_lost", error: `Couldn't reach Hermes (${e?.message ?? e})` });
  });

  const abort = (() => { clearTimeout(showTimer); ended = true; outer.abort(); wake?.(); }) as RunHandle;
  abort.quiet = (on: boolean) => {
    background = on;
    if (on) { clearTimeout(showTimer); showTimer = undefined; if (shown) { shown = false; emit({ type: "reconnected" }); } }
    else if (troubled && !shown && !showTimer) showTimer = setTimeout(show, reconnectDelayMs);
  };
  /** App came back to the foreground: skip any backoff wait, and drop a stream that has gone quiet
   *  (Hermes sends a keepalive every 10 s, so 12 s of silence means the socket died while asleep). */
  abort.nudge = () => {
    if (outer.signal.aborted || ended) return;
    if (inner && Date.now() - lastByte > 12000) { nudging = true; inner.abort(); }
    wake?.();
    if (currentRun) void probe(currentRun);
  };
  return abort;
}
