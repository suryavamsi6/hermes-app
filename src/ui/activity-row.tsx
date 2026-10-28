// One factual line while Hermes works. It stays still so the reply remains easy to read.
import { memo } from "react";
import { Text } from "react-native";
import { colors, type } from "./theme";

export const ActivityRow = memo(function ActivityRow({ text }: { text: string }) {
  return <Text numberOfLines={1} accessibilityLiveRegion="polite" style={[type.body, { color: colors.muted }]}>{text.trim() || "Working…"}</Text>;
});
