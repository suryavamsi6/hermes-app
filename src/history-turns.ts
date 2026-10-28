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

/** Keep visible IDs only when a history row has one unambiguous exact text match. */
export function preserveHistoryIds(turns: Turn[], shown: Turn[]): Turn[] {
  return turns.map((turn) => {
    const raw = (turn as { raw?: string }).raw ?? turn.text;
    const matches = shown.filter((candidate) => !candidate.local && candidate.role === turn.role &&
      (candidate.text === raw || (candidate as { raw?: string }).raw === raw));
    return matches.length === 1 ? { ...turn, id: matches[0].id } as Turn : turn;
  });
}

/** A history response may only replace the exact turn snapshot it was requested for. */
export function historyRefreshCanApply(startedWith: Turn[], current: Turn[] | undefined, busy: boolean): boolean {
  return !busy && current === startedWith;
}

export const loadTurns = (raw: unknown, shown: Turn[] = []) => {
  const history = parseMessages(raw);
  const turns = toTurns(history, keptSteps(shown, history, stepsFromHistory(raw)));
  return { history, turns: preserveHistoryIds(turns, shown) };
};
