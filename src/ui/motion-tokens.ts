// Motion tokens (pure, RN-free, unit-tested): every animation in the app picks its duration, curve and
// spring from here so motion feels like one system. Short and calm: nothing an ordinary action waits on.
//   press      touch feedback (scale dip / highlight)          ~90 ms in, spring out
//   quick      small component changes (icons, chips, labels)  140 ms
//   base       content in/out, expand/collapse, toasts         200 ms
//   sheet      bottom sheets and dialogs                       240 ms in, 180 ms out
//   expression a bot face moving between moods                 280 ms
//   celebrate  the one short success hop                       ~520 ms total
export const DUR = { press: 90, quick: 140, base: 200, sheet: 240, sheetOut: 180, expression: 280, celebrate: 520, toast: 1800 } as const;

/** Spring configs (Reanimated withSpring options). `press` is crisp, `gentle` settles without overshoot
 *  you'd notice, `pop` is the only one allowed a visible bounce (success, tap reactions). */
export const SPRINGS = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  gentle: { damping: 22, stiffness: 190, mass: 0.8 },
  pop: { damping: 11, stiffness: 240, mass: 0.7 },
} as const;

export type MotionPolicy = {
  /** Animate transitions at all (fades, slides, presses). */
  transitions: boolean;
  /** Ambient loops: idle blinks, glances, breathing, skeleton pulses, status pulses. */
  ambient: boolean;
  /** One-off flourishes: success hop, tap reaction, icon pops. */
  flourish: boolean;
};

/** Reduce Motion turns off every loop and flourish and makes transitions instant; state is still shown
 *  (static expression, text labels, icons). An inactive surface (app backgrounded, screen not focused)
 *  keeps transitions but stops ambient loops so nothing runs where nobody can see it. */
export function motionPolicy({ reduced, active = true }: { reduced: boolean; active?: boolean }): MotionPolicy {
  if (reduced) return { transitions: false, ambient: false, flourish: false };
  return { transitions: true, ambient: active, flourish: active };
}

/** Duration to use under a policy: 0 means "set it, don't animate". */
export const dur = (ms: number, p: Pick<MotionPolicy, "transitions">) => (p.transitions ? ms : 0);
