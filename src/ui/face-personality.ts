// Pure (RN-free) so it can be unit-tested.
/** mouthW/pupil are kept for compatibility and are 0: the face has no mouth or pupils. */
export type Personality = { eyeW: number; eyeH: number; gap: number; eyeY: number; blinkMin: number; blinkMax: number; mouthW: number; pupil: number; drift: number };

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Deterministic personality from a seed (bot id or name). Values are fractions of the tile size. */
import type { EyeStyle } from "../appearance";
// Calm, Grok-like proportions: narrow upright ovals, set well apart (inner gap ≈ a quarter of the tile).
const EYES: Record<Exclude<EyeStyle, "auto">, [number, number, number]> = { round: [0.13, 0.17, 0], tall: [0.11, 0.21, 0], wide: [0.15, 0.14, 0], dot: [0.1, 0.11, 0] };

export function personality(seed: string, eyes: EyeStyle = "auto"): Personality {
  const h = hash(seed || "bot");
  const pick = (shift: number, n: number) => (h >>> shift) % n;
  const shapes = [[0.12, 0.19], [0.11, 0.21], [0.13, 0.17], [0.12, 0.16]]; // all upright ovals, slightly different
  const [eyeW, eyeH] = shapes[pick(0, shapes.length)];
  const blinks = [[2800, 5500], [3200, 6000], [2400, 5000]];
  const [blinkMin, blinkMax] = blinks[pick(4, blinks.length)];
  const o = eyes !== "auto" ? EYES[eyes] : undefined;
  return {
    eyeW: o ? o[0] : eyeW, eyeH: o ? o[1] : eyeH, gap: [0.22, 0.25, 0.28][pick(8, 3)], eyeY: [0.34, 0.36, 0.38][pick(12, 3)],
    blinkMin, blinkMax, mouthW: 0, pupil: 0, drift: [0.6, 1][pick(24, 2)],
  };
}
