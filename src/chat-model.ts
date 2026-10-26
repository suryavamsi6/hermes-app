// Local Hermes chat types + a pure reducer for one streamed assistant turn (unit-tested).
export type Step = { id: string; tool: string; status: "running" | "completed" | "failed"; preview?: string; result?: string };
/** Hermes /v1/runs/{id}/approval choices ("session"/"always" are refused in shared rooms). */
export type ApprovalChoice = "once" | "session" | "always" | "deny";
export type Approval = { runId?: string; requestId: string; generation: number; title: string; detail?: string };
// "queued": the profile's Bot Chat is busy in another client; the reply lands in the history later.
export type TurnStatus = "streaming" | "completed" | "failed" | "cancelled" | "queued";
export type AssistantTurn = {
  id: string; role: "assistant"; text: string; steps: Step[]; status: TurnStatus;
  runId?: string; approval?: Approval; error?: string; errorCode?: string;
  at?: number;
  thought?: string;
  reconnecting?: boolean;
  key?: string;
  prompt?: string;
  attachments?: string[];
  raw?: string;
  steers?: string[];
  local?: boolean;
  pendingSteer?: string;
  /** Mid-turn commentary sealed into its own bubble (Telegram sends these immediately). */
  note?: boolean;
};
export type UserTurn = { id: string; role: "user"; text: string; at?: number; images?: string[]; imageCount?: number; files?: string[]; notice?: { title: string; body: string }; raw?: string; local?: boolean };
export type Turn = UserTurn | AssistantTurn;

export type TurnAction =
  | { type: "delta"; text: string }
  | { type: "final"; text: string }
  | { type: "interim"; text: string; alreadyStreamed: boolean }
  | { type: "tool"; phase: "started" | "completed" | "failed"; tool: string; preview?: string }
  | { type: "approval"; approval: Approval }
  | { type: "run"; runId: string }
  | { type: "thought"; text: string }
  | { type: "reconnecting" } | { type: "reconnected" }
  | { type: "done"; status: Exclude<TurnStatus, "streaming">; error?: string; code?: string; pendingSteer?: string };

export const initialTurn = (id: string): AssistantTurn => ({ id, role: "assistant", text: "", steps: [], status: "streaming" });

export function reduce(t: AssistantTurn, a: TurnAction): AssistantTurn {
  switch (a.type) {
    case "delta": return { ...t, text: t.text + a.text };
    case "final": return a.text ? { ...t, text: a.text } : t;
    case "thought": return a.text.trim() ? { ...t, thought: a.text.trim() } : t;
    case "run": return t.runId ? t : { ...t, runId: a.runId };
    case "reconnecting": return t.status === "streaming" && !t.reconnecting ? { ...t, reconnecting: true } : t;
    case "reconnected": return t.reconnecting ? { ...t, reconnecting: false } : t;
    case "approval": return { ...t, approval: { ...a.approval, runId: a.approval.runId ?? t.runId } };
    case "tool": {
      if (a.phase === "started") return { ...t, steps: [...t.steps, { id: `${t.steps.length}`, tool: a.tool, status: "running", preview: a.preview }] };
      const phase: "completed" | "failed" = a.phase;
      const idx = [...t.steps].reverse().findIndex((s) => s.tool === a.tool && s.status === "running");
      if (idx === -1) return { ...t, steps: [...t.steps, { id: `${t.steps.length}`, tool: a.tool, status: phase, result: a.preview }] };
      const real = t.steps.length - 1 - idx;
      return { ...t, steps: t.steps.map((s, i) => (i === real ? { ...s, status: phase, result: a.preview } : s)), approval: undefined };
    }
    case "interim": return t;
    case "done":
      if (t.status !== "streaming") return t;
      return { ...t, status: a.status, error: a.error, errorCode: a.code, approval: undefined, reconnecting: false, ...(a.pendingSteer ? { pendingSteer: a.pendingSteer } : {}), ...(t.text.trim() ? {} : { note: true }), steps: t.steps.map((s) => (s.status === "running" ? { ...s, status: a.status === "completed" ? "completed" : "failed" } : s)) };
  }
}

