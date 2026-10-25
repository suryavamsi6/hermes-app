// usage: node bench.mjs <port> <label>  → prints one JSON line
import { chromium } from "playwright-core";
const [port, label, rm] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, reducedMotion: rm === "rm" ? "reduce" : "no-preference" });
await ctx.addInitScript(() => {
  const st = (window.__perf = { commits: 0, renders: 0 });
  const seen = new WeakMap(); st.origins = {};
  const nm = (n) => { const t = n.type; return (t && (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)))) || "?"; };
  const walk = (f) => { // a component rendered in this commit iff its props or state object changed
    for (let n = f; n; n = n.sibling) {
      if (n.tag === 0 || n.tag === 11 || n.tag === 14 || n.tag === 15 || n.tag === 1) {
        const prev = seen.get(n) || (n.alternate && seen.get(n.alternate));
        const rec = { p: n.memoizedProps, s: n.memoizedState };
        if (!prev || prev.p !== rec.p || prev.s !== rec.s) { st.renders++; if (prev && prev.p === rec.p) { let k = nm(n); if (k === "?") { let q = n.return, d = 0; while (q && nm(q) === "?" && d < 8) { q = q.return; d++; } k = "?<" + (q ? nm(q) : "root") + (n.type && n.type.$$typeof ? ":" + String(n.type.$$typeof) : ""); } st.origins[k] = (st.origins[k] || 0) + 1; } }
        seen.set(n, rec); if (n.alternate) seen.set(n.alternate, rec);
      }
      if (n.child) walk(n.child);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, isDisabled: false, renderers: new Map(), inject() { return 1; }, checkDCE() {},
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) { st.commits++; walk(root.current.child); } };
  st.frames = []; let last = 0; const tick = (t) => { if (st.rec) { if (last) st.frames.push(t - last); last = t; } else last = 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p); await cdp.send("Performance.enable");
const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
await p.goto(`http://localhost:${port}/bot/hermes`, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
async function window_(name, fn) {
  await p.evaluate(() => { Object.assign(window.__perf, { commits: 0, renders: 0, frames: [], rec: true, origins: {} }); });
  const m0 = await metric(); const t0 = Date.now(); await fn(); const secs = (Date.now() - t0) / 1000; const m1 = await metric();
  const s = await p.evaluate(() => { window.__perf.rec = false; const f = window.__perf.frames; return { commits: window.__perf.commits, renders: window.__perf.renders, n: f.length, slow: f.filter((x) => x > 34).length, origins: Object.entries(window.__perf.origins).sort((a,b)=>b[1]-a[1]).slice(0,5), p95: f.slice().sort((a, b) => a - b)[Math.floor(f.length * 0.95)] }; });
  return { name, secs: +secs.toFixed(2), commits: s.commits, renders: s.renders, scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), frames: s.n, slowFrames: s.slow, p95FrameMs: Math.round(s.p95), origins: s.origins };
}
const idle = await window_("idle5s", () => p.waitForTimeout(5000));
const box = p.getByPlaceholder(/Message /).filter({ visible: true }).first();
await box.fill("Check my homelab services");
const stream = await window_("stream", async () => {
  await p.getByLabel("Send").filter({ visible: true }).first().click();
  await p.getByLabel("Stop").first().waitFor({ timeout: 10000 });
  await p.getByLabel("Send").filter({ visible: true }).first().waitFor({ timeout: 60000 });
});
const ok = await p.getByText("This is demo mode").count(); // reply really arrived
console.log(JSON.stringify({ label, ok: ok > 0, idle, stream }));
await b.close();
