// Shared motion building blocks on react-native-reanimated: every animation runs on the UI thread
// (transform/opacity only, no layout props), plays once on mount rather than on re-render, and is
// skipped when the system's Reduce Motion setting is on.
import { type ReactNode, useEffect, useRef } from "react";
import { Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";

const EASE = Easing.out(Easing.cubic);
export const SPRING = { damping: 18, stiffness: 260, mass: 0.7, reduceMotion: ReduceMotion.System } as const;

/** Layout presets (they honour Reduce Motion themselves). */
export const enter = {
  fade: FadeIn.duration(180).reduceMotion(ReduceMotion.System),
  pop: ZoomIn.springify().damping(16).stiffness(240).reduceMotion(ReduceMotion.System),
};
export const leave = {
  fade: FadeOut.duration(140).reduceMotion(ReduceMotion.System),
  pop: ZoomOut.duration(140).reduceMotion(ReduceMotion.System),
};

/** Fades and rises into place once, when mounted with `play` (e.g. a message that just arrived).
 *  With `play` false (history, re-mounts) it renders in place with no animation at all. */
export function Rise({ play = true, delay = 0, dy = 10, scale = 1, style, children }: { play?: boolean; delay?: number; dy?: number; scale?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const on = play && !reduced;
  const p = useSharedValue(on ? 0 : 1);
  useEffect(() => {
    if (on) p.value = withDelay(delay, withTiming(1, { duration: 260, easing: EASE }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only
  const a = useAnimatedStyle(() => (p.value >= 1 ? { opacity: 1, transform: [] } : {
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * dy }, { scale: scale + (1 - scale) * p.value }],
  }));
  // History rows don't animate: a plain View, no animated opacity/transform (on Android those can
  // push a tall row into an offscreen layer that draws blank).
  // Decided once at mount, so a later re-render never swaps the wrapper (that would remount the row).
  const animated = useRef(on).current;
  if (!animated) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

const APressable = Animated.createAnimatedComponent(Pressable);
/** A Pressable that dips to `to` while pressed and springs back (UI thread). */
export function PressScale({ to = 0.96, style, children, onPressIn, onPressOut, ...rest }: Omit<PressableProps, "style" | "children"> & { to?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable {...rest} style={[style, a]}
      onPressIn={(e) => { s.value = withSpring(to, SPRING); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, SPRING); onPressOut?.(e); }}>
      {children}
    </APressable>
  );
}

/** A soft pulsing placeholder bar for lists that are still loading. */
export function Skeleton({ width = "100%", height = 14, radius = 7, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.5);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: "#24242a" }, style, a]} />;
}

/** A few skeleton rows shaped like list rows (title + detail). */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <Animated.View entering={enter.fade} style={{ padding: 14, gap: 18 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={{ gap: 8 }}>
          <Skeleton width={`${55 - i * 8}%`} />
          <Skeleton width={`${85 - i * 6}%`} height={11} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

/** Pulsing opacity for a "working" label (the live status line). */
export function usePulse(min = 0.55, period = 900) {
  const reduced = useReducedMotion();
  const o = useSharedValue(reduced ? 1 : min);
  useEffect(() => {
    if (reduced) { o.value = 1; return; }
    o.value = withRepeat(withSequence(withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }), withTiming(min, { duration: period, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: o.value }));
}
