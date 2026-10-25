// The live status line while Hermes works: a small thinking face and a softly pulsing phrase
// ("Searching the web", "Running git status") instead of bare typing dots. Each new phrase
// crossfades in (keyed by its text); everything runs on the UI thread at 120 Hz.
import { memo } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import type { Bot } from "../backend";
import { Avatar } from "./kit";
import { enter, leave, usePulse } from "./motion";
import { colors, type } from "./theme";

export const ActivityRow = memo(function ActivityRow({ bot, text }: { bot: Bot; text: string }) {
  const pulse = usePulse();
  return (
    <Animated.View entering={enter.fade} exiting={leave.fade} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingVertical: 2 }}
      accessibilityLiveRegion="polite" accessibilityLabel={text}>
      <Avatar bot={bot} size={24} mood="thinking" badge={false} />
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        <Animated.View style={pulse}>
          <Animated.Text key={text} entering={enter.fade} numberOfLines={1} style={[type.body, { color: colors.muted }]}>{text}</Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
});
