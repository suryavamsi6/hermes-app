// README screenshots of the demo web build (sample bots only: Atlas, Forge, Nova).
//   EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir /tmp/hweb
//   node scripts/static.mjs /tmp/hweb 8802 &
//   PW=/path/to/playwright-core/index.mjs node scripts/screenshots.mjs http://localhost:8802 /tmp/shots [--reduced]
// Needs playwright-core and a Chromium (CHROME env, default `chromium` on PATH). ONLY=<regex> limits the shots.
// Convert for docs/screenshots/: magick in.png -resize 50% -quality 82 out.webp
const { chromium } = await import(process.env.PW ?? "playwright-core");
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
const [B, OUT] = [process.argv[2] ?? "http://localhost:8802", process.argv[3] ?? "/tmp/shots"];
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

await go("/", 3000); await shot("home");
await go("/bot/atlas", 2500);
await say("Atlas", "What can you do?");
await shot("chat-working", 1100);
await p.waitForTimeout(7500);
const steps = vis(p.getByText(/^\d+ steps? ·/));
if (await steps.count()) { await steps.click(); await shot("chat-tool-steps", 600); }
const attach = vis(p.getByLabel(/^Attach/));
if (await attach.count()) { await attach.click(); await shot("attach-sheet", 700); await p.keyboard.press("Escape"); await p.waitForTimeout(400); }
await go("/bot/forge", 2500); await say("Forge", "delete old logs"); await shot("approval", 2600);
const back = vis(p.getByLabel("Back to bots"));
if (await back.count()) { await back.click(); await shot("home-needs-ok", 1200); }
for (const [n, path] of [["faces", "/faces"], ["routines", "/routines"], ["mcp", "/mcp/atlas"], ["bot-settings", "/bot-info/atlas"], ["settings", "/preferences"]]) {
  await go(path, 2200); await shot(n, 0);
}
console.log("errors:", errs.length ? errs : "none");
await b.close();
