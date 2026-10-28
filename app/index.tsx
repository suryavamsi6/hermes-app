// Compact Home: header search, a Continue row for the primary bot, then the assistant roster.
import { Redirect, router, useFocusEffect } from "expo-router";
import { FlatList, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Activity, CalendarClock, CircleAlert, ChevronRight, Home as HomeIcon, LayoutGrid, LoaderCircle, ShieldQuestion, Palette, Plus, Search, Settings, ShieldCheck, Star, UserRound, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot } from "../src/backend";
import { useActivity, useApp, useAttentionChats, useLastAt, useMood, usePreview, useTotalUnread, useUnread, useUnreadBots } from "../src/app-state";
import { moodLabel, type FaceMood } from "../src/ui/face-state";
import { Avatar } from "../src/ui/kit";
import { Skeleton, Spin } from "../src/ui/motion";
import { selectAttentionItems } from "../src/ui/attention-items";
import { AttentionCarousel } from "../src/ui/attention-carousel";
import { isFailing } from "../src/job-text";
import { useLoad } from "../src/use-load";

import { Sheet, SheetRow } from "../src/ui/sheet";
import { relTime } from "../src/ui/time";
import { colors, font, type } from "../src/ui/theme";

const circle = { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border } as const;
const open = (b: Bot) => router.push(`/bot/${encodeURIComponent(b.id)}`);

