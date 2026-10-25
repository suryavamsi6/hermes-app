// Original mark for this app: a rounded square with a stylised "H" (no third-party logos).
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "./theme";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={1} y={1} width={30} height={30} rx={9} fill={colors.text} />
      <Path d="M10 9v14M22 9v14M10 16h12" stroke={colors.canvas} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
