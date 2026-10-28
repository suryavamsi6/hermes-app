import type { Step } from "../chat-model";

export function summary(steps: Step[]): string {
  if (!steps.length) return "No steps";
  const tools = [...new Set(steps.map((s) => s.tool))];
  const shown = tools.slice(0, 3).join(", ") + (tools.length > 3 ? ` +${tools.length - 3}` : "");
  const state = steps.some((s) => s.status === "failed") ? "failed"
    : steps.some((s) => s.status === "running") ? "running" : "done";
  return `${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${state} · ${shown}`;
}