export default function Home() {
  const { ready, backend, bots, botsLoaded, botsError, demo, primaryId, setPrimary, reloadBots } = useApp();
  const chats = useAttentionChats();
  const unread = useTotalUnread();
  const unreadIds = useUnreadBots();
  // With hermes-bridge the roster is the server's profile list: refresh it whenever Home shows again.
  const focusedBefore = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedBefore.current) void reloadBots();
    else focusedBefore.current = true; // AppProvider already starts the initial roster request.
  }, [reloadBots]));
  const notice = backend?.notice?.() ?? null;
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<Bot | null>(null);
  const [grid, setGrid] = useState(false);
  const [compact, setCompact] = useState(false);
  const [carouselBotId, setCarouselBotId] = useState<string>();
  const listRef = useRef<FlatList<Bot>>(null);
  const scrollY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const onListScroll = useAnimatedScrollHandler({ onScroll: (event) => { scrollY.set(event.contentOffset.y); } });
  const setCompactOnJS = useCallback((value: boolean) => setCompact(value), []);
  useAnimatedReaction(() => scrollY.get() > 156, (next, previous) => {
    if (next !== previous) scheduleOnRN(setCompactOnJS, next);
  }, [scrollY, setCompactOnJS]);
  const expandAttention = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion }), [reducedMotion]);
  const primary = bots.find((b) => b.id === primaryId) ?? bots[0];
  const query = q.trim().toLowerCase();
  const others = useMemo(() => (query
    ? bots.filter((b) => `${b.name} ${b.description ?? ""} ${b.profile ?? ""}`.toLowerCase().includes(query))
    : bots.filter((b) => b.id !== primary?.id)), [bots, primary, query]);
  const onLong = useCallback((b: Bot) => setMenuFor(b), []);
  const firstUnread = useMemo(() => {
    const ids = new Set(unreadIds ? unreadIds.split(",") : []);
    return bots.find((bot) => ids.has(bot.id));
  }, [bots, unreadIds]);
  const routineFailures = useLoad(backend && !query && bots.length && bots.length <= 12 ? async () => {
    const all = await Promise.all(bots.map(async (bot) => {
      try {
        return (await backend.listJobs(bot)).filter(isFailing).map((job) => ({ botId: bot.id, jobId: job.id, name: job.name, detail: job.lastError }));
      } catch { return []; }
    }));
    return all.flat();
  } : null, [backend, query, bots.map((bot) => bot.id).join(",")]);
  const attention = useMemo(() => selectAttentionItems(chats, Date.now(), {
    loading: !botsLoaded,
    unread: unread > 0 && firstUnread ? { botId: firstUnread.id, count: unread } : undefined,
    routines: routineFailures.data ?? [],
  }), [chats, botsLoaded, unread, firstUnread, routineFailures.data]);
  const { width: windowWidth } = useWindowDimensions();
  // Match the actionable approval selector: only the latest active streaming turn can be waiting.
  const approvalCount = attention.counts.approval;

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (!backend) return <Redirect href="/settings" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
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
      {!query && compact && bots.length ? <FlatList horizontal accessibilityLabel="Bot shortcuts" data={bots.slice(0, 5)} keyExtractor={(bot) => bot.id} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 14 }} style={{ flexGrow: 0, paddingVertical: 8, backgroundColor: colors.canvas }}
        renderItem={({ item }) => <CompactShortcut bot={item} selected={item.id === (carouselBotId ?? primary?.id)} />} /> : null}
      <Animated.FlatList
        ref={listRef}
        data={others} keyExtractor={(b) => b.id} keyboardShouldPersistTaps="handled"
        onScroll={onListScroll} scrollEventThrottle={16}
        ListHeaderComponent={<View>
          {!query && bots.length ? <>
            <View style={{ paddingTop: 10, paddingBottom: 2 }}>
              <HomeBotCarousel bots={bots} width={windowWidth} scrollY={scrollY} primaryId={primary?.id} onSelectionChange={setCarouselBotId} onOpen={open} />
              <View style={{ marginHorizontal: 24, marginTop: 14, marginBottom: 18 }}>
                <Text style={[type.display, { fontSize: 29, lineHeight: 34 }]}>Good to see you<Text style={{ color: colors.muted }}> again</Text></Text>
                <Text style={[type.bodySm, { marginTop: 3 }]}>Your team is ready when you are.</Text>
              </View>
              <View style={{ marginHorizontal: 20, padding: 18, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <Text style={[type.h, { fontSize: 18 }]}>Your team</Text><Text style={type.label}>{bots.length} {bots.length === 1 ? "bot" : "bots"}</Text>
                </View>
                <View style={{ flexDirection: "row", marginTop: 16 }}>
                  {bots.slice(0, 3).map((bot) => <TeamBot key={bot.id} bot={bot} onPress={() => open(bot)} />)}
                </View>
                {bots.length > 3 ? <Text style={[type.caption, { textAlign: "center", marginTop: 4 }]}>+{bots.length - 3} more in your team</Text> : null}
              </View>
              <View style={{ flexDirection: "row", marginHorizontal: 20, marginTop: 12, gap: 12 }}>
                <Pressable onPress={() => primary && router.push(`/activity/${encodeURIComponent(primary.id)}`)} accessibilityRole="button" accessibilityLabel="View activity" style={{ flex: 1, minHeight: 132, padding: 15, alignItems: "center", borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 7 }}><Activity size={16} color={colors.success} /><Text style={type.bodySm}>Activity</Text></View>
                  <Text style={[type.display, { marginTop: 14 }]}>{Object.values(chats).filter((chat) => chat.busy).length}</Text><Text style={type.caption}>Active runs</Text>
                </Pressable>
                <Pressable onPress={() => { const approval = attention.items.find((item) => item.kind === "approval"); if (approval) router.push(approval.destination.path as any); else expandAttention(); }} accessibilityRole="button" accessibilityLabel={`${approvalCount} pending approvals`} style={{ flex: 1, minHeight: 132, padding: 15, alignItems: "center", borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 7 }}><ShieldCheck size={16} color={colors.warning} /><Text style={type.bodySm}>Approvals</Text></View>
                  <Text style={[type.display, { marginTop: 14 }]}>{approvalCount}</Text><Text style={type.caption}>Waiting on you</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 24, marginTop: 22, marginBottom: 4 }}>
                <Text style={type.h}>Needs your attention</Text><Text style={type.caption}>{unread ? `${unread} unread` : "Live updates"}</Text>
              </View>
              <AttentionCarousel items={attention.items} bots={bots} loading={attention.loading} scrollY={scrollY} onSelectRing={expandAttention}
                onOpen={(item) => { if (item.destination) router.push(item.destination.path as any); }} />
            </View>
          </> : null}
          {!query && primary ? <><Text style={[type.label, { marginHorizontal: 16, marginBottom: 6, letterSpacing: 0.1 }]}>Continue</Text><BotRow bot={primary} onLong={onLong} primary /></> : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, marginTop: 12, marginBottom: 6 }}>
            <Text style={[type.label, { letterSpacing: 0.1 }]}>{query ? "Search results" : "Your assistants"}</Text>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
      />

      <FloatingNav bottom={insets.bottom} onHome={() => listRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion })} onActivity={() => { if (primary) router.push(`/activity/${encodeURIComponent(primary.id)}`); }} onSettings={() => router.push("/preferences")} />
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

