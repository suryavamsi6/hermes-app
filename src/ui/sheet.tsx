// Bottom sheet (Home bot menu, message menu, attach, model picker): scrim, rounded top, grab handle,
// plain rows. It glides up on open and slides back down on close (ease-out in, ease-in out, no
// bounce) while the scrim fades; the Modal stays mounted until the exit finishes, showing the last
// content so the panel doesn't collapse mid-slide. Reduce Motion: appears and disappears at once.
// Shared values only (no layout animations), so nothing can outlive the sheet.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "./live-surface";
import { DUR } from "./motion-tokens";
import { colors, type } from "./theme";

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const last = useRef<ReactNode>(children);
  if (visible) last.current = children;
  const t = useSharedValue(0); // 0 hidden, 1 shown
  const height = useSharedValue(480);

  useEffect(() => {
    if (visible) { setMounted(true); return; }
    if (!mounted) return;
    if (reduced) { t.value = 0; setMounted(false); return; }
    t.value = withTiming(0, { duration: DUR.sheetOut, easing: Easing.in(Easing.cubic) }, (done) => { if (done) runOnJS(setMounted)(false); });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!(visible && mounted)) return;
    t.value = reduced ? 1 : withTiming(1, { duration: DUR.sheet, easing: Easing.out(Easing.cubic) });
  }, [visible, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrim = useAnimatedStyle(() => ({ opacity: t.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - t.value) * height.value }] }));
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Reanimated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.scrim }, scrim]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Reanimated.View>
        <Reanimated.View style={panel} onLayout={(e) => { height.value = e.nativeEvent.layout.height + 24; }}>
          <View accessibilityViewIsModal style={{ backgroundColor: colors.control, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: insets.bottom + 12 }}>
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: title ? 10 : 14 }} />
            {title ? <Text accessibilityRole="header" style={[type.label, { paddingHorizontal: 20, paddingBottom: 6, letterSpacing: 0.4 }]}>{title.toUpperCase()}</Text> : null}
            <View style={{ paddingHorizontal: title ? 6 : 0 }}>{visible ? children : last.current}</View>
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

export function SheetRow({ icon, label, detail, onPress }: { icon: ReactNode; label: string; detail?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? colors.controlActive : "transparent" })}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: onPress ? colors.text : colors.muted }]}>{label}</Text>
        {detail ? <Text style={type.label} numberOfLines={1}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
