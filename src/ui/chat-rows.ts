// Chat list rows, like Grok Bot: a centred divider with day and time ("Today 4:28 PM", "Yesterday
// 9:02 AM", "Monday 3:15 PM", "Oct 13, 4:28 PM") on a new day or after a 15-minute gap, and a
// small muted time at the end of each burst of messages.
import type { Turn } from "../chat-model";

export type ChatRow = { kind: "turn"; key: string; turn: Turn; time?: string } | { kind: "day"; key: string; label: string };
/** A new divider after this much silence, and a burst of messages ends after GROUP_MS. */
export const GAP_MS = 15 * 60_000, GROUP_MS = 5 * 60_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function dayLabel(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86400000);
  const d = new Date(at);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return DAYS[d.getDay()];
  const md = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${md}, ${d.getFullYear()}`;
}

/** "4:28 PM". */
export function clock(at: number): string {
  const d = new Date(at);
  const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Divider text: "Today 4:28 PM", "Monday 3:15 PM", "Oct 13, 4:28 PM". */
export function dividerLabel(at: number, now = Date.now()): string {
  const label = dayLabel(at, now);
  return `${label}${/\d/.test(label) ? "," : ""} ${clock(at)}`;
}

/** "12:41 PM" or "Oct 13, 12:41 PM" (the long-press menu). */
export function messageTime(at: number, now = Date.now()): string {
  const time = clock(at);
  const label = dayLabel(at, now);
  return label === "Today" ? time : `${label}, ${time}`;
}

/** Rows newest-first, for an inverted list. Turns without a timestamp (very old history) get no divider or time. */
export function buildRows(turns: Turn[], now = Date.now()): ChatRow[] {
  const rows: ChatRow[] = [];
  // nextAt[i]: the timestamp of the next dated turn after turns[i] (one backward pass, O(n)).
  const nextAt: (number | undefined)[] = new Array(turns.length);
  for (let i = turns.length - 1, n: number | undefined; i >= 0; i--) { nextAt[i] = n; if (turns[i].at) n = turns[i].at; }
  let prev: number | undefined, groupLabel: string | undefined;
  turns.forEach((t, i) => {
    if (!t.at) { rows.push({ kind: "turn", key: t.id, turn: t }); return; }
    if (prev === undefined || startOfDay(t.at) !== startOfDay(prev) || t.at - prev > GAP_MS) {
      rows.push({ kind: "day", key: `day-${t.id}`, label: dividerLabel(t.at, now) });
      groupLabel = clock(t.at);
    }
    const next = nextAt[i];
    const ends = next === undefined || next - t.at > GROUP_MS || startOfDay(next) !== startOfDay(t.at);
    // Skip the end-of-burst time when it would just repeat the divider right above the burst.
    const time = ends && clock(t.at) !== groupLabel ? clock(t.at) : undefined;
    rows.push(time ? { kind: "turn", key: t.id, turn: t, time } : { kind: "turn", key: t.id, turn: t });
    if (ends) groupLabel = undefined;
    prev = t.at;
  });
  return rows.reverse();
}

/** What the chat area shows. The skeleton appears only while the first load is pending and there is
 *  nothing to show yet; it is rendered *instead of* the list (never over it) and goes away on
 *  success, error, or the first message. */
export type ChatBody = "setup" | "skeleton" | "empty" | "list";
export function chatBody(c: { loaded: boolean; error?: string; turns: unknown[] }, needsKey?: boolean): ChatBody {
  if (needsKey) return "setup";
  if (c.turns.length) return "list";
  if (!c.loaded && !c.error) return "skeleton";
  return "empty";
}
