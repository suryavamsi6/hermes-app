import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app-state";
import { colors } from "../src/ui/theme";

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
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "fade" }}>
          <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
