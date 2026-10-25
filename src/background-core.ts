// Pure part of the background reply check (see background-check.ts): which assistant messages are new.
export type Watch = { since: number; chats: { botId: string; sid: string }[] };
type Msg = { role: "user" | "assistant"; text: string; at?: number };

/** Assistant messages that landed after `since` (ms). Messages without a timestamp are never "new",
 *  so an old history can't cause a burst of notifications. */
export function newReplies(history: Msg[], since: number): Msg[] {
  return history.filter((m) => m.role === "assistant" && typeof m.at === "number" && m.at > since && m.text.trim());
}

export function parseWatch(raw: string | null): Watch | null {
  try {
    const w = raw ? JSON.parse(raw) : null;
    if (!w || typeof w.since !== "number" || !Array.isArray(w.chats)) return null;
    return { since: w.since, chats: w.chats.filter((c: any) => typeof c?.botId === "string" && typeof c?.sid === "string").slice(0, 20) };
  } catch { return null; }
}
