// Compact relative times for the Home list.
/** "now", "5m", "3h", "Yesterday", "Mon", "12 Oct": the Grok list's compact times. */
export function relTime(at: number | undefined, now = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const d = new Date(at), today = new Date(now);
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return `${Math.floor(s / 3600)}h`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

