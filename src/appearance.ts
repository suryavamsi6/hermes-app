// Bot appearance: tile shapes, colour palette, eye styles, contrast and local persistence.
// Pure TypeScript (no React Native imports) so it can be unit-tested. Appearance is app-only cosmetic,
// so in live mode it lives on the phone, keyed by Hermes profile, and needs nothing from the server.

export const SHAPES = ["rounded", "circle", "squircle", "blob", "hexagon", "flower", "cloud", "ghost"] as const;
export type ShapeId = (typeof SHAPES)[number];
export const SHAPE_LABELS: Record<ShapeId, string> = {
  rounded: "Rounded", circle: "Circle", squircle: "Squircle", blob: "Blob", hexagon: "Hexagon", flower: "Flower", cloud: "Cloud", ghost: "Ghost",
};

export const EYE_STYLES = ["auto", "round", "tall", "wide", "dot"] as const;
export type EyeStyle = (typeof EYE_STYLES)[number];

/** Curated for the near-black theme. `b` makes a top-left → bottom-right gradient. */
export type Swatch = { id: string; name: string; a: string; b?: string };
export const PALETTE: Swatch[] = [
  { id: "midnight", name: "Midnight", a: "#2a3f5c" },
  { id: "grape", name: "Grape", a: "#4b3576" },
  { id: "forest", name: "Forest", a: "#1f5a42" },
  { id: "teal", name: "Teal", a: "#1d6670" },
  { id: "ember", name: "Ember", a: "#9a3b2e" },
  { id: "plum", name: "Plum", a: "#6e2f60" },
  { id: "ochre", name: "Ochre", a: "#8a6a1f" },
  { id: "slate", name: "Slate", a: "#43475a" },
  { id: "sky", name: "Sky", a: "#8cc8ff" },
  { id: "mint", name: "Mint", a: "#7fe0b5" },
  { id: "coral", name: "Coral", a: "#ff8a75" },
  { id: "butter", name: "Butter", a: "#ffd66b" },
];
export const GRADIENTS: Swatch[] = [
  { id: "sunset", name: "Sunset", a: "#ff8a75", b: "#6e2f60" },
  { id: "aurora", name: "Aurora", a: "#7fe0b5", b: "#2a3f5c" },
  { id: "dusk", name: "Dusk", a: "#8c7bff", b: "#1d2b4f" },
  { id: "honey", name: "Honey", a: "#ffd66b", b: "#9a3b2e" },
  { id: "lagoon", name: "Lagoon", a: "#8cc8ff", b: "#1d6670" },
  { id: "berry", name: "Berry", a: "#ff7ab6", b: "#4b3576" },
];

export type Look = { color: string; color2?: string; shape?: ShapeId; eyes?: EyeStyle; emoji?: string };

// ---- contrast ----
function lum(hex: string) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const INK = "#121214", LIGHT = "#f7f7f7";
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** Feature colours for a tile: whichever of light/ink reads better on the (average of the) fill. */
export function faceInk(color: string, color2?: string) {
  const l = color2 ? (lum(color) + lum(color2)) / 2 : lum(color);
  const light = contrast(l, lum(LIGHT)) >= contrast(l, lum(INK));
  return light ? { fg: LIGHT, pupil: INK } : { fg: INK, pupil: LIGHT };
}

