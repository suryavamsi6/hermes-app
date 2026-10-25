// One continuous chat per bot (Hermes Bot Mode's "Bot Chat"), styled like the Grok Bot app: floating
// pill header, light-grey user bubbles, subtle dark reply cards with large text, no per-message avatar.
// Opens at the newest message (inverted list), follows a streaming reply while you're at the bottom,
// and shows a round jump-to-bottom button with a count of new messages when you've scrolled up.
// Date dividers between days; long-press a message for reactions, time, copy/share/quote/read aloud/
// edit; swipe a bubble left to quote it. The "…" menu holds search, the model picker and export.
import { router, useLocalSearchParams } from "expo-router";
import { ArrowDown, ChevronDown, ChevronLeft, ChevronUp, Cpu, Ellipsis, FileDown, Loader, RotateCcw, Search, Settings2, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, FlatList, Image, KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, PanResponder, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { restoreDraft, setDraftText, useApp, useBot, useChat, useMood, useReaction, useReconnecting } from "../../src/app-state";
import type { Bot } from "../../src/backend";
import type { AssistantTurn, Turn, UserTurn } from "../../src/chat-model";
import type { Attachment } from "../../src/attach";
import { canSteer as steerable, chatToMarkdown, editableLast, findMatches, runningTurn } from "../../src/chat-tools";
import { clearBotNotifications } from "../../src/notify";
import { ApprovalCard } from "../../src/ui/approval-card";
import { buildRows, type ChatRow } from "../../src/ui/chat-rows";
import { Composer } from "../../src/ui/composer";
import { activityLine } from "../../src/ui/activity";
import { Avatar, Chip } from "../../src/ui/kit";
import { ActivityRow } from "../../src/ui/activity-row";
import { ModelPicker } from "../../src/ui/model-picker";
import { enter, leave, PressScale, Rise } from "../../src/ui/motion";
import Reanimated from "react-native-reanimated";
import { Markdown, MarkedText } from "../../src/ui/markdown";
import { MessageMenu, quoteOf } from "../../src/ui/message-menu";
import { ReactionBadge } from "../../src/ui/reactions";
import { Sheet, SheetRow } from "../../src/ui/sheet";
import { SetupChat } from "../../src/ui/setup-chat";
import { StepsRow } from "../../src/ui/steps-row";
import { colors, radii, type } from "../../src/ui/theme";
import { useLoad } from "../../src/use-load";

const SUGGESTIONS: Record<string, string[]> = {
  default: ["What can you do?", "Plan my day", "Remember that I prefer 24-hour times"],
  "pi-ops": ["How's the homelab?", "Clean up old logs", "Any containers down?"],
  market: ["Market mood today?", "How are my holdings?", "Explain today's move"],
};

type RowProps = { turn: Turn; bot: Bot; isLast: boolean; time?: string; fresh?: boolean; highlight?: string; onLong: (t: Turn) => void; onQuote: (t: Turn) => void; onRetry: (id: string) => void };

/** Swipe a bubble left to quote it (Grok-style). Only claims clearly horizontal left drags, so
 *  scrolling the list and long-pressing still work. */
function SwipeQuote({ onQuote, children }: { onQuote: () => void; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx < -14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(-72, Math.min(0, g.dx))),
    onPanResponderRelease: (_e, g) => {
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      if (g.dx < -48) onQuote();
    },
  })).current;
  return <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>{children}</Animated.View>;
}

