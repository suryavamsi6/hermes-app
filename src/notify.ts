// Local notifications: "reply ready" and "needs your OK" with Allow once / Deny buttons. They're
// posted by the app's own JS, so they work while the app is open or backgrounded and Android keeps
// it alive. There is no push server yet, so a killed (swiped-away) app can't notify; see TODO.md.
//
// v0.10.1 root cause of "no notifications": the Android 13+ permission was only requested the first
// time something was posted, which only happens while the app is in the background, where Android
// can't show the permission dialog. The refusal was then cached for the session. Now the channel and
// permission are set up at launch, in the foreground, and the permission is re-checked every post.
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Approval } from "./chat-model";
import { getPrefs, shouldNotify } from "./prefs";
import type { NotifStatus } from "./notify-status";
export type { NotifStatus };

type Bot = { id: string; name: string };
const CHANNEL = "replies";
const APPROVAL = "hermes-approval";
let setup: Promise<void> | undefined;

/** Handler, channel and approval buttons, once per launch (retried if it threw). */
function prepare(): Promise<void> {
  setup ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: "Replies and approvals", importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200], enableVibrate: true, showBadge: true });
    await Notifications.setNotificationCategoryAsync(APPROVAL, [
      { identifier: "deny", buttonTitle: "Deny", options: { opensAppToForeground: false } },
      { identifier: "once", buttonTitle: "Allow once", options: { opensAppToForeground: false } },
    ]);
  })().catch((e) => { setup = undefined; throw e; });
  return setup;
}

/** True when notifications may be shown. Asks for the permission only when `ask` is set and the app
 *  is in the foreground (Android can't show the dialog otherwise). Never caches a refusal. */
export async function ensureNotifications(ask = false): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    await prepare();
    const now = await Notifications.getPermissionsAsync();
    if (now.granted) return true;
    if (!ask || !now.canAskAgain || AppState.currentState !== "active") return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch { return false; }
}


/** What Settings shows next to "Send test notification". */
export async function notificationStatus(): Promise<NotifStatus> {
  if (Platform.OS === "web") return { permission: "unsupported", canAskAgain: false, channel: "n/a" };
  try {
    await prepare().catch(() => {});
    const perm = await Notifications.getPermissionsAsync();
    let channel: NotifStatus["channel"] = "n/a";
    if (Platform.OS === "android") {
      const ch = await Notifications.getNotificationChannelAsync(CHANNEL);
      channel = !ch ? "missing" : ch.importance === Notifications.AndroidImportance.NONE ? "off" : "on";
    }
    const permission = perm.granted ? "granted" : perm.status === "undetermined" ? "undetermined" : "denied";
    return { permission, canAskAgain: perm.canAskAgain, channel };
  } catch { return { permission: "unsupported", canAskAgain: false, channel: "n/a" }; }
}

/** Settings → Send test notification. Asks for the permission if needed; returns the status after. */
export async function sendTestNotification(): Promise<NotifStatus> {
  if (await ensureNotifications(true)) {
    try { await Notifications.scheduleNotificationAsync({ identifier: "test", content: { title: "Hermes", body: "Notifications are working." }, trigger: { channelId: CHANNEL } as any }); } catch {}
  }
  return notificationStatus();
}

/** Android's notification settings for this app (to turn the permission or channel back on). */
export const openNotificationSettings = () => { void Linking.openSettings().catch(() => {}); };

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
