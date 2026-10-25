// Which expression a bot's face shows (pure, RN-free, unit-tested). Every mood comes from real app
// state: a face never looks busy, pleased or expectant unless the chat says so.
//   idle      nothing going on (occasional blink, glance, slow breath)
//   listening you're typing to it or dictating (eyes open a little wider, look up at you)
//   thinking  a run started and nothing has come back yet (eyes up and to the side, slow drift)
//   working   a tool is running or the reply is being written (focused squint, small steady nod)
//   waiting   the run is paused for your OK, or queued behind another client (head tilt, looks at you)
//   success   a reply just finished, or a setting was saved (^ ^ eyes and one hop; ~1 s)
//   error     the last run failed or the chat couldn't load (concerned, lowered eyes; no "z", no nap)
import type { AssistantTurn, Turn } from "../chat-model";
import { motionPolicy } from "./motion-tokens";

export type FaceMood = "idle" | "listening" | "thinking" | "working" | "waiting" | "success" | "error";
export const FACE_MOODS: FaceMood[] = ["idle", "listening", "thinking", "working", "waiting", "success", "error"];

type ChatLike = { busy: boolean; error?: string; turns: Turn[] } | undefined;

function lastAssistant(turns: Turn[] | undefined): AssistantTurn | undefined {
  for (let i = (turns?.length ?? 0) - 1; i >= 0; i--) { const t = turns![i]; if (t.role === "assistant") return t; }
  return undefined;
}

/** The face for one streaming reply (the small face on its status line). */
export function turnMood(t: AssistantTurn): FaceMood {
  if (t.status !== "streaming") return t.status === "failed" ? "error" : "idle";
  if (t.approval) return "waiting";
  if (t.steps.some((s) => s.status === "running") || t.text) return "working";
  return "thinking";
}

/** The face for a bot, from its chat. `happy` is the short flag set when a reply completes (or a
 *  setting was saved); `listening` is the composer being focused or dictating. Order matters: a
 *  pending approval outranks everything (it needs you), then live work, then the brief success,
 *  then a failure, then listening. */
export function faceMood(c: ChatLike, o: { happy?: boolean; listening?: boolean } = {}): FaceMood {
  const last = lastAssistant(c?.turns);
  if (last?.status === "streaming" && last.approval) return "waiting";
  if (last?.status === "queued") return "waiting";
  if (c?.busy) return last?.status === "streaming" ? turnMood(last) : "thinking";
  if (o.happy) return "success";
  if (c?.error || last?.status === "failed") return "error";
  if (o.listening) return "listening";
  return "idle";
}

/** Words for the mood, so state is never shown by the face (colour or motion) alone. */
export function moodLabel(m: FaceMood, o: { approval?: boolean; reconnecting?: boolean } = {}): string | null {
  if (o.reconnecting) return "reconnecting…";
  switch (m) {
    case "idle": return null;
    case "listening": return "listening…";
    case "thinking": return "thinking…";
    case "working": return "working…";
    case "waiting": return o.approval === false ? "waiting…" : "needs your OK";
    case "success": return "done";
    case "error": return "needs attention";
  }
}

/** Where each mood's features rest. Units: look* are fractions of the eye travel (-1..1), eye* scale
 *  the eyes, tilt is degrees, lift is a fraction of the tile, joy crossfades to ^ ^ eyes, worry slants
 *  the eyes into a concerned look. Every non-idle mood differs from idle even with motion off, so the
 *  static (Reduce Motion) face still tells you what's going on. */
