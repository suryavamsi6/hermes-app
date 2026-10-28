import { createContext, useContext, type ReactNode } from "react";
import type { Backend, Bot, CommandResult } from "./backend";
import type { HermesConfig } from "./config";
import { type AssistantTurn, type Turn, parseMessages } from "./chat-model";
import { historyRefreshCanApply, loadTurns } from "./history-turns";
import { isGatewayNotice, parseNotice, tidyEscapes } from "./notices";
import { splitFiles } from "./files";
import { skillDisplay } from "./slash";
import type { ApprovalChoice } from "./chat-model";
import * as Store from "./secure";
import { createStore, useStore } from "./store";
import { faceMood, type FaceMood } from "./ui/face-state";
import { activityLine } from "./ui/activity";

export type BotChat = { sessionId?: string; turns: Turn[]; busy: boolean; loaded: boolean; error?: string };
export type Ctx = {
  ready: boolean; demo: boolean; config: HermesConfig | null; backend: Backend | null;
  bots: Bot[]; botsLoaded: boolean; botsError?: string; reloadBots: () => Promise<void>;
  setActive: (botId: string | null) => void;
  loadChat: (bot: Bot, force?: boolean) => Promise<void>;
  send: (bot: Bot, text: string, images?: { uri: string; dataUrl: string }[], files?: { name: string; text: string }[]) => Promise<void>;
  steer: (bot: Bot, text: string) => Promise<void>;
  retry: (bot: Bot, turnId: string) => Promise<void>;
  newChat: (bot: Bot) => Promise<void>;
  syncChat: (bot: Bot) => Promise<void>;
  runCommand: (bot: Bot, command: string, profileWide: boolean) => Promise<CommandResult>;
  commandReply: (bot: Bot, typed: string, answer: string) => void;
  setDraft: (botId: string, text: string) => void;
  stop: (bot: Bot) => void;
  approve: (bot: Bot, turnId: string, choice: ApprovalChoice) => Promise<void>;
  react: (messageId: string, emoji: string | null) => void;
  save: (c: HermesConfig) => Promise<void>;
  primaryId: string | undefined;
  setPrimary: (botId: string) => Promise<void>;
  setDemo: (on: boolean) => Promise<void>;
};
export const AppCtx = createContext<Ctx | null>(null);
export type Live = { chats: Record<string, BotChat>; unread: Record<string, number>; preview: Record<string, string>; reactions: Record<string, string>; happy: Record<string, boolean>; lastAt: Record<string, number>; drafts: Record<string, string> };
export const live = createStore<Live>({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} });
export const slice = <K extends keyof Live>(k: K) => (f: (v: Live[K]) => Live[K]) => live.set((s) => { const v = f(s[k]); return v === s[k] ? s : { ...s, [k]: v }; });
const setDrafts = slice("drafts");
const draftKey = (botId: string) => `hermes.draft.${botId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
const draftTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const saveDraft = (botId: string, text: string) => { void (text ? Store.setItem(draftKey(botId), text) : Store.deleteItem(draftKey(botId))).catch(() => {}); };
export function setDraft(botId: string, text: string) {
  setDrafts((d) => (d[botId] === text ? d : { ...d, [botId]: text }));
  clearTimeout(draftTimers[botId]);
  draftTimers[botId] = setTimeout(() => { delete draftTimers[botId]; saveDraft(botId, text); }, 400);
}
export function flushDrafts() {
  for (const id of Object.keys(draftTimers)) { clearTimeout(draftTimers[id]); delete draftTimers[id]; saveDraft(id, live.get().drafts[id] ?? ""); }
}
export async function restoreDraft(botId: string) {
  if (live.get().drafts[botId] !== undefined) return;
  const v = await Store.getItem(draftKey(botId)).catch(() => null);
  setDrafts((d) => (d[botId] !== undefined ? d : { ...d, [botId]: v ?? "" }));
}
export const setChats = slice("chats"), setUnread = slice("unread"), setPreview = slice("preview"), setReactions = slice("reactions"), setHappy = slice("happy"), setLastAt = slice("lastAt");
export const touch = (botId: string, at = Date.now()) => setLastAt((m) => (m[botId] && m[botId] >= at ? m : { ...m, [botId]: at }));
export const EMPTY: BotChat = { turns: [], busy: false, loaded: false };
export const raf: (f: () => void) => void = typeof requestAnimationFrame === "function" ? (f) => { requestAnimationFrame(f); } : (f) => { setTimeout(f, 16); };
let seq = 0;
export const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export function retryReason(code?: string): "bot_chat" | "stale" | null {
  if (!code) return null;
  if (/^bot_chat_|^permission_denied$|^session_owned|^409$/.test(code)) return "bot_chat";
  if (code === "session_not_found" || code === "404") return "stale";
  return null;
}
export const plain = (md: string) => md.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const previewOf = (m: { role: string; text: string }) => (m.role === "user" && skillDisplay(m.text) ? skillDisplay(m.text)! : m.role === "user" && isGatewayNotice(m.text) ? parseNotice(m.text).title : plain(tidyEscapes(splitFiles(m.text).text) || "📎 File"));

export async function syncChatState({ backend, bot, chats, patchChat, setPreview, touch }: {
  backend: Backend | null; bot: Bot; chats: () => Record<string, BotChat>;
  patchChat: (botId: string, f: (c: BotChat) => BotChat) => void;
  setPreview: (f: (p: Record<string, string>) => Record<string, string>) => void;
  touch: (botId: string, at?: number) => void;
}) {
  if (!backend || bot.needsKey) return;
  const c = chats()[bot.id];
  if (!c?.loaded || c.busy || c.turns.some((turn) => turn.role === "assistant" && turn.status === "queued")) return;
  const turnsAtStart = c.turns;
  try {
    const sid = c.sessionId ?? (await backend.botChatSession(bot));
    const raw = await backend.chat(bot).messages(sid);
    const { history, turns } = loadTurns(raw, turnsAtStart);
    const now = chats()[bot.id];
    if (!historyRefreshCanApply(turnsAtStart, now?.turns, !!now?.busy)) return;
    const shown = (now?.turns ?? []).filter((t) => !t.local && (t.role === "user" || t.status === "completed"));
    const same = shown.length === history.length && history.every((m, i) => m.text === ((shown[i] as { raw?: string }).raw ?? shown[i].text));
    const missing = history.some((m, i) => m.role === "assistant" && turns[i]?.role === "assistant" && turns[i].steps.length && !(shown[i] as AssistantTurn | undefined)?.steps?.length);
    if (same && !missing) return;
    patchChat(bot.id, (x) => ({ ...x, sessionId: sid, turns, error: undefined }));
    const last = history[history.length - 1];
    if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
  } catch {}
}

export async function waitForQueuedReply({ backend, bot, aid, chats, patchTurn, setPreview, cheer }: {
  backend: Backend | null; bot: Bot; aid: string; chats: () => Record<string, BotChat>;
  patchTurn: (botId: string, turnId: string, f: (t: AssistantTurn) => AssistantTurn) => void;
  setPreview: (f: (p: Record<string, string>) => Record<string, string>) => void;
  cheer: (botId: string) => void;
}) {
  if (!backend) return;
  const sid = chats()[bot.id]?.sessionId; if (!sid) return;
  const count = async () => parseMessages(await backend.chat(bot).messages(sid));
  let before: number; try { before = (await count()).filter((m) => m.role === "assistant").length; } catch { return; }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const turn = chats()[bot.id]?.turns.find((t): t is AssistantTurn => t.id === aid && t.role === "assistant");
    if (turn?.status !== "queued") return;
    try { const replies = (await count()).filter((m) => m.role === "assistant"); if (replies.length > before) { const text = replies[replies.length - 1].text; patchTurn(bot.id, aid, (t) => ({ ...t, text, status: "completed" })); setPreview((p) => ({ ...p, [bot.id]: plain(text) })); cheer(bot.id); return; } } catch {}
  }
}

export function useApp() { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; }
export const useChat = (botId?: string): BotChat => useStore(live, (s) => (botId && s.chats[botId]) || EMPTY);
/** Narrow Home subscription: stream changes rerender attention summaries without subscribing to drafts or reactions. */
export const useAttentionChats = () => useStore(live, (s) => s.chats);
export const useUnread = (botId: string) => useStore(live, (s) => s.unread[botId] ?? 0);
export const useTotalUnread = () => useStore(live, (s) => Object.values(s.unread).reduce((n, v) => n + (v ?? 0), 0));
export const useUnreadBots = () => useStore(live, (s) => Object.keys(s.unread).filter((id) => (s.unread[id] ?? 0) > 0));
export const useApprovalBots = () => useStore(live, (s) => Object.entries(s.chats).filter(([, c]) => c.turns.some((t) => t.role === "assistant" && !!(t as any).approval)).map(([id]) => id).join(","));
export const useBusyCount = () => useStore(live, (s) => Object.values(s.chats).filter((c) => c.busy).length);
export const usePreview = (botId: string) => useStore(live, (s) => s.preview[botId] ?? "");
export const useBusy = (botId: string) => useStore(live, (s) => s.chats[botId]?.busy ?? false);
export const useReaction = (id: string) => useStore(live, (s) => s.reactions[id]);
const listenStore = createStore<Record<string, boolean>>({});
export const setListening = (botId: string, on: boolean) => listenStore.set((s) => (!!s[botId] === on ? s : { ...s, [botId]: on }));
export const useMood = (botId: string, withListening = false): FaceMood => { const listening = useStore(listenStore, (s) => withListening && !!s[botId]); return useStore(live, (s) => faceMood(s.chats[botId], { happy: !!s.happy[botId], listening })); };
export const useActivity = (botId: string) => useStore(live, (s) => { const c = s.chats[botId]; if (!c?.busy) return ""; for (let i = c.turns.length - 1; i >= 0; i--) { const t = c.turns[i]; if (t.role === "assistant") return t.status === "streaming" && !t.note ? (t.text ? "Writing a reply" : activityLine(t) ?? "") : "Thinking"; } return "Thinking"; });
export const useHasApproval = (botId: string) => useStore(live, (s) => { const turns = s.chats[botId]?.turns ?? []; for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") return t.status === "streaming" && !t.note && !!t.approval; } return false; });
export const useReconnecting = (botId: string) => useStore(live, (s) => { const turns = s.chats[botId]?.turns ?? []; for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") return !!t.reconnecting && t.status === "streaming" && !t.note; } return false; });
export const useLastAt = (botId: string) => useStore(live, (s) => s.lastAt[botId]);
export const resetLive = () => live.set(() => ({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} }));
export const setDraftText = setDraft;
export const useDraft = (botId: string) => useStore(live, (s) => s.drafts[botId] ?? "");
export const useBot = (id?: string) => { const { bots } = useApp(); return bots.find((b) => b.id === id); };
