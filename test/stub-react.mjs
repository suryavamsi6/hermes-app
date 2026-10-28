// Test double for React used by the snapshot-stability harness. It implements just enough of the
// React API that the store hook modules import, and turns useSyncExternalStore into a stability
// probe: every snapshot function is called twice (plus the server snapshot) and any fresh value
// fails the build — the exact failure mode that killed release 0.11.12 on device.
let current = "unknown";
export const setHookName = (n) => { current = n; };

export function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const a = getSnapshot();
  const b = getSnapshot();
  if (!Object.is(a, b)) throw new Error(`Unstable getSnapshot in ${current}: two calls returned different values (${fmt(a)} vs ${fmt(b)})`);
  const c = getServerSnapshot();
  if (!Object.is(a, c)) throw new Error(`Unstable getServerSnapshot in ${current}: ${fmt(a)} vs ${fmt(c)}`);
  subscribe(() => {});
  return a;
}
const fmt = (v) => (typeof v === "object" && v !== null ? `object ${Array.isArray(v) ? "array" : ""}` : String(v));

export const Platform = { OS: "node" };
export const createContext = () => ({ _ctx: true });
export const useContext = () => null;
export const useState = (init) => [typeof init === "function" ? init() : init, () => {}];
export const useRef = (v) => ({ current: v });
export const useCallback = (f) => f;
export const useMemo = (f) => f();
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const memo = (c) => c;
export const forwardRef = (c) => c;
export const createElement = () => null;
export const Fragment = "Fragment";
export default { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect, memo, forwardRef, createElement, Fragment, createContext, useContext, useSyncExternalStore };
