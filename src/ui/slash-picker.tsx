// The list that opens above the composer when you type "/": commands for this bot, filtered as you
// type. Tap one to run it (or, when it takes text, to put "/name " in the composer to finish).
// Plain views, no entering/exiting animations; it appears and goes with the text.
import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { SlashCommand } from "../slash";
import { colors, font, radii, type } from "./theme";

export const SlashPicker = memo(function SlashPicker({ items, onPick }: { items: SlashCommand[]; onPick: (c: SlashCommand) => void }) {
  if (!items.length) return null;
  return (
    <View accessibilityRole="menu" accessibilityLabel="Commands"
      style={{ marginHorizontal: 2, borderRadius: radii.card, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 264 }} contentContainerStyle={{ paddingVertical: 4 }}>
        {items.map((c, i) => (
          <Pressable key={c.name} onPress={() => onPick(c)} accessibilityRole="menuitem"
            accessibilityLabel={`/${c.name}${c.args ? ` ${c.args}` : ""}: ${c.description}`}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 7,
              backgroundColor: pressed ? colors.control : i === 0 ? "rgba(255,255,255,0.03)" : "transparent" })}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 14.5, lineHeight: 20, color: colors.text }}>
                /{c.name}{c.args ? <Text style={{ color: colors.dim }}> {c.args}</Text> : null}
              </Text>
              <Text numberOfLines={1} style={[type.label, { color: colors.muted }]}>{c.description}</Text>
            </View>
            {c.kind === "skill" ? <Text style={[type.caption, { color: colors.dim }]}>skill</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});
