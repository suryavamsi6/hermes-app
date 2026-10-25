import type { Step } from "../chat-model";

/** "3 steps · terminal, web_search" (first three distinct tools, then "+n"). */
export function summary(steps: Step[]): string {
  const tools = [...new Set(steps.map((s) => s.tool))];
  const shown = tools.slice(0, 3).join(", ") + (tools.length > 3 ? ` +${tools.length - 3}` : "");
  return `${steps.length} ${steps.length === 1 ? "step" : "steps"} · ${shown}`;
}
