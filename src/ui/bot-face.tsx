// Animated face for a bot, calm and minimal like Grok Bot's avatar: a tile in the bot's colour with
// two well-spaced solid oval eyes (no pupils, no mouth) and the bot's emoji as a small badge.
//
// Expressions (face-state.ts) come only from real app state. Each mood is a resting pose the features
// ease into, plus at most a little ambient life: blinks, glances and a slow breath at the bot's own
// uneven rhythm (seeded, plus a random phase per mount, so a row of bots never moves in step).
// Everything runs on the UI thread with Reanimated shared values (transform/opacity only, no JS timers,
// no React re-render per frame). Ambient motion stops while the app is in the background, the screen
// is covered, or `animate` is off; Reduce Motion shows the pose with no motion at all.
// `poke` (bump the number) plays a short tap reaction: a squash, a blink and a little hop.
import { memo, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { type EyeStyle, faceInk, type ShapeId, shapePath } from "../appearance";
import { faceMotion, type FaceMood, POSE, rhythm } from "./face-state";
import { personality } from "./face-personality";
import { useLiveSurface, useReduceMotion } from "./live-surface";
import { DUR, SPRINGS } from "./motion-tokens";

export type { FaceMood };
export { personality };
export { useReduceMotion as useReducedMotion };

let gradSeq = 0;
/** The tile itself: the shape path filled with a colour or a two-stop gradient. Static (only its parent animates). */
export const ShapeTile = memo(function ShapeTile({ shape = "rounded", color, color2, size }: { shape?: ShapeId; color: string; color2?: string; size: number }) {
  const gid = useMemo(() => `g${++gradSeq}`, []);
  const d = useMemo(() => shapePath(shape), [shape]);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
      {color2 ? <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={color} /><Stop offset="1" stopColor={color2} /></LinearGradient></Defs> : null}
      <Path d={d} fill={color2 ? `url(#${gid})` : color} stroke="rgba(255,255,255,0.24)" strokeWidth={2.2} />
      <Path d={d} fill="rgba(255,255,255,0.055)" stroke="rgba(12,10,24,0.14)" strokeWidth={1} transform="translate(0,-1)" />
    </Svg>
  );
});

const IN_OUT = Easing.inOut(Easing.quad);
const OUT = Easing.out(Easing.cubic);
const stop = (...v: SharedValue<number>[]) => v.forEach((x) => cancelAnimation(x));
/** Keyframes for the ambient clocks (built once per bot rhythm). */
const NOD = { period: 1000, input: [0, 0.3, 0.76, 1], output: [0, 1, 0, 0] };
function ambientKeys(r: ReturnType<typeof rhythm>) {
  // Blinks: closes in 70 ms, opens in 130 ms; the third gap ends in a double blink.
  const bi: number[] = [0], bo: number[] = [1];
  let t = 0;
  const blinkAt = (at: number) => { bi.push(at, at + 70, at + 200); bo.push(1, 0.08, 1); };
  t += r.blinks[0]; blinkAt(t); t += 200 + r.blinks[1]; blinkAt(t); t += 200 + r.blinks[2]; blinkAt(t); t += 290; blinkAt(t); t += 400;
  const blinkPeriod = t;
  // Glances: wait, move 240 ms, hold, return 260 ms; twice per cycle with different targets.
  const gi: number[] = [0], gxo: number[] = [0], gyo: number[] = [0];
  let g = 0;
  for (const gl of r.glances) { g += gl.wait; gi.push(g); gxo.push(0); gyo.push(0); g += 240; gi.push(g); gxo.push(gl.x); gyo.push(gl.y); g += gl.hold; gi.push(g); gxo.push(gl.x); gyo.push(gl.y); g += 260; gi.push(g); gxo.push(0); gyo.push(0); }
  g += 400; gi.push(g); gxo.push(0); gyo.push(0);
  // Waiting: every few seconds a quick look down at the approval card and back.
  const w = 2400 + (r.start % 900), checkPeriod = w + 260 + 900 + 320;
  return {
    blinkPeriod, blinkIn: bi.map((x) => x / blinkPeriod), blinkOut: bo,
    glancePeriod: g, glanceIn: gi.map((x) => x / g), glanceX: gxo, glanceY: gyo,
    checkPeriod, checkIn: [0, w / checkPeriod, (w + 260) / checkPeriod, (w + 1160) / checkPeriod, 1], checkOut: [0, 0, 1, 1, 0],
  };
}

