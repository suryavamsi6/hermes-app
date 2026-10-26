// v0.11.4: slash commands. Hermes's API server has no command handling (a "/status" sent over /v1/runs
// reached the model as plain text), so the app parses and runs them itself, and shows a picker on "/".
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

execSync("npx -y esbuild@0.24.0 src/slash.ts --format=esm --outfile=node_modules/.cache/hm-slash/s.mjs --log-level=error");
const m = await import("../node_modules/.cache/hm-slash/s.mjs");
const SKILLS = [{ name: "Server Health", description: "Check disks, memory and services", enabled: true },
  { name: "trip-planner", description: "Plan a trip\nstep by step", enabled: true }, { name: "old-skill", description: "x", enabled: false },
  { name: "status", description: "a skill named like a built-in", enabled: true }];

test("parsing: commands vs normal text", () => {
  assert.deepStrictEqual(m.parseSlash("/status"), { name: "status", arg: "" });
  assert.deepStrictEqual(m.parseSlash("  /Model  gpt-5 mini "), { name: "model", arg: "gpt-5 mini" });
  assert.deepStrictEqual(m.parseSlash("/steer keep it\nshort"), { name: "steer", arg: "keep it\nshort" });
  for (const t of ["hello /status", "/ status", "//status", "/etc/hosts is broken", "/", "", "/\ud83d\ude00"]) assert.strictEqual(m.parseSlash(t), null, t);
  assert.strictEqual(m.unescapeSlash("//status please"), "/status please");
  assert.strictEqual(m.unescapeSlash("plain"), "plain");
});

export { m, SKILLS, assert, readFileSync, execSync, test };
