// Local notifications while the app is in the background: "reply ready" and "needs your OK" with
// Allow once / Deny buttons. They're posted by the app's own JS while Android keeps it alive (a long
// reply in a backgrounded app); there is no push server, so a killed app can't notify.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Approval } from "./chat-model";
import { getPrefs, shouldNotify } from "./prefs";

type Bot = { id: string; name: string };
const CHANNEL = "replies";
const APPROVAL = "hermes-approval";
let setup: Promise<boolean> | undefined;

/** Channel, approval buttons and permission (Android 13+ asks once). False when not allowed. */
export function ensureNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(false);
  setup ??= (async () => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Replies and approvals", importance: Notifications.AndroidImportance.HIGH });
      await Notifications.setNotificationCategoryAsync(APPROVAL, [
        { identifier: "deny", buttonTitle: "Deny", options: { opensAppToForeground: false } },
        { identifier: "once", buttonTitle: "Allow once", options: { opensAppToForeground: false } },
      ]);
      const now = await Notifications.getPermissionsAsync();
      if (now.granted) return true;
      if (!now.canAskAgain) return false;
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch { setup = undefined; return false; }
  })();
  return setup;
}

async function post(content: Notifications.NotificationContentInput, id?: string) {
  if (!(await ensureNotifications())) return;
  try { await Notifications.scheduleNotificationAsync({ identifier: id, content, trigger: { channelId: CHANNEL } as any }); } catch {}
}

/** Respects Settings → Notifications and the bot's own switches (mute, kinds, quiet hours, hidden previews). */
export const notifyDone = (bot: Bot, text: string, failed = false) => {
  const p = getPrefs();
  if (!shouldNotify(p, bot.id, failed ? "error" : "reply")) return;
  return post({ title: bot.name, body: p.hidePreviews ? (failed ? "A reply couldn't finish" : "New reply") : text.slice(0, 180), data: { botId: bot.id } }, `done-${bot.id}`);
};

export const notifyApproval = (bot: Bot, turnId: string, a: Approval) => {
  const p = getPrefs();
  if (!shouldNotify(p, bot.id, "approval")) return;
  return post({ title: `${bot.name} needs your OK`, body: p.hidePreviews ? "Open Hermes to review it" : [a.title, a.detail].filter(Boolean).join(": ").slice(0, 220),
    categoryIdentifier: APPROVAL, data: { botId: bot.id, turnId, approval: true } }, `approval-${bot.id}-${turnId}`);
};

export type NotificationTap = { botId: string; turnId?: string; choice?: "once" | "deny" };

/** Taps and button presses. `choice` is set when Allow once / Deny was pressed on an approval. */
export function onNotificationTap(handle: (t: NotificationTap, dismiss: () => void) => void): () => void {
  if (Platform.OS === "web") return () => {};
  const route = (r: Notifications.NotificationResponse | null) => {
    if (!r) return;
    const d: any = r.notification.request.content.data ?? {};
    if (typeof d.botId !== "string") return;
    const choice = r.actionIdentifier === "once" || r.actionIdentifier === "deny" ? r.actionIdentifier : undefined;
    const id = r.notification.request.identifier;
    handle({ botId: d.botId, turnId: d.turnId, choice }, () => { void Notifications.dismissNotificationAsync(id).catch(() => {}); });
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  };
  try {
    void Notifications.getLastNotificationResponseAsync().then(route).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  } catch { return () => {}; }
}

export const clearBotNotifications = (botId: string) => {
  if (Platform.OS === "web") return;
  void Notifications.getPresentedNotificationsAsync().then((list) => list
    .filter((n) => (n.request.content.data as any)?.botId === botId)
    .forEach((n) => void Notifications.dismissNotificationAsync(n.request.identifier))).catch(() => {});
};
