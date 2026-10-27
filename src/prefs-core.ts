// App preferences (kept on the phone) and the pure rules that use them. RN-free so it's unit-tested.
export type BotNotify = { muted?: boolean; replies?: boolean; approvals?: boolean; errors?: boolean };
export type Prefs = {
  appearance: "system" | "light" | "dark";
  // Chat
  showTimestamps: boolean; showStatus: boolean; readAloudRate: number;
  // Notifications
  notifyReplies: boolean; notifyApprovals: boolean; notifyErrors: boolean; hidePreviews: boolean;
  /** Quiet hours as local hours 0-23 (start inclusive, end exclusive; may wrap midnight). null = off. */
  quietStart: number | null; quietEnd: number | null;
  bots: Record<string, BotNotify>;
  // Security
  appLock: boolean;
};
export const DEFAULT_PREFS: Prefs = {
  appearance: "system",
  showTimestamps: true, showStatus: true, readAloudRate: 1,
  notifyReplies: true, notifyApprovals: true, notifyErrors: true, hidePreviews: false,
  quietStart: null, quietEnd: null, bots: {}, appLock: false,
};

/** Merge stored JSON over the defaults, ignoring junk. */
export function parsePrefs(raw: string | null | undefined): Prefs {
  try { const v = raw ? JSON.parse(raw) : {}; return { ...DEFAULT_PREFS, ...(v && typeof v === "object" ? v : {}), bots: { ...(v?.bots ?? {}) } }; }
  catch { return { ...DEFAULT_PREFS }; }
}

export function inQuietHours(p: Pick<Prefs, "quietStart" | "quietEnd">, at = new Date()): boolean {
  const { quietStart: s, quietEnd: e } = p;
  if (s == null || e == null || s === e) return false;
  const h = at.getHours();
  return s < e ? h >= s && h < e : h >= s || h < e;
}

export type NotifyKind = "reply" | "approval" | "error";
/** Whether to post a notification of this kind for this bot now. Approvals still come through quiet
 *  hours (a run is waiting on you), but never for a muted bot. */
export function shouldNotify(p: Prefs, botId: string, kind: NotifyKind, at = new Date()): boolean {
  const b = p.bots[botId] ?? {};
  if (b.muted) return false;
  const on = kind === "reply" ? (b.replies ?? p.notifyReplies) : kind === "approval" ? (b.approvals ?? p.notifyApprovals) : (b.errors ?? p.notifyErrors);
  if (!on) return false;
  return kind === "approval" || !inQuietHours(p, at);
}
