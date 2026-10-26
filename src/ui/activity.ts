/** Which rotating pool applies to a still-working reply, or null when there's a concrete line to show. */
export function idleKind(t: AssistantTurn): IdleKind | null {
  if (t.status !== "streaming" || t.text || t.note || t.reconnecting || t.approval || t.thought) return null;
  if (t.steps.some((s) => s.status === "running")) return null;
  return t.steps.length ? "wrapup" : "start";
}

/** The status line, or null when the reply text is already showing (or the turn is done). */
export function activityLine(t: AssistantTurn): string | null {
  if (t.status !== "streaming" || t.text || t.note) return null;
  if (t.reconnecting) return null;
  if (t.approval) return "Waiting for your OK";
  for (let i = t.steps.length - 1; i >= 0; i--) if (t.steps[i].status === "running") return toolPhrase(t.steps[i].tool, t.steps[i].preview);
  if (t.thought) return clip(t.thought.split(/[.!?]\s/)[0], 64);
  return t.steps.length ? "Putting it together" : "Thinking";
}
