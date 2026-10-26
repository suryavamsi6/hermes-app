// One continuous chat per bot (Hermes Bot Mode's "Bot Chat"), styled like the Grok Bot app: floating
// pill header, light-grey user bubbles, subtle dark reply cards with large text, no per-message avatar.
// Opens at the newest message (inverted list), follows a streaming reply while you're at the bottom,
// and shows a round jump-to-bottom button with a count of new messages when you've scrolled up.
// Date dividers between days; long-press a message for reactions, time, copy/share/quote/read aloud/
// edit; swipe a bubble left to quote it. The "…" menu holds search, the model picker and export.
import { router, useLocalSearchParams } from "expo-router";
import { Blocks, CircleAlert, WifiOff, Phone, ArrowDown, ChevronDown, ChevronLeft, ChevronUp, Cpu, Ellipsis, FileDown, FileText, Loader, RotateCcw, Search, Settings2, X } from "lucide-react-native";
import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, FlatList, Image, KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, PanResponder, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { restoreDraft, setDraftText, useApp, useBot, useChat, useHasApproval, useMood, useReaction, useReconnecting } from "../../src/app-state";
import { moodLabel, turnMood } from "../../src/ui/face-state";
import { type Bot, CommandError } from "../../src/backend";
import type { AssistantTurn, Turn, UserTurn } from "../../src/chat-model";
import type { Attachment, FileAttachment } from "../../src/attach";
import { ChatFollow } from "../../src/chat-follow";
import { catalog as slashCatalog, explain, failureNote, resolveSlash, type SlashAction, skillDisplay, skillMessage } from "../../src/slash";
import { pieces, scrollsSideways } from "../../src/text-safety";
import { canSteer as steerable, chatToMarkdown, editableLast, findMatches, runningTurn } from "../../src/chat-tools";
import { clearBotNotifications } from "../../src/notify";
import { ApprovalCard } from "../../src/ui/approval-card";
import { buildRows, chatBody, type ChatRow } from "../../src/ui/chat-rows";
import { Composer } from "../../src/ui/composer";
import { activityLine, idleKind } from "../../src/ui/activity";
import { Avatar, Chip, TapFace } from "../../src/ui/kit";
import { ActivityRow } from "../../src/ui/activity-row";
import { ModelPicker } from "../../src/ui/model-picker";
import { usePrefs } from "../../src/prefs";
import { enter, leave, PressScale, Rise, Skeleton, Spin } from "../../src/ui/motion";
import { NoticeChip } from "../../src/ui/notice-chip";
import Reanimated from "react-native-reanimated";
import { Markdown, MarkedText } from "../../src/ui/markdown";
import { MessageMenu, quoteOf } from "../../src/ui/message-menu";
import { ReactionBadge } from "../../src/ui/reactions";
import { Scrim } from "../../src/ui/scrim";
import { Sheet, SheetRow } from "../../src/ui/sheet";
import { SetupChat } from "../../src/ui/setup-chat";
import { StepsRow } from "../../src/ui/steps-row";
import { colors, radii, type } from "../../src/ui/theme";
import { useLoad } from "../../src/use-load";

const SUGGESTIONS: Record<string, string[]> = {
  default: ["What can you do?", "Plan my day", "Remember that I prefer 24-hour times"],
  forge: ["How's the server?", "Clean up old logs", "Any containers down?"],
  nova: ["Market mood today?", "How are my holdings?", "Explain today's move"],
};

type RowProps = { turn: Turn; bot: Bot; isLast: boolean; time?: string; fresh?: boolean; highlight?: string; onLong: (t: Turn) => void; onQuote: (t: Turn) => void; onRetry: (id: string) => void };

/** Swipe a bubble left to quote it (Grok-style). Only claims clearly horizontal left drags, so
 *  scrolling the list and long-pressing still work. */
function SwipeQuote({ onQuote, children, style }: { onQuote: () => void; children: ReactNode; style?: object }) {
  const x = useRef(new Animated.Value(0)).current;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx < -14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(-72, Math.min(0, g.dx))),
    onPanResponderRelease: (_e, g) => {
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      if (g.dx < -48) onQuote();
    },
  })).current;
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]} {...responder.panHandlers}>{children}</Animated.View>;
}