/** Memoised: while a reply streams, only the streaming row re-renders (other turns keep their identity). */
const TurnRow = memo(function TurnRow({ turn, bot, isLast, time, fresh, highlight, onLong, onQuote, onRetry }: RowProps) {
  const { react, approve } = useApp();
  const reaction = useReaction(turn.id);
  const longPress = () => onLong(turn);
  if (turn.role === "user") return <Rise play={fresh}><UserRow t={turn} time={time} reaction={reaction} longPress={longPress} unreact={() => react(turn.id, null)} quote={() => onQuote(turn)} highlight={highlight} /></Rise>;
  const t = turn as AssistantTurn;
  const activity = activityLine(t);
  const canRetry = !!t.prompt;
  const lost = t.errorCode === "connection_lost";
  const note = t.status === "failed" ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Text style={[type.label, { color: lost ? colors.muted : colors.danger, flexShrink: 1 }]}>
        {lost ? "Couldn't reach Hermes to finish this reply." : `That didn't work: ${t.error ?? "the run failed"}`}
      </Text>
      {canRetry ? <RetryPill onPress={() => onRetry(t.id)} /> : null}
    </View>
  ) : t.status === "cancelled" ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={type.label}>Stopped. Ready when you are.</Text>
      {canRetry ? <RetryPill onPress={() => onRetry(t.id)} /> : null}
    </View>
  ) : t.status === "queued" ? <Text style={type.label}>Hermes is busy with this chat in another window. The reply will show up here when it's done.</Text>
    : t.status === "streaming" && t.reconnecting ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite">
        <Loader size={13} color={colors.muted} /><Text style={type.label}>Reconnecting…</Text>
      </View>
    ) : null;
  return (
    <Rise play={fresh} style={{ gap: 8, alignItems: "flex-start" }}>
      {t.steps.length ? <View style={{ paddingLeft: 4 }}><StepsRow steps={t.steps} /></View> : null}
      {activity ? <ActivityRow bot={bot} text={activity} /> : null}
      {t.approval ? <Reanimated.View entering={enter.pop} exiting={leave.fade}><ApprovalCard approval={t.approval} respond={(c) => approve(bot, t.id, c)} /></Reanimated.View> : null}
      {t.steers?.length ? t.steers.map((s, i) => <Text key={i} style={[type.label, { paddingLeft: 4, color: colors.accentText }]}>↪ You added: {s}</Text>) : null}
      {t.text ? (
        <SwipeQuote onQuote={() => onQuote(turn)}>
          <Pressable onLongPress={longPress} delayLongPress={300}
            style={{ maxWidth: "94%", backgroundColor: colors.botBubble, borderRadius: radii.bubble, borderTopLeftRadius: isLast ? 8 : radii.bubble, paddingHorizontal: 18, paddingVertical: 14 }}>
            <Markdown text={t.text} highlight={highlight} />
          </Pressable>
        </SwipeQuote>
      ) : null}
      {reaction ? <ReactionBadge emoji={reaction} align="flex-start" onPress={() => react(turn.id, null)} /> : null}
      {note ? <View style={{ paddingLeft: 4 }}>{note}</View> : null}
      {time && t.status !== "streaming" ? <Text style={[type.label, { paddingLeft: 6, fontSize: 12, color: colors.dim }]}>{time}</Text> : null}
    </Rise>
  );
});

function RetryPill({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Retry" hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: pressed ? colors.controlActive : colors.control })}>
      <RotateCcw size={14} color={colors.text} /><Text style={[type.label, { color: colors.text }]}>Retry</Text>
    </Pressable>
  );
}

function UserRow({ t, time, reaction, longPress, unreact, quote, highlight }: { t: UserTurn; time?: string; reaction?: string; longPress: () => void; unreact: () => void; quote: () => void; highlight?: string }) {
  return (
    <View style={{ alignItems: "flex-end", gap: 4 }}>
      <SwipeQuote onQuote={quote}>
        <Pressable onLongPress={longPress} delayLongPress={300}
          style={{ maxWidth: "82%", backgroundColor: colors.userBubble, borderRadius: radii.bubble, borderTopRightRadius: 8, paddingHorizontal: 18, paddingVertical: 12 }}>
          {t.images?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: t.text ? 8 : 0 }}>
              {t.images.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 120, height: 120, borderRadius: radii.inset }} />)}
            </View>
          ) : t.imageCount ? <Text style={[type.label, { marginBottom: t.text ? 6 : 0 }]}>📷 {t.imageCount === 1 ? "Photo" : `${t.imageCount} photos`}</Text> : null}
          {t.text ? <MarkedText text={t.text} highlight={highlight} /> : null}
        </Pressable>
      </SwipeQuote>
      {reaction ? <ReactionBadge emoji={reaction} align="flex-end" onPress={unreact} /> : null}
      {time ? <Text style={[type.label, { paddingRight: 6, fontSize: 12, color: colors.dim }]}>{time}</Text> : null}
    </View>
  );
}

const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return <Text accessibilityRole="header" style={[type.label, { alignSelf: "center", fontSize: 12, color: colors.dim, paddingVertical: 2 }]}>{label}</Text>;
});