export type Pose = { lookX: number; lookY: number; eyeX: number; eyeY: number; tilt: number; lift: number; joy: number; worry: number };
export const POSE: Record<FaceMood, Pose> = {
  idle:      { lookX: 0,    lookY: 0,    eyeX: 1,    eyeY: 1,    tilt: 0,  lift: 0,     joy: 0, worry: 0 },
  listening: { lookX: 0,    lookY: -0.5, eyeX: 1.06, eyeY: 1.1,  tilt: 0,  lift: -0.02, joy: 0, worry: 0 },
  thinking:  { lookX: 0.7,  lookY: -0.8, eyeX: 1,    eyeY: 0.92, tilt: 3,  lift: 0,     joy: 0, worry: 0 },
  working:   { lookX: 0,    lookY: 0.45, eyeX: 1.04, eyeY: 0.72, tilt: 0,  lift: 0,     joy: 0, worry: 0 },
  waiting:   { lookX: 0.25, lookY: 0,    eyeX: 1,    eyeY: 1,    tilt: 6,  lift: 0,     joy: 0, worry: 0 },
  success:   { lookX: 0,    lookY: 0,    eyeX: 1,    eyeY: 1,    tilt: 0,  lift: 0,     joy: 1, worry: 0 },
  error:     { lookX: 0,    lookY: 0.55, eyeX: 0.96, eyeY: 0.7,  tilt: -3, lift: 0.02,  joy: 0, worry: 1 },
};

/** The ambient loop a mood runs on top of its pose (only while motion is allowed). */
export type FaceLoop = "none" | "drift" | "nod" | "check";
export type FaceMotion = { blink: boolean; glance: boolean; breathe: boolean; loop: FaceLoop; celebrate: boolean; react: boolean };
const STILL: FaceMotion = { blink: false, glance: false, breathe: false, loop: "none", celebrate: false, react: false };

/** What may move for a mood. Reduce Motion: nothing (the pose alone carries the state). Inactive
 *  (backgrounded / screen hidden / `animate` off): nothing ambient either. */
export function faceMotion(m: FaceMood, o: { reduced: boolean; active: boolean }): FaceMotion {
  const p = motionPolicy(o);
  if (!p.ambient) return STILL;
  switch (m) {
    case "idle": return { ...STILL, blink: true, glance: true, breathe: true, react: true };
    case "listening": return { ...STILL, blink: true, breathe: true, react: true };
    case "thinking": return { ...STILL, blink: true, loop: "drift", react: true };
    case "working": return { ...STILL, blink: true, loop: "nod", react: true };
    case "waiting": return { ...STILL, blink: true, breathe: true, loop: "check", react: true };
    case "success": return { ...STILL, celebrate: true, react: true };
    case "error": return { ...STILL, blink: true, breathe: true, react: true };
  }
}

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const mix = (h: number, k: number) => { let x = Math.imul(h ^ (k * 0x9e3779b1), 2246822507); x ^= x >>> 13; x = Math.imul(x, 3266489909); return (x ^ (x >>> 16)) >>> 0; };

/** A bot's own idle rhythm: three uneven blink gaps (the third is a double blink), glance targets and
 *  holds, and a breathing period, all derived from its seed so bots side by side never move in step.
 *  `phase` (0..1, random per mount) offsets the start as well. */
export type Rhythm = { blinks: [number, number, number]; glances: { x: number; y: number; wait: number; hold: number }[]; breath: number; start: number };
export function rhythm(seed: string, base: [number, number] = [2600, 5600], phase = 0): Rhythm {
  const h = hash(seed || "bot");
  const r = (k: number) => (mix(h, k) % 10000) / 10000;
  const [lo, hi] = base;
  const gap = (k: number) => Math.round(lo + r(k) * (hi - lo));
  const side = r(7) < 0.5 ? -1 : 1;
  return {
    blinks: [gap(1), gap(2), gap(3) + 400],
    glances: [
      { x: side * (0.6 + 0.4 * r(4)), y: (r(5) - 0.5) * 0.6, wait: 3800 + Math.round(r(6) * 4200), hold: 700 + Math.round(r(8) * 900) },
      { x: -side * (0.5 + 0.4 * r(9)), y: (r(10) - 0.5) * 0.8, wait: 5200 + Math.round(r(11) * 5200), hold: 600 + Math.round(r(12) * 800) },
    ],
    breath: 3400 + Math.round(r(13) * 1400),
    start: Math.round((phase % 1) * (lo + hi) / 2),
  };
}
