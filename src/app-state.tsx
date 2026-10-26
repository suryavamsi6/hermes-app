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
  bots: Bot[]; reloadBots: () => Promise<void>;
  setActive: (botId: string | null) => void;
  /** Load the bot's chat once; `force` reloads it (e.g. after the bot got a chat key). */
  loadChat: (bot: Bot, force?: boolean) => Promise<void>;
  /** Send a message; `images` are photos picked in the composer (local URI for the bubble, data: URL for Hermes). */
  send: (bot: Bot, text: string, images?: { uri: string; dataUrl: string }[], files?: { name: string; text: string }[]) => Promise<void>;
  /** Add guidance to the reply that's being written. Throws when Hermes no longer accepts it. */
  steer: (bot: Bot, text: string) => Promise<void>;
  /** Retry a failed/stopped assistant turn in place. */
  retry: (bot: Bot, turnId: string) => Promise<void>;
  /** /new: start a fresh session for this bot and show it (empty). Throws if it can't. */
  newChat: (bot: Bot) => Promise<void>;
  /** Re-read the chat from Hermes if nothing is running (pull-to-refresh). */
  syncChat: (bot: Bot) => Promise<void>;
  /** Run a slash command with Hermes's own handler in this bot's chat session. Throws CommandError. */
  runCommand: (bot: Bot, command: string, profileWide: boolean) => Promise<CommandResult>;
  /** Show a command and its answer in the chat, like Telegram does (this phone only). */
  commandReply: (bot: Bot, typed: string, answer: string) => void;
  /** Unsent composer text per bot, kept across app restarts. */
  setDraft: (botId: string, text: string) => void;
  stop: (bot: Bot) => void;
  approve: (bot: Bot, turnId: string, choice: ApprovalChoice) => Promise<void>;
  react: (messageId: string, emoji: string | null) => void;
  save: (c: HermesConfig) => Promise<void>;
  /** The bot shown big at the top of Home (persisted per mode); falls back to the first bot. */
  primaryId: string | undefined;
  setPrimary: (botId: string) => Promise<void>;
  setDemo: (on: boolean) => Promise<void>;
};
const AppCtx = createContext<Ctx | null>(null);

