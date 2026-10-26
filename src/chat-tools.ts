/** The reply that's still being written (the one steering text goes to). A sealed note is not it. */
export function runningTurn(turns: Turn[]): AssistantTurn | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "assistant") return t.status === "streaming" && !t.note ? t : undefined;
  }
  return undefined;
}

/** Steering needs the run's id (only /v1/runs streams have one); legacy session streams can't steer. */
export const canSteer = (t?: AssistantTurn) => !!t?.runId && t.status === "streaming" && !t.note && !t.approval;
