// Visual baseline / regression screenshots of the demo web build (EXPO_PUBLIC_DEMO=1 expo export -p web).
// node docs/polish/shots.mjs <baseUrl> <outDir> [--reduced]
// Needs playwright-core (PW=path to its index.mjs) and a Chromium (CHROME env, default `chromium` on PATH).
const { chromium } = await import(process.env.PW ?? "playwright-core"); // PW=/path/to/node_modules/playwright-core/index.mjs
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
const [B, OUT] = [process.argv[2] ?? "http://localhost:8800", process.argv[3] ?? "/tmp/shots"];
const reduced = process.argv.includes("--reduced");
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? execSync("command -v chromium").toString().trim();
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const shot = async (n, wait = 700) => { await p.waitForTimeout(wait); if (only && !only.test(n)) return; await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const vis = (loc) => loc.filter({ visible: true }).last();
const say = async (bot, text) => { const box = vis(p.getByLabel(`Ask ${bot}`)); await box.click(); await box.fill(text); await vis(p.getByLabel("Send", { exact: true })).click(); };
const go = async (path, wait = 1800) => { await p.goto(B + path); await p.waitForTimeout(wait); };

await go("/", 3000); await shot("01-home");
await vis(p.getByLabel("More")).click(); await shot("02-home-grid-sheet", 600); await p.keyboard.press("Escape"); await p.waitForTimeout(400);
await go("/bot/hermes", 2500); await shot("03-chat-open");
await say("Hermes", "What can you do?");
await shot("04-chat-thinking", 350);
await shot("05-chat-working-tool", 900);
await p.waitForTimeout(6000); await shot("06-chat-reply-done", 300);
await p.waitForTimeout(1500); await shot("06b-chat-after-done", 0);
const steps = vis(p.getByText(/^\d+ steps? ·/));
if (await steps.count()) { await steps.click(); await shot("07-steps-expanded", 500); }
const attach = vis(p.getByLabel(/^Attach/));
if (await attach.count()) { await attach.click(); await shot("08-attach-sheet", 600); await p.keyboard.press("Escape"); await p.waitForTimeout(400); }
await say("Hermes", "flaky wifi: what's on my calendar?"); await shot("09-reconnecting", 1500);
await p.waitForTimeout(9000);
await go("/bot/pi-ops", 2500); await say("Pi Ops", "delete old logs"); await shot("10-approval", 2600);
// Home while a run waits for your OK (in-app navigation keeps the live state), then back into the chat.
const back = vis(p.getByLabel("Back to bots"));
if (await back.count()) { await back.click(); await shot("10b-home-needs-ok", 1200); await vis(p.getByLabel(/^Open Pi Ops/)).click(); await p.waitForTimeout(1500); }
const allow = vis(p.getByText(/^Allow once$/));
if (await allow.count()) { await allow.click(); await shot("11-approval-allowed", 900); await p.waitForTimeout(4000); await shot("12-task-done", 200); }
await go("/", 1500); await shot("13-home-after-activity", 200);
for (const [n, path] of [["14-bot-info", "/bot-info/hermes"], ["15-routines", "/routines"], ["16-mcp", "/mcp/hermes"], ["17-plugins", "/plugins/hermes"],
  ["18-memory", "/memory/hermes"], ["19-preferences", "/preferences"], ["20-settings", "/settings"], ["21-new-bot", "/new-bot"], ["22-faces", "/faces"],
  ["23-history", "/history/hermes"], ["24-activity", "/activity/hermes"]]) { await go(path, 2200); await shot(n, 0); }
console.log("errors:", errs.length ? errs : "none");
await b.close();
