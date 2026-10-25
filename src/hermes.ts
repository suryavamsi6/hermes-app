// Hermes Agent API-server client (Sessions API + Runs approval).
// Shapes checked against hermes-agent gateway/platforms/api_server.py (Oct 2026):
//   POST /api/sessions -> 201 {object:"hermes.session", session:{id,title,...}}; 400 code=invalid_title on a taken title
//   GET  /api/sessions?title=<exact>&include_hidden=true -> {object:"list", data:[session...]}
//   GET  /api/sessions/{id}/messages -> {object:"list", data:[{role,content,...}]}
//   errors -> {error:{message,type,code}} (or {error:"..."} from the /p/<profile>/ prefix check)
// Docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
import { fetch } from "expo/fetch"; // streaming-capable fetch (response.body is a ReadableStream)
import type { HermesConfig } from "./config";
import { SseParser } from "./sse";
import { type TurnAction, toAction } from "./chat-model";

export type OnAction = (a: TurnAction) => void;

/** What the UI needs from a Hermes backend. HermesClient talks HTTP; MockHermesClient (demo) is offline. */
export interface ChatClient {
  capabilities(): Promise<unknown>;
  listSessions(limit?: number): Promise<unknown>;
  createSession(title?: string): Promise<string>;
  messages(sessionId: string): Promise<unknown>;
  /** Sends one turn and streams the reply. `key` makes the send idempotent (reuse it to retry the
   *  same turn without storing the message twice). The handle aborts; `nudge` (if present) tells a
   *  reconnecting stream the app is back in the foreground. */
  streamTurn(sessionId: string, input: string, onAction: OnAction, opts?: { key?: string }): StreamHandle;
  approve(runId: string, requestId: string, executionGeneration: number, choice: "once" | "deny"): Promise<unknown>;
  stop(runId: string): Promise<unknown>;
}

export type StreamHandle = (() => void) & { nudge?: () => void };

export type HermesTarget = HermesConfig & { profile?: string; model?: string; provider?: string };

export { HermesError, toHermesError } from "./errors";
import { followRun, newRunKey } from "./run-stream";
import { HermesError, toHermesError } from "./errors";

/** The id in a create/get-session response ({session:{id}}), tolerant of flatter shapes. */
export const sessionIdOf = (r: any): string | undefined => {
  const id = r?.session?.id ?? r?.id ?? r?.session_id;
  return id == null ? undefined : String(id);
};

