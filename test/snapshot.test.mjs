// Snapshot stability: every store selector must return a stable value (primitive or stored
// reference). A selector that builds a fresh array/object per call loops useSyncExternalStore
// (React re-renders until "Maximum update depth exceeded") — this killed release 0.11.12 on
// device, where the app died at startup. The harness bundles the hook modules against a React
// stub that calls every snapshot function twice and fails on any fresh value (stub-react.mjs).
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 test/snapshot-entry.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/hm-snapshot/snapshot.js --log-level=error --alias:react=" + new URL("./stub-react.mjs", import.meta.url).pathname + " --alias:expo-secure-store=" + new URL("./stub-react.mjs", import.meta.url).pathname + " --alias:react-native=" + new URL("./stub-react.mjs", import.meta.url).pathname);
const { probeAll } = await import("../node_modules/.cache/hm-snapshot/snapshot.js");

test("every store hook returns a stable snapshot across calls", () => {
  const failures = probeAll();
  assert.deepEqual(failures, []);
});
