// Design tokens for Hermes Mobile: a dark canvas, warm accent, neutral text and Inter type. Spacing is on a 4-point grid.

const light = {
  canvas: "#fffaf2", surface: "#ffffff", floating: "#fffdf9", control: "#f4efe7", controlActive: "#eae1f5",
  border: "#e8e0d5", borderStrong: "#d8cdbf", text: "#171525", textSecondary: "#48465a", muted: "#6f6b7d", dim: "#777386",
  accentText: "#98520c", action: "#c16b1b", actionForeground: "#ffffff", star: "#d58a16", danger: "#c83d42", success: "#159b72", warning: "#a46600",
  userBubble: "#f4e7d7", botBubble: "#f1eafa", scrim: "rgba(15,12,25,0.48)",
};
const dark = {
  canvas: "#09090b",          // screen background
  surface: "#131316",         // cards, assistant replies
  floating: "#1b1b1f",        // headers and sheets that float over the canvas
  control: "#1f1f24",         // inputs, chips, code blocks
  controlActive: "#2b2b31",   // pressed / selected controls
  border: "#24242a",
  borderStrong: "#383840",
  text: "#f2f2f4",
  textSecondary: "#c4c4ca",
  muted: "#9696a0",
  dim: "#7c7c86",              // timestamps, hints (4.5:1 on canvas)
  accentText: "#f0b35b",      // links and tappable text
  action: "#e79a3c",          // send button and primary buttons
  actionForeground: "#211407",
  star: "#f0b35b",
  danger: "#ff6464",
  success: "#46d27f",
  warning: "#f0b35b",
  userBubble: "#222227",
  botBubble: "#131316",
  scrim: "rgba(0,0,0,0.62)",
};
export const colors = { ...dark };
export function setTheme(mode: "light" | "dark") {
  Object.assign(colors, mode === "light" ? light : dark);
  for (const style of Object.values(type)) (style as { color: string }).color = colors.text;
  type.label.color = colors.muted;
  type.bodySm.color = colors.textSecondary;
  type.caption.color = colors.dim;
}

export const radii = { bubble: 22, pill: 26, card: 18, inset: 12, chip: 999 } as const;

/** n steps of the 4-point grid. */
export const space = (n: number) => n * 4;

/** Minimum touch target (Material/Apple guidance) for anything tappable. */
export const hit = 44;

/** Surfaces above the canvas: a soft shadow on Android (elevation) and iOS. */
export const elevation = {
  raised: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  floating: { elevation: 8, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
};

/** Durations for the few UI motions: short and calm, never bouncy. */
export const motion = { fast: 140, base: 200, slow: 260 } as const;

export const font = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  mono: "monospace",
};

export const type = {
  display: { fontFamily: font.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: colors.text },
  h: { fontFamily: font.semibold, fontSize: 19, lineHeight: 26, letterSpacing: -0.2, color: colors.text },
  title: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.1, color: colors.text },
  chat: { fontFamily: font.regular, fontSize: 16.5, lineHeight: 25, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  bodySm: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  label: { fontFamily: font.medium, fontSize: 12.5, lineHeight: 17, color: colors.muted },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: colors.dim },
};
