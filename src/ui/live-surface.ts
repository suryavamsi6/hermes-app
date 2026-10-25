// Is anyone looking? Shared, single-subscription signals that ambient animation checks before running:
// the app is in the foreground, the screen is focused, and the system's Reduce Motion setting.
import { useContext, useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";
import { IsFocusedContext } from "expo-router/build/react-navigation/core/useIsFocused";
import { useReducedMotion as useStartupReduced } from "react-native-reanimated";

function signal<T>(initial: T, start: (set: (v: T) => void) => () => void) {
  let value = initial; let stop: (() => void) | undefined;
  const subs = new Set<() => void>();
  const set = (v: T) => { if (v !== value) { value = v; subs.forEach((l) => l()); } };
  return {
    get: () => value,
    subscribe(l: () => void) {
      subs.add(l);
      if (!stop) stop = start(set);
      return () => { subs.delete(l); if (!subs.size) { stop?.(); stop = undefined; } };
    },
  };
}

const appState = signal<AppStateStatus>((AppState.currentState as AppStateStatus) ?? "active", (set) => {
  const sub = AppState.addEventListener("change", set);
  return () => sub.remove();
});
/** False while the app is in the background (Android) or inactive (iOS app switcher). */
export function useAppActive() {
  const s = useSyncExternalStore(appState.subscribe, appState.get, appState.get);
  return s !== "background" && s !== "inactive";
}

let reduceNow = false;
// undefined until the async query answers; until then Reanimated's synchronous startup value is used.
const reduceMotion = signal<boolean | undefined>(undefined, (set) => {
  AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceNow = v; set(v); }).catch(() => {});
  const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => { reduceNow = v; set(v); });
  return () => sub?.remove?.();
});
/** The system Reduce Motion / "Remove animations" setting, live (updates if changed while open). */
export function useReduceMotion(): boolean {
  const startup = useStartupReduced();
  const v = useSyncExternalStore(reduceMotion.subscribe, reduceMotion.get, reduceMotion.get);
  return v ?? startup;
}
export const reduceMotionNow = () => reduceNow;

/** True unless this component sits in a screen that is not the focused one (covered by a pushed screen).
 *  Outside a navigator (no focus context) it counts as focused. */
export function useScreenFocused() {
  return useContext(IsFocusedContext) ?? true;
}

/** Ambient animation may run: app foregrounded, screen focused, and the caller wants it. */
export function useLiveSurface(want = true) {
  const app = useAppActive(), focused = useScreenFocused();
  return want && app && focused;
}
