import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-state";
import { clearBotNotifications, onNotificationTap } from "../src/notify";
import { colors } from "../src/ui/theme";

/** Taps (and Allow once / Deny presses) on this app's notifications: approvals are answered in the
 *  background, plain taps open that bot's chat. Also fires for the notification that launched the
 *  app (getLastNotificationResponseAsync), so a killed app still routes. */
function NotificationTaps() {
  const { bots, approve } = useApp();
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
      </AppProvider>
    </SafeAreaProvider>
  );
}
