// Animated face for a bot, calm and minimal like Grok Bot's avatar: a tile in the bot's colour with
// two well-spaced solid oval eyes (no pupils, no mouth) that blink and glance, and the bot's emoji as
// a small badge. Only transform/opacity are animated, so every animation runs
// on the native driver. Personality (eye shape/spacing, blink rate) comes from a seed.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { type EyeStyle, faceInk, type ShapeId, shapePath } from "../appearance";

export type FaceMood = "idle" | "thinking" | "happy" | "approval" | "error";

import { personality } from "./face-personality";
export { personality };

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => alive && setReduced(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

const ND = { useNativeDriver: true } as const;
const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.quad)) => Animated.timing(v, { toValue, duration, easing, ...ND });

let gradSeq = 0;
/** The tile itself: the shape path filled with a colour or a two-stop gradient. Static (only its parent animates). */
export const ShapeTile = memo(function ShapeTile({ shape = "rounded", color, color2, size }: { shape?: ShapeId; color: string; color2?: string; size: number }) {
  const gid = useMemo(() => `g${++gradSeq}`, []);
  const d = useMemo(() => shapePath(shape), [shape]);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
      {color2 ? <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={color} /><Stop offset="1" stopColor={color2} /></LinearGradient></Defs> : null}
      <Path d={d} fill={color2 ? `url(#${gid})` : color} />
    </Svg>
  );
});

type Keys = { inputRange: number[]; outputRange: number[] };
const flat: Keys = { inputRange: [0, 1], outputRange: [0, 0] };
/** Sine wave keyframes over 0..1 (cycles × amp), piecewise-linear but dense enough to look smooth. */
function sine(cycles: number, amp: number, lo = 0): Keys {
  const n = cycles * 12, inputRange: number[] = [], outputRange: number[] = [];
  for (let i = 0; i <= n; i++) { inputRange.push(i / n); outputRange.push(lo + amp * (0.5 - 0.5 * Math.cos((i / n) * cycles * Math.PI * 2))); }
  return { inputRange, outputRange };
}
/** [ms, value] keyframes over a cycle of `period` ms → interpolation keys on 0..1. */
const keys = (period: number, pts: [number, number][]): Keys => ({ inputRange: pts.map(([t]) => t / period), outputRange: pts.map(([, v]) => v) });

/** Per-mood loop: one clock period, and the offsets each channel adds on top of the mood's pose. */
function moodLoop(mood: FaceMood, drift: number): { period: number; loop: boolean; x: Keys; y: Keys; hop: Keys; tilt: Keys; scale: Keys } {
  switch (mood) {
    case "idle": { const d = drift;
      return { period: 9600, loop: true, hop: flat, tilt: flat, scale: sine(3, 0.035),
        x: keys(9600, [[0, 0], [1800, 0], [2060, 0.8 * d], [2960, 0.8 * d], [3220, -0.7 * d], [3920, -0.7 * d], [4180, 0], [6580, 0], [6840, 0.3 * d], [7440, 0.3 * d], [7700, 0], [9600, 0]]),
        y: keys(9600, [[0, 0], [2960, 0], [3220, 0.2 * d], [3920, 0.2 * d], [4180, 0], [6580, 0], [6840, -0.5 * d], [7440, -0.5 * d], [7700, 0], [9600, 0]]) }; }
    case "thinking":
      return { period: 1200, loop: true, y: flat, scale: flat,
        x: keys(1200, [[0, -0.8], [180, 0.8], [600, 0.8], [820, -0.8], [1200, -0.8]]),
        hop: keys(1200, [[0, 0], [260, -0.025], [520, 0], [600, 0], [860, -0.025], [1120, 0], [1200, 0]]),
        tilt: sine(1, 4, -2) };
    case "happy":
      return { period: 700, loop: false, x: flat, y: flat, tilt: flat,
        hop: keys(700, [[0, 0], [90, -0.12], [180, -0.18], [300, -0.04], [380, 0], [450, -0.06], [520, -0.08], [620, 0], [660, -0.01], [700, 0]]),
        scale: keys(700, [[0, 0], [180, 0.08], [500, 0], [700, 0]]) };
    case "approval":
      return { period: 2500, loop: true, y: flat, hop: flat, tilt: flat, scale: flat,
        x: keys(2500, [[0, 0], [1400, 0], [1600, -1.2], [2300, -1.2], [2500, 0]]) };
    case "error":
      return { period: 5200, loop: true, x: flat, y: flat, hop: flat, tilt: flat, scale: sine(1, 0.03, -0.01) };
  }
}
/** Where each mood's face rests (offsets above animate around it). */
const POSE: Record<FaceMood, { x: number; y: number; hop: number; tilt: number }> = {
  idle: { x: 0, y: 0, hop: 0, tilt: 0 }, happy: { x: 0, y: 0, hop: 0, tilt: 0 }, thinking: { x: 0, y: -0.75, hop: 0, tilt: 0 },
  approval: { x: 0.7, y: -0.2, hop: 0, tilt: 5 }, error: { x: 0, y: 0.5, hop: 0.03, tilt: -3 },
};