// ---- shapes: every shape is a closed polygon in a 100×100 box (dense enough to look smooth) ----
type Pt = [number, number];
const N = 96;
function polar(cx: number, cy: number, r: (t: number) => number): Pt[] {
  return Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; const d = r(t); return [cx + d * Math.cos(t), cy + d * Math.sin(t)] as Pt; });
}
function superellipse(n: number, a = 47): Pt[] {
  return Array.from({ length: N }, (_, i) => {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    return [50 + a * Math.sign(c) * Math.abs(c) ** (2 / n), 50 + a * Math.sign(s) * Math.abs(s) ** (2 / n)] as Pt;
  });
}
function roundedPoly(corners: Pt[], r: number): Pt[] {
  const out: Pt[] = [];
  corners.forEach((p, i) => {
    const prev = corners[(i + corners.length - 1) % corners.length], next = corners[(i + 1) % corners.length];
    const v1 = [prev[0] - p[0], prev[1] - p[1]], v2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    const a: Pt = [p[0] + (v1[0] / l1) * r, p[1] + (v1[1] / l1) * r], b: Pt = [p[0] + (v2[0] / l2) * r, p[1] + (v2[1] / l2) * r];
    for (let k = 0; k <= 8; k++) { const t = k / 8; // quadratic Bézier a → p → b
      out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p[1] + t * t * b[1]]); }
  });
  return out;
}
/** Outline of a union of circles, traced by rays from (cx, cy), which must lie inside every circle's reach. */
function circleUnion(cx: number, cy: number, circles: [number, number, number][]): Pt[] {
  return polar(cx, cy, (t) => {
    const u = [Math.cos(t), Math.sin(t)]; let best = 0;
    for (const [x, y, R] of circles) {
      const d = [cx - x, cy - y], b = d[0] * u[0] + d[1] * u[1], c = d[0] ** 2 + d[1] ** 2 - R * R, disc = b * b - c;
      if (disc >= 0) best = Math.max(best, -b + Math.sqrt(disc));
    }
    return best;
  });
}
function ghost(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) { const t = Math.PI + (i / 24) * Math.PI; pts.push([50 + 38 * Math.cos(t), 46 + 38 * Math.sin(t)]); } // dome
  pts.push([88, 84]);
  for (let i = 0; i <= 36; i++) { const x = 88 - (i / 36) * 76; pts.push([x, 88 + 5 * Math.cos(((88 - x) / 76) * Math.PI * 6)]); } // wavy hem
  pts.push([12, 84]);
  return pts;
}

export function shapePoints(shape: ShapeId = "rounded"): Pt[] {
  switch (shape) {
    case "circle": return polar(50, 50, () => 47);
    case "squircle": return superellipse(5);
    case "rounded": return roundedPoly([[3, 3], [97, 3], [97, 97], [3, 97]], 34);
    case "blob": return polar(50, 50, (t) => 42 + 4 * Math.sin(3 * t + 0.6) + 2.5 * Math.cos(5 * t + 1.3));
    case "hexagon": return roundedPoly(Array.from({ length: 6 }, (_, i) => { const t = (i / 6) * Math.PI * 2 + Math.PI / 6; return [50 + 50 * Math.cos(t), 50 + 50 * Math.sin(t)] as Pt; }), 12);
    case "flower": return polar(50, 50, (t) => 43 + 6 * Math.cos(8 * t));
    case "cloud": return circleUnion(50, 56, [[26, 62, 22], [50, 44, 30], [76, 58, 22], [50, 70, 24]]);
    case "ghost": return ghost();
  }
}
const f = (n: number) => Math.round(n * 10) / 10;
/** SVG path in a 0 0 100 100 viewBox. */
export function shapePath(shape: ShapeId = "rounded"): string {
  const p = shapePoints(shape);
  return `M${p.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
}
export function insideShape(shape: ShapeId, x: number, y: number) { // ray casting, coords in 0..100
  const p = shapePoints(shape); let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- persistence (live mode): one small entry per profile ----
export type KV = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
export const LOOK_KEY = (profile: string) => `hermes.look.${profile.replace(/[^A-Za-z0-9._-]/g, "_")}`;
export function lookOf(b: Look): Look { return { color: b.color, color2: b.color2, shape: b.shape, eyes: b.eyes, emoji: b.emoji }; }
export async function saveLook(kv: KV, profile: string, look: Look) { await kv.setItem(LOOK_KEY(profile), JSON.stringify(lookOf(look))); }
export async function withLook<T extends Look & { profile: string }>(kv: KV, b: T): Promise<T> {
  const raw = await kv.getItem(LOOK_KEY(b.profile)).catch(() => null);
  if (!raw) return b;
  try { const l = JSON.parse(raw) as Look; return { ...b, ...Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)) }; } catch { return b; }
}
