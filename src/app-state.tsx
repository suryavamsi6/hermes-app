// App-wide state: backend (demo or live), the bot roster, and one continuous chat per bot.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Backend, type Bot, CommandError, type CommandResult } from "./backend";
import { AppState } from "react-native";
import { buildInput, canSteer, runningTurn } from "./chat-tools";
import { notifyApproval, notifyDone } from "./notify";
import { type AssistantTurn, applyStream, initialTurn, type HistoryMessage, parseMessages, recoverReply, reduce, retryReusesKey, type ApprovalChoice, type Turn, type TurnAction } from "./chat-model";
import type { StreamHandle } from "./hermes";
import { newRunKey } from "./run-stream";
import { doneHaptic } from "./ui/haptics";
import { type HermesConfig, loadConfig, saveConfig } from "./config";
import { DemoBackend } from "./demo-backend";
import { LiveBackend } from "./live-backend";
import * as Store from "./secure";
import { isGatewayNotice, parseNotice, tidyEscapes } from "./notices";
import { loadTurns, toTurns } from "./history-turns";
import { splitFiles, withFiles } from "./files";
import { skillDisplay } from "./slash";
import { AppCtx, EMPTY, flushDrafts, live, nextId, plain, raf, setChats, setDraft, setHappy, setLastAt, setPreview, setReactions, setUnread, slice, syncChatState, touch, waitForQueuedReply, retryReason, type BotChat, type Ctx } from "./app-state-hooks";
export { restoreDraft, retryReason, useApp, useAttentionChats, useApprovalBots, useBot, useBusy, useBusyCount, useChat, useDraft, useHasApproval, useLastAt, useMood, usePreview, useReaction, useReconnecting, useTotalUnread, useUnread, useUnreadBots, setDraftText, setListening, resetLive, useActivity } from "./app-state-hooks";
export type { BotChat } from "./app-state-hooks";

const BUILD_DEMO = process.env.EXPO_PUBLIC_DEMO === "1";
const DEMO_KEY = "hermes.demo";
const PRIMARY_KEY = (demo: boolean) => (demo ? "hermes.primary.demo" : "hermes.primary");


