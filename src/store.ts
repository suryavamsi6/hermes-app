// Tiny external store for fast-changing chat state. Components subscribe with a selector, so a streaming
// delta re-renders only what reads the changed slice (the streaming row, the header mood), not the app.
import { useSyncExternalStore } from "react";

export function createStore<S>(initial: S) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(f: (s: S) => S) { const next = f(state); if (next !== state) { state = next; subs.forEach((l) => l()); } },
    subscribe(l: () => void) { subs.add(l); return () => { subs.delete(l); }; },
  };
}
export type Store<S> = ReturnType<typeof createStore<S>>;
export function useStore<S, T>(store: Store<S>, select: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
