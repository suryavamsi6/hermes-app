// v0.8.0 demo screenshots (EXPO_PUBLIC_DEMO=1 web build on :8800).
import { chromium } from "playwright-core";
const S = "/workspace/hermes-mobile/dist/screens/";
const B = "http://localhost:8800";
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const shot = async (n, wait = 900) => { await p.waitForTimeout(wait); await p.screenshot({ path: S + n }); console.log("shot", n); };
const vis = (loc) => loc.filter({ visible: true }).last();
const say = async (bot, text) => { const box = vis(p.getByLabel(`Ask ${bot}`)); await box.click(); await box.fill(text); await vis(p.getByLabel("Send", { exact: true })).click(); };
const longPress = async (loc) => { const bb = await loc.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up(); };
const wheel = async (dy, n = 8) => { await p.mouse.move(206, 450); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(60); } };

await p.goto(B + "/"); await p.waitForTimeout(3000);
await shot("50-home.png");
await p.goto(B + "/bot/hermes"); await p.waitForTimeout(2500);
await shot("51-chat-opens-at-bottom-with-dividers.png");
await say("Hermes", "flaky wifi test: what's on my calendar?");
await shot("52-reconnecting.png", 1400);
await p.waitForTimeout(9000);
await shot("53-recovered-reply.png");
await longPress(vis(p.getByText("flaky wifi test: what's on my calendar?", { exact: true })));
await shot("54-long-press-menu.png", 600);
await p.keyboard.press("Escape"); await p.waitForTimeout(500);
for (const q of ["What can you do?", "Plan my day"]) { await say("Hermes", q); await p.waitForTimeout(8000); }
await say("Hermes", "Remember that I prefer 24-hour times");
await p.waitForTimeout(400);
await wheel(-500, 10); // scroll up while the reply streams
await p.waitForTimeout(9000);
await shot("55-jump-button-with-new-count.png");
await vis(p.getByLabel(/^Jump to the latest message/)).click();
await shot("56-back-at-bottom.png", 1200);
const steps = vis(p.getByText(/^\d+ steps?$/));
if (await steps.count()) { await steps.click(); await p.waitForTimeout(400); const first = vis(p.getByText("web_search", { exact: true })); if (await first.count()) await first.click(); }
await shot("57-steps-expanded.png");
await say("Hermes", "flaky again, then I'll stop it");
await p.waitForTimeout(1200);
await vis(p.getByLabel("Stop", { exact: true })).click();
await shot("58-stopped-with-retry.png");
await vis(p.getByLabel("Retry", { exact: true })).click();
await shot("59-retry-in-place.png", 1500);
await p.waitForTimeout(9000);
const box = vis(p.getByLabel("Ask Hermes")); await box.click(); await box.fill("half-written thought about the trip");
await p.goto(B + "/"); await p.waitForTimeout(1500);
await p.goto(B + "/bot/pi-ops"); await p.waitForTimeout(2000);
await say("Pi Ops", "How's the homelab?");
await p.waitForTimeout(300);
await vis(p.getByLabel("Back to bots")).click();
await p.waitForTimeout(9000);
await shot("60-home-unread-count.png");
await vis(p.getByLabel(/^Open Hermes/)).first().click();
await shot("61-draft-kept.png", 2000);
console.log("errors:", errs);
await b.close();
