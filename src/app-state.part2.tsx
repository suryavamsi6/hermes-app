  const send = useCallback(async (bot: Bot, text: string, images: { uri: string; dataUrl: string }[] = [], files: { name: string; text: string }[] = []) => {
    if (!backend) return;
    const aid = nextId("a"); const at = Date.now();
    const pics = images.length ? { images: images.map((i) => i.uri) } : {};
    const attachments = images.length ? { attachments: images.map((i) => i.dataUrl) } : {};
    // Text files go inline (Hermes's runs API takes text and images only); the bubble shows chips.
    const prompt = files.length ? withFiles(text, files) : text;
    const docs = files.length ? { files: files.map((f) => f.name), raw: prompt } : {};
    patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text, at, ...pics, ...docs }, { ...initialTurn(aid), at, prompt, key: newRunKey(), ...attachments }] }));
    setPreview((p) => ({ ...p, [bot.id]: `You: ${plain(text) || (files.length ? `📎 ${files[0].name}` : "📷 Photo")}` }));
    touch(bot.id);
    await runTurn(bot, aid);
  }, [backend, patchChat, runTurn]);

  /** Retry a failed or stopped turn in place (no second user bubble). After a lost connection the
   *  same Idempotency-Key is reused, so Hermes replays that run rather than storing the message again. */
  const retry = useCallback(async (bot: Bot, turnId: string) => {
    const t = chats()[bot.id]?.turns.find((x): x is AssistantTurn => x.id === turnId && x.role === "assistant");
    if ((!t?.prompt && !t?.attachments?.length) || t.status === "streaming" || chats()[bot.id]?.busy) return;
    patchTurn(bot.id, turnId, (x) => ({ ...initialTurn(turnId), at: x.at, prompt: x.prompt, attachments: x.attachments, key: retryReusesKey(x) && x.key ? x.key : newRunKey() }));
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
      const shown = (now?.turns ?? []).filter((t) => !t.local && (t.role === "user" || t.status === "completed")).map((t) => (t as { raw?: string }).raw ?? t.text);
      const same = shown.length === history.length && history.every((m, i) => m.text === shown[i]);
      if (same) return;
      patchChat(bot.id, (x) => ({ ...x, sessionId: sid, turns: toTurns(history), error: undefined }));
      const last = history[history.length - 1];
      if (last) { setPreview((p) => ({ ...p, [bot.id]: previewOf(last) })); if (last.at) touch(bot.id, last.at); }
    } catch {}
  }, [backend, patchChat]);

  // Back in the foreground: wake any reconnecting stream right away, and pick up replies that
  // landed while the phone slept (a routine's message, a queued Bot Chat answer).
  const appActive = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener?.("change", (st) => {
      const was = appActive.current;
      appActive.current = st === "active";
      // Backgrounded: Android may drop the sockets; that's expected, so streams go quiet (no
      // "Reconnecting") and resume silently when the app is back.
      if (st !== "active") {
        flushDrafts(); Object.values(aborts.current).forEach((h) => h?.quiet?.(true));
        return;
      }
      if (was) return;
      Object.values(aborts.current).forEach((h) => { h?.quiet?.(false); h?.nudge?.(); });
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

  const newChat = useCallback(async (bot: Bot) => {
    if (!backend?.newBotChat) throw new Error("Starting a new chat isn't available here.");
    if (chats()[bot.id]?.busy) throw new Error("Wait for this reply to finish, or /stop it first.");
    await backend.newBotChat(bot);
    await loadChat(bot, true);
  }, [backend, loadChat]);

  const runCommand = useCallback(async (bot: Bot, command: string, profileWide: boolean) => {
    if (!backend?.runCommand) throw new CommandError({ kind: "no_bridge" });
    const sid = chats()[bot.id]?.sessionId ?? (await backend.botChatSession(bot));
    return backend.runCommand(bot, sid, command, profileWide);
  }, [backend]);
  const commandReply = useCallback((bot: Bot, typed: string, answer: string) => {
    const at = Date.now();
    patchChat(bot.id, (c) => ({ ...c, turns: [...c.turns, { id: nextId("u"), role: "user", text: typed, at, local: true },
      { ...initialTurn(nextId("a")), text: answer, status: "completed", at, local: true }] }));
    touch(bot.id, at);
  }, [patchChat]);

  const value = useMemo<Ctx>(() => ({
    ready, demo, config, backend, bots, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, setDraft, stop, approve, primaryId: primary, setPrimary,
    setActive: (id) => { active.current = id; if (id) setUnread((u) => ({ ...u, [id]: 0 })); },
    react: (id, emoji) => {
      setReactions((r) => { const n = { ...r }; if (emoji) n[id] = emoji; else delete n[id]; return n; });
      if (emoji) { const owner = Object.entries(chats()).find(([, c]) => c.turns.some((t) => t.id === id)); if (owner) cheer(owner[0]); }
    },
    save: async (c) => { await saveConfig(c); await Store.deleteItem(DEMO_KEY); setConfig(c); setDemoState(BUILD_DEMO); },
    setDemo: async (on) => { on ? await Store.setItem(DEMO_KEY, "1") : await Store.deleteItem(DEMO_KEY); setDemoState(on || BUILD_DEMO); },
  }), [ready, demo, config, backend, bots, reloadBots, loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, stop, approve, cheer, primary, setPrimary]);
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
/** Home's "Today" card: totals across bots (primitives only, so selectors stay cheap and stable). */
export const useTotalUnread = () => useStore(live, (s) => Object.values(s.unread).reduce((n, v) => n + (v ?? 0), 0));
export const useApprovalBots = () => useStore(live, (s) => Object.entries(s.chats).filter(([, c]) => c.turns.some((t) => t.role === "assistant" && !!(t as any).approval)).map(([id]) => id).join(","));
export const useBusyCount = () => useStore(live, (s) => Object.values(s.chats).filter((c) => c.busy).length);
export const usePreview = (botId: string) => useStore(live, (s) => s.preview[botId] ?? "");
export const useBusy = (botId: string) => useStore(live, (s) => s.chats[botId]?.busy ?? false);
export const useReaction = (id: string) => useStore(live, (s) => s.reactions[id]);
/** Composer focused or dictating, per bot (drives the "listening" face in that chat). */
const listenStore = createStore<Record<string, boolean>>({});
export const setListening = (botId: string, on: boolean) => listenStore.set((s) => (!!s[botId] === on ? s : { ...s, [botId]: on }));
/** The bot's face mood from real state (see face-state.ts). `withListening`: also show "listening"
 *  while you type or dictate to it (only the open chat passes this). */
export const useMood = (botId: string, withListening = false): FaceMood => {
  const listening = useStore(listenStore, (s) => withListening && !!s[botId]);
  return useStore(live, (s) => faceMood(s.chats[botId], { happy: !!s.happy[botId], listening }));
};
/** What the bot is doing right now, in words ("Running git status", "Thinking"), or "" when idle. */
export const useActivity = (botId: string) => useStore(live, (s) => {
  const c = s.chats[botId];
  if (!c?.busy) return "";
  for (let i = c.turns.length - 1; i >= 0; i--) { const t = c.turns[i]; if (t.role === "assistant") return t.status === "streaming" && !t.note ? (t.text ? "Writing a reply" : activityLine(t) ?? "") : "Thinking"; }
  return "Thinking";
});
/** The latest reply is paused waiting for your OK (an approval card is showing). */
export const useHasApproval = (botId: string) => useStore(live, (s) => {
  const turns = s.chats[botId]?.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") return t.status === "streaming" && !t.note && !!t.approval; }
  return false;
});
/** The running reply lost its connection and is quietly re-attaching. */
export const useReconnecting = (botId: string) => useStore(live, (s) => {
  const turns = s.chats[botId]?.turns ?? [];
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") return !!t.reconnecting && t.status === "streaming" && !t.note; }
  return false;
});
export const useLastAt = (botId: string) => useStore(live, (s) => s.lastAt[botId]);
export const resetLive = () => live.set(() => ({ chats: {}, unread: {}, preview: {}, reactions: {}, happy: {}, lastAt: {}, drafts: {} }));
export const setDraftText = setDraft;
export const useDraft = (botId: string) => useStore(live, (s) => s.drafts[botId] ?? "");

export const useBot = (id?: string) => { const { bots } = useApp(); return bots.find((b) => b.id === id); };
export { parseMessages } from "./chat-model";
