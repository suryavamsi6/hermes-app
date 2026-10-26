// Rebuild chat turns from a session's messages and keep each reply's tool steps.
// Leaving the chat reloads history. History stores tool_calls beside the text, so a text-only
// rebuild hides the steps pill.
import { initialTurn, type HistoryMessage, parseMessages, type Step, type Turn } from "./chat-model";
import { splitFiles } from "./files";
import { isGatewayNotice, parseNotice, tidyEscapes } from "./notices";
import { stepsFromHistory, withKeptSteps } from "./steps-from-history";

let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const toTurns = (history: HistoryMessage[], steps: Step[][] = []): Turn[] => {
  let prompt: string | undefined;
  return history.map((m, i) => {
    if (m.role === "user") {
      if (isGatewayNotice(m.text)) { prompt = undefined; const n = parseNotice(m.text); return { id: nextId("u"), role: "user", text: n.title, raw: m.text, notice: n, at: m.at }; }
      prompt = m.text;
      const { text, files } = splitFiles(m.text);
      return { id: nextId("u"), role: "user", text: tidyEscapes(text), at: m.at, ...(text !== m.text ? { raw: m.text } : {}), ...(files.length ? { files } : {}), ...(m.images ? { imageCount: m.images } : {}) };
    }
    const text = tidyEscapes(m.text);
    return { ...initialTurn(nextId("a")), text, steps: steps[i] ?? [], status: "completed", at: m.at, prompt, ...(text !== m.text ? { raw: m.text } : {}) };
  });
};

const keptSteps = (shown: Turn[], history: HistoryMessage[], lists: Step[][]): Step[][] =>
  history.map((m, i) => (m.role === "assistant" ? withKeptSteps(shown, m, lists[i] ?? []).steps : []));

export const loadTurns = (raw: unknown, shown: Turn[] = []) => {
  const history = parseMessages(raw);
  return { history, turns: toTurns(history, keptSteps(shown, history, stepsFromHistory(raw))) };
};