/** Fast-changing state lives outside React context; read it with the selector hooks at the bottom. */
type Live = { chats: Record<string, BotChat>; unread: Record<string, number>; preview: Record<string, string>; reactions: Record<string, string>; happy: Record<string, boolean>; lastAt: Record<string, number>; drafts: Record<string, string> };
const live = createStore<Live>({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} });
const slice = <K extends keyof Live>(k: K) => (f: (v: Live[K]) => Live[K]) => live.set((s) => { const v = f(s[k]); return v === s[k] ? s : { ...s, [k]: v }; });
const setDrafts = slice("drafts");
const draftKey = (botId: string) => `hermes.draft.${botId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
const draftTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const saveDraft = (botId: string, text: string) => { void (text ? Store.setItem(draftKey(botId), text) : Store.deleteItem(draftKey(botId))).catch(() => {}); };
/** Composer text per bot: in memory at once, persisted 400 ms after typing stops (or when the app
 *  goes to the background, see flushDrafts). */
function setDraft(botId: string, text: string) {
  setDrafts((d) => (d[botId] === text ? d : { ...d, [botId]: text }));
  clearTimeout(draftTimers[botId]);
  draftTimers[botId] = setTimeout(() => { delete draftTimers[botId]; saveDraft(botId, text); }, 400);
}
function flushDrafts() {
  for (const id of Object.keys(draftTimers)) { clearTimeout(draftTimers[id]); delete draftTimers[id]; saveDraft(id, live.get().drafts[id] ?? ""); }
}
/** Loads a bot's saved draft once (the chat screen calls this on open). */
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

/** Message history shape is UNVERIFIED for live Hermes; keep user/assistant text only. */
/** Which failed first attempts are worth one automatic retry: the profile's Bot Chat refusing a phone
 *  turn (owned by another login/client, see hermes-agent gateway/platforms/api_server_bot_chat.py) ->
 *  switch to a phone session; a stored session that no longer exists -> resolve it again. */
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
/** Home's one-line preview of a history message. */
const previewOf = (m: HistoryMessage) => (m.role === "user" && skillDisplay(m.text) ? skillDisplay(m.text)! : m.role === "user" && isGatewayNotice(m.text) ? parseNotice(m.text).title : plain(tidyEscapes(splitFiles(m.text).text) || "📎 File"));

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<HermesConfig | null>(null);
  const [demo, setDemoState] = useState(BUILD_DEMO);
  const [bots, setBots] = useState<Bot[]>([]);
  const cheerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cheer = useCallback((botId: string) => {
    setHappy((h) => ({ ...h, [botId]: true }));
    clearTimeout(cheerTimers.current[botId]);
    cheerTimers.current[botId] = setTimeout(() => setHappy((h) => ({ ...h, [botId]: false })), 1200);
  }, []);
  const chats = () => live.get().chats; // read at call time, so the callbacks below stay stable
  const [primaryId, setPrimaryId] = useState<string | undefined>();
  useEffect(() => { void Store.getItem(PRIMARY_KEY(demo)).then((v) => setPrimaryId(v ?? undefined)); }, [demo]);
  const setPrimary = useCallback(async (id: string) => { await Store.setItem(PRIMARY_KEY(demo), id); setPrimaryId(id); cheer(id); }, [demo, cheer]);
  const primary = bots.find((b) => b.id === primaryId)?.id ?? bots[0]?.id;
  const active = useRef<string | null>(null);
  const aborts = useRef<Record<string, StreamHandle>>({});

  useEffect(() => {
    Promise.all([loadConfig(), Store.getItem(DEMO_KEY)]).then(([c, d]) => { setConfig(c); if (d === "1") setDemoState(true); setReady(true); });
  }, []);
  const demoBackend = useMemo(() => new DemoBackend(), []);
  const backend = useMemo<Backend | null>(() => (demo ? demoBackend : config ? new LiveBackend(config) : null), [demo, config, demoBackend]);

  const reloadBots = useCallback(async () => { if (backend) setBots(await backend.listBots()); }, [backend]);
  useEffect(() => { setChats(() => ({})); setPreview(() => ({})); setUnread(() => ({})); void reloadBots(); }, [reloadBots]);

  const patchChat = useCallback((botId: string, f: (c: BotChat) => BotChat) =>
    setChats((all) => ({ ...all, [botId]: f(all[botId] ?? EMPTY) })), []);
  const patchTurn = useCallback((botId: string, turnId: string, f: (t: AssistantTurn) => AssistantTurn) =>
    patchChat(botId, (c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === "assistant" ? f(t) : t)) })), [patchChat]);

  const loadChat = useCallback(async (bot: Bot, force = false) => {
    if (!backend || (!force && chats()[bot.id]?.loaded)) return;
    if (force) { patchChat(bot.id, () => EMPTY); setPreview((p) => { const { [bot.id]: _, ...rest } = p; return rest; }); }
    if (bot.needsKey) { // a server profile this phone has no chat key for yet: nothing to load
      patchChat(bot.id, (c) => ({ ...c, loaded: true }));
      setPreview((p) => ({ ...p, [bot.id]: "Tap to set up chat" }));
      return;
    }
    try {
      const sessionId = await backend.botChatSession(bot);
      const history = parseMessages(await backend.chat(bot).messages(sessionId));
      const turns = toTurns(history);
      patchChat(bot.id, (c) => ({ ...c, sessionId, turns: c.turns.length ? c.turns : turns, loaded: true }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
    } catch (e: any) {
      patchChat(bot.id, (c) => ({ ...c, loaded: true, error: String(e?.message ?? e) }));
    }
  }, [backend, patchChat]);

  // Load previews for Home once the roster arrives.
  useEffect(() => { bots.forEach((b) => void loadChat(b)); }, [bots]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs (or re-runs) the assistant turn `aid`, whose prompt and Idempotency-Key live on the turn. */
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
    const fail = (e: any) => {
      patchTurn(bot.id, aid, (t) => reduce(t, { type: "done", status: "failed", error: String(e?.message ?? e) }));
      patchChat(bot.id, (c) => ({ ...c, busy: false }));
    };
    const attempt = async (retried: boolean) => {
      const sid = (!retried && chats()[bot.id]?.sessionId) || (await backend.botChatSession(bot));
      patchChat(bot.id, (c) => ({ ...c, sessionId: sid }));
      let acc = ""; let ended = false;
      // Batch stream events: at most one state update per frame however fast tokens arrive.
      let queue: TurnAction[] = []; let scheduled = false;
      const flush = () => { scheduled = false; if (!queue.length) return; const q = queue; queue = []; patchChat(bot.id, (c) => ({ ...c, turns: applyStream(c.turns, aid, q, () => nextId("a")) })); };
      aborts.current[bot.id] = backend.chat(bot).streamTurn(sid, input, (a) => {
        if (ended) return;
        if (a.type === "approval" && !appActive.current) void notifyApproval(bot, aid, a.approval); // `error` is followed by `done`/`run.failed`: the first terminal event wins
        if (a.type === "delta") acc += a.text;
        if (a.type === "final" && a.text) acc = a.text;
        if (a.type === "done") {
          ended = true;
          const retry = !retried && a.status === "failed" ? retryReason(a.code) : null;
          if (retry) {
            queue = []; // nothing of this attempt reached the transcript; start the turn over
            patchTurn(bot.id, aid, (t) => ({ ...initialTurn(aid), at: t.at, prompt: t.prompt, attachments: t.attachments, key: newRunKey() }));
            void Promise.resolve(retry === "bot_chat" ? backend.abandonBotChat?.(bot) : backend.forgetSession?.(bot))
              .then(() => attempt(true)).catch(fail);
            return;
          }
          // The connection never came back: the run may still have finished server-side, so look
          // for its answer in the session history before showing an error.
          if (a.status === "failed" && (a.code === "connection_lost" || a.code === "run_unknown")) {
            flush();
            void recoverFromHistory(bot, sid, text).then((reply) => {
              if (reply) { const done = { type: "done", status: "completed" } as const; patchTurn(bot.id, aid, (t) => reduce({ ...t, text: reply }, done)); finish(done, reply); }
              else { queue.push(a); flush(); finish(a, acc); }
            });
            return;
          }
          queue.push(a); flush(); finish(a, acc);
          return;
        }
        queue.push(a);
        if (!scheduled) { scheduled = true; raf(flush); }
      }, { key: turnOf()?.key });
    };
    try { await attempt(false); } catch (e: any) { fail(e); }
  }, [backend, patchChat, patchTurn, cheer]); // eslint-disable-line react-hooks/exhaustive-deps

  const recoverFromHistory = useCallback(async (bot: Bot, sid: string, prompt: string): Promise<string | undefined> => {
    if (!backend) return undefined;
    try { return recoverReply(parseMessages(await backend.chat(bot).messages(sid)), prompt); } catch { return undefined; }
  }, [backend]);