function HomeBotCarousel({ bots, width, scrollY, primaryId, onSelectionChange, onOpen }: { bots: Bot[]; width: number; scrollY: ReturnType<typeof useSharedValue<number>>; primaryId?: string; onSelectionChange: (id: string) => void; onOpen: (bot: Bot) => void }) {
  const [selected, setSelected] = useState(() => Math.max(0, bots.findIndex((bot) => bot.id === primaryId)));
  const list = useRef<FlatList<Bot>>(null);
  const reducedMotion = useReducedMotion();
  const carouselX = useSharedValue(0);
  const carouselWidth = Math.min(width, 560);
  const cardWidth = Math.min(carouselWidth - 32, Math.max(224, Math.min(carouselWidth * 0.76, carouselWidth - 36, 440)));
  const stride = cardWidth + 16;
  const botIds = bots.map((bot) => bot.id).join("\u0000");
  useEffect(() => {
    const index = Math.max(0, bots.findIndex((bot) => bot.id === primaryId));
    setSelected(index);
    if (bots[index]) onSelectionChange(bots[index].id);
    list.current?.scrollToOffset({ offset: index * stride, animated: false });
  // Re-center only when the roster or saved primary changes, not when the user swipes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botIds, primaryId]);
  const side = (carouselWidth - cardWidth) / 2;
  const onScroll = useAnimatedScrollHandler({ onScroll: (event) => { carouselX.set(event.contentOffset.x); } });
  const morphStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1, transform: [] };
    const progress = interpolate(scrollY.get(), [0, 230], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1 - progress * 0.7, transform: [{ scale: 1 - progress * 0.14 }, { translateY: -progress * 8 }] };
  }, [reducedMotion]);
  return <Animated.View style={[morphStyle, { width: carouselWidth, alignSelf: "center" }]}>
    <Animated.FlatList ref={list} horizontal data={bots} keyExtractor={(bot) => bot.id} showsHorizontalScrollIndicator={false} snapToInterval={stride} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: side, gap: 16, paddingTop: 10, paddingBottom: 8 }} getItemLayout={(_, index) => ({ length: stride, offset: stride * index, index })}
      onScroll={onScroll} scrollEventThrottle={16}
      onMomentumScrollEnd={(event) => { const index = Math.max(0, Math.min(bots.length - 1, Math.round(event.nativeEvent.contentOffset.x / stride))); setSelected(index); if (bots[index]) onSelectionChange(bots[index].id); }}
      renderItem={({ item, index }) => <BotHero bot={item} index={index} width={cardWidth} stride={stride} scrollX={carouselX} reducedMotion={reducedMotion} onOpen={() => onOpen(item)} />} />
    {bots.length > 1 ? <View accessibilityLabel="Choose an assistant" style={{ height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      {bots.map((bot, index) => <Pressable key={bot.id} onPress={() => { setSelected(index); onSelectionChange(bot.id); list.current?.scrollToOffset({ offset: index * stride, animated: !reducedMotion }); }} accessibilityRole="button" accessibilityLabel={`Show ${bot.name}`} accessibilityState={{ selected: selected === index }} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: selected === index ? 18 : 7, height: 7, borderRadius: 5, backgroundColor: selected === index ? colors.text : colors.borderStrong }} />
      </Pressable>)}
    </View> : null}
  </Animated.View>;
}

