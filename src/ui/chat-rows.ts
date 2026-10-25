// Chat list rows: the turns plus a small date divider wherever the day changes ("Today",
// "Yesterday", a weekday within the last week, else "Oct 13" / "Oct 13, 2025"), like Grok Bot.
import type { Turn } from "../chat-model";

export type ChatRow = { kind: "turn"; key: string; turn: Turn } | { kind: "day"; key: string; label: string };

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

/** "12:41 PM" or "Oct 13, 12:41 PM" (the long-press menu). */
export function messageTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, "0");
  const time = `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  const label = dayLabel(at, now);
  return label === "Today" ? time : `${label}, ${time}`;
}

/** Rows newest-first, for an inverted list. Turns without a timestamp (very old history) get no divider. */
export function buildRows(turns: Turn[], now = Date.now()): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay: number | undefined;
  for (const t of turns) {
    if (t.at) {
      const day = startOfDay(t.at);
      if (day !== lastDay) { rows.push({ kind: "day", key: `day-${day}`, label: dayLabel(t.at, now) }); lastDay = day; }
    }
    rows.push({ kind: "turn", key: t.id, turn: t });
  }
  return rows.reverse();
}