export class HermesClient implements ChatClient {
  constructor(private cfg: HermesTarget) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
    // Cloudflare Access is optional (Tailscale Funnel needs only the bearer key):
    // send the service-token headers only when both halves are set.
    if (this.cfg.cfClientId && this.cfg.cfClientSecret) {
      h["CF-Access-Client-Id"] = this.cfg.cfClientId;
      h["CF-Access-Client-Secret"] = this.cfg.cfClientSecret;
    }
    return h;
  }

  url(path: string) {
    const p = this.cfg.profile && this.cfg.profile !== "default" ? `/p/${encodeURIComponent(this.cfg.profile)}` : "";
    return this.cfg.baseUrl.replace(/\/+$/, "") + p + path;
  }

  /** Generic authenticated JSON call, used by LiveBackend for /v1/skills, /api/jobs, etc. */
  call<T = unknown>(path: string, method = "GET", body?: unknown) {
    return this.json<T>(path, { method, body });
  }

  private async json<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(this.url(path), {
      method: init.method ?? "GET",
      headers: this.headers(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    if (!res.ok) throw toHermesError(res.status, path, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Whether /p/<profile>/ is served, independent of the key: the multiplex prefix middleware answers
   *  404 "Unknown or unconfigured profile" before auth runs, so any other status (200, or 401 for a
   *  key that isn't this profile's) means the profile exists. */
  static async profileServed(cfg: HermesConfig, profile: string): Promise<boolean> {
    const c = new HermesClient({ ...cfg, profile });
    const res = await fetch(c.url("/v1/capabilities"), { headers: c.headers() });
    if (res.status === 404) return false;
    if (res.ok || res.status === 401) return true;
    throw toHermesError(res.status, `/p/${profile}/v1/capabilities`, await res.text());
  }

  health() {
    return this.json<{ status: string }>("/health");
  }

  capabilities() {
    return this.json<Record<string, unknown>>("/v1/capabilities");
  }

  listSessions(limit = 30) {
    return this.json<unknown>(`/api/sessions?limit=${limit}`);
  }

  async createSession(title?: string): Promise<string> {
    const r = await this.json<Record<string, any>>("/api/sessions", { method: "POST", body: title ? { title } : {} });
    const id = sessionIdOf(r);
    if (!id) throw new Error("createSession: no id in response " + JSON.stringify(r).slice(0, 200));
    return id;
  }

  /** Exact-title lookup, the same query `hermes peer dm` uses to find a profile's "Bot Chat". */
  async findSessionByTitle(title: string): Promise<string | undefined> {
    const r: any = await this.json(`/api/sessions?title=${encodeURIComponent(title)}&include_hidden=true&limit=5`);
    const rows: any[] = Array.isArray(r?.data) ? r.data : [];
    const hit = rows.find((x) => (x?.title ?? "").trim() === title && !x?.archived) ?? rows.find((x) => (x?.title ?? "").trim() === title);
    return hit?.id == null ? undefined : String(hit.id);
  }

  /** true if the session exists, false on 404. */
  async sessionExists(id: string): Promise<boolean> {
    try { await this.json(`/api/sessions/${encodeURIComponent(id)}`); return true; }
    catch (e) { if (e instanceof HermesError && e.status === 404) return false; throw e; }
  }

  messages(sessionId: string) {
    return this.json<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/messages?inline_images=false`);
  }

  /** Servers seen without /v1/runs (older Hermes): use the session stream for them. */
  private static noRunsApi = new Set<string>();

  /** Sends one turn as a detached /v1/runs run and follows it, reconnecting through drops (see
   *  run-stream.ts for why). Falls back to the session stream on servers without the Runs API. */
  streamTurn(sessionId: string, input: string, onAction: OnAction, opts: { key?: string } = {}): StreamHandle {
    const base = this.cfg.baseUrl;
    if (HermesClient.noRunsApi.has(base)) return this.streamSession(sessionId, input, onAction);
    let legacy: (() => void) | null = null;
    const run = followRun(
      { url: (p) => this.url(p), headers: (e) => this.headers(e), fetch: (u, i) => fetch(u, i) as unknown as Promise<Response> },
      { sessionId, input, key: opts.key ?? newRunKey(), model: this.cfg.model, provider: this.cfg.provider, onAction,
        onNoRunsApi: () => { HermesClient.noRunsApi.add(base); legacy = this.streamSession(sessionId, input, onAction); } });
    const handle: StreamHandle = () => { run(); legacy?.(); };
    handle.nudge = run.nudge;
    return handle;
  }

  /** Legacy: POST /api/sessions/{id}/chat/stream. The reply streams on the request itself, so a
   *  dropped connection interrupts the run server-side. Only used when /v1/runs is missing. */
  streamSession(sessionId: string, input: string, onAction: OnAction): () => void {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(this.url(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`), {
          method: "POST",
          headers: this.headers({ Accept: "text/event-stream" }),
          body: JSON.stringify({ message: input, ...(this.cfg.model ? { model: this.cfg.model } : {}), ...(this.cfg.provider ? { provider: this.cfg.provider } : {}) }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw toHermesError(res.status, "chat/stream", await res.text());
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        const parser = new SseParser();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const ev of parser.push(dec.decode(value, { stream: true }))) toAction(ev.event, ev.data).forEach(onAction);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError")
          onAction({ type: "done", status: "failed", error: e instanceof HermesError ? e.detail : String(e?.message ?? e), code: e instanceof HermesError ? e.code ?? String(e.status) : undefined });
      }
    })();
    return () => ctrl.abort();
  }

  /** Approve/deny a pending tool call (identity comes from GET /v1/runs/{id}.pending_controls). */
  approve(runId: string, requestId: string, executionGeneration: number, choice: "once" | "deny") {
    return this.json(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
      method: "POST",
      body: { request_id: requestId, execution_generation: executionGeneration, choice },
    });
  }

  stop(runId: string) {
    return this.json(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: "POST", body: {} });
  }
}