function BotHero({ bot, index, width, stride, scrollX, reducedMotion, onOpen }: { bot: Bot; index: number; width: number; stride: number; scrollX: ReturnType<typeof useSharedValue<number>>; reducedMotion: boolean; onOpen: () => void }) {
  const mood = useMood(bot.id), preview = usePreview(bot.id), doing = useActivity(bot.id), unread = useUnread(bot.id);
  const status = moodLabel(mood, { approval: mood === "waiting" }) ?? (unread ? `${unread} unread` : "Ready when you are");
  const dark = colors.canvas === "#09090b";
  const background = dark
    ? mood === "waiting" ? ["#76502e", "#29211b", "#171a1d"] : mood === "error" ? ["#5a466c", "#241f2a", "#17171b"] : mood === "working" || mood === "thinking" ? ["#684a37", "#27211d", "#171a1d"] : ["#3d5635", "#20261e", "#17171b"]
    : mood === "waiting" ? ["#f6b17a", "#fff0de", "#e5eff4"] : mood === "error" ? ["#cdb9e8", "#eee8f5", "#f7f6f1"] : mood === "working" || mood === "thinking" ? ["#f6d1b7", "#f5e7d9", "#e7eef1"] : ["#d8e8c9", "#edf2e8", "#f7f6f1"];
  const ink = dark ? colors.text : "#292a25";
  const subdued = dark ? colors.textSecondary : "#555b52";
  const cardStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1, transform: [] };
    const center = index * stride;
    const angle = interpolate(scrollX.get(), [center - stride, center, center + stride], [12, 0, -12], Extrapolation.CLAMP);
    const lift = interpolate(scrollX.get(), [center - stride, center, center + stride], [-12, 0, -12], Extrapolation.CLAMP);
    const scale = interpolate(scrollX.get(), [center - stride, center, center + stride], [0.94, 1, 0.94], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.get(), [center - stride, center, center + stride], [0.78, 1, 0.78], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY: lift }, { scale }, { rotate: `${angle}deg` }] };
  }, [index, reducedMotion, stride]);
  return <Animated.View style={cardStyle}><Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open chat with ${bot.name}, ${status}`} style={({ pressed }) => ({ width, height: 270, borderRadius: 28, padding: 18, justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, backgroundColor: background[1], overflow: "hidden", opacity: pressed ? 0.92 : 1 })}>
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 115, backgroundColor: background[0], borderBottomLeftRadius: 90, borderBottomRightRadius: 90, opacity: 0.68 }} />
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text numberOfLines={1} style={{ maxWidth: width - 100, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: "hidden", color: ink, backgroundColor: dark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.58)", fontFamily: font.medium, fontSize: 12 }}>{bot.description || "Your assistant"}</Text><View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.text }}><ChevronRight size={21} color={colors.canvas} /></View></View>
    <View style={{ alignSelf: "center", width: 98, height: 98, borderRadius: 49, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.48)", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" }}><Avatar bot={bot} size={82} mood={mood} badge={false} /></View>
    <View><Text numberOfLines={1} style={[type.display, { color: ink, fontSize: 27 }]}>{bot.name}</Text><Text numberOfLines={1} style={{ marginTop: 3, color: mood === "waiting" ? (dark ? "#ffd18b" : "#71400c") : mood === "error" ? (dark ? "#ffaaa2" : "#8b3029") : mood === "working" || mood === "thinking" ? (dark ? "#bdd0ff" : "#354e88") : (dark ? colors.success : "#354e3d"), fontFamily: font.semibold, fontSize: 14 }}>{doing || status}</Text><Text numberOfLines={1} style={{ marginTop: 3, color: subdued, fontFamily: font.regular, fontSize: 12 }}>{preview || bot.description || "Open a conversation"}</Text></View>
  </Pressable></Animated.View>;
}

function CompactShortcut({ bot, selected }: { bot: Bot; selected: boolean }) {
  const mood = useMood(bot.id);
  return <Pressable onPress={() => open(bot)} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Open ${bot.name}, ${moodLabel(mood) ?? "ready"}`} style={{ alignItems: "center", gap: 3, minWidth: 48 }}>
    <Avatar bot={bot} size={38} mood={mood} badge={false} /><Text style={[type.caption, { maxWidth: 64 }]} numberOfLines={1}>{bot.name}</Text>
  </Pressable>;
}

function FloatingNav({ bottom, onHome, onActivity, onSettings }: { bottom: number; onHome: () => void; onActivity: () => void; onSettings: () => void }) {
  const dark = colors.canvas === "#09090b";
  return <View accessibilityRole="tablist" accessibilityLabel="Primary navigation" style={{ position: "absolute", bottom: bottom + 8, alignSelf: "center", width: "88%", maxWidth: 320, flexDirection: "row", gap: 3, padding: 5, borderRadius: 999, borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.52)", backgroundColor: dark ? "rgba(25,25,29,0.94)" : "rgba(39,48,41,0.92)", shadowColor: "#000", shadowOpacity: dark ? 0.38 : 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
    <NavTab label="Home" selected onPress={onHome} icon={<HomeIcon size={19} color="#252820" />} />
    <NavTab label="Activity" onPress={onActivity} icon={<Activity size={19} color="#eef1ed" />} />
    <NavTab label="Settings" onPress={onSettings} icon={<Settings size={19} color="#eef1ed" />} />
  </View>;
}

function NavTab({ label, selected = false, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon: ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 54, paddingHorizontal: 4, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: selected ? "rgba(255,255,255,0.94)" : "transparent", opacity: pressed ? 0.82 : 1 })}>
    {icon}<Text numberOfLines={1} style={{ color: selected ? "#252820" : "#eef1ed", fontFamily: font.medium, fontSize: 11 }}>{label}</Text>
  </Pressable>;
}

function TeamBot({ bot, onPress }: { bot: Bot; onPress: () => void }) {
  const mood = useMood(bot.id);
  const unread = useUnread(bot.id);
  const label = moodLabel(mood, { approval: mood === "waiting" }) ?? (unread ? `${unread} unread` : "Ready");
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${bot.name}, ${label}`} style={{ flex: 1, minHeight: 92, alignItems: "center", gap: 4, paddingHorizontal: 3 }}>
    <View style={{ width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: bot.color || colors.control, borderWidth: 1, borderColor: colors.border }}><Avatar bot={bot} size={46} mood={mood} badge={false} /></View>
    <Text style={[type.bodySm, { color: colors.text, fontFamily: font.medium }]} numberOfLines={1}>{bot.name}</Text><Text style={[type.caption, { textAlign: "center" }]} numberOfLines={1}>{label}</Text>
  </Pressable>;
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
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 78, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, backgroundColor: pressed ? colors.control : colors.surface })}>
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