/** One message that fails to render shows a short note instead of taking the whole chat down. */
class RowBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text style={[type.label, { color: colors.muted, paddingLeft: 6 }]}>This message couldn't be shown.</Text> : this.props.children; }
}

/** Memoised: while a reply streams, only the streaming row re-renders (other turns keep their identity). */
const TurnRow = memo(function TurnRow({ turn, bot, isLast, time, fresh, highlight, onLong, onQuote, onRetry }: RowProps) {
  const { react, approve } = useApp();
  const reaction = useReaction(turn.id);
  const longPress = () => onLong(turn);
  if (turn.role === "user" && turn.notice) return <NoticeChip title={turn.notice.title} body={turn.notice.body} time={time} />;
  if (turn.role === "user") return <Rise play={fresh}><UserRow t={turn} time={time} reaction={reaction} longPress={longPress} unreact={() => react(turn.id, null)} quote={() => onQuote(turn)} highlight={highlight} /></Rise>;
  const t = turn as AssistantTurn;
  const activity = activityLine(t);
  const wide = !!t.text && scrollsSideways(t.text);
  const showStatus = usePrefs((p) => p.showStatus);
  const canRetry = !!t.prompt;
  const lost = t.errorCode === "connection_lost";
  const note = t.status === "failed" ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }} accessibilityLiveRegion="polite">
      {lost ? <WifiOff size={14} color={colors.muted} /> : <CircleAlert size={14} color={colors.danger} />}
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
        <Spin><Loader size={13} color={colors.muted} /></Spin><Text style={type.label}>Reconnecting…</Text>
      </View>
    ) : null;
  return (
    <Rise play={fresh} style={{ gap: 8, alignItems: "flex-start" }}>
      {t.steps.length ? <View style={{ paddingLeft: 4 }}><StepsRow steps={t.steps} botId={bot.id} turnId={t.id} /></View> : null}
      {activity ? <ActivityRow bot={bot} mood={turnMood(t)} text={showStatus ? activity : "Working"} idle={showStatus ? idleKind(t) : null} /> : null}
      {t.approval ? <Rise scale={0.96}><ApprovalCard approval={t.approval} respond={(c) => approve(bot, t.id, c)} onEdit={(d) => setDraftText(bot.id, `Don't run that. Instead:\n${d}`)} /></Rise> : null}
      {t.steers?.length ? t.steers.map((s, i) => <Text key={i} style={[type.label, { paddingLeft: 4, color: colors.accentText }]}>↳ You added: {s}</Text>) : null}
      {t.text ? (
        <SwipeQuote onQuote={() => onQuote(turn)} style={wide ? { width: "94%" } : { maxWidth: "94%" }}>
          <Markdown text={t.text} highlight={highlight} streaming={t.status === "streaming"} wrap={(c, i, n) => (
            <Pressable onLongPress={longPress} delayLongPress={300}
              style={[piece(i, n, 14), { backgroundColor: colors.botBubble }, i === 0 ? { borderTopLeftRadius: isLast ? 8 : radii.bubble } : null]}>
              {c}
            </Pressable>
          )} />
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

function piece(i: number, n: number, pad: number) {
  const r = radii.bubble;
  return { paddingHorizontal: 18, paddingTop: i === 0 ? pad : 5, paddingBottom: i === n - 1 ? pad : 5,
    borderTopLeftRadius: i === 0 ? r : 0, borderTopRightRadius: i === 0 ? r : 0, borderBottomLeftRadius: i === n - 1 ? r : 0, borderBottomRightRadius: i === n - 1 ? r : 0 } as const;
}

function UserRow({ t: raw, time, reaction, longPress, unreact, quote, highlight }: { t: UserTurn; time?: string; reaction?: string; longPress: () => void; unreact: () => void; quote: () => void; highlight?: string }) {
  const shown = raw.text ? skillDisplay(raw.text) : null;
  const t = shown ? { ...raw, text: shown } : raw;
  return (
    <View style={{ alignItems: "flex-end", gap: 4 }}>
      <SwipeQuote onQuote={quote} style={{ maxWidth: "82%" }}>
        {(t.text ? pieces(t.text) : [""]).map((p, i, all) => (
          <Pressable key={i} onLongPress={longPress} delayLongPress={300}
            style={[piece(i, all.length, 12), { backgroundColor: colors.userBubble }, i === 0 ? { borderTopRightRadius: 8 } : null]}>
            {i === 0 ? <>
          {t.images?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: t.text ? 8 : 0 }}>
              {t.images.map((u) => <Image key={u} source={{ uri: u }} resizeMethod="resize" style={{ width: 120, height: 120, borderRadius: radii.inset }} />)}
            </View>
          ) : t.imageCount ? <Text style={[type.label, { marginBottom: t.text ? 6 : 0 }]}>📷 {t.imageCount === 1 ? "Photo" : `${t.imageCount} photos`}</Text> : null}
          {t.files?.length ? (
            <View style={{ gap: 6, marginBottom: t.text ? 8 : 0 }}>
              {t.files.map((f, i) => (
                <View key={f + i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.inset, backgroundColor: colors.control }}>
                  <FileText size={16} color={colors.muted} />
                  <Text numberOfLines={1} style={[type.bodySm, { flexShrink: 1, color: colors.text }]}>{f}</Text>
                </View>
              ))}
            </View>
          ) : null}
            </> : null}
            {p ? <MarkedText text={p} highlight={highlight} /> : null}
          </Pressable>
        ))}
      </SwipeQuote>
      {reaction ? <ReactionBadge emoji={reaction} align="flex-end" onPress={unreact} /> : null}
      {time ? <Text style={[type.label, { paddingRight: 6, fontSize: 12, color: colors.dim }]}>{time}</Text> : null}
    </View>
  );
}

