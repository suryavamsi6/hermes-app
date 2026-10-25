// The live status line while Hermes works: a small thinking face and a softly pulsing phrase
// ("Searching the web", "Running git status") instead of bare typing dots. Each new phrase
// fades in once; the pulse runs on the UI thread.
//
// No Reanimated layout animations (entering/exiting) here: this row lives inside the chat's inverted
// FlatList, and on Android an `exiting` view keeps its removed ancestors alive as a "ghost" drawn over
// the list until the animation ends. When the reply row was replaced mid-animation (stream finished,
// history re-synced) the ghost of the whole reply bubble stuck on top of the chat (v0.10.4 fix).
import { memo } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import type { Bot } from "../backend";
import type { FaceMood } from "./face-state";
import { Avatar } from "./kit";
import { Rise, usePulse } from "./motion";
import { colors, type } from "./theme";

export const ActivityRow = memo(function ActivityRow({ bot, text, mood = "thinking" }: { bot: Bot; text: string; mood?: FaceMood }) {
  const pulse = usePulse();
  return (
    <Rise dy={0} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingVertical: 2 }}>
      <Avatar bot={bot} size={24} mood={mood} badge={false} />
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        <Animated.View style={pulse}>
          <Animated.Text numberOfLines={1} accessibilityLiveRegion="polite" style={[type.body, { color: colors.muted }]}>{text}</Animated.Text>
        </Animated.View>
      </View>
    </Rise>
  );
});
