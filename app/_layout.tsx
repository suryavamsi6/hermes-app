import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Appearance, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider, useApp } from "../src/app-state";
import { clearBotNotifications, ensureNotifications, onNotificationTap } from "../src/notify";
import { colors, setTheme } from "../src/ui/theme";
import { loadPrefs, usePrefs } from "../src/prefs";
import { AppLock } from "../src/ui/app-lock";
import { ToastHost } from "../src/ui/toast";
import * as Store from "../src/secure";

void loadPrefs();

// Fatal JS errors in a release build kill the app instantly with no visible error (this is how
// 0.11.13 "wouldn't open" after the useUnreadBots loop fix), while the route ErrorBoundary only
// sees render errors. So: persist every uncaught error to SecureStore, and on the next launch show
// it on a dismissable screen — the app's own black box for exactly this case.
const CRASH_KEY = "hermes.lastcrash";
type LastCrash = { at: number; message: string; stack: string };
const installCrashRecorder = () => {
  const eu = (globalThis as any).ErrorUtils;
  if (!eu?.setGlobalHandler) return;
  const prev = eu.getGlobalHandler?.();
  eu.setGlobalHandler((e: unknown, fatal: boolean) => {
    const record: LastCrash = { at: Date.now(), message: String((e as Error)?.message ?? e), stack: String((e as Error)?.stack ?? "").slice(0, 2000) };
    void Store.setItem(CRASH_KEY, JSON.stringify(record)).catch(() => {});
    prev?.(e, fatal);
  });
};
installCrashRecorder();

/** Set on launch when the previous run died on an uncaught error; cleared when dismissed. */
function useLastCrash(): LastCrash | null {
  const [crash, setCrash] = useState<LastCrash | null>(null);
  useEffect(() => { void Store.getItem(CRASH_KEY).then((raw) => {
    if (!raw) return;
    void Store.deleteItem(CRASH_KEY).catch(() => {});
    try { const c = JSON.parse(raw) as LastCrash; if (c?.message && Date.now() - (c.at ?? 0) < 7 * 864e5) setCrash(c); } catch {}
  }).catch(() => {}); }, []);
  return crash;
}

function CrashReport({ crash }: { crash: LastCrash }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ color: colors.text, fontSize: 20 }}>Hermes hit a problem last time</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{new Date(crash.at).toLocaleString()}</Text>
      <Text selectable style={{ color: colors.text, fontSize: 14 }}>{crash.message}</Text>
      <Text selectable style={{ color: colors.dim, fontSize: 11 }}>{crash.stack}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Reported above is the error that closed the app. Opening it again continues normally.</Text>
    </ScrollView>
  );
}

/** Taps (and Allow once / Deny presses) on this app's notifications: approvals are answered in the
 *  background, plain taps open that bot's chat. Also fires for the notification that launched the
 *  app (getLastNotificationResponseAsync), so a killed app still routes. */
function NotificationTaps() {
  const { bots, approve } = useApp();
  // Channel + Android 13 permission at launch, while in the foreground (the only time Android can ask).
  useEffect(() => { void ensureNotifications(true).catch(() => {}); }, []);
  useEffect(() => onNotificationTap((t, dismiss) => {
    const bot = bots.find((b) => b.id === t.botId);
    if (!bot) return;
    dismiss();
    if (t.choice && t.turnId) { void approve(bot, t.turnId, t.choice).catch(() => {}); return; }
    clearBotNotifications(bot.id);
    router.push(`/bot/${bot.id}`);
  }), [bots, approve]);
  return null;
}

/** expo-router shows this instead of crashing when a screen throws while rendering: the error text
 *  (for a screenshot) and Try again. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ color: colors.text, fontSize: 20 }}>Hermes hit a problem</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{String(error?.message ?? error)}</Text>
      <Text selectable style={{ color: colors.dim, fontSize: 11 }}>{String(error?.stack ?? "").slice(0, 1500)}</Text>
      <Pressable onPress={() => void retry()} style={{ alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.control }}>
        <Text style={{ color: colors.text }}>Try again</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function RootLayout() {
  const lastCrash = useLastCrash();
  const appearance = usePrefs((p) => p.appearance);
  useEffect(() => {
    const update = () => setTheme(appearance === "system" ? (Appearance.getColorScheme() === "light" ? "light" : "dark") : appearance);
    update();
    if (appearance !== "system") return;
    const sub = Appearance.addChangeListener(update);
    return () => sub.remove();
  }, [appearance]);
  const [loaded] = useFonts({
    "Inter-Regular": require("../assets/fonts/Inter-Regular.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter-Medium.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.ttf"),
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  if (lastCrash) return <CrashReport crash={lastCrash} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AppProvider>
        <NotificationTaps />
        <StatusBar style={appearance === "light" || (appearance === "system" && Appearance.getColorScheme() === "light") ? "dark" : "light"} />
        {/* Screens slide in from the right (native stack, UI thread); Home and modals keep their own. */}
        <Stack key={`${appearance}-${colors.canvas}`} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right", animationDuration: 260 }}>
          <Stack.Screen name="index" options={{ animation: "fade" }} />
          <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack>
        <ToastHost />
        <AppLock />
      </AppProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
