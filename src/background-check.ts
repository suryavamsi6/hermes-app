// Replies while the app is closed, without a push server. Android runs this task through WorkManager
// at most every ~15 minutes (later under Doze / Samsung battery limits), even after the app was
// swiped away, but not after a force stop. It lists each watched Bot Chat's messages and posts a
// notification for assistant replies newer than the last check. Read-only against Hermes.
//
// The watch list ({since, chats:[{botId, sid}]}) is written when the app goes to the background;
// bot details and keys come from the same SecureStore entries the app uses.
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { newReplies, parseWatch, type Watch } from "./background-core";
import { parseMessages } from "./chat-model";
import { loadConfig } from "./config";
import { LiveBackend } from "./live-backend";
import { notifyDone } from "./notify";
import { loadPrefs } from "./prefs";
import * as Store from "./secure";

export const REPLY_CHECK = "hermes-reply-check";
const WATCH_KEY = "hm.watch";

export async function saveWatch(chats: { botId: string; sid: string }[]) {
  const w: Watch = { since: Date.now(), chats };
  try { await Store.setItem(WATCH_KEY, JSON.stringify(w)); } catch {}
}

/** The app itself just notified (it was alive in the background): move the mark so the task doesn't repeat it. */
export async function markNotified() {
  const w = parseWatch(await Store.getItem(WATCH_KEY).catch(() => null));
  if (w) try { await Store.setItem(WATCH_KEY, JSON.stringify({ ...w, since: Math.max(w.since, Date.now()) })); } catch {}
}

/** One pass: returns how many notifications it posted. */
export async function checkReplies(): Promise<number> {
  const w = parseWatch(await Store.getItem(WATCH_KEY));
  const cfg = await loadConfig();
  if (!w || !w.chats.length || !cfg) return 0;
  await loadPrefs();
  const backend = new LiveBackend(cfg);
  const bots = await backend.listBots();
  let newest = w.since, posted = 0;
  for (const c of w.chats) {
    const bot = bots.find((b) => b.id === c.botId);
    if (!bot || bot.needsKey) continue;
    try {
      const fresh = newReplies(parseMessages(await backend.chat(bot).messages(c.sid)), w.since);
      if (!fresh.length) continue;
      const last = fresh[fresh.length - 1];
      newest = Math.max(newest, ...fresh.map((m) => m.at!));
      await notifyDone(bot, fresh.length > 1 ? `${fresh.length} new replies. ${last.text}` : last.text);
      posted++;
    } catch {}
  }
  if (newest > w.since) await Store.setItem(WATCH_KEY, JSON.stringify({ ...w, since: newest }));
  return posted;
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(REPLY_CHECK, async () => {
    try { await checkReplies(); return BackgroundTask.BackgroundTaskResult.Success; } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
}

/** Registered once at launch; Android keeps it across restarts. */
export async function registerReplyCheck() {
  if (Platform.OS === "web") return;
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(REPLY_CHECK))) await BackgroundTask.registerTaskAsync(REPLY_CHECK, { minimumInterval: 15 });
  } catch {}
}