export const BotFace = memo(function BotFace({ seed, color, color2, shape = "rounded", eyes = "auto", emoji, size = 40, mood = "idle", animate = true, badge = true, poke = 0 }: {
  seed: string; color: string; color2?: string; shape?: ShapeId; eyes?: EyeStyle; emoji?: string; size?: number; mood?: FaceMood; animate?: boolean; badge?: boolean;
  /** Change it (e.g. increment on tap) to play the tap reaction. */
  poke?: number;
}) {
  const p = useMemo(() => personality(seed, eyes), [seed, eyes]);
  const phase = useRef(Math.random()).current;
  const rh = useMemo(() => rhythm(seed, [p.blinkMin, p.blinkMax], phase), [seed, p.blinkMin, p.blinkMax, phase]);
  const reduced = useReduceMotion();
  const active = useLiveSurface(animate);
  const plan = faceMotion(mood, { reduced, active });
  const pose = POSE[mood];
  const smooth = !reduced; // pose changes ease unless Reduce Motion is on

  // Resting pose (eased between moods).
  const lookX = useSharedValue(pose.lookX), lookY = useSharedValue(pose.lookY);
  const eyeX = useSharedValue(pose.eyeX), eyeY = useSharedValue(pose.eyeY);
  const tilt = useSharedValue(pose.tilt), lift = useSharedValue(pose.lift);
  const joy = useSharedValue(pose.joy), worry = useSharedValue(pose.worry);
  // Ambient channels (0 at rest) and one-offs.
  const blink = useSharedValue(0), gx = useSharedValue(0), breath = useSharedValue(0), wink = useSharedValue(1);
  const loop = useSharedValue(0), hop = useSharedValue(0), squash = useSharedValue(0);

  useEffect(() => {
    const to = (v: SharedValue<number>, x: number, ms: number = DUR.expression) => { v.value = smooth ? withTiming(x, { duration: ms, easing: IN_OUT }) : x; };
    to(lookX, pose.lookX); to(lookY, pose.lookY); to(eyeX, pose.eyeX); to(eyeY, pose.eyeY);
    to(lift, pose.lift); to(joy, pose.joy, DUR.quick); to(worry, pose.worry);
    tilt.value = smooth ? withSpring(pose.tilt, SPRINGS.gentle) : pose.tilt;
  }, [mood, smooth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ambient channels are each ONE linear clock (0→1, repeating) read through keyframes in the
  // animated style, like the native-driver loops before: no nested sequences, nothing to drift.
  const keys = useMemo(() => ambientKeys(rh), [rh]);
  useEffect(() => {
    if (!plan.blink) { stop(blink); blink.value = 0; return; }
    blink.value = 0;
    blink.value = withDelay(rh.start, withRepeat(withTiming(1, { duration: keys.blinkPeriod, easing: Easing.linear }), -1, false));
    return () => { stop(blink); blink.value = 0; };
  }, [plan.blink, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Glances (idle only): look somewhere, hold, come back; two different targets per cycle.
  useEffect(() => {
    if (!plan.glance) { stop(gx); gx.value = 0; return; }
    gx.value = 0;
    gx.value = withRepeat(withTiming(1, { duration: keys.glancePeriod, easing: Easing.linear }), -1, false);
    return () => { stop(gx); gx.value = 0; };
  }, [plan.glance, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Breathing: a very slow, tiny scale swell.
  useEffect(() => {
    if (!plan.breathe) { stop(breath); breath.value = withTiming(0, { duration: DUR.base }); return; }
    breath.value = withDelay(rh.start % 1200, withRepeat(withTiming(1, { duration: rh.breath, easing: IN_OUT }), -1, true));
    return () => { stop(breath); breath.value = 0; };
  }, [plan.breathe, rh]); // eslint-disable-line react-hooks/exhaustive-deps

  // The mood's own loop: drift (thinking), nod (working), check (waiting: a look down at the card).
  useEffect(() => {
    stop(loop);
    if (plan.loop === "none") { loop.value = 0; return; }
    loop.value = 0;
    loop.value = plan.loop === "drift"
      ? withRepeat(withTiming(1, { duration: 2200, easing: IN_OUT }), -1, true)
      : withRepeat(withTiming(1, { duration: plan.loop === "nod" ? NOD.period : keys.checkPeriod, easing: Easing.linear }), -1, false);
    return () => { stop(loop); loop.value = 0; };
  }, [plan.loop, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Success: one hop with a small pop, then rest (never loops).
  useEffect(() => {
    if (!plan.celebrate) return;
    hop.value = withSequence(withTiming(-0.13, { duration: 170, easing: OUT }), withSpring(0, SPRINGS.pop));
    squash.value = withSequence(withTiming(-0.6, { duration: 90 }), withTiming(0.5, { duration: 150 }), withSpring(0, SPRINGS.pop));
  }, [plan.celebrate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap reaction.
  const pokes = useRef(poke);
  useEffect(() => {
    if (poke === pokes.current) return;
    pokes.current = poke;
    if (reduced) return;
    squash.value = withSequence(withTiming(1, { duration: 80, easing: OUT }), withSpring(0, SPRINGS.pop));
    hop.value = withSequence(withDelay(60, withTiming(-0.06, { duration: 140, easing: OUT })), withSpring(0, SPRINGS.pop));
    if (mood !== "success") wink.value = withSequence(withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 140, easing: OUT }));
  }, [poke]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = size;
  const eyeW = s * p.eyeW, eyeH = s * p.eyeH;
  const travelX = s * 0.05, travelY = s * 0.035;
  const cx = s / 2, eyeTop = s * p.eyeY, gap = s * p.gap;
  const { fg: light } = faceInk(color, color2); // features flip to dark ink on light tiles

  const loopKind = plan.loop;
  const tileStyle = useAnimatedStyle(() => {
    const b = 1 + breath.value * 0.022;
    const q = squash.value;
    const nod = loopKind === "nod" ? interpolate(loop.value, NOD.input, NOD.output) * 0.025 : 0;
    const sway = loopKind === "drift" ? (loop.value - 0.5) * 4 : 0;
    return {
      opacity: 1 - worry.value * 0.1,
      transform: [{ translateY: (lift.value + hop.value + nod) * s }, { rotate: `${tilt.value + sway}deg` }, { scaleX: b * (1 + q * 0.07) }, { scaleY: b * (1 - q * 0.07) }],
    };
  });
  const eyeStyle = (side: -1 | 1) => () => {
    "worklet";
    const drift = loopKind === "drift" ? (loop.value - 0.5) * 0.9 : 0;
    const check = loopKind === "check" ? interpolate(loop.value, keys.checkIn, keys.checkOut) * 0.7 : 0;
    const nod = loopKind === "nod" ? interpolate(loop.value, NOD.input, NOD.output) * 0.25 : 0;
    const open = interpolate(blink.value, keys.blinkIn, keys.blinkOut) * wink.value;
    const gX = interpolate(gx.value, keys.glanceIn, keys.glanceX), gY = interpolate(gx.value, keys.glanceIn, keys.glanceY);
    return {
      opacity: 1 - joy.value,
      transform: [
        { translateX: (lookX.value + gX + drift) * travelX },
        { translateY: (lookY.value + gY + check + nod) * travelY },
        { rotate: `${-side * worry.value * 13}deg` },
        { scaleX: eyeX.value },
        { scaleY: eyeY.value * open },
      ],
    };
  };
  const left = useAnimatedStyle(eyeStyle(-1));
  const right = useAnimatedStyle(eyeStyle(1));
  const joyStyle = useAnimatedStyle(() => ({ opacity: joy.value, transform: [{ translateY: (1 - joy.value) * eyeH * 0.2 }] }));

  const eyeAt = (side: -1 | 1) => cx + side * (gap / 2 + eyeW / 2) - eyeW / 2;
  const ring = Math.max(1.5, s * 0.045);
  const badgeSize = Math.max(14, s * 0.4);
  const label = mood === "idle" ? "bot face" : `bot face, ${mood}`;
  return (
    <View style={{ width: s, height: s }} pointerEvents="none" accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={[{ width: s, height: s }, tileStyle]}>
        <ShapeTile shape={shape} color={color} color2={color2} size={s} />
        {([-1, 1] as const).map((side) => (
          <Animated.View key={side} style={[{ position: "absolute", left: eyeAt(side), top: eyeTop, width: eyeW, height: eyeH, borderRadius: eyeW / 2, backgroundColor: light }, side === -1 ? left : right]} />
        ))}
        {/* ^ ^ eyes for success: the top half of a ring, crossfaded with the ovals. */}
        <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: s, height: s }, joyStyle]}>
          {([-1, 1] as const).map((side) => (
            <View key={side} style={{ position: "absolute", left: eyeAt(side), top: eyeTop + eyeH * 0.25, width: eyeW, height: eyeW / 2, overflow: "hidden" }}>
              <View style={{ width: eyeW, height: eyeW, borderRadius: eyeW / 2, borderWidth: ring, borderColor: light }} />
            </View>
          ))}
        </Animated.View>
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

/** Hidden text for screen readers / tests: what the face is showing. */
export { moodLabel } from "./face-state";
