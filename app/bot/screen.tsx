import { router, useLocalSearchParams } from "expo-router";
import { Blocks, Phone, Cpu, FileDown, Search, Settings2, X, ChevronDown, ChevronUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { restoreDraft, setDraftText, useApp, useBot, useChat, useReaction } from "../../src/app-state";
import type { AssistantTurn, Turn } from "../../src/chat-model";
import type { Attachment, FileAttachment } from "../../src/attach";
import { ChatFollow } from "../../src/chat-follow";
import { catalog as slashCatalog, explain, failureNote, resolveSlash, skillMessage, type SlashAction } from "../../src/slash";
import { CommandError } from "../../src/backend";
import { canSteer as steerable, chatToMarkdown, editableLast, findMatches, runningTurn } from "../../src/chat-tools";
import { clearBotNotifications } from "../../src/notify";
import { buildRows, chatBody, type ChatRow } from "../../src/ui/chat-rows";
import { Composer } from "../../src/ui/composer";
import { ModelPicker } from "../../src/ui/model-picker";
import { usePrefs } from "../../src/prefs";
import { MessageMenu, quoteOf } from "../../src/ui/message-menu";
import { Scrim } from "../../src/ui/scrim";
import { Sheet, SheetRow } from "../../src/ui/sheet";
import { SetupChat } from "../../src/ui/setup-chat";
import { colors, radii, type } from "../../src/ui/theme";
import { useLoad } from "../../src/use-load";
import { ChatSkeleton, DayDivider, EmptyChat, Header, JumpButton, RowBoundary, TurnRow } from "./bits";

const AWAY = 320;
function SearchBar({ query, setQuery, position, onNext, onPrev, onClose }: { query: string; setQuery: (q: string) => void; position: [number, number]; onNext: () => void; onPrev: () => void; onClose: () => void }) {
  const circle = { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.control } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
        <Search size={16} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search this chat" placeholderTextColor={colors.muted} accessibilityLabel="Search this chat" style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 }} />
        {query ? <Text style={[type.label, { color: colors.muted }]}>{position[0]}/{position[1]}</Text> : null}
      </View>
      {query ? <><Pressable hitSlop={6} onPress={onPrev} style={circle}><ChevronUp size={18} color={colors.text} /></Pressable><Pressable hitSlop={6} onPress={onNext} style={circle}><ChevronDown size={18} color={colors.text} /></Pressable></> : null}
      <Pressable hitSlop={6} onPress={onClose} style={circle}><X size={18} color={colors.text} /></Pressable>
    </View>
  );
}
export default function BotChatScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const app = useApp();
  const { loadChat, newChat, runCommand, commandReply, send, steer, retry, syncChat, stop, approve, setActive, react, bots, backend, reloadBots } = app;
  const insets = useSafeAreaInsets();
  const [composerH, setComposerH] = useState(76);
  const list = useRef<FlatList<ChatRow>>(null);
  const chat = useChat(bot?.id);
  const turns = chat.turns;
  const body = chatBody(chat, bot?.needsKey);
  const rows = useMemo(() => buildRows(turns), [turns]);
  const showTimes = usePrefs((p) => p.showTimestamps);
  const openedAt = useRef(Date.now() - 1000);
  const played = useRef(new Set<string>());
  const isFresh = (t: Turn) => { if (!t.at || t.at < openedAt.current) return false; const k = `${t.role}:${t.at}`; if (played.current.has(k)) return false; played.current.add(k); return true; };
  const [menu, setMenu] = useState<Turn | null>(null);
  const menuReaction = useReaction(menu?.id ?? "");
  const [chatMenu, setChatMenu] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const matches = useMemo(() => (searching ? findMatches(turns, query) : []), [searching, turns, query]);
  const models = useLoad(modelSheet && bot && backend && !bot.needsKey ? () => backend.listModels(bot) : null, [bot?.id, backend, modelSheet]);
  const [editing, setEditing] = useState<string | null>(null);
  const editable = editableLast(turns);
  let lastAssistant: AssistantTurn | undefined;
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") { lastAssistant = t; break; } }
  const goMatch = useCallback((i: number) => { if (!matches.length) return; const h = ((i % matches.length) + matches.length) % matches.length; setHit(h); const row = rows.findIndex((r) => r.kind === "turn" && r.turn.id === matches[h].id); if (row >= 0) { try { list.current?.scrollToIndex({ index: row, animated: true, viewPosition: 0.4 }); } catch {} } }, [matches, rows]);
  useEffect(() => { if (matches.length) goMatch(matches.length - 1); else setHit(0); }, [matches.length]);
  const startSearch = useCallback(() => { setSearching(true); setQuery(""); setHit(0); }, []);
  const onQuote = useCallback((t: Turn) => { if (bot && t.text) setDraftText(bot.id, quoteOf(t.text)); }, [bot?.id]);
  const exportChat = useCallback(() => { if (!bot) return; void Share.share({ message: chatToMarkdown(bot.name, turns) }).catch(() => {}); }, [bot?.id, turns]);
  const pickModel = useCallback(async (model: string | undefined, provider?: string) => { if (!bot || !backend) return; try { await backend.updateBot({ ...bot, model, provider }); await reloadBots(); } catch (e: any) { Alert.alert("Couldn't change the model", String(e?.message ?? e)); } setModelSheet(false); }, [bot, backend, reloadBots]);
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  let progress = turns.length; for (const t of turns) if (t.role === "assistant" && t.status !== "streaming") progress++;
  const seen = useRef(progress); if (!away) seen.current = progress;
  const unseen = away ? Math.max(0, progress - seen.current) : 0;
  const jump = useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: true }), []);
  const follow = useRef<ChatFollow | null>(null);
  if (!follow.current) follow.current = new ChatFollow(() => requestAnimationFrame(() => list.current?.scrollToOffset({ offset: 0, animated: true })));
  const [, setFollowing] = useState(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { const y = e.nativeEvent.contentOffset.y; if (follow.current!.scrolled(y)) setFollowing(follow.current!.following()); const isAway = y > AWAY; if (isAway !== awayRef.current) { awayRef.current = isAway; setAway(isAway); } }, []);
  const toLatest = useCallback(() => { follow.current!.sent(); setFollowing(true); }, []);
  useEffect(() => { follow.current!.rowsChanged(); }, [rows]);
  const onLong = useCallback((t: Turn) => setMenu(t), []);
  const onRetry = useCallback((id: string) => { if (bot) void retry(bot, id); }, [bot, retry]);
  const render = useCallback(({ item }: { item: ChatRow }) => !bot ? null : item.kind === "day" ? <DayDivider label={item.label} /> : <RowBoundary><TurnRow turn={item.turn} bot={bot} isLast={item.turn.id === lastAssistant?.id} time={showTimes ? item.time : undefined} fresh={isFresh(item.turn)} highlight={searching && query ? query : undefined} onLong={onLong} onQuote={onQuote} onRetry={onRetry} /></RowBoundary>, [bot, lastAssistant?.id, onLong, onQuote, onRetry, searching, query, showTimes]);
  const onSend = useCallback((t: string, images: Attachment[] = [], files: FileAttachment[] = []) => { if (!bot) return; setEditing(null); toLatest(); void send(bot, t, images, files); }, [bot, send, toLatest]);
  const onSteer = useCallback(async (t: string) => { if (!bot) return false; toLatest(); try { await steer(bot, t); return true; } catch (e: any) { Alert.alert("Couldn't add that", String(e?.detail ?? e?.message ?? e)); return false; } }, [bot, steer, toLatest]);
  const onStop = useCallback(() => { if (bot) stop(bot); }, [bot, stop]);
  const skills = useLoad(bot && backend && !bot.needsKey ? () => backend.listSkills(bot).catch(() => []) : null, [bot?.id, backend]);
  const serverCmds = useLoad(bot && backend?.serverCommands && !bot.needsKey ? () => backend.serverCommands!(bot) : null, [bot?.id, backend]);
  const commands = useMemo(() => slashCatalog(skills.data ?? [], serverCmds.data ?? []), [skills.data, serverCmds.data]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 10000); return () => clearTimeout(t); }, [note]);
  const [modelQuery, setModelQuery] = useState("");
  const onSlash = (text: string, images: Attachment[], files: FileAttachment[]): "sent" | "done" | "kept" | false => {
    if (!bot || !backend) return false;
    const a = resolveSlash(text, skills.data ?? [], serverCmds.data ?? []);
    if (!a) return false;
    setNote(null);
    const running = runningTurn(turns);
    const busy = chat.busy;
    const say = (s: string) => setNote(s);
    switch (a.type) {
      case "help": setTimeout(() => setDraftText(bot.id, "/"), 0); return "done";
      case "status": say(`${bot.name} \u00b7 ${bot.profile} \u00b7 ${bot.model ?? "default"}`); return "done";
      case "stop": if (busy) stop(bot); else say("Nothing is running."); return "done";
      case "retry": if (busy) say("Wait for this reply to finish."); else if (lastAssistant?.prompt) void retry(bot, lastAssistant.id); else say("Nothing to run again yet."); return "done";
      case "steer": if (running && steerable(running)) void onSteer(a.text); else say("Nothing is running."); return "done";
      case "approve": if (lastAssistant?.approval && lastAssistant.status === "streaming") void approve(bot, lastAssistant.id, a.choice); else say("Nothing is waiting."); return "done";
      case "model": setModelQuery(a.query); setModelSheet(true); return "done";
      case "new": if (busy) say("Wait for this reply to finish."); else void newChat(bot).then(() => say("New chat started."), (e: any) => say(String(e?.message ?? e))); return "done";
      case "search": startSearch(); return "done";
      case "export": exportChat(); return "done";
      case "open": { const to = { settings: `/bot-info/${bot.id}`, skills: `/bot-info/${bot.id}`, mcp: `/mcp/${bot.id}`, plugins: `/plugins/${bot.id}`, memory: `/memory/${bot.id}`, routines: `/routines?bot=${bot.id}`, topics: `/history/${bot.id}`, activity: `/activity/${bot.id}`, call: `/call/${bot.id}` }[a.screen]; router.push(to as any); return "done"; }
      case "skill": onSend(skillMessage(a.name, a.arg), images, files); return "sent";
      case "rename": if (!backend.updateSession) { say("Renaming isn't available here."); return "done"; } void backend.updateSession(bot, chat.sessionId ?? "", { title: a.title }).then(() => say("Renamed."), (e: any) => say(String(e?.message ?? e))); return "done";
      case "restart": say("/restart needs the server bridge."); return "done";
      case "hermes": say(`Running ${a.command.split(/\s/)[0]}`); void runCommand(bot, a.command, a.profileWide).then((r) => { setNote(null); if (r.type === "send") onSend(r.message); else commandReply(bot, text.trim(), r.output.trim() || "Done."); }, (e: any) => setNote(e instanceof CommandError ? failureNote(a.name, e.failure) : String(e?.message ?? e))); return "done";
      default: say(explain(a)); return "kept";
    }
  };
  useEffect(() => { if (!bot) return; void restoreDraft(bot.id); setActive(bot.id); clearBotNotifications(bot.id); if (chat.loaded) void syncChat(bot); else void loadChat(bot); return () => setActive(null); }, [bot?.id]);
  useEffect(() => { if (!bot && bots.length) router.replace("/"); }, [bot, bots]);
  if (!bot) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  const headerH = insets.top + 56;
  const topInset = headerH + (searching && !bot.needsKey ? 48 : 0);
  const bottomInset = bot.needsKey ? insets.bottom : composerH;
  const busy = chat.busy;
  const live = menu?.role === "assistant" ? (turns.find((t) => t.id === menu.id) as AssistantTurn | undefined) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {body === "setup" || body === "skeleton" || body === "empty" ? (
          <View style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomInset }}>
            {body === "setup" ? <SetupChat bot={bot} /> : body === "skeleton" ? <ChatSkeleton /> : <EmptyChat bot={bot} error={chat.error} onPick={onSend} onRetry={() => void loadChat(bot, true)} />}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList ref={list} data={rows} keyExtractor={(r) => r.key} renderItem={render} inverted maintainVisibleContentPosition={follow.current!.anchor()} onScroll={onScroll} scrollEventThrottle={64} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: bottomInset + 12, paddingBottom: topInset + 12, gap: 18 }} />
            {away ? <JumpButton unseen={unseen} onPress={jump} bottom={bottomInset + 12} /> : null}
          </View>
        )}
        <Scrim side="top" style={{ top: 0, height: topInset + 28 }} />
        {searching && !bot.needsKey ? <View style={{ position: "absolute", top: headerH, left: 0, right: 0, zIndex: 2 }}><SearchBar query={query} setQuery={setQuery} position={[matches.length ? Math.min(hit + 1, matches.length) : 0, matches.length]} onPrev={() => goMatch(hit - 1)} onNext={() => goMatch(hit + 1)} onClose={() => { setSearching(false); setQuery(""); }} /></View> : null}
        <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (Math.abs(h - composerH) > 1) setComposerH(h); }} style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 10, paddingBottom: insets.bottom, display: bot.needsKey ? "none" : "flex" }}>
          <Scrim side="bottom" style={{ top: 0, bottom: 0 }} />
          {note ? <View style={{ flexDirection: "row", gap: 10, marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: radii.card, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}><Text style={[type.bodySm, { flex: 1 }]}>{note}</Text><Pressable onPress={() => setNote(null)}><X size={15} color={colors.muted} /></Pressable></View> : null}
          <Composer botId={bot.id} busy={busy} placeholder={`Ask ${bot.name}`} onSend={onSend} onStop={onStop} onSteer={onSteer} canSteer={steerable(runningTurn(turns))} editing={!!editing} onCancelEdit={() => setEditing(null)} commands={commands} onSlash={onSlash} />
        </View>
      </KeyboardAvoidingView>
      <Header bot={bot} top={insets.top} onMenu={() => setChatMenu(true)} />
      <MessageMenu turn={menu} reaction={menuReaction} onClose={() => setMenu(null)} actions={{ react: (e) => menu && react(menu.id, e), quote: () => { if (menu) setDraftText(bot.id, quoteOf(menu.text)); }, edit: menu?.role === "user" && editable?.userId === menu.id ? () => { setEditing(editable.userId); setDraftText(bot.id, editable.text); } : undefined, retry: live && live.prompt && !busy && (live.status === "failed" || live.status === "cancelled") ? () => void retry(bot, live.id) : undefined, askAgain: live && live.prompt && !busy && live.status === "completed" && live.id === lastAssistant?.id ? () => onSend(live.prompt!) : undefined }} />
      <Sheet visible={chatMenu} onClose={() => setChatMenu(false)}>
        <SheetRow icon={<Search size={20} color={colors.text} />} label="Search in chat" onPress={() => { setChatMenu(false); startSearch(); }} />
        <SheetRow icon={<Cpu size={20} color={colors.text} />} label={bot.model ? `Model ${bot.model}` : "Model"} onPress={() => { setChatMenu(false); setModelSheet(true); }} />
        <SheetRow icon={<Phone size={20} color={colors.text} />} label="Voice call" onPress={() => { setChatMenu(false); router.push(`/call/${bot.id}`); }} />
        <SheetRow icon={<FileDown size={20} color={colors.text} />} label="Export as Markdown" onPress={() => { setChatMenu(false); exportChat(); }} />
        <SheetRow icon={<Blocks size={20} color={colors.text} />} label="Plugins" onPress={() => { setChatMenu(false); router.push(`/plugins/${bot.id}`); }} />
        <SheetRow icon={<Settings2 size={20} color={colors.text} />} label="Bot settings" onPress={() => { setChatMenu(false); router.push(`/bot-info/${bot.id}`); }} />
      </Sheet>
      <Sheet visible={modelSheet} onClose={() => { setModelSheet(false); setModelQuery(""); }}>
        <ModelPicker key={modelQuery} initialQuery={modelQuery} models={models.data} loading={models.loading} error={models.error} selected={bot.model} selectedProvider={bot.provider} onPick={(id, provider) => void pickModel(id, provider)} footer="Sent with each message, so it applies right away." />
      </Sheet>
    </View>
  );
}
