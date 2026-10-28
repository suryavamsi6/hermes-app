// Compact Home attention summaries. Carousel presentation is a later phase; every current
// actionable item still opens its actual chat, step list, or routine destination.
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, CalendarClock, MessageCircle, ShieldQuestion, Timer } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useAttentionChats, useApp, useTotalUnread, useUnreadBots } from "../app-state";
import { failedRoutinesLink, isFailing } from "../job-text";
import type { AttentionItem } from "./attention-items";
import { selectAttentionItems } from "./attention-items";
import { setStepsPage } from "./steps-page";
import { useLoad } from "../use-load";
import { colors, font, radii, type } from "./theme";

const glyph = {
  approval: ShieldQuestion,
  running: Timer,
  failed: AlertTriangle,
  time: CalendarClock,
} as const;

export function TodayCard({ loading }: { loading: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    const resume = () => { if (!timer) { tick(); timer = setInterval(tick, 1000); } };
    const pause = () => { if (timer) clearInterval(timer); timer = undefined; };
    if (AppState.currentState === "active") resume();
    const sub = AppState.addEventListener("change", (state) => state === "active" ? resume() : pause());
    return () => { pause(); sub.remove(); };
  }, []));
  const { backend, bots } = useApp();
  const chats = useAttentionChats();
  const unread = useTotalUnread();
  const unreadIds = useUnreadBots();
  const unreadBots = useMemo(() => (unreadIds ? unreadIds.split(",") : []), [unreadIds]);
  const attention = useMemo(() => selectAttentionItems(chats, now, { loading: loading || bots.some((bot) => !chats[bot.id]?.loaded) }), [chats, now, loading, bots]);
  // Keep the existing routine result and direct-to-failures destination.
  const failing = useLoad(backend && bots.length && bots.length <= 12 ? async () => {
    const all = await Promise.all(bots.map(async (b) => { try { return (await backend.listJobs(b)).filter(isFailing).map((j) => ({ botId: b.id, jobId: j.id })); } catch { return []; } }));
    return all.flat();
  } : null, [backend, bots.length]);
  const actions = attention.items.filter((item) => item.kind !== "time");
  const firstUnread = bots.find((bot) => unreadBots.includes(bot.id));

  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8,
      borderRadius: 24, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[type.label, { letterSpacing: 0.1 }]}>Attention</Text>
        <Text style={[type.label, { color: colors.muted, fontVariant: ["tabular-nums"] }]}>{attention.items.find((item) => item.kind === "time")?.metric}</Text>
      </View>
      {attention.loading ? <Text style={[type.bodySm, { color: colors.muted }]}>Checking your chats…</Text> : null}
      {!attention.loading && actions.length === 0 ? <Text style={[type.bodySm, { color: colors.muted }]}>All caught up</Text> : null}
      {actions.map((item) => <AttentionRow key={item.key} item={item} chats={chats} />)}
      {unread > 0 && firstUnread ? (
        <Pressable onPress={() => router.push(`/bot/${encodeURIComponent(firstUnread.id)}`)} accessibilityRole="button"
          accessibilityLabel={`${unread} unread ${unread === 1 ? "reply" : "replies"}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38 }}>
          <MessageCircle size={18} color={colors.accentText} />
          <Text style={[type.bodySm, { flex: 1 }]}>{unread} unread {unread === 1 ? "reply" : "replies"}</Text>
        </Pressable>
      ) : null}
      {(failing.data ?? []).length ? (
        <Pressable onPress={() => router.push(failedRoutinesLink(failing.data!) as any)} accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 38 }}>
          <AlertTriangle size={18} color={colors.danger} />
          <Text style={[type.bodySm, { flex: 1 }]}>{failing.data!.length} routine{failing.data!.length === 1 ? "" : "s"} failed last time</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AttentionRow({ item, chats }: { item: Exclude<AttentionItem, { kind: "time" }>; chats: Record<string, { turns: import("../chat-model").Turn[] }> }) {
  const Icon = glyph[item.kind];
  const color = item.kind === "approval" ? colors.warning : item.kind === "failed" ? colors.danger : colors.accentText;
  const go = () => {
    if (item.kind === "failed") {
      const turn = chats[item.botId]?.turns.find((candidate) => candidate.role === "assistant" && candidate.id === item.turnId);
      if (!turn || turn.role !== "assistant" || !turn.steps.some((step) => step.status === "failed")) {
        router.push(`/bot/${encodeURIComponent(item.botId)}`);
        return;
      }
      setStepsPage(item.botId, item.turnId, turn.steps);
      router.push(item.destination.path as any);
      return;
    }
    router.push(item.destination.path as any);
  };
  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`${item.title}${item.detail ? `, ${item.detail}` : ""}, ${item.metric}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40, borderRadius: 10,
        backgroundColor: pressed ? colors.control : "transparent" })}>
      <Icon size={18} color={color} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.bodySm, { fontFamily: font.semibold }]} numberOfLines={1}>{item.title}</Text>
        {item.detail ? <Text style={[type.label, { color: colors.muted }]} numberOfLines={1}>{item.detail}</Text> : null}
      </View>
      <Text style={[type.label, { color, fontVariant: ["tabular-nums"] }]}>{item.metric}</Text>
    </Pressable>
  );
}
