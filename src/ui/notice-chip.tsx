// A gateway notification Hermes stored in the chat (a routine result delivered, a process finished):
// a small centred event chip; tap to read what it carried. Never a user bubble.
import { BellRing, ChevronDown, ChevronRight } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { tapHaptic } from "./haptics";
import { Markdown } from "./markdown";
import { colors, radii, type } from "./theme";

export const NoticeChip = memo(function NoticeChip({ title, body, time }: { title: string; body: string; time?: string }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Pressable onPress={() => { tapHaptic(); setOpen(!open); }} disabled={!body} accessibilityRole="button"
        accessibilityLabel={`${title}. ${open ? "Hide" : "Show"} details`} hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "88%", minHeight: 32, paddingHorizontal: 12, paddingVertical: 6,
          borderRadius: radii.chip, backgroundColor: pressed ? colors.control : colors.floating, borderWidth: 1, borderColor: colors.border })}>
        <BellRing size={14} color={colors.muted} />
        <Text numberOfLines={1} style={[type.label, { flexShrink: 1, color: colors.textSecondary }]}>{title}</Text>
        {time ? <Text style={[type.label, { color: colors.dim }]}>{time}</Text> : null}
        {body ? <Chevron size={14} color={colors.dim} /> : null}
      </Pressable>
      {open && body ? (
        <View style={{ alignSelf: "stretch", marginHorizontal: 8, padding: 14, borderRadius: radii.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Markdown text={body} />
        </View>
      ) : null}
    </View>
  );
});
