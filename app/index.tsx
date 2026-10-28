// Compact Home: header search, a Continue row for the primary bot, then the assistant roster.
import { Redirect, router, useFocusEffect } from "expo-router";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useReducedMotion, useSharedValue } from "react-native-reanimated";
import { CalendarClock, CircleAlert, LayoutGrid, LoaderCircle, ShieldQuestion, Palette, Plus, Search, Settings, Star, UserRound, X } from "lucide-react-native";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot } from "../src/backend";
import { useActivity, useApp, useAttentionChats, useLastAt, useMood, usePreview, useUnread } from "../src/app-state";
import { moodLabel, type FaceMood } from "../src/ui/face-state";
import { Avatar } from "../src/ui/kit";
import { Skeleton, Spin } from "../src/ui/motion";
import { TodayCard } from "../src/ui/today-card";
import { selectAttentionItems } from "../src/ui/attention-items";
import { AttentionCarousel } from "../src/ui/attention-carousel";

import { Sheet, SheetRow } from "../src/ui/sheet";
import { relTime } from "../src/ui/time";
import { colors, font, type } from "../src/ui/theme";

const circle = { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border } as const;
const open = (b: Bot) => router.push(`/bot/${encodeURIComponent(b.id)}`);

export default function Home() {
  const { ready, backend, bots, botsLoaded, botsError, demo, primaryId, setPrimary, reloadBots } = useApp();
  const chats = useAttentionChats();
  // With hermes-bridge the roster is the server's profile list: refresh it whenever Home shows again.
  useFocusEffect(useCallback(() => { void reloadBots(); }, [reloadBots]));
  const notice = backend?.notice?.() ?? null;
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<Bot | null>(null);
  const [grid, setGrid] = useState(false);
  const listRef = useRef<FlatList<Bot>>(null);
  const scrollY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const onListScroll = useAnimatedScrollHandler({ onScroll: (event) => { scrollY.set(event.contentOffset.y); } });
  const expandAttention = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion }), [reducedMotion]);
  const primary = bots.find((b) => b.id === primaryId) ?? bots[0];
  const query = q.trim().toLowerCase();
  const others = useMemo(() => (query
    ? bots.filter((b) => `${b.name} ${b.description ?? ""} ${b.profile ?? ""}`.toLowerCase().includes(query))
    : bots.filter((b) => b.id !== primary?.id)), [bots, primary, query]);
  const onLong = useCallback((b: Bot) => setMenuFor(b), []);
  const attention = useMemo(() => selectAttentionItems(chats, Date.now(), { loading: !botsLoaded }), [chats, botsLoaded]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (!backend) return <Redirect href="/settings" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Pressable accessibilityLabel="Settings" onPress={() => router.push("/preferences")} style={[circle, { backgroundColor: colors.control }]}>
          <UserRound size={22} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 24, paddingHorizontal: 14, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
          <Search size={19} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={demo ? "Search · Demo" : "Search"} placeholderTextColor={colors.muted} accessibilityLabel="Search bots"
            style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 16, paddingVertical: 0 }} />
          {q ? <Pressable hitSlop={8} accessibilityLabel="Clear search" onPress={() => setQ("")}><X size={18} color={colors.muted} /></Pressable> : null}
        </View>
        <Pressable accessibilityLabel="Add a bot" onPress={() => router.push("/new-bot")} style={circle}><Plus size={23} color={colors.text} /></Pressable>
      </View>

      {notice ? <Notice text={notice} onSettings={() => router.push("/settings")} /> : null}
      {!query ? <AttentionCarousel items={attention.items} bots={bots} loading={attention.loading} scrollY={scrollY} onSelectRing={expandAttention} /> : null}
      <Animated.FlatList
        ref={listRef}
        data={others} keyExtractor={(b) => b.id} keyboardShouldPersistTaps="handled"
        onScroll={onListScroll} scrollEventThrottle={16}
        ListHeaderComponent={<View>
          {!query ? <TodayCard loading={!botsLoaded} /> : null}
          {!query && primary ? <><Text style={[type.label, { marginHorizontal: 16, marginBottom: 6, letterSpacing: 0.4 }]}>CONTINUE</Text><BotRow bot={primary} onLong={onLong} primary /></> : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, marginTop: 12, marginBottom: 6 }}>
            <Text style={[type.label, { letterSpacing: 0.4 }]}>{query ? "SEARCH RESULTS" : "YOUR ASSISTANTS"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setGrid(true)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44, paddingHorizontal: 4 }}>
              <LayoutGrid size={16} color={colors.muted} /><Text style={[type.label, { color: colors.muted }]}>More</Text>
            </Pressable>
          </View>
        </View>}
        renderItem={({ item }) => <BotRow bot={item} onLong={onLong} primary={item.id === primary?.id} />}
        ListEmptyComponent={query ? <Text style={[type.bodySm, { color: colors.muted, textAlign: "center", marginTop: 40 }]}>No bots match "{q.trim()}"</Text>
          : !botsLoaded && !bots.length ? <HomeSkeleton />
          : botsError && !bots.length ? <RosterError message={botsError} retry={() => { void reloadBots(); }} />
          : !primary ? <EmptyAssistants add={() => router.push("/new-bot")} /> : undefined}
        contentContainerStyle={{ paddingBottom: 12 }}
      />

      <Sheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        {menuFor ? <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 10 }}>
            <Avatar bot={menuFor} size={40} badge={false} /><Text style={type.title} numberOfLines={1}>{menuFor.name}</Text>
          </View>
          {menuFor.id === primary?.id
            ? <SheetRow icon={<Star size={20} color={colors.star} fill={colors.star} />} label="This is your primary bot" />
            : <SheetRow icon={<Star size={20} color={colors.star} />} label="Make primary" onPress={() => { void setPrimary(menuFor.id); setMenuFor(null); }} />}
          <SheetRow icon={<Settings size={20} color={colors.textSecondary} />} label="Bot settings" onPress={() => { setMenuFor(null); router.push(`/bot-info/${menuFor.id}`); }} />
        </> : null}
      </Sheet>
      <Sheet visible={grid} onClose={() => setGrid(false)}>
        {[
          { label: "Add a bot", icon: Plus, path: "/new-bot" },
          { label: "Routines", icon: CalendarClock, path: "/routines" },
          { label: "Faces & colours", icon: Palette, path: "/faces" },
          { label: "Settings", icon: Settings, path: "/settings" },
        ].map(({ label, icon: Icon, path }) => (
          <SheetRow key={label} icon={<Icon size={20} color={colors.textSecondary} />} label={label} onPress={() => { setGrid(false); router.push(path as any); }} />
        ))}
      </Sheet>
    </View>
  );
}

