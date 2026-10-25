import { chromium } from "playwright-core";
const S = "/workspace/hermes-mobile/dist/screens/";
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem("hermes.demo", "1"); });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const v = (l) => p.getByLabel(l).filter({ visible: true }).first();
await p.goto("http://localhost:8799/"); await p.waitForTimeout(3500);
await p.screenshot({ path: S + "20-home.png" });
// search filter
await v("Search bots").fill("pi"); await p.waitForTimeout(500);
await p.screenshot({ path: S + "21-home-search.png" });
await v("Clear search").click(); await p.waitForTimeout(300);
// long-press second row -> make primary
const rows = p.getByLabel(/^Open (?!.*primary)/).filter({ visible: true });
const name = (await rows.first().getAttribute("aria-label")).replace("Open ", "");
const box = await rows.first().boundingBox();
await p.mouse.move(box.x + 40, box.y + 20); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); await p.waitForTimeout(500);
await p.screenshot({ path: S + "22-home-longpress.png" });
await v("Make primary").click(); await p.waitForTimeout(800);
const hero = await p.getByLabel(/\(primary\)$/).filter({ visible: true }).first().getAttribute("aria-label");
console.log("long-pressed:", name, "hero now:", hero);
await p.screenshot({ path: S + "23-home-new-primary.png" });
await p.reload(); await p.waitForTimeout(3000);
console.log("after reload hero:", await p.getByLabel(/\(primary\)$/).filter({ visible: true }).first().getAttribute("aria-label"));
// open hero chat, send a message
await p.getByLabel(/\(primary\)$/).filter({ visible: true }).first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: S + "24-chat-empty-or-history.png" });
const input = p.getByPlaceholder(/^Ask /).filter({ visible: true }).first();
await input.fill("Check the homelab and give me a short status"); await p.waitForTimeout(200);
await p.screenshot({ path: S + "25-chat-typing.png" });
await v("Send").click(); await p.waitForTimeout(9000);
await p.screenshot({ path: S + "26-chat-reply.png" });
await v("Back to bots").click(); await p.waitForTimeout(1200);
await p.screenshot({ path: S + "27-home-after-chat.png" });
await v("More").click(); await p.waitForTimeout(500);
await p.screenshot({ path: S + "28-home-grid.png" });
console.log("errors:", errs);
await b.close();
