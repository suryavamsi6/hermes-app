// The live status line while Hermes works: a small thinking face and a softly pulsing phrase
// ("Searching the web", "Running git status") instead of bare typing dots. Opacity only, on the
// native driver, so it costs nothing per frame at 120 Hz.
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import type { Bot } from "../backend";
import { Avatar } from "./kit";
import { colors, type } from "./theme";

export const ActivityRow = memo(function ActivityRow({ bot, text }: { bot: Bot; text: string }) {
  const glow = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [glow]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingVertical: 2 }} accessibilityLiveRegion="polite" accessibilityLabel={text}>
      <Avatar bot={bot} size={24} mood="thinking" badge={false} />
      <Animated.Text numberOfLines={1} style={[type.body, { flexShrink: 1, color: colors.muted, opacity: glow }]}>{text}</Animated.Text>
    </View>
  );
});