/** The bot's state in words + an icon, so it never rests on the face or a colour alone. */
function StatusText({ mood, doing, fallback, unread, style }: { mood: FaceMood; doing: string; fallback: string; unread?: boolean; style?: object }) {
  if (mood === "waiting") return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }, style]}>
      <ShieldQuestion size={14} color={colors.warning} /><Text style={[type.bodySm, { color: colors.warning, flexShrink: 1 }]} numberOfLines={1}>Needs your OK</Text>
    </View>
  );
  if (mood === "thinking" || mood === "working") return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }, style]}>
      <Spin><LoaderCircle size={13} color={colors.accentText} /></Spin><Text style={[type.bodySm, { color: colors.accentText, flexShrink: 1 }]} numberOfLines={1}>{doing || "Thinking"}</Text>
    </View>
  );
  if (mood === "error") return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }, style]}>
      <CircleAlert size={14} color={colors.danger} /><Text style={[type.bodySm, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>Needs attention · open to see why</Text>
    </View>
  );
  return <Text style={[type.bodySm, { flexShrink: 1, color: unread ? colors.textSecondary : colors.muted }, style]} numberOfLines={1}>{fallback}</Text>;
}

/** One list row; subscribes to its own bot's slices only, so streaming in one chat doesn't re-render the list. */
const BotRow = memo(function BotRow({ bot, onLong, primary }: { bot: Bot; onLong: (b: Bot) => void; primary: boolean }) {
  const n = useUnread(bot.id), preview = usePreview(bot.id), mood = useMood(bot.id), doing = useActivity(bot.id), at = useLastAt(bot.id);
  const label = moodLabel(mood);
  return (
    <Pressable onPress={() => open(bot)} onLongPress={() => onLong(bot)} accessibilityLabel={`Open ${bot.name}${label ? `, ${label}` : ""}${n ? `, ${n} unread` : ""}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 74, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.control : colors.surface })}>
      <Avatar bot={bot} size={52} mood={mood} badge={false} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[type.body, { flexShrink: 1, fontFamily: n ? font.semibold : font.medium, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>{bot.name}</Text>
          {primary ? <Star size={13} color={colors.star} fill={colors.star} /> : null}
          <Text style={[type.label, { marginLeft: "auto", color: n ? colors.text : colors.muted }]}>{relTime(at)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <StatusText mood={mood} doing={doing} unread={!!n} fallback={preview || bot.description || "Say hi"} />
          </View>
          {n ? (
            <View accessibilityLabel={`${n} unread`} style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentText }}>
              <Text style={{ color: colors.actionForeground, fontFamily: font.semibold, fontSize: 12, lineHeight: 15 }}>{n > 99 ? "99+" : n}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/** Home's first load: rows shaped like bot rows (face, name, preview). */
function HomeSkeleton() {
  return (
    <View accessibilityLabel="Loading your bots" style={{ paddingTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 11 }}>
          <Skeleton width={52} height={52} radius={16} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton width={`${46 - i * 6}%`} height={15} /><Skeleton width={`${80 - i * 8}%`} height={12} /></View>
        </View>
      ))}
    </View>
  );
}

function RosterError({ message, retry }: { message: string; retry: () => void }) {
  return <View style={{ gap: 8, margin: 16, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
    <Text style={[type.bodySm, { color: colors.textSecondary }]}>{message}</Text>
    <Pressable onPress={retry} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}><Text style={[type.bodySm, { color: colors.accentText }]}>Retry</Text></Pressable>
  </View>;
}

function EmptyAssistants({ add }: { add: () => void }) {
  return <View style={{ alignItems: "center", gap: 8, marginHorizontal: 24, marginTop: 24, padding: 20 }}>
    <Text style={type.title}>No assistants yet</Text>
    <Text style={[type.bodySm, { color: colors.muted, textAlign: "center" }]}>Add an assistant to start a conversation.</Text>
    <Pressable onPress={add} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.control }}>
      <Text style={[type.bodySm, { color: colors.accentText }]}>Add an assistant</Text>
    </Pressable>
  </View>;
}

/** A server notice (e.g. why hermes-bridge is off). Collapsed to 3 lines; tap to read all of it. */
function Notice({ text, onSettings }: { text: string; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  return (
    <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityHint={open ? "Collapse" : "Show the whole message"}
      style={{ gap: 8, marginHorizontal: 16, marginBottom: 4, padding: 10, borderRadius: 14, backgroundColor: colors.control }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <CircleAlert size={16} color={colors.muted} style={{ marginTop: 1 }} />
        <Text selectable style={[type.label, { flex: 1 }]} numberOfLines={open ? undefined : 3}
          onTextLayout={(e) => { if (!open && e.nativeEvent.lines.length > 3) setClipped(true); }}>{text}</Text>
      </View>
      {open || clipped ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingLeft: 24 }}>
          <Text style={[type.label, { color: colors.accentText }]}>{open ? "Show less" : "Show more"}</Text>
          {open ? <Pressable onPress={onSettings} hitSlop={8} accessibilityRole="button"><Text style={[type.label, { color: colors.accentText }]}>Settings</Text></Pressable> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
