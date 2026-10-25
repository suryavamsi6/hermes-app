// A small confirmation pill ("Copied", "Saved") that rises in near the bottom, stays ~2 s and fades.
// One host at the root; call toast() from anywhere. It never takes touches (pointerEvents none),
// never delays the action it confirms, and is announced to screen readers.
import { Check, CircleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createStore, useStore } from "../store";
import { useReduceMotion } from "./live-surface";
import { DUR } from "./motion-tokens";
import { colors, elevation, font } from "./theme";

type Toast = { id: number; text: string; kind: "ok" | "error" } | null;
const store = createStore<Toast>(null);
let seq = 0;
export function toast(text: string, kind: "ok" | "error" = "ok") {
  store.set(() => ({ id: ++seq, text, kind }));
  AccessibilityInfo.announceForAccessibility?.(text);
}

export function ToastHost() {
  const current = useStore(store, (s) => s);
  const [shown, setShown] = useState<Toast>(null);
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!current) return;
    setShown(current);
    t.value = reduced ? 1 : withTiming(1, { duration: DUR.base, easing: Easing.out(Easing.cubic) });
    const hide = setTimeout(() => {
      t.value = reduced ? 0 : withTiming(0, { duration: DUR.base, easing: Easing.in(Easing.quad) });
      store.set((s) => (s?.id === current.id ? null : s));
    }, DUR.toast);
    return () => clearTimeout(hide);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: (1 - t.value) * 12 }, { scale: 0.96 + 0.04 * t.value }] }));
  if (!shown) return null;
  const Icon = shown.kind === "ok" ? Check : CircleAlert;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 96, alignItems: "center" }}>
      <Reanimated.View accessibilityLiveRegion="polite" style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
        backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.borderStrong, ...elevation.floating }, style]}>
        <Icon size={16} color={shown.kind === "ok" ? colors.success : colors.danger} />
        <Text style={{ fontFamily: font.medium, fontSize: 14, color: colors.text }}>{shown.text}</Text>
      </Reanimated.View>
    </View>
  );
}
