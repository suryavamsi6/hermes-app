// Tapback reactions: long-press a message to pick one; tap the badge to clear. Stored on the phone.
import { Pressable, Text, View } from "react-native";
import { colors, radii } from "./theme";

export const REACTIONS = ["❤️", "👍", "😂", "🔥", "🙏", "‼️"];

export function ReactionPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, backgroundColor: colors.surface, borderRadius: radii.chip, borderWidth: 1, borderColor: colors.borderStrong, padding: 6, alignSelf: "flex-start" }}>
      {REACTIONS.map((e) => (
        <Pressable key={e} onPress={() => onPick(e)} accessibilityLabel={`React ${e}`} style={({ pressed }) => ({ padding: 6, borderRadius: 999, backgroundColor: pressed ? colors.control : "transparent" })}>
          <Text style={{ fontSize: 22 }}>{e}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ReactionBadge({ emoji, onPress, align }: { emoji: string; onPress: () => void; align: "flex-start" | "flex-end" }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="Remove reaction" style={{ alignSelf: align, marginTop: -10, backgroundColor: colors.surface, borderRadius: 999,
      borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
    </Pressable>
  );
}
