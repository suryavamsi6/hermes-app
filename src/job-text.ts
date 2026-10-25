// Readable text for cron job fields. Hermes stores schedule as an object ({kind, expr, display}), and
// other fields (prompt, deliver, last status, results) may arrive as objects or lists depending on the
// Hermes version and route; String(obj) would show "[object Object]". Field names follow hermes-agent
// cron/jobs.py (_normalize_job_record, create_job) and gateway/platforms/api_server.py (/api/jobs).
import type { Job } from "./backend";

const PREFERRED = ["display", "text", "content", "message", "summary", "description", "expr", "value", "name", "label", "title", "status", "run_at", "at"];

/** Any JSON value -> one readable line ("" for nothing). Objects use their most descriptive field. */
export function readable(v: unknown, depth = 0): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (depth > 3) return "";
  if (Array.isArray(v)) return v.map((x) => readable(x, depth + 1)).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of PREFERRED) { const t = readable(o[k], depth + 1); if (t) return t; }
    return Object.entries(o)
      .filter(([, x]) => x != null && x !== "" && typeof x !== "object")
      .map(([k, x]) => `${k.replace(/_/g, " ")}: ${String(x)}`).join(", ");
  }
  return "";
}

/** "every 30m" style schedule text from a cron schedule object or string. */
export function scheduleText(job: any): string {
  const display = readable(job?.schedule_display);
  if (display) return display;
  const s = job?.schedule;
  if (s && typeof s === "object") {
    const t = readable((s as any).display) || readable((s as any).expr) || readable((s as any).value) || readable((s as any).run_at);
    if (t) return t;
    if ((s as any).minutes) return `every ${(s as any).minutes}m`;
    return readable(s);
  }
  return readable(s);
}

/** ISO / unix seconds / ms -> ms, or undefined. */
export function timeOf(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); if (isFinite(n)) return timeOf(n); const d = Date.parse(v); return isNaN(d) ? undefined : d; }
  if (v && typeof v === "object") return timeOf((v as any).at ?? (v as any).time ?? (v as any).timestamp);
  return undefined;
}

/** Short time for a routine line: "today 8:00 AM", "tomorrow 8:00 AM", "Oct 13 8:00 AM". */
export function shortTime(ms: number, now = Date.now()): string {
  const d = new Date(ms); const n = new Date(now);
  const h = d.getHours(); const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 86400000);
  if (diff === 0) return `today ${time}`;
  if (diff === 1) return `tomorrow ${time}`;
  if (diff === -1) return `yesterday ${time}`;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()} ${time}`;
}

export function toJob(j: any): Job {
  const job = j?.job ?? j ?? {};
  const prompt = readable(job.prompt);
  const skills = readable(job.skills ?? job.skill);
  const state = readable(job.state);
  const fmt = (v: unknown) => { const t = timeOf(v); return t ? shortTime(t) : readable(v) || undefined; };
  return {
    id: readable(job.id ?? job.job_id),
    name: readable(job.name) || prompt.slice(0, 50) || "Routine",
    schedule: scheduleText(job),
    prompt: prompt || (skills ? `Skills: ${skills}` : readable(job.script) ? `Script: ${readable(job.script)}` : ""),
    // Hermes treats `enabled` as authoritative (cron/jobs.py effective_job_state).
    paused: typeof job.paused === "boolean" ? job.paused : job.enabled === false || (job.enabled === undefined && state === "paused"),
    lastRun: fmt(job.last_run_at ?? job.last_run),
    nextRun: fmt(job.next_run_at ?? job.next_run),
    lastStatus: readable(job.last_status) || (state === "error" ? "error" : undefined) || undefined,
    // Hermes keeps the last run's error and the last delivery error (cron/jobs.py).
    lastError: readable(job.last_error) || readable(job.last_delivery_error) || undefined,
  };
}

/** A routine whose last run failed (paused ones don't count: they won't run again). */
export const isFailing = (j: Job) => !j.paused && (/error|fail/i.test(j.lastStatus ?? "") || (!!j.lastError && !/^ok|success/i.test(j.lastStatus ?? "")));

/** Where Home's "routine failed" line goes: straight to that routine when there's one, else the
 *  routines list showing only the failed ones. */
export function failedRoutinesLink(failing: { botId: string; jobId: string }[]): string {
  if (failing.length === 1) return `/routines?bot=${encodeURIComponent(failing[0].botId)}&job=${encodeURIComponent(failing[0].jobId)}`;
  return "/routines?failed=1";
}
