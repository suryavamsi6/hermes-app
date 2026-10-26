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

// v0.11.6: every command Telegram accepts. Hermes's gateway command registry (hermes_cli/commands.py at the
// tested commit 4ea8d23c: commands that aren't cli_only, or are config-gated) with their aliases.
const TELEGRAM = {"start": [], "new": ["reset"], "topic": [], "save": [], "retry": [], "undo": [], "title": [], "branch": ["fork"], "compress": ["compact"], "rollback": [], "stop": [], "discard": [], "pause": [], "approve": [], "deny": [], "bg": [], "btw": [], "agents": ["tasks"], "queue": ["q"], "steer": ["s"], "goal": [], "heartbeat": ["hb"], "refine": [], "review": [], "loop": ["proactive"], "plan": [], "moa": [], "subgoal": [], "status": [], "egress": [], "context": ["ctx"], "whoami": [], "profile": [], "sethome": ["set-home"], "resume": [], "sessions": [], "model": [], "codex-runtime": ["codex_runtime"], "personality": [], "diff": [], "verbose": [], "footer": [], "yolo": [], "approvals": [], "reasoning": [], "fast": [], "voice": [], "busy": [], "autoprune": [], "skills": [], "memory": [], "bundles": [], "learn": [], "init": [], "suggestions": ["suggest"], "blueprint": ["bp"], "curator": [], "kanban": [], "reload-mcp": ["reload_mcp"], "reload-skills": ["reload_skills"], "commands": [], "help": [], "restart": [], "usage": [], "login": [], "topup": [], "insights": [], "platform": [], "update": [], "version": ["v"], "debug": []};
// Telegram commands Hermes's gateway refuses for any other client (gateway/session_commands.py: everything
// not in its read/control/setting/prompt lists gets unsupported_command), checked against a live gateway.
const REFUSED_BY_HERMES = ["start", "topic", "save", "retry", "undo", "branch", "compress", "rollback", "stop", "discard", "pause", "bg", "btw", "agents",
  "queue", "steer", "sethome", "resume", "sessions", "model", "reload-mcp", "reload-skills", "restart", "platform", "update", "new"];

test("every Telegram command is in the picker and routed: app, Hermes's handler, or explained", () => {
  assert.deepStrictEqual([...m.TELEGRAM].sort(), Object.keys(TELEGRAM).sort(), "the app's list is Telegram's list");
  const cat = m.catalog();
  for (const [name, aliases] of Object.entries(TELEGRAM)) {
    const row = cat.find((c) => c.name === name);
    assert.ok(row, `/${name} is in the picker`);
    for (const al of aliases) assert.ok(row.aliases?.includes(al), `/${al} is an alias of /${name}`);
    const route = m.routeOf(name);
    assert.ok(["app", "hermes", "no"].includes(route), name);
    if (REFUSED_BY_HERMES.includes(name)) assert.notStrictEqual(route, "hermes", `/${name} can't go to Hermes`);
    for (const t of [name, ...aliases]) {
      const a = m.resolveSlash(`/${t} x`);
      assert.ok(a && a.type !== "unknown", `/${t} resolves`);
      if (route === "hermes") assert.deepStrictEqual([a.type, a.command], ["hermes", `/${name} x`], `/${t} runs as Hermes's /${name}`);
      if (route === "no") { assert.strictEqual(a.type, "unsupported"); assert.ok(m.explain(a).length > 60); }
    }
  }
  const counts = { app: 0, hermes: 0, no: 0 };
  for (const name of Object.keys(TELEGRAM)) counts[m.routeOf(name)]++;
  assert.deepStrictEqual(counts, { app: 13, hermes: 43, no: 15 });
});
