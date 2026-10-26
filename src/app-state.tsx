// App-wide state: backend (demo or live), the bot roster, and one continuous chat per bot.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Backend, type Bot, CommandError, type CommandResult } from "./backend";
import { AppState } from "react-native";
import { buildInput, canSteer, runningTurn } from "./chat-tools";
import { notifyApproval, notifyDone } from "./notify";
import { type AssistantTurn, applyStream, initialTurn, type HistoryMessage, parseMessages, recoverReply, reduce, retryReusesKey, type Turn, type TurnAction } from "./chat-model";
import type { StreamHandle } from "./hermes";
import { newRunKey } from "./run-stream";
import { doneHaptic } from "./ui/haptics";
import { type HermesConfig, loadConfig, saveConfig } from "./config";
import { DemoBackend } from "./demo-backend";
import { LiveBackend } from "./live-backend";
import * as Store from "./secure";
import { isGatewayNotice, parseNotice, tidyEscapes } from "./notices";
import { splitFiles, withFiles } from "./files";
import { createStore, useStore } from "./store";
import { faceMood, type FaceMood } from "./ui/face-state";
import { activityLine } from "./ui/activity";
import type { ApprovalChoice } from "./chat-model";
import { skillDisplay } from "./slash";

const BUILD_DEMO = process.env.EXPO_PUBLIC_DEMO === "1";
const DEMO_KEY = "hermes.demo";
const PRIMARY_KEY = (demo: boolean) => (demo ? "hermes.primary.demo" : "hermes.primary");
export type BotChat = { sessionId?: string; turns: Turn[]; busy: boolean; loaded: boolean; error?: string };
type Ctx = {
  ready: boolean; demo: boolean; config: HermesConfig | null; backend: Backend | null;
  bots: Bot[]; reloadBots: () => Promise<void>; setActive: (botId: string | null) => void;
  loadChat: (bot: Bot, force?: boolean) => Promise<void>;
  send: (bot: Bot, text: string, images?: { uri: string; dataUrl: string }[], files?: { name: string; text: string }[]) => Promise<void>;
  steer: (bot: Bot, text: string) => Promise<void>; retry: (bot: Bot, turnId: string) => Promise<void>;
  newChat: (bot: Bot) => Promise<void>; syncChat: (bot: Bot) => Promise<void>;
  runCommand: (bot: Bot, command: string, profileWide: boolean) => Promise<CommandResult>;
  commandReply: (bot: Bot, typed: string, answer: string) => void; setDraft: (botId: string, text: string) => void;
  stop: (bot: Bot) => void; approve: (bot: Bot, turnId: string, choice: ApprovalChoice) => Promise<void>;
  react: (messageId: string, emoji: string | null) => void; save: (c: HermesConfig) => Promise<void>;
  primaryId: string | undefined; setPrimary: (botId: string) => Promise<void>; setDemo: (on: boolean) => Promise<void>;
};
const AppCtx = createContext<Ctx | null>(null);
type Live = { chats: Record<string, BotChat>; unread: Record<string, number>; preview: Record<string, string>; reactions: Record<string, string>; happy: Record<string, boolean>; lastAt: Record<string, number>; drafts: Record<string, string> };
const live = createStore<Live>({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} });
const slice = <K extends keyof Live>(k: K) => (f: (v: Live[K]) => Live[K]) => live.set((s) => { const v = f(s[k]); return v === s[k] ? s : { ...s, [k]: v }; });
const setDrafts = slice("drafts");
const draftKey = (botId: string) => `hermes.draft.${botId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
const draftTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const saveDraft = (botId: string, text: string) => { void (text ? Store.setItem(draftKey(botId), text) : Store.deleteItem(draftKey(botId))).catch(() => {}); };
function setDraft(botId: string, text: string) {
  setDrafts((d) => (d[botId] === text ? d : { ...d, [botId]: text }));
  clearTimeout(draftTimers[botId]);
  draftTimers[botId] = setTimeout(() => { delete draftTimers[botId]; saveDraft(botId, text); }, 400);
}
function flushDrafts() {
  for (const id of Object.keys(draftTimers)) { clearTimeout(draftTimers[id]); delete draftTimers[id]; saveDraft(id, live.get().drafts[id] ?? ""); }
}
export async function restoreDraft(botId: string) {
  if (live.get().drafts[botId] !== undefined) return;
  const v = await Store.getItem(draftKey(botId)).catch(() => null);
  setDrafts((d) => (d[botId] !== undefined ? d : { ...d, [botId]: v ?? "" }));
}
const setChats = slice("chats"), setUnread = slice("unread"), setPreview = slice("preview"), setReactions = slice("reactions"), setHappy = slice("happy"), setLastAt = slice("lastAt");
const touch = (botId: string, at = Date.now()) => setLastAt((m) => (m[botId] && m[botId] >= at ? m : { ...m, [botId]: at }));
const EMPTY: BotChat = { turns: [], busy: false, loaded: false };
const raf: (f: () => void) => void = typeof requestAnimationFrame === "function" ? (f) => { requestAnimationFrame(f); } : (f) => { setTimeout(f, 16); };
let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export function retryReason(code?: string): "bot_chat" | "stale" | null {
  if (!code) return null;
  if (/^bot_chat_|^permission_denied$|^session_owned|^409$/.test(code)) return "bot_chat";
  if (code === "session_not_found" || code === "404") return "stale";
  return null;
}
export const toTurns = (history: HistoryMessage[]): Turn[] => {
  let prompt: string | undefined;
  return history.map((m) => {
    if (m.role === "user") {
      if (isGatewayNotice(m.text)) { prompt = undefined; const n = parseNotice(m.text); return { id: nextId("u"), role: "user", text: n.title, raw: m.text, notice: n, at: m.at }; }
      prompt = m.text;
      const { text, files } = splitFiles(m.text);
      return { id: nextId("u"), role: "user", text: tidyEscapes(text), at: m.at, ...(text !== m.text ? { raw: m.text } : {}), ...(files.length ? { files } : {}), ...(m.images ? { imageCount: m.images } : {}) };
    }
    const text = tidyEscapes(m.text);
    return { ...initialTurn(nextId("a")), text, status: "completed", at: m.at, prompt, ...(text !== m.text ? { raw: m.text } : {}) };
  });
};
const plain = (md: string) => md.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const previewOf = (m: HistoryMessage) => (m.role === "user" && skillDisplay(m.text) ? skillDisplay(m.text)! : m.role === "user" && isGatewayNotice(m.text) ? parseNotice(m.text).title : plain(tidyEscapes(splitFiles(m.text).text) || "📎 File"));

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<HermesConfig | null>(null);
  const [demo, setDemoState] = useState(BUILD_DEMO);
  const [bots, setBots] = useState<Bot[]>([]);
  const cheerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cheer = useCallback((botId: string) => { setHappy((h) => ({ ...h, [botId]: true })); clearTimeout(cheerTimers.current[botId]); cheerTimers.current[botId] = setTimeout(() => setHappy((h) => ({ ...h, [botId]: false })), 1200); }, []);
  const chats = () => live.get().chats;
  const [primaryId, setPrimaryId] = useState<string | undefined>();
  useEffect(() => { void Store.getItem(PRIMARY_KEY(demo)).then((v) => setPrimaryId(v ?? undefined)); }, [demo]);
  const setPrimary = useCallback(async (id: string) => { await Store.setItem(PRIMARY_KEY(demo), id); setPrimaryId(id); cheer(id); }, [demo, cheer]);
  const primary = bots.find((b) => b.id === primaryId)?.id ?? bots[0]?.id;
  const active = useRef<string | null>(null);
  const aborts = useRef<Record<string, StreamHandle>>({});
  useEffect(() => { Promise.all([loadConfig(), Store.getItem(DEMO_KEY)]).then(([c, d]) => { setConfig(c); if (d === "1") setDemoState(true); setReady(true); }); }, []);
  const demoBackend = useMemo(() => new DemoBackend(), []);
  const backend = useMemo<Backend | null>(() => (demo ? demoBackend : config ? new LiveBackend(config) : null), [demo, config, demoBackend]);
  const reloadBots = useCallback(async () => { if (backend) setBots(await backend.listBots()); }, [backend]);
  useEffect(() => { setChats(() => ({})); setPreview(() => ({})); setUnread(() => ({})); void reloadBots(); }, [reloadBots]);
  const patchChat = useCallback((botId: string, f: (c: BotChat) => BotChat) => setChats((all) => ({ ...all, [botId]: f(all[botId] ?? EMPTY) })), []);
  const patchTurn = useCallback((botId: string, turnId: string, f: (t: AssistantTurn) => AssistantTurn) => patchChat(botId, (c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === "assistant" ? f(t) : t)) })), [patchChat]);
  const loadChat = useCallback(async (bot: Bot, force = false) => {
    if (!backend || (!force && chats()[bot.id]?.loaded)) return;
    if (force) { patchChat(bot.id, () => EMPTY); setPreview((p) => { const { [bot.id]: _, ...rest } = p; return rest; }); }
    if (bot.needsKey) { patchChat(bot.id, (c) => ({ ...c, loaded: true })); setPreview((p) => ({ ...p, [bot.id]: "Tap to set up chat" })); return; }
    try {
      const sessionId = await backend.botChatSession(bot);
      const history = parseMessages(await backend.chat(bot).messages(sessionId));
      const turns = toTurns(history);
      patchChat(bot.id, (c) => ({ ...c, sessionId, turns: c.turns.length ? c.turns : turns, loaded: true }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
    } catch (e: any) { patchChat(bot.id, (c) => ({ ...c, loaded: true, error: String(e?.message ?? e) })); }
  }, [backend, patchChat]);
  useEffect(() => { bots.forEach((b) => void loadChat(b)); }, [bots]); // eslint-disable-line react-hooks/exhaustive-deps
  const runTurn = useCallback(async (bot: Bot, aid: string) => {
    if (!backend) return;
    const turnOf = () => chats()[bot.id]?.turns.find((t): t is AssistantTurn => t.id === aid && t.role === "assistant");
    const text = turnOf()?.prompt ?? "";
    const input = buildInput(text, turnOf()?.attachments);
    patchChat(bot.id, (c) => ({ ...c, busy: true, error: undefined }));
    const finish = (a: Extract<TurnAction, { type: "done" }>, acc: string) => {
      patchChat(bot.id, (c) => ({ ...c, busy: false }));
      if (a.status === "completed") { cheer(bot.id); if (active.current === bot.id && appActive.current) doneHaptic(); }
      if (!appActive.current && (a.status === "completed" || a.status === "failed")) void notifyDone(bot, a.status === "completed" ? plain(acc) || "Reply ready" : `Couldn't finish: ${a.error ?? "the run failed"}`, a.status === "failed");
      if (acc) setPreview((p) => ({ ...p, [bot.id]: plain(acc) }));
      touch(bot.id);
      if (active.current !== bot.id) setUnread((u) => ({ ...u, [bot.id]: (u[bot.id] ?? 0) + 1 }));
      if (a.status === "queued") void awaitQueuedReply(bot, aid);
    };
    const fail = (e: any) => { patchTurn(bot.id, aid, (t) => reduce(t, { type: "done", status: "failed", error: String(e?.message ?? e) })); patchChat(bot.id, (c) => ({ ...c, busy: false })); };
    const attempt = async (retried: boolean) => {
      const sid = (!retried && chats()[bot.id]?.sessionId) || (await backend.botChatSession(bot));
      patchChat(bot.id, (c) => ({ ...c, sessionId: sid }));
      let acc = ""; let ended = false;
      let queue: TurnAction[] = []; let scheduled = false;
      const flush = () => { scheduled = false; if (!queue.length) return; const q = queue; queue = []; patchChat(bot.id, (c) => ({ ...c, turns: applyStream(c.turns, aid, q, () => nextId("a")) })); };
      aborts.current[bot.id] = backend.chat(bot).streamTurn(sid, input, (a) => {
        if (ended) return;
        if (a.type === "approval" && !appActive.current) void notifyApproval(bot, aid, a.approval);
        if (a.type === "delta") acc += a.text;
        if (a.type === "final" && a.text) acc = a.text;
        if (a.type === "done") {
          ended = true;
          const retry = !retried && a.status === "failed" ? retryReason(a.code) : null;
          if (retry) { queue = []; patchTurn(bot.id, aid, (t) => ({ ...initialTurn(aid), at: t.at, prompt: t.prompt, attachments: t.attachments, key: newRunKey() })); void Promise.resolve(retry === "bot_chat" ? backend.abandonBotChat?.(bot) : backend.forgetSession?.(bot)).then(() => attempt(true)).catch(fail); return; }
          if (a.status === "failed" && (a.code === "connection_lost" || a.code === "run_unknown")) { flush(); void recoverFromHistory(bot, sid, text).then((reply) => { if (reply) { const done = { type: "done", status: "completed" } as const; patchTurn(bot.id, aid, (t) => reduce({ ...t, text: reply }, done)); finish(done, reply); } else { queue.push(a); flush(); finish(a, acc); } }); return; }
          queue.push(a); flush(); finish(a, acc); return;
        }
        queue.push(a);
        if (!scheduled) { scheduled = true; raf(flush); }
      }, { key: turnOf()?.key });
    };
    try { await attempt(false); } catch (e: any) { fail(e); }
  }, [backend, patchChat, patchTurn, cheer]); // eslint-disable-line react-hooks/exhaustive-deps
  const recoverFromHistory = useCallback(async (bot: Bot, sid: string, prompt: string): Promise<string | undefined> => { if (!backend) return undefined; try { return recoverReply(parseMessages(await backend.chat(bot).messages(sid)), prompt); } catch { return undefined; } }, [backend]);
  const send = useCallback(async (bot: Bot, text: string, images: { uri: string; dataUrl: string }[] = [], files: { name: string; text: string }[] = []) => {
    if (!backend) return;
    const aid = nextId("a"); const at = Date.now();
    const pics = images.length ? { images: images.map((i) => i.uri) } : {};
    const attachments = images.length ? { attachments: images.map((i) => i.dataUrl) } : {};
    const prompt = files.length ? withFiles(text, files) : text;
    const docs = files.length ? { files: files.map((f) => f.name), raw: prompt } : {};
    patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text, at, ...pics, ...docs }, { ...initialTurn(aid), at, prompt, key: newRunKey(), ...attachments }] }));
    setPreview((p) => ({ ...p, [bot.id]: `You: ${plain(text) || (files.length ? `📎 ${files[0].name}` : "📷 Photo")}` }));
    touch(bot.id);
    await runTurn(bot, aid);
  }, [backend, patchChat, runTurn]);
  const retry = useCallback(async (bot: Bot, turnId: string) => {
    const t = chats()[bot.id]?.turns.find((x): x is AssistantTurn => x.id === turnId && x.role === "assistant");
    if ((!t?.prompt && !t?.attachments?.length) || t.status === "streaming" || chats()[bot.id]?.busy) return;
    patchTurn(bot.id, turnId, (x) => ({ ...initialTurn(turnId), at: x.at, prompt: x.prompt, attachments: x.attachments, key: retryReusesKey(x) && x.key ? x.key : newRunKey() }));
    await runTurn(bot, turnId);
  }, [patchTurn, runTurn]);
  const syncChat = useCallback(async (bot: Bot) => {
    if (!backend || bot.needsKey) return;
    const c = chats()[bot.id];
    if (!c?.loaded || c.busy) return;
    try {
      const sid = c.sessionId ?? (await backend.botChatSession(bot));
      const history = parseMessages(await backend.chat(bot).messages(sid));
      const now = chats()[bot.id];
      if (now?.busy) return;
      const shown = (now?.turns ?? []).filter((t) => !t.local && (t.role === "user" || t.status === "completed")).map((t) => (t as { raw?: string }).raw ?? t.text);
      if (shown.length === history.length && history.every((m, i) => m.text === shown[i])) return;
      patchChat(bot.id, (x) => ({ ...x, sessionId: sid, turns: toTurns(history), error: undefined }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
    } catch {}
  }, [backend, patchChat]);
  const appActive = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener?.("change", (st) => {
      const was = appActive.current; appActive.current = st === "active";
      if (st !== "active") { flushDrafts(); Object.values(aborts.current).forEach((h) => h?.quiet?.(true)); return; }
      if (was) return;
      Object.values(aborts.current).forEach((h) => { h?.quiet?.(false); h?.nudge?.(); });
      const id = active.current; const bot = id ? bots.find((b) => b.id === id) : undefined;
      if (bot) void syncChat(bot);
    });
    return () => sub?.remove();
  }, [bots, syncChat]);
  const awaitQueuedReply = useCallback(async (bot: Bot, aid: string) => {
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
  }, [backend, patchTurn, cheer]);
  const stop = useCallback((bot: Bot) => {
    const c = chats()[bot.id];
    const running = c?.turns.slice().reverse().find((t): t is AssistantTurn => t.role === "assistant" && t.status === "streaming" && !t.note);
    if (running?.runId && backend) void backend.chat(bot).stop(running.runId).catch(() => {});
    aborts.current[bot.id]?.();
    if (running) patchTurn(bot.id, running.id, (t) => reduce(t, { type: "done", status: "cancelled" }));
    patchChat(bot.id, (x) => ({ ...x, busy: false }));
  }, [backend, patchChat, patchTurn]);
  const steer = useCallback(async (bot: Bot, text: string) => {
    const running = runningTurn(chats()[bot.id]?.turns ?? []);
    if (!backend || !running || !canSteer(running)) throw new Error("This reply can't take additions. Send it as a new message.");
    await backend.chat(bot).steer(running.runId!, text);
    patchTurn(bot.id, running.id, (t) => (t.role === "assistant" ? { ...t, steers: [...(t.steers ?? []), text] } : t));
  }, [backend, patchTurn]);
  const approve = useCallback(async (bot: Bot, turnId: string, choice: ApprovalChoice) => {
    const t = chats()[bot.id]?.turns.find((x): x is AssistantTurn => x.id === turnId && x.role === "assistant");
    if (!backend || !t?.approval?.runId) throw new Error("This approval can't be answered from the phone yet.");
    await backend.chat(bot).approve(t.approval.runId, t.approval.requestId, t.approval.generation, choice);
    patchTurn(bot.id, turnId, (x) => ({ ...x, approval: undefined }));
  }, [backend, patchTurn]);
  const newChat = useCallback(async (bot: Bot) => { if (!backend?.newBotChat) throw new Error("Starting a new chat isn't available here."); if (chats()[bot.id]?.busy) throw new Error("Wait for this reply to finish, or /stop it first."); await backend.newBotChat(bot); await loadChat(bot, true); }, [backend, loadChat]);
  const runCommand = useCallback(async (bot: Bot, command: string, profileWide: boolean) => { if (!backend?.runCommand) throw new CommandError({ kind: "no_bridge" }); const sid = chats()[bot.id]?.sessionId ?? (await backend.botChatSession(bot)); return backend.runCommand(bot, sid, command, profileWide); }, [backend]);
  const commandReply = useCallback((bot: Bot, typed: string, answer: string) => { const at = Date.now(); patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text: typed, at, local: true }, { ...initialTurn(nextId("a")), text: answer, status: "completed", at, local: true }] })); touch(bot.id, at); }, [patchChat]);
  const value = useMemo<Ctx>(() => ({ ready, demo, config, backend, bots, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, setDraft, stop, approve, primaryId: primary, setPrimary, setActive: (id) => { active.current = id; if (id) setUnread((u) => ({ ...u, [id]: 0 })); }, react: (id, emoji) => { setReactions((r) => { const n = { ...r }; if (emoji) n[id] = emoji; else delete n[id]; return n; }); if (emoji) { const owner = Object.entries(chats()).find(([, c]) => c.turns.some((t) => t.id === id)); if (owner) cheer(owner[0]); } }, save: async (c) => { await saveConfig(c); await Store.deleteItem(DEMO_KEY); setConfig(c); setDemoState(BUILD_DEMO); }, setDemo: async (on) => { on ? await Store.setItem(DEMO_KEY, "1") : await Store.deleteItem(DEMO_KEY); setDemoState(on || BUILD_DEMO); } }), [ready, demo, config, backend, bots, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, stop, approve, cheer, primary, setPrimary]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export function useApp() { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside AppProvider"); return c; }
export const useChat = (botId?: string): BotChat => useStore(live, (s) => (botId && s.chats[botId]) || EMPTY);
export const useUnread = (botId: string) => useStore(live, (s) => s.unread[botId] ?? 0);
export const useTotalUnread = () => useStore(live, (s) => Object.values(s.unread).reduce((n, v) => n + (v ?? 0), 0));
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
export { parseMessages } from "./chat-model";
