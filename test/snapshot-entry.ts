// Entry for the snapshot-stability harness: bundles the store-hook modules with a React stub that
// fails on any selector returning a fresh value per call. See stub-react.mjs for the mechanism.
import * as hooks from "../src/app-state-hooks";
import { live, type Live } from "../src/app-state-hooks";
import { setPrefs, usePrefs } from "../src/prefs";
import { setHookName } from "./stub-react.mjs";

const sample: Live = {
  chats: {
    b1: { turns: [{ id: "t1", role: "assistant", status: "streaming", text: "hi", steps: [], at: 1 } as any], busy: true, loaded: true },
    b2: { turns: [{ id: "t2", role: "user", text: "yo", at: 1 } as any], busy: false, loaded: true, error: "boom" },
  },
  unread: { b1: 2, b3: 1 },
  preview: { b1: "preview" },
  reactions: { t1: "👍" },
  happy: { b1: true },
  lastAt: { b1: 1000 },
  drafts: { b1: "draft" },
};
live.set(() => sample);
setPrefs({ bots: { b1: { muted: true } }, quietStart: 22, quietEnd: 7 });

// Probe every exported hook with plausible dummy arguments. Most take a bot/turn id; wrong-arity
// calls throw real TypeErrors, which are ignored — only instability is a failure.
const fakes = ["b1", "t1", undefined, true, 1, {}, "x"];
export function probeAll(): string[] {
  const failures: string[] = [];
  const ignored: string[] = [];
  for (const [name, fn] of Object.entries({ ...hooks, usePrefs })) {
    if (typeof fn !== "function" || !name.startsWith("use")) continue;
    for (const arity of [0, 1, 2]) {
      setHookName(`${name}/${arity}`);
      try { (fn as any)(...fakes.slice(0, arity)); } catch (e: any) {
        if (String(e?.message).includes("Unstable")) failures.push(`${name}: ${e.message}`);
        else ignored.push(`${name}/${arity}: ${String(e?.message ?? e).slice(0, 80)}`);
      }
    }
  }
  return failures;
}
