// A soft fade from the canvas colour to transparent, so floating controls stay readable while the
// chat scrolls underneath them. Pure SVG: no blur, no animation, never takes touches.
import { memo } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "./theme";

export const Scrim = memo(function Scrim({ side, style, strength = 0.94 }: { side: "top" | "bottom"; style?: ViewStyle; strength?: number }) {
  const id = `scrim-${side}`;
  const [from, to] = side === "top" ? ["0", "1"] : ["1", "0"];
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ position: "absolute", left: 0, right: 0 }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={from} x2="0" y2={to}>
            <Stop offset="0" stopColor={colors.canvas} stopOpacity={strength} />
            <Stop offset="0.55" stopColor={colors.canvas} stopOpacity={strength * 0.72} />
            <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});