/** A message.interim seals the open reply as its own bubble and opens a fresh one, so a mid-turn note shows immediately. */
export function applyStream(turns: Turn[], anchorId: string, actions: TurnAction[], freshId: () => string, at = Date.now()): Turn[] {
  const anchor = turns.findIndex((t) => t.id === anchorId && t.role === "assistant");
  if (anchor === -1) return turns;
  let end = anchor;
  while (end + 1 < turns.length && turns[end + 1].role === "assistant" && (turns[end + 1] as AssistantTurn).status === "streaming") end++;
  const head = turns.slice(0, anchor), tail = turns.slice(end + 1);
  const out = turns.slice(anchor, end + 1) as AssistantTurn[];
  let open = out.length - 1;
  const seal = (i: number, text: string): AssistantTurn => ({ ...out[i], ...(text ? { text } : {}), status: "completed", note: true, thought: undefined, reconnecting: false });
  for (const a of actions) {
    if (a.type !== "interim") { out[open] = reduce(out[open], a); continue; }
    const cur = out[open];
    const prev = open > 0 ? out[open - 1] : undefined;
    if (prev?.note && prev.text.trim() === a.text) continue;
    const shown = cur.text.trim();
    const same = shown === a.text || (a.alreadyStreamed && (shown === a.text || shown.endsWith(a.text)));
    out[open] = { ...seal(open, shown ? "" : a.text), text: shown || a.text };
    if (shown && !same) { out.push({ ...initialTurn(freshId()), at, text: a.alreadyStreamed ? "" : a.text, prompt: cur.prompt, key: cur.key, runId: cur.runId }); open = out.length - 1; }
    out.push({ ...initialTurn(freshId()), at, prompt: cur.prompt, key: cur.key, runId: cur.runId });
    open = out.length - 1;
  }
  return [...head, ...out, ...tail];
}

export function toAction(event: string, raw: string): TurnAction[] {
  let d: any = raw;
  try { d = JSON.parse(raw); } catch {}
  const s = (...k: string[]) => k.map((x) => d?.[x]).find((v) => typeof v === "string") as string | undefined;
  const out: TurnAction[] = [];
  const runId = s("run_id", "runId");
  if (runId) out.push({ type: "run", runId });
  if (event === "assistant.delta" || event === "message.delta") out.push({ type: "delta", text: s("delta", "text", "content") ?? (typeof d === "string" ? d : "") });
  else if (event === "message.interim") { const text = (s("text", "content") ?? "").trim(); if (text) out.push({ type: "interim", text, alreadyStreamed: d?.already_streamed === true }); }
  else if (event === "reasoning.available") out.push({ type: "thought", text: s("text", "content") ?? "" });
  else if (event === "assistant.completed") out.push({ type: "final", text: s("content") ?? "" });
  else if (/^tool\.(started|completed|failed)$/.test(event)) out.push({ type: "tool", phase: event === "tool.completed" && d?.error === true ? "failed" : event.slice(5) as any, tool: s("tool_name", "tool", "name") ?? "tool", preview: s("preview") });
  else if (event.startsWith("approval.request")) { const requestId = s("request_id", "prompt_id", "id"); if (requestId) out.push({ type: "approval", approval: { runId, requestId, generation: Number(d?.execution_generation ?? 0), title: s("title", "tool", "kind") ?? "Approval needed", detail: s("command", "description", "preview", "reason") } }); }
  else if (/^run\.(completed|failed|cancelled)$/.test(event)) { if (event === "run.completed" && s("output")) out.push({ type: "final", text: s("output")! }); out.push({ type: "done", status: event.slice(4) as any, error: s("error", "turn_exit_reason"), ...(s("pending_steer") ? { pendingSteer: s("pending_steer") } : {}) }); }
  else if (event === "run.interrupted") out.push({ type: "done", status: "failed", error: s("error", "reason") ?? "the run was interrupted", code: "interrupted" });
  else if (event === "run.queued") out.push({ type: "done", status: "queued" });
  else if (event === "error") out.push({ type: "done", status: "failed", error: s("message", "error") ?? "the run failed", code: s("code") });
  return out;
}

export type HistoryMessage = { role: "user" | "assistant"; text: string; at?: number; images?: number };
export function parseMessages(r: any): HistoryMessage[] {
  const list: any[] = Array.isArray(r) ? r : r?.messages ?? r?.data ?? [];
  return list.filter((m) => (m.role === "user" || m.role === "assistant") && m.content).map((m) => {
    const parts: any[] = typeof m.content === "string" ? [] : Array.isArray(m.content) ? m.content : [];
    const images = parts.filter((p) => p && (p.type === "image_url" || p.type === "input_image" || p.type === "image")).length;
    const text = typeof m.content === "string" ? m.content : parts.map((p) => p?.text ?? "").join("");
    return { role: m.role, text, at: toMs(m.timestamp ?? m.created_at), ...(images ? { images } : {}) };
  }).filter((m) => m.text.trim() || m.images);
}
function toMs(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") { const n = Number(v); if (isFinite(n) && v.trim()) return toMs(n); const d = Date.parse(v); return isNaN(d) ? undefined : d; }
  return undefined;
}
export function recoverReply(history: { role: "user" | "assistant"; text: string }[], prompt: string): string | undefined {
  let i = -1;
  for (let k = history.length - 1; k >= 0; k--) if (history[k].role === "user" && history[k].text.trim() === prompt.trim()) { i = k; break; }
  if (i === -1) return undefined;
  let reply: string | undefined;
  for (let k = i + 1; k < history.length && history[k].role === "assistant"; k++) reply = history[k].text;
  return reply;
}
export const retryReusesKey = (t: Pick<AssistantTurn, "status" | "errorCode">) => t.status === "failed" && t.errorCode === "connection_lost";