/** Round "jump to the newest message" button with a count of messages that arrived while scrolled up. */
function JumpButton({ unseen, onPress }: { unseen: number; onPress: () => void }) {
  return (
    <Reanimated.View entering={enter.pop} exiting={leave.pop} style={{ position: "absolute", bottom: 12, alignSelf: "center" }}>
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={unseen ? `Jump to the latest message, ${unseen} new` : "Jump to the latest message"} to={0.9}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.borderStrong, elevation: 4 }}>
      <ArrowDown size={22} color={colors.text} />
      {unseen ? (
        <View style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentText }}>
          <Text style={{ color: colors.actionForeground, fontSize: 11, fontWeight: "700" }}>{unseen > 99 ? "99+" : unseen}</Text>
        </View>
      ) : null}
    </PressScale>
    </Reanimated.View>
  );
}

/** Floating pill header (Grok-style): back circle, face + name pill (opens settings), "…" circle
 *  (search, model, export). Subscribes to the mood itself, so it re-renders only when the mood changes. */
const Header = memo(function Header({ bot, top, onMenu }: { bot: Bot; top: number; onMenu: () => void }) {
  const mood = useMood(bot.id);
  const reconnecting = useReconnecting(bot.id);
  const status = reconnecting ? "reconnecting…" : mood === "approval" ? "needs your OK" : mood === "thinking" ? "thinking…" : mood === "happy" ? "done! ✨" : mood === "error" ? "having a nap…" : null;
  const circle = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border } as const;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top, left: 0, right: 0, zIndex: 2, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Pressable hitSlop={8} accessibilityLabel="Back to bots" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={circle}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => router.push(`/bot-info/${bot.id}`)} accessibilityLabel={`${bot.name} settings`}
        style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 44, paddingLeft: 6, paddingRight: 16, borderRadius: 22, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
        <Avatar bot={bot} size={32} mood={mood} badge={false} />
        <View style={{ flexShrink: 1 }}>
          <Text style={[type.title, { fontSize: 17 }]} numberOfLines={1}>{bot.name}</Text>
          {status ? <Text style={[type.label, { fontSize: 11, lineHeight: 13, color: mood === "thinking" ? colors.accentText : colors.muted }]} numberOfLines={1}>{status}</Text> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable hitSlop={8} accessibilityLabel="Chat menu" onPress={onMenu} style={circle}>
        <Ellipsis size={22} color={colors.text} />
      </Pressable>
    </View>
  );
});

function EmptyChat({ bot, error, onPick }: { bot: Bot; error?: string; onPick: (s: string) => void }) {
  const mood = useMood(bot.id);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
      <Avatar bot={bot} size={84} mood={mood} />
      <Text style={[type.title, { fontSize: 20 }]}>Say hi to {bot.name}</Text>
      <Text style={[type.bodySm, { color: colors.muted, textAlign: "center" }]}>{error ? `Couldn't load the chat: ${error}` : bot.description}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 6 }}>
        {(SUGGESTIONS[bot.id] ?? SUGGESTIONS.default).map((s) => <Chip key={s} label={s} onPress={() => onPick(s)} />)}
      </View>
    </View>
  );
}

/** In-chat search bar: query, "n/m" matching messages, prev/next and close. */
function SearchBar({ query, setQuery, position, onNext, onPrev, onClose }: { query: string; setQuery: (q: string) => void; position: [number, number]; onNext: () => void; onPrev: () => void; onClose: () => void }) {
  const circle = { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.control } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
        <Search size={16} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search this chat" placeholderTextColor={colors.muted} accessibilityLabel="Search this chat" returnKeyType="search"
          style={{ flex: 1, color: colors.text, fontFamily: type.chat.fontFamily, fontSize: 15, paddingVertical: 0 }} />
        {query ? <Text style={[type.label, { color: colors.muted }]}>{position[0]}/{position[1]}</Text> : null}
      </View>
      {query ? <>
        <Pressable hitSlop={6} accessibilityLabel="Previous match" onPress={onPrev} style={circle}><ChevronUp size={18} color={colors.text} /></Pressable>
        <Pressable hitSlop={6} accessibilityLabel="Next match" onPress={onNext} style={circle}><ChevronDown size={18} color={colors.text} /></Pressable>
      </> : null}
      <Pressable hitSlop={6} accessibilityLabel="Close search" onPress={onClose} style={circle}><X size={18} color={colors.text} /></Pressable>
    </View>
  );
}

const AWAY = 320; // px scrolled up from the newest message before the jump button shows

