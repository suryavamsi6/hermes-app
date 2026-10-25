// v0.8.0 live-rig shots: Routines via the real bridge (realistic cron records), or the gated notice.
import { chromium } from "playwright-core";
const S = "/workspace/hermes-mobile/dist/screens/"; const [KEY, MODE] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await ctx.addInitScript((k) => { localStorage.setItem("hermes.baseUrl", "http://localhost:8799"); localStorage.setItem("hermes.apiKey", "main-key-0123456789"); localStorage.setItem("hermes.bridgeKey", k); }, KEY);
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
if (MODE === "gated") {
  await p.goto("http://localhost:8799/"); await p.waitForTimeout(3500);
  await p.screenshot({ path: S + "62-notice-collapsed.png" });
  await p.getByText(/hermes-bridge/).filter({ visible: true }).first().click(); await p.waitForTimeout(700);
  await p.screenshot({ path: S + "63-notice-expanded.png" });
} else {
  await p.goto("http://localhost:8799/routines"); await p.waitForTimeout(3500);
  await p.screenshot({ path: S + "64-routines-readable.png" });
  const body = await p.evaluate(() => document.body.innerText);
  console.log("object leak:", /\[object/.test(body), "| paused shown:", /Disk check/.test(body));
}
console.log("errors:", errs); await b.close();