// Every animation here is a single native-driver timing (no JS per frame or per loop iteration), and the
// animated node graph is rebuilt only when the mood or size changes, never on unrelated re-renders.
export const BotFace = memo(function BotFace({ seed, color, color2, shape = "rounded", eyes = "auto", emoji, size = 40, mood = "idle", animate = true, badge = true }: {
  seed: string; color: string; color2?: string; shape?: ShapeId; eyes?: EyeStyle; emoji?: string; size?: number; mood?: FaceMood; animate?: boolean; badge?: boolean;
}) {
  const p = useMemo(() => personality(seed, eyes), [seed, eyes]);
  const reduced = useReducedMotion();
  const live = animate && !reduced;

  const blinkClock = useRef(new Animated.Value(0)).current; // 0→1 = one blink
  const clock = useRef(new Animated.Value(0)).current;      // the mood's loop
  const pose = useRef({ x: new Animated.Value(0), y: new Animated.Value(0), hop: new Animated.Value(0), tilt: new Animated.Value(0) }).current;

  // Blinks at a personality-specific random interval (idle, thinking and approval only).
  useEffect(() => {
    if (!live || mood === "error" || mood === "happy") return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { blinkClock.setValue(0); t(blinkClock, 1, 180, Easing.linear).start(() => schedule()); }, p.blinkMin + Math.random() * (p.blinkMax - p.blinkMin));
    };
    schedule();
    return () => { clearTimeout(timer); blinkClock.stopAnimation(); blinkClock.setValue(0); };
  }, [live, mood, p, blinkClock]);

  const loop = useMemo(() => moodLoop(mood, p.drift), [mood, p.drift]);
  // Mood change: tween to the new pose, then run that mood's loop on the clock.
  useEffect(() => {
    const target = POSE[mood];
    clock.stopAnimation(); clock.setValue(0);
    const tweens: Animated.CompositeAnimation[] = [];
    (Object.keys(pose) as (keyof typeof pose)[]).forEach((k) => {
      pose[k].stopAnimation();
      if (!live) { pose[k].setValue(target[k]); return; }
      const a = t(pose[k], target[k], mood === "approval" && k === "tilt" ? 260 : 220, mood === "approval" && k === "tilt" ? Easing.out(Easing.back(2)) : Easing.inOut(Easing.quad));
      tweens.push(a); a.start();
    });
    let run: Animated.CompositeAnimation | undefined;
    if (live) {
      const one = Animated.timing(clock, { toValue: 1, duration: loop.period, easing: Easing.linear, ...ND });
      run = loop.loop ? Animated.loop(one) : one; // loop(timing) runs as a native loop
      run.start();
    }
    return () => { run?.stop(); tweens.forEach((a) => a.stop()); };
  }, [mood, live, loop, clock, pose]);

  const s = size;
  const eyeW = s * p.eyeW, eyeH = s * p.eyeH;
  // The whole eye glances (there are no pupils): a few percent of the tile each way.
  const travelX = s * 0.04, travelY = s * 0.025;
  const nodes = useMemo(() => {
    const ch = (base: Animated.Value, k: Keys) => Animated.add(base, clock.interpolate(k));
    return {
      blink: blinkClock.interpolate({ inputRange: [0, 0.39, 1], outputRange: [1, 0.08, 1] }),
      px: Animated.multiply(ch(pose.x, loop.x), travelX), py: Animated.multiply(ch(pose.y, loop.y), travelY),
      ty: Animated.multiply(ch(pose.hop, loop.hop), s),
      rot: ch(pose.tilt, loop.tilt).interpolate({ inputRange: [-30, 30], outputRange: ["-30deg", "30deg"] }),
      scale: clock.interpolate({ inputRange: loop.scale.inputRange, outputRange: loop.scale.outputRange.map((v) => 1 + v) }),
    };
  }, [clock, blinkClock, pose, loop, travelX, travelY, s]);

  const cx = s / 2, eyeTop = s * p.eyeY, gap = s * p.gap;
  const { fg: light } = faceInk(color, color2); // features flip to dark ink on light tiles

  const eye = (side: -1 | 1) => {
    const left = cx + side * (gap / 2 + eyeW / 2) - eyeW / 2;
    if (mood === "happy") // ^ ^ squint: top half of a ring
      return <View key={side} style={{ position: "absolute", left, top: eyeTop + eyeH * 0.25, width: eyeW, height: eyeW / 2, overflow: "hidden" }}>
        <View style={{ width: eyeW, height: eyeW, borderRadius: eyeW / 2, borderWidth: Math.max(1.5, s * 0.045), borderColor: light }} />
      </View>;
    const flat = mood === "error";
    return (
      <Animated.View key={side} style={{ position: "absolute", left, top: eyeTop + (flat ? eyeH * 0.4 : 0), width: eyeW, height: flat ? Math.max(2, eyeH * 0.2) : eyeH,
        borderRadius: eyeW / 2, backgroundColor: light,
        transform: [{ translateX: nodes.px }, { translateY: nodes.py }, { scaleY: nodes.blink }] }} />
    );
  };
  const badgeSize = Math.max(14, s * 0.4);
  return (
    <View style={{ width: s, height: s }} accessibilityRole="image" accessibilityLabel={`${mood === "idle" ? "" : `${mood} `}bot face`}>
      <Animated.View style={{ width: s, height: s, opacity: mood === "error" ? 0.75 : 1,
        transform: [{ translateY: nodes.ty }, { rotate: nodes.rot }, { scale: nodes.scale }] }}>
        <ShapeTile shape={shape} color={color} color2={color2} size={s} />
        {eye(-1)}{eye(1)}
        {mood === "error" && s >= 30 ? <Text style={{ position: "absolute", right: s * 0.08, top: s * 0.02, fontSize: s * 0.2, color: light, opacity: 0.8 }}>z</Text> : null}
      </Animated.View>
      {badge && emoji && s >= 26 ? (
        <View style={{ position: "absolute", right: -s * 0.1, bottom: -s * 0.1, width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2,
          backgroundColor: "#141415", borderWidth: 1.5, borderColor: "#000", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: badgeSize * 0.6, lineHeight: badgeSize * 0.8 }}>{emoji}</Text>
        </View>
      ) : null}
    </View>
  );
});