export { toTurns };
const previewOf = (m: HistoryMessage) => (m.role === "user" && skillDisplay(m.text) ? skillDisplay(m.text)! : m.role === "user" && isGatewayNotice(m.text) ? parseNotice(m.text).title : plain(tidyEscapes(splitFiles(m.text).text) || "📎 File"));
export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<HermesConfig | null>(null);
  const [demo, setDemoState] = useState(BUILD_DEMO);
  const [bots, setBots] = useState<Bot[]>([]);
  const [botsLoaded, setBotsLoaded] = useState(false);
  const [botsError, setBotsError] = useState<string>();
  const cheerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cheer = useCallback((botId: string) => { setHappy((h) => ({ ...h, [botId]: true })); clearTimeout(cheerTimers.current[botId]); cheerTimers.current[botId] = setTimeout(() => setHappy((h) => ({ ...h, [botId]: false })), 1200); }, []);
  const chats = () => live.get().chats;
  const [primaryId, setPrimaryId] = useState<string | undefined>();
  useEffect(() => { void Store.getItem(PRIMARY_KEY(demo)).then((v) => setPrimaryId(v ?? undefined)); }, [demo]);
  const setPrimary = useCallback(async (id: string) => { await Store.setItem(PRIMARY_KEY(demo), id); setPrimaryId(id); cheer(id); }, [demo, cheer]);
  const primary = bots.find((b) => b.id === primaryId)?.id ?? bots[0]?.id;
  const active = useRef<string | null>(null);
  const aborts = useRef<Record<string, StreamHandle>>({});
  const loadGeneration = useRef<Record<string, number>>({});
  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      // A SecureStore read can reject on devices where the Android Keystore is unavailable or
      // has been invalidated. Treat either value as absent and still render setup instead of
      // leaving startup as an unhandled rejection.
      const [c, d] = await Promise.all([
        loadConfig().catch(() => null),
        Store.getItem(DEMO_KEY).catch(() => null),
      ]);
      if (!mounted) return;
      setConfig(c);
      if (d === "1") setDemoState(true);
      setReady(true);
    };
    void initialize().catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  const demoBackend = useMemo(() => new DemoBackend(), []);
  const backend = useMemo<Backend | null>(() => (demo ? demoBackend : config ? new LiveBackend(config) : null), [demo, config, demoBackend]);
  const reloadBots = useCallback(async () => {
    if (!backend) return;
    try { setBots(await backend.listBots()); setBotsError(undefined); }
    catch (e: any) { setBotsError(String(e?.message ?? e)); }
    finally { setBotsLoaded(true); }
  }, [backend]);
  useEffect(() => { setChats(() => ({})); setPreview(() => ({})); setUnread(() => ({})); setBotsLoaded(false); setBotsError(undefined); void reloadBots(); }, [reloadBots]);
  const patchChat = useCallback((botId: string, f: (c: BotChat) => BotChat) => setChats((all) => ({ ...all, [botId]: f(all[botId] ?? EMPTY) })), []);
  const patchTurn = useCallback((botId: string, turnId: string, f: (t: AssistantTurn) => AssistantTurn) => patchChat(botId, (c) => ({ ...c, turns: c.turns.map((t) => (t.id === turnId && t.role === "assistant" ? f(t) : t)) })), [patchChat]);
  const loadChat = useCallback(async (bot: Bot, force = false) => {
    if (!backend || (!force && chats()[bot.id]?.loaded)) return;
    const generation = (loadGeneration.current[bot.id] ?? 0) + 1;
    loadGeneration.current[bot.id] = generation;
    if (force) { patchChat(bot.id, () => EMPTY); setPreview((p) => { const { [bot.id]: _, ...rest } = p; return rest; }); }
    if (bot.needsKey) { patchChat(bot.id, (c) => ({ ...c, loaded: true })); setPreview((p) => ({ ...p, [bot.id]: "Tap to set up chat" })); return; }
    try {
      const sessionId = await backend.botChatSession(bot);
      const raw = await backend.chat(bot).messages(sessionId);
      if (loadGeneration.current[bot.id] !== generation) return;
      const { history, turns } = loadTurns(raw);
      patchChat(bot.id, (c) => ({ ...c, sessionId, turns: c.turns.length ? c.turns : turns, loaded: true, error: undefined }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
    } catch (e: any) { if (loadGeneration.current[bot.id] === generation) patchChat(bot.id, (c) => ({ ...c, loaded: true, error: String(e?.message ?? e) })); }
  }, [backend, patchChat]);
  useEffect(() => { bots.forEach((b) => void loadChat(b)); }, [bots]);
  const runTurn = useCallback(async (bot: Bot, aid: string) => {
    if (!backend) return;
    const turnOf = () => chats()[bot.id]?.turns.find((t): t is AssistantTurn => t.id === aid && t.role === "assistant");
    const text = turnOf()?.prompt ?? "";
    const input = buildInput(text, turnOf()?.attachments);
    const startedAt = Date.now();
    patchTurn(bot.id, aid, (t) => ({ ...t, startedAt: t.startedAt ?? startedAt }));
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
          if (retry) { queue = []; patchTurn(bot.id, aid, (t) => ({ ...initialTurn(aid), at: t.at, startedAt: t.startedAt ?? startedAt, prompt: t.prompt, attachments: t.attachments, key: newRunKey() })); void Promise.resolve(retry === "bot_chat" ? backend.abandonBotChat?.(bot) : backend.forgetSession?.(bot)).then(() => attempt(true)).catch(fail); return; }
          if (a.status === "failed" && (a.code === "connection_lost" || a.code === "run_unknown")) { flush(); void recoverFromHistory(bot, sid, text).then((reply) => { if (reply) { const done = { type: "done", status: "completed" } as const; patchTurn(bot.id, aid, (t) => reduce({ ...t, text: reply }, done)); finish(done, reply); } else { queue.push(a); flush(); finish(a, acc); } }); return; }
          queue.push(a); flush(); finish(a, acc); return;
        }
        queue.push(a);
        if (!scheduled) { scheduled = true; raf(flush); }
      }, { key: turnOf()?.key });
    };
    try { await attempt(false); } catch (e: any) { fail(e); }
  }, [backend, patchChat, patchTurn, cheer]);
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
  const syncChat = useCallback((bot: Bot) => syncChatState({ backend, bot, chats, patchChat, setPreview, touch }), [backend, patchChat]);
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
  const awaitQueuedReply = useCallback((bot: Bot, aid: string) => waitForQueuedReply({ backend, bot, aid, chats, patchTurn, setPreview, cheer }), [backend, patchTurn, cheer]);
  const stop = useCallback((bot: Bot) => {
    const running = chats()[bot.id]?.turns.slice().reverse().find((t): t is AssistantTurn => t.role === "assistant" && t.status === "streaming" && !t.note);
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
  const newChat = useCallback(async (bot: Bot) => { if (!backend?.newBotChat) throw new Error("Starting a new chat isn't available here."); if (chats()[bot.id]?.busy) throw new Error("Wait for this reply to finish, or /stop it first."); await backend.newBotChat(bot);
    await loadChat(bot, true); }, [backend, loadChat]);
  const runCommand = useCallback(async (bot: Bot, command: string, profileWide: boolean) => { if (!backend?.runCommand) throw new CommandError({ kind: "no_bridge" }); const sid = chats()[bot.id]?.sessionId ?? (await backend.botChatSession(bot)); return backend.runCommand(bot, sid, command, profileWide); }, [backend]);
  const commandReply = useCallback((bot: Bot, typed: string, answer: string) => { const at = Date.now(); patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text: typed, at, local: true }, { ...initialTurn(nextId("a")), text: answer, status: "completed", at, local: true }] })); touch(bot.id, at); }, [patchChat]);
  const value = useMemo<Ctx>(() => ({ ready, demo, config, backend, bots, botsLoaded, botsError, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, setDraft, stop, approve, primaryId: primary, setPrimary, setActive: (id) => { active.current = id; if (id) setUnread((u) => ({ ...u, [id]: 0 })); }, react: (id, emoji) => { setReactions((r) => { const n = { ...r }; if (emoji) n[id] = emoji; else delete n[id]; return n; }); if (emoji) { const owner = Object.entries(chats()).find(([, c]) => c.turns.some((t) => t.id === id)); if (owner) cheer(owner[0]); } }, save: async (c) => { await saveConfig(c); await Store.deleteItem(DEMO_KEY); setConfig(c); setDemoState(BUILD_DEMO); }, setDemo: async (on) => { on ? await Store.setItem(DEMO_KEY, "1") : await Store.deleteItem(DEMO_KEY); setDemoState(on || BUILD_DEMO); } }), [ready, demo, config, backend, bots, botsLoaded, botsError, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, stop, approve, cheer, primary, setPrimary]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
export { parseMessages } from "./chat-model";
