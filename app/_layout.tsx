import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-state";
import { clearBotNotifications, ensureNotifications, onNotificationTap } from "../src/notify";
import { colors } from "../src/ui/theme";
import { loadPrefs } from "../src/prefs";
import { AppLock } from "../src/ui/app-lock";

void loadPrefs();

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
  const [loaded] = useFonts({
    "Inter-Regular": require("../assets/fonts/Inter-Regular.ttf"),
    "Inter-Medium": require("../assets/fonts/Inter-Medium.ttf"),
    "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.ttf"),
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NotificationTaps />
        <StatusBar style="light" />
        {/* Screens slide in from the right (native stack, UI thread); Home and modals keep their own. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right", animationDuration: 260 }}>
          <Stack.Screen name="index" options={{ animation: "fade" }} />
          <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack>
        <AppLock />
      </AppProvider>
    </SafeAreaProvider>
  );
}
