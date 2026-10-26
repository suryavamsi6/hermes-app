function lastAssistant(turns: Turn[] | undefined): AssistantTurn | undefined {
  for (let i = (turns?.length ?? 0) - 1; i >= 0; i--) { const t = turns![i]; if (t.role === "assistant" && !t.note) return t; }
  return undefined;
}
