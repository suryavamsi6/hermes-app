// Shared motion building blocks on react-native-reanimated: every animation runs on the UI thread
// (transform/opacity only, no layout props), plays once on mount rather than on re-render, and is
// skipped when the system's Reduce Motion setting is on. Durations and springs come from
// motion-tokens.ts; ambient loops (skeleton and status pulses) pause while the app is in the
// background or the screen is covered.
import { type ReactNode, useEffect, useRef } from "react";
import { Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSpring, withTiming, ZoomIn, ZoomOut } from "react-native-reanimated";
import { tapHaptic } from "./haptics";
import { useLiveSurface, useReduceMotion as useReducedMotion } from "./live-surface";
import { DUR, SPRINGS } from "./motion-tokens";

const EASE = Easing.out(Easing.cubic);
export const SPRING = { ...SPRINGS.press, reduceMotion: ReduceMotion.System } as const;

/** Layout presets (they honour Reduce Motion themselves). */
export const enter = {
  fade: FadeIn.duration(DUR.base).reduceMotion(ReduceMotion.System),
  pop: ZoomIn.springify().damping(16).stiffness(240).reduceMotion(ReduceMotion.System),
};
export const leave = {
  fade: FadeOut.duration(DUR.quick).reduceMotion(ReduceMotion.System),
  pop: ZoomOut.duration(DUR.quick).reduceMotion(ReduceMotion.System),
};

/** Fades and rises into place once, when mounted with `play` (e.g. a message that just arrived).
 *  With `play` false (history, re-mounts) it renders in place with no animation at all. */
export function Rise({ play = true, delay = 0, dy = 10, scale = 1, style, children }: { play?: boolean; delay?: number; dy?: number; scale?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const on = play && !reduced;
  const p = useSharedValue(on ? 0 : 1);
  useEffect(() => {
    if (on) p.value = withDelay(delay, withTiming(1, { duration: DUR.expression - 20, easing: EASE }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only
  const a = useAnimatedStyle(() => ({
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
export function PressScale({ to = 0.96, haptic = false, style, children, onPressIn, onPressOut, onPress, ...rest }: Omit<PressableProps, "style" | "children"> & { to?: number; haptic?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable {...rest} style={[style, a]}
      onPress={onPress && ((e) => { if (haptic) tapHaptic(); onPress(e); })}
      onPressIn={(e) => { if (!reduced) s.value = withTiming(to, { duration: DUR.press, easing: EASE }); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, SPRING); onPressOut?.(e); }}>
      {children}
    </APressable>
  );
}

/** A soft pulsing placeholder bar for lists that are still loading. */
export function Skeleton({ width = "100%", height = 14, radius = 7, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const live = useLiveSurface();
  const o = useSharedValue(0.6);
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(o); o.value = 0.75; return; }
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(o);
  }, [reduced, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: "#24242a" }, style, a]} />;
}

/** A few skeleton rows shaped like list rows (title + detail). */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <Rise dy={0} style={{ padding: 14, gap: 18 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={{ gap: 8 }}>
          <Skeleton width={`${55 - i * 8}%`} />
          <Skeleton width={`${85 - i * 6}%`} height={11} />
        </Animated.View>
      ))}
    </Rise>
  );
}

/** Pulsing opacity for a "working" label (the live status line). */
export function usePulse(min = 0.55, period = 900) {
  const reduced = useReducedMotion();
  const live = useLiveSurface();
  const o = useSharedValue(reduced ? 1 : min);
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(o); o.value = 1; return; }
    o.value = min;
    o.value = withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(o);
  }, [reduced, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: o.value }));
}

/** A slowly turning child (e.g. a loader icon) for "running" states. Still under Reduce Motion or
 *  while nobody can see it; the icon alone still says "running". */
export function Spin({ children, period = 1100 }: { children: ReactNode; period?: number }) {
  const reduced = useReducedMotion();
  const live = useLiveSurface();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduced || !live) { cancelAnimation(r); r.value = 0; return; }
    r.value = 0;
    r.value = withRepeat(withTiming(1, { duration: period, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [reduced, live, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** 0→1 when `open` flips, eased (instant under Reduce Motion): drive a chevron's rotation etc. */
export function useToggleProgress(open: boolean) {
  const reduced = useReducedMotion();
  const v = useSharedValue(open ? 1 : 0);
  useEffect(() => { v.value = reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: DUR.base, easing: EASE }); }, [open, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
