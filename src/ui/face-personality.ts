// Pure (RN-free) so it can be unit-tested.
export type Personality = { eyeW: number; eyeH: number; gap: number; eyeY: number; blinkMin: number; blinkMax: number; mouthW: number; pupil: number; drift: number };

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Deterministic personality from a seed (bot id or name). Values are fractions of the tile size. */
import type { EyeStyle } from "../appearance";
const EYES: Record<Exclude<EyeStyle, "auto">, [number, number, number]> = { round: [0.17, 0.2, 0.5], tall: [0.15, 0.24, 0.58], wide: [0.2, 0.17, 0.5], dot: [0.12, 0.12, 0.62] };

export function personality(seed: string, eyes: EyeStyle = "auto"): Personality {
  const h = hash(seed || "bot");
  const pick = (shift: number, n: number) => (h >>> shift) % n;
  const shapes = [[0.17, 0.2], [0.15, 0.24], [0.2, 0.18], [0.16, 0.16]]; // round-ish, tall, wide, small
  const [eyeW, eyeH] = shapes[pick(0, shapes.length)];
  const blinks = [[2000, 4500], [2800, 6000], [1800, 3800]];
  const [blinkMin, blinkMax] = blinks[pick(4, blinks.length)];
  const o = eyes !== "auto" ? EYES[eyes] : undefined;
  return {
    eyeW: o ? o[0] : eyeW, eyeH: o ? o[1] : eyeH, gap: [0.12, 0.16, 0.2][pick(8, 3)], eyeY: [0.3, 0.33, 0.36][pick(12, 3)],
    blinkMin, blinkMax, mouthW: [0.26, 0.32, 0.38][pick(16, 3)], pupil: o ? o[2] : [0.5, 0.58][pick(20, 2)], drift: [0.6, 1][pick(24, 2)],
  };
}

