// Home's "Today" card: what needs you across bots: runs waiting for your OK, unread replies, bots
// still working, and routines whose last run failed. Hidden when there's nothing to show.
import { router } from "expo-router";
import { AlertTriangle, CalendarClock, MessageCircle, ShieldQuestion } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useApp, useApprovalBots, useBusyCount, useTotalUnread } from "../app-state";
import { failedRoutinesLink, isFailing } from "../job-text";
import { useLoad } from "../use-load";
import { enter } from "./motion";
import { colors, radii, type } from "./theme";

export function TodayCard() {
  const { backend, bots } = useApp();
  const unread = useTotalUnread(), busy = useBusyCount();
  const approvalIds = useApprovalBots().split(",").filter(Boolean);
  // Routine results: one light call per bot, once per Home mount.
  const failing = useLoad(backend && bots.length && bots.length <= 12 ? async () => {
    const all = await Promise.all(bots.map(async (b) => { try { return (await backend.listJobs(b)).filter(isFailing).map((j) => ({ botId: b.id, jobId: j.id })); } catch { return []; } }));
    return all.flat();
  } : null, [backend, bots.length]);
  const lines: { key: string; icon: ReactNode; text: string; go: () => void }[] = [];
  if (approvalIds.length) lines.push({ key: "a", icon: <ShieldQuestion size={18} color={colors.warning} />, text: `${approvalIds.length === 1 ? (bots.find((b) => b.id === approvalIds[0])?.name ?? "A bot") : `${approvalIds.length} bots`} waiting for your OK`, go: () => router.push(`/bot/${approvalIds[0]}`) });
  if (unread) lines.push({ key: "u", icon: <MessageCircle size={18} color={colors.accentText} />, text: `${unread} unread ${unread === 1 ? "reply" : "replies"}`, go: () => {} });
  const failed = failing.data ?? [];
  if (failed.length) lines.push({ key: "r", icon: <AlertTriangle size={18} color={colors.danger} />, text: `${failed.length} routine${failed.length === 1 ? "" : "s"} failed last time`, go: () => router.push(failedRoutinesLink(failed) as any) });
  if (busy) lines.push({ key: "b", icon: <CalendarClock size={18} color={colors.muted} />, text: `${busy} ${busy === 1 ? "bot is" : "bots are"} working`, go: () => {} });
  if (!lines.length) return null;
  return (
    <Animated.View entering={enter.fade} style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, gap: 10, borderRadius: radii.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Text style={[type.label, { letterSpacing: 0.4 }]}>TODAY</Text>
      {lines.map((l) => (
        <Pressable key={l.key} onPress={l.go} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityRole="button">
          {l.icon}<Text style={[type.body, { flex: 1 }]}>{l.text}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}
