// Home, Grok Bot-style: your avatar (settings) and "+" (add a bot) on top, the primary bot big and
// centred with a star, the other bots below (face, name, last activity, last message), and a grid
// button + Search pill at the bottom. Long-press any bot to make it primary.
import { Redirect, router, useFocusEffect } from "expo-router";
import { CalendarClock, CircleAlert, LayoutGrid, LoaderCircle, ShieldQuestion, Palette, Plus, Search, Settings, Star, UserRound, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot } from "../src/backend";
import { useActivity, useApp, useLastAt, useMood, usePreview, useUnread } from "../src/app-state";
import { moodLabel, type FaceMood } from "../src/ui/face-state";
import { Avatar } from "../src/ui/kit";
import { PressScale, Rise, Skeleton, Spin } from "../src/ui/motion";
import { TodayCard } from "../src/ui/today-card";

/** The list staggers in once per app launch, not every time Home re-mounts. */
let introPlayed = false;
import { Sheet, SheetRow } from "../src/ui/sheet";
import { relTime } from "../src/ui/time";
import { colors, font, type } from "../src/ui/theme";

const circle = { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border } as const;
const open = (b: Bot) => router.push(`/bot/${encodeURIComponent(b.id)}`);

export default function Home() {
  const { ready, backend, bots, demo, primaryId, setPrimary, reloadBots } = useApp();
  const intro = useRef(!introPlayed).current;
  useEffect(() => { introPlayed = true; }, []);
  // With hermes-bridge the roster is the server's profile list: refresh it whenever Home shows again.
  useFocusEffect(useCallback(() => { void reloadBots(); }, [reloadBots]));
  const notice = backend?.notice?.() ?? null;
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<Bot | null>(null);
  const [grid, setGrid] = useState(false);
  const primary = bots.find((b) => b.id === primaryId);
  const query = q.trim().toLowerCase();
  const others = useMemo(() => (query
    ? bots.filter((b) => `${b.name} ${b.description ?? ""} ${b.profile ?? ""}`.toLowerCase().includes(query))
    : bots.filter((b) => b.id !== primary?.id)), [bots, primary, query]);
  const onLong = useCallback((b: Bot) => setMenuFor(b), []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (!backend) return <Redirect href="/settings" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}>
        <Pressable accessibilityLabel="Settings" onPress={() => router.push("/preferences")} style={[circle, { backgroundColor: colors.control }]}>
          <UserRound size={24} color={colors.textSecondary} />
        </Pressable>
        {demo ? <Text style={[type.label, { alignSelf: "center", backgroundColor: colors.control, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }]}>Demo</Text> : null}
        <Pressable accessibilityLabel="Add a bot" onPress={() => router.push("/new-bot")} style={circle}><Plus size={24} color={colors.text} /></Pressable>
      </View>

      {notice ? <Notice text={notice} onSettings={() => router.push("/settings")} /> : null}
      <FlatList
        data={others} keyExtractor={(b) => b.id} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={!query && primary ? <View><Rise play={intro} scale={0.94} dy={0}><Hero bot={primary} onLong={onLong} /></Rise><TodayCard /></View> : undefined}
        renderItem={({ item, index }) => <Rise play={intro && index < 12} delay={80 + index * 45}><BotRow bot={item} onLong={onLong} primary={item.id === primary?.id} /></Rise>}
        ListEmptyComponent={query ? <Text style={[type.bodySm, { color: colors.muted, textAlign: "center", marginTop: 40 }]}>No bots match "{q.trim()}"</Text>
          : !bots.length ? <HomeSkeleton /> : undefined}
        contentContainerStyle={{ paddingBottom: 12 }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Pressable accessibilityLabel="More" onPress={() => setGrid(true)} style={circle}><LayoutGrid size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 24, paddingHorizontal: 16, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
          <Search size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.muted} accessibilityLabel="Search bots"
            style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 17, paddingVertical: 0 }} />
          {q ? <Pressable hitSlop={8} accessibilityLabel="Clear search" onPress={() => setQ("")}><X size={18} color={colors.muted} /></Pressable> : null}
        </View>
      </View>

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

const Hero = memo(function Hero({ bot, onLong }: { bot: Bot; onLong: (b: Bot) => void }) {
  const mood = useMood(bot.id), doing = useActivity(bot.id);
  const [poke, setPoke] = useState(0);
  const label = moodLabel(mood);
  return (
    <PressScale onPress={() => open(bot)} onPressIn={() => setPoke((n) => n + 1)} onLongPress={() => onLong(bot)} accessibilityLabel={`Open ${bot.name} (primary)${label ? `, ${label}` : ""}`} to={0.97}
      style={{ alignItems: "center", marginHorizontal: 16, marginTop: 8, marginBottom: 10, paddingTop: 20, paddingBottom: 20, gap: 10, borderRadius: 28, backgroundColor: colors.botBubble, borderWidth: 1, borderColor: colors.border }}>
      <View>
        <Avatar bot={bot} size={128} mood={mood} badge={false} poke={poke} />
        <View style={{ position: "absolute", right: -2, bottom: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.star,
          borderWidth: 3, borderColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
          <Star size={16} color="#fff" fill="#fff" />
        </View>
      </View>
      <Text style={[type.display, { fontSize: 24, lineHeight: 30 }]}>{bot.name}</Text>
      {mood !== "idle" && mood !== "listening" ? (
        <Rise dy={4} key={mood} style={{ minHeight: 24, maxWidth: "80%", marginTop: -4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong }}>
          {mood === "success" ? <Text style={[type.bodySm, { color: colors.success }]}>Done</Text> : <StatusText mood={mood} doing={doing} fallback="" />}
        </Rise>
      ) : bot.description ? <Text style={[type.bodySm, { color: colors.muted, marginTop: -4, maxWidth: "80%", textAlign: "center" }]} numberOfLines={1}>{bot.description}</Text> : null}
    </PressScale>
  );
});

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
      <View style={{ alignItems: "center", gap: 14, paddingTop: 18, paddingBottom: 30 }}>
        <Skeleton width={128} height={128} radius={36} />
        <Skeleton width={120} height={22} radius={11} />
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 11 }}>
          <Skeleton width={52} height={52} radius={16} />
          <View style={{ flex: 1, gap: 8 }}><Skeleton width={`${46 - i * 6}%`} height={15} /><Skeleton width={`${80 - i * 8}%`} height={12} /></View>
        </View>
      ))}
    </View>
  );
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