export default function BotChatScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { loadChat, send, steer, retry, syncChat, stop, setActive, react, bots, backend, reloadBots } = useApp();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ChatRow>>(null);
  const chat = useChat(bot?.id);
  const turns = chat.turns;
  const rows = useMemo(() => buildRows(turns), [turns]);
  // Only messages that arrive while the chat is open animate in (never history), each once. Keyed by
  // role+time because a re-sync rebuilds turn ids.
  const openedAt = useRef(Date.now() - 1000);
  const played = useRef(new Set<string>());
  const isFresh = (t: Turn) => {
    if (!t.at || t.at < openedAt.current) return false;
    const k = `${t.role}:${t.at}`;
    if (played.current.has(k)) return false;
    played.current.add(k); return true;
  };
  const [menu, setMenu] = useState<Turn | null>(null);
  const menuReaction = useReaction(menu?.id ?? "");
  // "…" menu, the model picker sheet it opens, and in-chat search.
  const [chatMenu, setChatMenu] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const matches = useMemo(() => (searching ? findMatches(turns, query) : []), [searching, turns, query]);
  const models = useLoad(modelSheet && bot && backend && !bot.needsKey ? () => backend.listModels(bot) : null, [bot?.id, backend, modelSheet]);
  /** The user message being edited (Edit & resend): its id, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const editable = editableLast(turns);
  let lastAssistant: AssistantTurn | undefined;
  for (let i = turns.length - 1; i >= 0; i--) { const t = turns[i]; if (t.role === "assistant") { lastAssistant = t; break; } }

  const goMatch = useCallback((i: number) => {
    if (!matches.length) return;
    const h = ((i % matches.length) + matches.length) % matches.length;
    setHit(h);
    const row = rows.findIndex((r) => r.kind === "turn" && r.turn.id === matches[h].id);
    if (row >= 0) { try { list.current?.scrollToIndex({ index: row, animated: true, viewPosition: 0.4 }); } catch {} }
  }, [matches, rows]);
  // As the query changes, land on the newest match (like iMessage's search).
  useEffect(() => { if (matches.length) goMatch(matches.length - 1); else setHit(0); }, [matches.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const startSearch = useCallback(() => { setSearching(true); setQuery(""); setHit(0); }, []);

  const onQuote = useCallback((t: Turn) => { if (bot && t.text) setDraftText(bot.id, quoteOf(t.text)); }, [bot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportChat = useCallback(() => {
    if (!bot) return;
    void Share.share({ message: chatToMarkdown(bot.name, turns) }).catch(() => {});
  }, [bot?.id, turns]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickModel = useCallback(async (model: string | undefined, provider?: string) => {
    if (!bot || !backend) return;
    try { await backend.updateBot({ ...bot, model, provider }); await reloadBots(); } catch (e: any) { Alert.alert("Couldn't change the model", String(e?.message ?? e)); }
    setModelSheet(false);
  }, [bot, backend, reloadBots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll position: inverted list, so offset 0 is the newest message.
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  // "New" while scrolled up = messages added + replies that finished since you scrolled away.
  let progress = turns.length;
  for (const t of turns) if (t.role === "assistant" && t.status !== "streaming") progress++;
  const seen = useRef(progress);
  if (!away) seen.current = progress;
  const unseen = away ? Math.max(0, progress - seen.current) : 0;
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isAway = e.nativeEvent.contentOffset.y > AWAY;
    if (isAway !== awayRef.current) { awayRef.current = isAway; setAway(isAway); }
  }, []);
  const jump = useCallback(() => list.current?.scrollToOffset({ offset: 0, animated: true }), []);

  const onLong = useCallback((t: Turn) => setMenu(t), []);
  const onRetry = useCallback((id: string) => { if (bot) void retry(bot, id); }, [bot, retry]);
  const render = useCallback(({ item }: { item: ChatRow }) => !bot ? null : item.kind === "day" ? <DayDivider label={item.label} /> : (
    <TurnRow turn={item.turn} bot={bot} isLast={item.turn.id === lastAssistant?.id} time={item.time} fresh={isFresh(item.turn)} highlight={searching && query ? query : undefined} onLong={onLong} onQuote={onQuote} onRetry={onRetry} />
  ), [bot, lastAssistant?.id, onLong, onQuote, onRetry, searching, query]);
  const onSend = useCallback((t: string, images: Attachment[] = []) => { if (!bot) return; setEditing(null); if (awayRef.current) jump(); void send(bot, t, images); }, [bot, send, jump]);
  const onSteer = useCallback(async (t: string) => {
    if (!bot) return false;
    try { await steer(bot, t); return true; } catch (e: any) { Alert.alert("Couldn't add that", String(e?.detail ?? e?.message ?? e)); return false; }
  }, [bot, steer]);
  const onStop = useCallback(() => { if (bot) stop(bot); }, [bot, stop]);

  useEffect(() => {
    if (!bot) return;
    void restoreDraft(bot.id);
    setActive(bot.id);
    clearBotNotifications(bot.id);
    // First open loads the chat; later opens re-sync it (replies that landed while you were away).
    if (chat.loaded) void syncChat(bot); else void loadChat(bot);
    return () => setActive(null);
  }, [bot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!bot && bots.length) router.replace("/"); }, [bot, bots]);
  const onPlus = useCallback(() => { if (bot) router.push(`/bot-info/${bot.id}`); }, [bot]);
  if (!bot) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  const busy = chat.busy;
  const m = menu?.role === "assistant" ? (menu as AssistantTurn) : undefined;
  const live = m ? (turns.find((t) => t.id === m.id) as AssistantTurn | undefined) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header bot={bot} top={insets.top} onMenu={() => setChatMenu(true)} />
      <KeyboardAvoidingView style={{ flex: 1, paddingTop: insets.top + 56 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {searching && !bot.needsKey ? (
          <SearchBar query={query} setQuery={setQuery} position={[matches.length ? Math.min(hit + 1, matches.length) : 0, matches.length]}
            onPrev={() => goMatch(hit - 1)} onNext={() => goMatch(hit + 1)} onClose={() => { setSearching(false); setQuery(""); }} />
        ) : null}
        {bot.needsKey ? <SetupChat bot={bot} /> : turns.length === 0 ? (
          <EmptyChat bot={bot} error={chat.error} onPick={onSend} />
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList ref={list} data={rows} keyExtractor={(r) => r.key} renderItem={render} inverted
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
              onScroll={onScroll} scrollEventThrottle={64} keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS === "android"} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={11}
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12, gap: 18 }} />
            {away ? <JumpButton unseen={unseen} onPress={jump} /> : null}
          </View>
        )}
        <View style={{ paddingBottom: insets.bottom, display: bot.needsKey ? "none" : "flex" }}>
          <Composer botId={bot.id} busy={busy} placeholder={`Ask ${bot.name}`} onSend={onSend} onStop={onStop} onPlus={onPlus}
            onSteer={onSteer} canSteer={steerable(runningTurn(turns))} editing={!!editing} onCancelEdit={() => setEditing(null)} />
        </View>
      </KeyboardAvoidingView>
      <MessageMenu turn={menu} reaction={menuReaction} onClose={() => setMenu(null)} actions={{
        react: (e) => menu && react(menu.id, e),
        quote: () => { if (menu) setDraftText(bot.id, quoteOf(menu.text)); },
        edit: menu?.role === "user" && editable?.userId === menu.id
          ? () => { setEditing(editable.userId); setDraftText(bot.id, editable.text); }
          : undefined,
        retry: live && live.prompt && !busy && (live.status === "failed" || live.status === "cancelled") ? () => void retry(bot, live.id) : undefined,
        askAgain: live && live.prompt && !busy && live.status === "completed" && live.id === lastAssistant?.id ? () => onSend(live.prompt!) : undefined,
      }} />
      <Sheet visible={chatMenu} onClose={() => setChatMenu(false)}>
        <SheetRow icon={<Search size={20} color={colors.text} />} label="Search in chat" onPress={() => { setChatMenu(false); startSearch(); }} />
        <SheetRow icon={<Cpu size={20} color={colors.text} />} label={bot.model ? `Model · ${bot.model}` : "Model"} onPress={() => { setChatMenu(false); setModelSheet(true); }} />
        <SheetRow icon={<FileDown size={20} color={colors.text} />} label="Export as Markdown" onPress={() => { setChatMenu(false); exportChat(); }} />
        <SheetRow icon={<Settings2 size={20} color={colors.text} />} label="Bot settings" onPress={() => { setChatMenu(false); router.push(`/bot-info/${bot.id}`); }} />
      </Sheet>
      <Sheet visible={modelSheet} onClose={() => setModelSheet(false)}>
        <ModelPicker models={models.data} loading={models.loading} error={models.error} selected={bot.model} selectedProvider={bot.provider}
          onPick={(id, provider) => void pickModel(id, provider)} footer="Sent with each message, so it applies right away." />
      </Sheet>
    </View>
  );
}
