// A bot face is a shallow stack of its own silhouette: contact shadow, darker back, face and eyes.
// State and ambient motion stay on Reanimated's UI thread; hidden surfaces and Reduce Motion settle still.
import { memo, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { type EyeStyle, faceInk, type ShapeId, shapePath } from "../appearance";
import { faceLayerGeometry, faceMotion, type FaceMood, POSE, rhythm } from "./face-state";
import { personality } from "./face-personality";
import { useLiveSurface, useReduceMotion } from "./live-surface";
import { DUR, SPRINGS } from "./motion-tokens";

export type { FaceMood };
export { personality };
export { useReduceMotion as useReducedMotion };

let gradSeq = 0;
/** Single face plane, also used by the appearance picker. */
export const ShapeTile = memo(function ShapeTile({ shape = "rounded", color, color2, size }: { shape?: ShapeId; color: string; color2?: string; size: number }) {
  const gid = useMemo(() => `g${++gradSeq}`, []);
  const d = useMemo(() => shapePath(shape), [shape]);
  return <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
    {color2 ? <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={color} /><Stop offset="1" stopColor={color2} /></LinearGradient></Defs> : null}
    <Path d={d} fill={color2 ? `url(#${gid})` : color} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
  </Svg>;
});

const IN_OUT = Easing.inOut(Easing.quad), OUT = Easing.out(Easing.cubic);
const stop = (...v: SharedValue<number>[]) => v.forEach((x) => cancelAnimation(x));
function ambientKeys(r: ReturnType<typeof rhythm>) {
  const input = [0], output = [1]; let t = 0;
  const blinkAt = (at: number) => { input.push(at, at + 70, at + 200); output.push(1, 0.06, 1); };
  t += r.blinks[0]; blinkAt(t); t += 200 + r.blinks[1]; blinkAt(t); t += 200 + r.blinks[2]; blinkAt(t); t += 290; blinkAt(t); t += 400;
  const period = t;
  const gi = [0], gx = [0], gy = [0]; let g = 0;
  for (const gl of r.glances) { g += gl.wait; gi.push(g); gx.push(0); gy.push(0); g += 240; gi.push(g); gx.push(gl.x); gy.push(gl.y); g += gl.hold; gi.push(g); gx.push(gl.x); gy.push(gl.y); g += 260; gi.push(g); gx.push(0); gy.push(0); }
  g += 400; gi.push(g); gx.push(0); gy.push(0);
  const w = 2400 + (r.start % 900), checkPeriod = w + 1480;
  return { blinkPeriod: period, blinkIn: input.map((x) => x / period), blinkOut: output, glancePeriod: g, glanceIn: gi.map((x) => x / g), glanceX: gx, glanceY: gy,
    checkPeriod, checkIn: [0, w / checkPeriod, (w + 260) / checkPeriod, (w + 1160) / checkPeriod, 1], checkOut: [0, 0, 1, 1, 0] };
}
function darken(hex: string) {
  const value = hex.replace("#", "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return "#171923";
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  return `#${[0, 2, 4].map((i) => Math.round(parseInt(full.slice(i, i + 2), 16) * 0.58 + [11, 15, 25][i / 2] * 0.42).toString(16).padStart(2, "0")).join("")}`;
}

export const BotFace = memo(function BotFace({ seed, color, color2, shape = "rounded", eyes = "auto", emoji, size = 40, mood = "idle", animate = true, badge = true, poke = 0 }: {
  seed: string; color: string; color2?: string; shape?: ShapeId; eyes?: EyeStyle; emoji?: string; size?: number; mood?: FaceMood; animate?: boolean; badge?: boolean; poke?: number;
}) {
  const p = useMemo(() => personality(seed, eyes), [seed, eyes]);
  const backId = useMemo(() => `b${++gradSeq}`, []);
  const phase = useRef(Math.random()).current;
  const rh = useMemo(() => rhythm(seed, [p.blinkMin, p.blinkMax], phase), [seed, p.blinkMin, p.blinkMax, phase]);
  const keys = useMemo(() => ambientKeys(rh), [rh]);
  const reduced = useReduceMotion(), active = useLiveSurface(animate), plan = faceMotion(mood, { reduced, active });
  const pose = POSE[mood], s = size, layers = faceLayerGeometry(s);
  const lookX = useSharedValue(pose.lookX), lookY = useSharedValue(pose.lookY), eyeX = useSharedValue(pose.eyeX), eyeY = useSharedValue(pose.eyeY);
  const tilt = useSharedValue(pose.tilt), lift = useSharedValue(pose.lift), worry = useSharedValue(pose.worry), joy = useSharedValue(pose.joy);
  const blink = useSharedValue(0), tapBlink = useSharedValue(1), glance = useSharedValue(0), breath = useSharedValue(0), loop = useSharedValue(0), accent = useSharedValue(0);
  const instant = reduced;

  useEffect(() => {
    const to = (v: SharedValue<number>, x: number, ms: number = DUR.expression) => { v.value = instant ? x : withTiming(x, { duration: ms, easing: IN_OUT }); };
    to(lookX, pose.lookX); to(lookY, pose.lookY); to(eyeX, pose.eyeX); to(eyeY, pose.eyeY);
    to(lift, pose.lift); to(worry, pose.worry); to(joy, pose.joy, DUR.quick);
    tilt.value = instant ? pose.tilt : withSpring(pose.tilt, SPRINGS.gentle);
  }, [mood, instant]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan.blink) { stop(blink); blink.value = 0; return; }
    blink.value = 0;
    blink.value = withDelay(rh.start, withRepeat(withTiming(1, { duration: keys.blinkPeriod, easing: Easing.linear }), -1, false));
    return () => { stop(blink); blink.value = 0; };
  }, [plan.blink, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!plan.glance) { stop(glance); glance.value = 0; return; }
    glance.value = withRepeat(withTiming(1, { duration: keys.glancePeriod, easing: Easing.linear }), -1, false);
    return () => { stop(glance); glance.value = 0; };
  }, [plan.glance, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!plan.breathe) { stop(breath); breath.value = 0; return; }
    breath.value = withDelay(rh.start % 1200, withRepeat(withTiming(1, { duration: rh.breath, easing: IN_OUT }), -1, true));
    return () => { stop(breath); breath.value = 0; };
  }, [plan.breathe, rh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    stop(loop);
    if (plan.loop === "none") { loop.value = 0; return; }
    loop.value = withRepeat(withTiming(1, { duration: plan.loop === "drift" ? 4200 : plan.loop === "nod" ? 1500 : keys.checkPeriod, easing: plan.loop === "drift" ? IN_OUT : Easing.linear }), -1, plan.loop === "drift");
    return () => { stop(loop); loop.value = 0; };
  }, [plan.loop, keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const celebrated = useRef(false);
  useEffect(() => {
    if (!plan.celebrate) { cancelAnimation(accent); accent.value = 0; celebrated.current = false; return; }
    if (celebrated.current || !active) return;
    celebrated.current = true;
    accent.value = withSequence(withTiming(-1, { duration: 170, easing: OUT }), withSpring(0, SPRINGS.gentle));
  }, [plan.celebrate, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastPoke = useRef(poke);
  useEffect(() => {
    if (reduced || !active) { cancelAnimation(tapBlink); tapBlink.value = 1; return; }
    if (lastPoke.current === poke) return;
    lastPoke.current = poke;
    tapBlink.value = withSequence(withTiming(0.06, { duration: 70 }), withTiming(1, { duration: 140, easing: OUT }));
  }, [poke, reduced, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const eyeW = s * p.eyeW, eyeH = s * p.eyeH, travelX = s * 0.05, travelY = s * 0.035, cx = s / 2, eyeTop = s * p.eyeY, gap = s * p.gap;
  const { fg: ink } = faceInk(color, color2), d = useMemo(() => shapePath(shape), [shape]);
  const colorBack = darken(color), colorBack2 = color2 ? darken(color2) : undefined;
  const shadowStyle = useAnimatedStyle(() => ({ opacity: 0.12 - worry.value * 0.02, transform: [{ translateY: layers.shadowY + lift.value * s * 0.18 }, { scaleX: 0.92 }, { scaleY: 0.9 }] }));
  const shadowSoftStyle = useAnimatedStyle(() => ({ opacity: 0.035 - worry.value * 0.005, transform: [{ translateY: layers.shadowY + lift.value * s * 0.18 }, { scaleX: 0.99 }, { scaleY: 0.97 }] }));
  const backStyle = useAnimatedStyle(() => ({ transform: [{ translateY: layers.backY + interpolate(loop.value, [0, 1], [0, plan.loop === "nod" ? layers.depth * 0.14 : 0]) }] }));
  const faceStyle = useAnimatedStyle(() => {
    const sway = plan.loop === "drift" ? (loop.value - 0.5) * 2 : 0;
    return { opacity: 1 - worry.value * 0.035, transform: [{ translateY: (lift.value + accent.value) * s * 0.04 }, { rotate: `${tilt.value + sway}deg` }, { scale: 1 + breath.value * 0.01 }] };
  });
  const eyeStyle = (side: -1 | 1) => () => {
    "worklet";
    const drift = plan.loop === "drift" ? (loop.value - 0.5) * 0.65 : 0;
    const check = plan.loop === "check" ? interpolate(loop.value, keys.checkIn, keys.checkOut) * 0.5 : 0;
    const nod = plan.loop === "nod" ? interpolate(loop.value, [0, 0.3, 0.76, 1], [0, 1, 0, 0]) * 0.18 : 0;
    const blinkScale = interpolate(blink.value, keys.blinkIn, keys.blinkOut) * tapBlink.value;
    const gx = interpolate(glance.value, keys.glanceIn, keys.glanceX), gy = interpolate(glance.value, keys.glanceIn, keys.glanceY);
    return { opacity: 1 - joy.value, transform: [{ translateX: (lookX.value + gx + drift) * travelX }, { translateY: layers.eyeY + (lookY.value + gy + check + nod) * travelY },
      { rotate: `${-side * worry.value * 9}deg` }, { scaleX: eyeX.value }, { scaleY: eyeY.value * blinkScale }] };
  };
  const left = useAnimatedStyle(eyeStyle(-1)), right = useAnimatedStyle(eyeStyle(1));
  const joyStyle = useAnimatedStyle(() => ({ opacity: joy.value, transform: [{ translateY: (1 - joy.value) * eyeH * 0.2 }] }));
  const eyeAt = (side: -1 | 1) => cx + side * (gap / 2 + eyeW / 2) - eyeW / 2;
  const ring = Math.max(1.5, s * 0.04), badgeSize = Math.max(14, s * 0.4), label = mood === "idle" ? "bot face" : `bot face, ${mood}`;
  const plane = (fill: string, style?: object, stroke = "transparent") => <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: s, height: s }, style]} pointerEvents="none">
    <Svg width={s} height={s} viewBox="0 0 100 100"><Path d={d} fill={fill} stroke={stroke} strokeWidth={s < 40 ? 1 : 1.5} /></Svg>
  </Animated.View>;
  const backPlane = colorBack2 ? <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: s, height: s }, backStyle]} pointerEvents="none"><Svg width={s} height={s} viewBox="0 0 100 100"><Defs><LinearGradient id={backId} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colorBack} /><Stop offset="1" stopColor={colorBack2} /></LinearGradient></Defs><Path d={d} fill={`url(#${backId})`} /></Svg></Animated.View> : plane(colorBack, backStyle);
  return <View style={{ width: s, height: s }} pointerEvents="none" accessibilityRole="image" accessibilityLabel={label}>
    {plane("#000", shadowSoftStyle)}
    {plane("#000", shadowStyle)}
    {backPlane}
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: s, height: s }, faceStyle]} pointerEvents="none">
      <ShapeTile shape={shape} color={color} color2={color2} size={s} />
      {([-1, 1] as const).map((side) => <Animated.View key={side} style={[{ position: "absolute", left: eyeAt(side), top: eyeTop, width: eyeW, height: eyeH, borderRadius: eyeW / 2, backgroundColor: ink }, side === -1 ? left : right]} />)}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: s, height: s }, joyStyle]}>
        {([-1, 1] as const).map((side) => <View key={side} style={{ position: "absolute", left: eyeAt(side), top: eyeTop + eyeH * 0.25, width: eyeW, height: eyeW / 2, overflow: "hidden" }}><View style={{ width: eyeW, height: eyeW, borderRadius: eyeW / 2, borderWidth: ring, borderColor: ink }} /></View>)}
      </Animated.View>
    </Animated.View>
    {badge && emoji && s >= 26 ? <View style={{ position: "absolute", right: -s * 0.1, bottom: -s * 0.1, width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2,
      backgroundColor: "#141415", borderWidth: 1.5, borderColor: "#000", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: badgeSize * 0.6, lineHeight: badgeSize * 0.8 }}>{emoji}</Text></View> : null}
  </View>;
});

/** Hidden text for screen readers / tests: what the face is showing. */
export { moodLabel } from "./face-state";
