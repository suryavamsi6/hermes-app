// Preferences store: loaded once from secure storage, updated in memory, saved on change.
import { createStore, useStore } from "./store";
import * as Store from "./secure";
import { DEFAULT_PREFS, parsePrefs, type Prefs } from "./prefs-core";
export * from "./prefs-core";

const KEY = "hermes.prefs.v1";
const prefs = createStore<Prefs>({ ...DEFAULT_PREFS });
let loaded: Promise<void> | undefined;
export const loadPrefs = () => (loaded ??= Store.getItem(KEY).then((raw) => prefs.set(() => parsePrefs(raw))).catch(() => {}));
export const getPrefs = () => prefs.get();
export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  prefs.set((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  void Store.setItem(KEY, JSON.stringify(prefs.get())).catch(() => {});
}
export function usePrefs<T>(select: (p: Prefs) => T): T { return useStore(prefs, select); }
export const setBotNotify = (botId: string, patch: Prefs["bots"][string]) =>
  setPrefs((p) => ({ bots: { ...p.bots, [botId]: { ...p.bots[botId], ...patch } } }));
