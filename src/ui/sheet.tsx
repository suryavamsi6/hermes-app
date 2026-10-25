// Bottom sheet (Home bot menu, message menu): scrim, rounded top, grab handle, plain rows.
// The panel glides up (ease-out, no bounce) while the scrim fades in (Reduce Motion: no slide).
import { Modal, Pressable, Text, View } from "react-native";
import Reanimated, { Easing, ReduceMotion, SlideInDown } from "react-native-reanimated";
const SLIDE = SlideInDown.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "./theme";

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" }} onPress={onClose}>
        <Reanimated.View entering={SLIDE}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.control, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: insets.bottom + 12 }}>
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: title ? 10 : 14 }} />
            {title ? <Text accessibilityRole="header" style={[type.label, { paddingHorizontal: 20, paddingBottom: 6, letterSpacing: 0.4 }]}>{title.toUpperCase()}</Text> : null}
            <View style={{ paddingHorizontal: title ? 6 : 0 }}>{children}</View>
          </Pressable>
        </Reanimated.View>
      </Pressable>
    </Modal>
  );
}
export function SheetRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: pressed ? colors.controlActive : "transparent" })}>
      {icon}<Text style={[type.body, { color: onPress ? colors.text : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

