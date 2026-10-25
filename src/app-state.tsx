// App-wide state: backend (demo or live), the bot roster, and one continuous chat per bot.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Backend, Bot } from "./backend";
import { AppState } from "react-native";
import { type AssistantTurn, initialTurn, parseMessages, recoverReply, reduce, retryReusesKey, type Turn, type TurnAction } from "./chat-model";
import type { StreamHandle } from "./hermes";
import { newRunKey } from "./run-stream";
import { doneHaptic } from "./ui/haptics";
import { type HermesConfig, loadConfig, saveConfig } from "./config";
import { DemoBackend } from "./demo-backend";
import { LiveBackend } from "./live-backend";
import * as Store from "./secure";
import { createStore, useStore } from "./store";
import type { FaceMood } from "./ui/bot-face";

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
  send: (bot: Bot, text: string) => Promise<void>;
  /** Retry a failed/stopped assistant turn in place. */
  retry: (bot: Bot, turnId: string) => Promise<void>;
  /** Re-read the chat from Hermes if nothing is running (pull-to-refresh). */
  syncChat: (bot: Bot) => Promise<void>;
  /** Unsent composer text per bot, kept across app restarts. */
  setDraft: (botId: string, text: string) => void;
  stop: (bot: Bot) => void;
  approve: (bot: Bot, turnId: string, choice: "once" | "deny") => Promise<void>;
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
const toTurns = (history: { role: "user" | "assistant"; text: string; at?: number }[]): Turn[] => {
  let prompt: string | undefined;
  return history.map((m) => {
    if (m.role === "user") { prompt = m.text; return { id: nextId("u"), role: "user", text: m.text, at: m.at }; }
    return { ...initialTurn(nextId("a")), text: m.text, status: "completed", at: m.at, prompt };
  });
};
const plain = (md: string) => md.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

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
      if (last) { setPreview((p) => ({ ...p, [bot.id]: plain(last.text) })); if (last.at) touch(bot.id, last.at); }
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
    patchChat(bot.id, (c) => ({ ...c, busy: true, error: undefined }));
    const finish = (a: Extract<TurnAction, { type: "done" }>, acc: string) => {
      patchChat(bot.id, (c) => ({ ...c, busy: false }));
      if (a.status === "completed") { cheer(bot.id); if (active.current === bot.id && appActive.current) doneHaptic(); }
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
      const flush = () => { scheduled = false; if (!queue.length) return; const q = queue; queue = []; patchTurn(bot.id, aid, (t) => q.reduce(reduce, t)); };
      aborts.current[bot.id] = backend.chat(bot).streamTurn(sid, text, (a) => {
        if (ended) return; // `error` is followed by `done`/`run.failed`: the first terminal event wins
        if (a.type === "delta") acc += a.text;
        if (a.type === "final" && a.text) acc = a.text;
        if (a.type === "done") {
          ended = true;
          const retry = !retried && a.status === "failed" ? retryReason(a.code) : null;
          if (retry) {
            queue = []; // nothing of this attempt reached the transcript; start the turn over
            patchTurn(bot.id, aid, (t) => ({ ...initialTurn(aid), at: t.at, prompt: t.prompt, key: newRunKey() }));
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

  const send = useCallback(async (bot: Bot, text: string) => {
    if (!backend) return;
    const aid = nextId("a"); const at = Date.now();
    patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text, at }, { ...initialTurn(aid), at, prompt: text, key: newRunKey() }] }));
    setPreview((p) => ({ ...p, [bot.id]: `You: ${plain(text)}` }));
    touch(bot.id);
    await runTurn(bot, aid);
  }, [backend, patchChat, runTurn]);

  /** Retry a failed or stopped turn in place (no second user bubble). After a lost connection the
   *  same Idempotency-Key is reused, so Hermes replays that run rather than storing the message again. */
  const retry = useCallback(async (bot: Bot, turnId: string) => {
    const t = chats()[bot.id]?.turns.find((x): x is AssistantTurn => x.id === turnId && x.role === "assistant");
    if (!t?.prompt || t.status === "streaming" || chats()[bot.id]?.busy) return;
    patchTurn(bot.id, turnId, (x) => ({ ...initialTurn(turnId), at: x.at, prompt: x.prompt, key: retryReusesKey(x) && x.key ? x.key : newRunKey() }));
    await runTurn(bot, turnId);
  }, [patchTurn, runTurn]);

  /** Re-read the chat from Hermes (pull-to-refresh, back from background) when nothing is running. */
  const syncChat = useCallback(async (bot: Bot) => {
    if (!backend || bot.needsKey) return;
    const c = chats()[bot.id];
    if (!c?.loaded || c.busy) return;
    try {
      const sid = c.sessionId ?? (await backend.botChatSession(bot));
      const history = parseMessages(await backend.chat(bot).messages(sid));
      const now = chats()[bot.id];
      if (now?.busy) return;
      const shown = (now?.turns ?? []).filter((t) => t.role === "user" || t.status === "completed").map((t) => t.text);
      const same = shown.length === history.length && history.every((m, i) => m.text === shown[i]);
      if (same) return;
      patchChat(bot.id, (x) => ({ ...x, sessionId: sid, turns: toTurns(history), error: undefined }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: plain(last.text) })); if (last.at) touch(bot.id, last.at); }
    } catch {}
  }, [backend, patchChat]);

  // Back in the foreground: wake any reconnecting stream right away, and pick up replies that
  // landed while the phone slept (a routine's message, a queued Bot Chat answer).
  const appActive = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener?.("change", (st) => {
      const was = appActive.current;
      appActive.current = st === "active";
      if (st !== "active") { flushDrafts(); return; }
      if (was) return;
      Object.values(aborts.current).forEach((h) => h?.nudge?.());
      const id = active.current; const bot = id ? bots.find((b) => b.id === id) : undefined;
      if (bot) void syncChat(bot);
    });
    return () => sub?.remove();
  }, [bots, syncChat]);

  /** A Bot Chat turn the owner hadn't answered yet: poll the history until a newer assistant reply lands. */
  const awaitQueuedReply = useCallback(async (bot: Bot, aid: string) => {
    if (!backend) return;
    const sid = chats()[bot.id]?.sessionId; if (!sid) return;
    const count = async () => parseMessages(await backend.chat(bot).messages(sid));
    let before: number;
    try { before = (await count()).filter((m) => m.role === "assistant").length; } catch { return; }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const turn = chats()[bot.id]?.turns.find((t): t is AssistantTurn => t.id === aid && t.role === "assistant");
      if (turn?.status !== "queued") return;
      try {
        const replies = (await count()).filter((m) => m.role === "assistant");
        if (replies.length > before) {
          const text = replies[replies.length - 1].text;
          patchTurn(bot.id, aid, (t) => ({ ...t, text, status: "completed" }));
          setPreview((p) => ({ ...p, [bot.id]: plain(text) }));
          cheer(bot.id);
          return;
        }
      } catch {}
    }
  }, [backend, patchTurn, cheer]);

  const stop = useCallback((bot: Bot) => {
    const c = chats()[bot.id];
    const running = c?.turns.slice().reverse().find((t): t is AssistantTurn => t.role === "assistant" && t.status === "streaming");
    if (running?.runId && backend) void backend.chat(bot).stop(running.runId).catch(() => {});
    aborts.current[bot.id]?.();
    if (running) patchTurn(bot.id, running.id, (t) => reduce(t, { type: "done", status: "cancelled" }));
    patchChat(bot.id, (x) => ({ ...x, busy: false }));
  }, [backend, patchChat, patchTurn]);

  const approve = useCallback(async (bot: Bot, turnId: string, choice: "once" | "deny") => {
    const t = chats()[bot.id]?.turns.find((x): x is AssistantTurn => x.id === turnId && x.role === "assistant");
    if (!backend || !t?.approval?.runId) throw new Error("This approval can't be answered from the phone yet.");
    await backend.chat(bot).approve(t.approval.runId, t.approval.requestId, t.approval.generation, choice);
    patchTurn(bot.id, turnId, (x) => ({ ...x, approval: undefined }));
  }, [backend, patchTurn]);

  const value = useMemo<Ctx>(() => ({
    ready, demo, config, backend, bots, reloadBots, loadChat, send, retry, syncChat, setDraft, stop, approve, primaryId: primary, setPrimary,
    setActive: (id) => { active.current = id; if (id) setUnread((u) => ({ ...u, [id]: 0 })); },
    react: (id, emoji) => {
      setReactions((r) => { const n = { ...r }; if (emoji) n[id] = emoji; else delete n[id]; return n; });
      if (emoji) { const owner = Object.entries(chats()).find(([, c]) => c.turns.some((t) => t.id === id)); if (owner) cheer(owner[0]); }
    },
    save: async (c) => { await saveConfig(c); await Store.deleteItem(DEMO_KEY); setConfig(c); setDemoState(BUILD_DEMO); },
    setDemo: async (on) => { on ? await Store.setItem(DEMO_KEY, "1") : await Store.deleteItem(DEMO_KEY); setDemoState(on || BUILD_DEMO); },
  }), [ready, demo, config, backend, bots, reloadBots, loadChat, send, retry, syncChat, stop, approve, cheer, primary, setPrimary]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
// ---- selector hooks over the live store: each re-renders only when its own slice changes ----
export const useChat = (botId?: string): BotChat => useStore(live, (s) => (botId && s.chats[botId]) || EMPTY);
export const useUnread = (botId: string) => useStore(live, (s) => s.unread[botId] ?? 0);
export const usePreview = (botId: string) => useStore(live, (s) => s.preview[botId] ?? "");
export const useBusy = (botId: string) => useStore(live, (s) => s.chats[botId]?.busy ?? false);
export const useReaction = (id: string) => useStore(live, (s) => s.reactions[id]);
export function moodFrom(c: BotChat | undefined, happy: boolean): FaceMood {
  let last: AssistantTurn | undefined;
  for (let i = (c?.turns.length ?? 0) - 1; i >= 0; i--) { const t = c!.turns[i]; if (t.role === "assistant") { last = t; break; } }
  if (last?.approval) return "approval";
  if (c?.busy) return "thinking";
  if (happy) return "happy";
  if (c?.error || last?.status === "failed") return "error";
  return "idle";
}
export const useMood = (botId: string): FaceMood => useStore(live, (s) => moodFrom(s.chats[botId], !!s.happy[botId]));
/** The running reply lost its connection and is quietly re-attaching. */
export const useReconnecting = (botId: string) => useStore(live, (s) => {
  const turns = s.chats[botId]?.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") return !!t.reconnecting && t.status === "streaming"; }
  return false;
});
export const useLastAt = (botId: string) => useStore(live, (s) => s.lastAt[botId]);
export const resetLive = () => live.set(() => ({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} }));
export const setDraftText = setDraft;
export const useDraft = (botId: string) => useStore(live, (s) => s.drafts[botId] ?? "");

export const useBot = (id?: string) => { const { bots } = useApp(); return bots.find((b) => b.id === id); };
export { parseMessages } from "./chat-model";
