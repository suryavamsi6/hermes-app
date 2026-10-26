// Tool steps stored on a session's messages. The live stream puts them on the turn, but leaving
// the chat rebuilds turns from history, and history keeps the calls on the assistant row. Without
// this, the steps pill is gone when you come back.
import type { Step } from "./chat-model";

type Row = { role: string; text: string; steps?: Step[] };

const rows = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? r?.messages ?? []);

function argsOf(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try { const v = JSON.parse(String(raw ?? "")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

function preview(a: Record<string, unknown>): string | undefined {
  for (const k of ["command", "query", "path", "file_path", "url", "name", "goal", "prompt"]) if (typeof a[k] === "string" && a[k]) return a[k] as string;
  return undefined;
}

const failed = (text: string) => /^\s*\{\s*"(error|success"\s*:\s*false)/.test(text);

/** One step list per visible user/assistant row. Tool rows attach to the assistant call they answer. */
export function stepsFromHistory(raw: unknown): Step[][] {
  const out: Step[][] = [];
  const byCall = new Map<string, Step>();
  let open: Step[] | null = null;
  for (const m of rows(raw)) {
    if (m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const steps: Step[] = m.tool_calls.map((c: any, i: number) => {
        const name = String(c?.function?.name ?? c?.name ?? "tool");
        const step: Step = { id: String(c?.id ?? `${out.length}-${i}`), tool: name, status: "completed", preview: preview(argsOf(c?.function?.arguments ?? c?.arguments)) };
        if (c?.id) byCall.set(String(c.id), step);
        return step;
      });
      open = steps;
      if (typeof m.content === "string" ? m.content.trim() : Array.isArray(m.content) && m.content.some((p: any) => p?.text)) out.push(steps);
    } else if (m?.role === "tool" && m.tool_call_id && byCall.has(String(m.tool_call_id))) {
      const text = typeof m.content === "string" ? m.content : "";
      const step = byCall.get(String(m.tool_call_id))!;
      if (failed(text)) step.status = "failed";
      if (text && !step.result) step.result = text.slice(0, 4000);
    } else if (m?.role === "user" || m?.role === "assistant") {
      const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p: any) => p?.text ?? "").join("") : "";
      if (!text.trim() && !(m.role === "user" && Array.isArray(m.content) && m.content.some((p: any) => p?.type === "image_url" || p?.type === "image"))) continue;
      out.push(m.role === "assistant" && open ? open : []);
      open = null;
    }
  }
  return out;
}

/** Prefer steps already on the matching shown turn. History fills a turn that lost them. */
export function withKeptSteps(shown: Row[], row: { role: string; text: string }, historySteps: Step[] = []): { steps: Step[] } {
  const hit = shown.find((t) => t.role === row.role && (t.text === row.text || (t as { raw?: string }).raw === row.text) && t.steps?.length);
  return { steps: hit?.steps?.length ? hit.steps : historySteps };
}
