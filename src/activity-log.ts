// A bot's activity timeline and current plan, read from its session messages (GET
// /api/sessions/{id}/messages keeps assistant tool_calls and role:"tool" results). Pure, unit-tested.
import { toolPhrase } from "./ui/activity";

export type LogEntry = { id: string; at?: number; tool: string; summary: string; failed?: boolean };
export type PlanItem = { id: string; content: string; status: "pending" | "in_progress" | "completed" | "cancelled" };

const ms = (v: unknown) => (typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : typeof v === "string" && !isNaN(Date.parse(v)) ? Date.parse(v) : undefined);
const rows = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? r?.messages ?? []);
function argsOf(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try { const v = JSON.parse(String(raw ?? "")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
/** The most telling argument of a call: a command, query, path or URL. */
function preview(a: Record<string, unknown>): string | undefined {
  for (const k of ["command", "query", "path", "file_path", "url", "name", "goal", "prompt"]) if (typeof a[k] === "string" && a[k]) return a[k] as string;
  return undefined;
}

/** Newest first. Results marked as errors (content starting with an error JSON) flag their call as failed. */
export function activityLog(raw: unknown, limit = 200): LogEntry[] {
  const out: LogEntry[] = [];
  const byCall = new Map<string, LogEntry>();
  for (const m of rows(raw)) {
    if (m?.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) {
        const name = String(c?.function?.name ?? c?.name ?? "tool");
        const e: LogEntry = { id: String(c?.id ?? `${out.length}`), at: ms(m.timestamp), tool: name, summary: toolPhrase(name, preview(argsOf(c?.function?.arguments ?? c?.arguments))) };
        out.push(e); if (c?.id) byCall.set(String(c.id), e);
      }
    } else if (m?.role === "tool" && m.tool_call_id && byCall.has(String(m.tool_call_id))) {
      const text = typeof m.content === "string" ? m.content : "";
      if (/^\s*\{\s*"(error|success"\s*:\s*false)/.test(text)) byCall.get(String(m.tool_call_id))!.failed = true;
    }
  }
  return out.reverse().slice(0, limit);
}

/** The latest todo list Hermes wrote with its `todo` tool (its working plan), or null. */
export function currentPlan(raw: unknown): PlanItem[] | null {
  const list = rows(raw);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m?.role !== "tool" || (m.tool_name && m.tool_name !== "todo")) continue;
    try {
      const v = JSON.parse(typeof m.content === "string" ? m.content : "");
      if (Array.isArray(v?.todos)) return v.todos.map((t: any, k: number) => ({ id: String(t.id ?? k), content: String(t.content ?? ""), status: t.status ?? "pending" }));
    } catch {}
  }
  return null;
}
