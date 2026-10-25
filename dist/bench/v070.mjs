import { chromium } from "playwright-core";
const S = "/workspace/hermes-mobile/dist/screens/";
const KEY = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript((k) => { if (!localStorage.getItem("hermes.baseUrl")) { localStorage.setItem("hermes.baseUrl", "http://localhost:8799"); localStorage.setItem("hermes.apiKey", "main-key-0123456789"); localStorage.setItem("hermes.bridgeKey", k); } }, KEY);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const shot = async (n, full = false) => { await p.waitForTimeout(1200); await p.screenshot({ path: S + n, fullPage: full }); console.log("shot", n); };
const text = (t) => p.getByText(t, { exact: true }).filter({ visible: true }).last();
await p.goto("http://localhost:8799/"); await p.waitForTimeout(3000);
await shot("30-home-bridge.png");
await p.getByLabel(/^Open Jobwing/).filter({ visible: true }).first().click();
await shot("31-setup-chat.png");
await text("Set up chat").click(); await p.waitForTimeout(1500);
await shot("32-after-setup.png");
await p.goto("http://localhost:8799/new-bot"); await p.waitForTimeout(2000);
await p.getByPlaceholder("e.g. Chef, Scout, Ledger").fill("Chef");
await p.getByPlaceholder("What is this bot for?").fill("Plans weekly meals");
await p.getByPlaceholder(/Cheerful sous-chef/).fill("Cheerful sous-chef who keeps a shopping list.");
await shot("33-new-bot.png", true);
await text("Create Chef").click(); await p.waitForTimeout(2500);
await shot("34-chef-chat.png");
await p.goto("http://localhost:8799/"); await p.waitForTimeout(2500);
await shot("35-home-with-chef.png");
for (const [n, path] of [["36-plugins-default.png", "/plugins/default"], ["37-plugins-jobwing.png", "/plugins/jobwing"], ["38-mcp.png", "/mcp/default"],
  ["39-routines.png", "/routines"], ["40-memory.png", "/memory/default"], ["42-settings.png", "/settings"]]) {
  await p.goto("http://localhost:8799" + path); await p.waitForTimeout(2000); await shot(n, true);
}
await p.goto("http://localhost:8799/bot-info/chef"); await p.waitForTimeout(2000); await shot("41-bot-info-chef.png");
await p.mouse.move(200, 600); for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(80); }
await shot("41b-bot-info-skills.png");
await p.goto("http://localhost:8799/bot-info/jobwing"); await p.waitForTimeout(2000);
await p.mouse.move(200, 600); for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(80); }
await shot("43-bot-info-jobwing-bottom.png");
console.log("roster:", await p.evaluate(() => JSON.parse(localStorage.getItem("hermes.roster") || "[]").map((b) => [b.profile, b.apiKey ? `key(${b.apiKey.length})` : "no key"])));
console.log("errors:", errs);
await b.close();
