// Pure: turns the notification permission/channel state into the line Settings shows.
export type NotifStatus = { permission: "granted" | "denied" | "undetermined" | "unsupported"; canAskAgain: boolean; channel: "on" | "off" | "missing" | "n/a" };

export function describeNotifStatus(s: NotifStatus | null): { text: string; ok: boolean; fixInSettings: boolean } {
  if (!s) return { text: "Checking…", ok: false, fixInSettings: false };
  if (s.permission === "unsupported") return { text: "Not available on this device", ok: false, fixInSettings: false };
  if (s.permission === "denied") return { text: s.canAskAgain ? "Permission off: tap to allow" : "Blocked: turn on in Android settings", ok: false, fixInSettings: !s.canAskAgain };
  if (s.permission === "undetermined") return { text: "Not allowed yet: tap to allow", ok: false, fixInSettings: false };
  if (s.channel === "off") return { text: "Allowed, but the 'Replies and approvals' channel is off", ok: false, fixInSettings: true };
  return { text: "Allowed · channel on", ok: true, fixInSettings: false };
}
