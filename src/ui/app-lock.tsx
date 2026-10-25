// Fingerprint / screen-lock gate (Settings → Security → App lock). Locks on launch and when the app
// comes back after a minute in the background; unlocks with the phone's biometrics or PIN.
import * as LocalAuthentication from "expo-local-authentication";
import { Lock } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { usePrefs } from "../prefs";
import { colors, font, radii, type } from "./theme";

const GRACE_MS = 60_000;

export async function canUseAppLock(): Promise<boolean> {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.getEnrolledLevelAsync()) > 0; } catch { return false; }
}

export function AppLock() {
  const enabled = usePrefs((p) => p.appLock);
  const [locked, setLocked] = useState(enabled);
  const away = useRef<number | null>(null);
  const unlock = useCallback(async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Hermes", disableDeviceFallback: false });
      if (r.success) setLocked(false);
    } catch {}
  }, []);
  useEffect(() => { if (!enabled) setLocked(false); }, [enabled]);
  useEffect(() => { if (enabled && locked) void unlock(); }, [enabled, locked, unlock]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") away.current = Date.now();
      else if (s === "active" && away.current && Date.now() - away.current > GRACE_MS) { away.current = null; if (enabled) setLocked(true); }
    });
    return () => sub.remove();
  }, [enabled]);
  if (!enabled || !locked) return null;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Lock size={36} color={colors.muted} />
      <Text style={type.title}>Hermes is locked</Text>
      <Pressable onPress={() => void unlock()} accessibilityRole="button" style={{ backgroundColor: colors.action, borderRadius: radii.chip, paddingHorizontal: 28, paddingVertical: 12 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 16, color: colors.actionForeground }}>Unlock</Text>
      </Pressable>
    </View>
  );
}