const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return <Text accessibilityRole="header" style={[type.label, { alignSelf: "center", fontSize: 12, color: colors.dim, paddingVertical: 2 }]}>{label}</Text>;
});

function JumpButton({ unseen, onPress, bottom }: { unseen: number; onPress: () => void; bottom: number }) {
  return (
    <Reanimated.View entering={enter.pop} exiting={leave.pop} style={{ position: "absolute", bottom, alignSelf: "center" }}>
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

const Header = memo(function Header({ bot, top, onMenu }: { bot: Bot; top: number; onMenu: () => void }) {
  const mood = useMood(bot.id, true);
  const reconnecting = useReconnecting(bot.id);
  const status = moodLabel(mood, { reconnecting, approval: useHasApproval(bot.id) });
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
          {status ? <Text style={[type.label, { fontSize: 11, lineHeight: 13, color: mood === "thinking" || mood === "working" ? colors.accentText : mood === "waiting" ? colors.warning : colors.muted }]} numberOfLines={1}>{status}</Text> : null}
        </View>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable hitSlop={8} accessibilityLabel="Chat menu" onPress={onMenu} style={circle}>
        <Ellipsis size={22} color={colors.text} />
      </Pressable>
    </View>
  );
});

function ChatSkeleton() {
  return (
    <View accessibilityLabel="Loading the chat" style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 14, paddingBottom: 16, gap: 18 }}>
      <Skeleton width="58%" height={44} radius={radii.bubble} style={{ alignSelf: "flex-end" }} />
      <View style={{ gap: 8 }}>
        <Skeleton width="86%" height={16} />
        <Skeleton width="72%" height={16} />
        <Skeleton width="40%" height={16} />
      </View>
      <Skeleton width="46%" height={44} radius={radii.bubble} style={{ alignSelf: "flex-end" }} />
      <View style={{ gap: 8 }}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="55%" height={16} />
      </View>
    </View>
  );
}

function EmptyChat({ bot, error, onPick, onRetry }: { bot: Bot; error?: string; onPick: (s: string) => void; onRetry: () => void }) {
  const mood = useMood(bot.id, true);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
      <TapFace bot={bot} size={84} mood={mood} label={`${bot.name}'s face`} />
      <Text style={[type.title, { fontSize: 20 }]}>Say hi to {bot.name}</Text>
      <Text style={[type.bodySm, { color: error ? colors.danger : colors.muted, textAlign: "center" }]}>{error ? `Couldn't load the chat: ${error}` : bot.description}</Text>
      {error ? <RetryPill onPress={onRetry} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 6 }}>
        {(SUGGESTIONS[bot.id] ?? SUGGESTIONS.default).map((s) => <Chip key={s} label={s} onPress={() => onPick(s)} />)}
      </View>
    </View>
  );
}
