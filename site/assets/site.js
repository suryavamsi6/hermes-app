// Small progressive enhancements: face timing, the sticky phone, the status line. No dependencies.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const rnd = (a, b) => a + Math.random() * (b - a);

  // Faces: each gets its own blink, glance and breath timing so neighbours never move in step.
  const faces = [...document.querySelectorAll("svg.face[data-blink]")];
  for (const f of faces) {
    const [lo, hi] = f.dataset.blink.split(",").map(Number);
    const blink = rnd(lo, hi) * 1.6, glance = rnd(9, 17), breath = rnd(3.4, 4.8);
    const side = Math.random() < .5 ? -1 : 1;
    f.style.setProperty("--blink", `${blink | 0}ms`);
    f.style.setProperty("--blink-d", `${-rnd(0, blink) | 0}ms`);
    f.style.setProperty("--glance", `${glance.toFixed(1)}s`);
    f.style.setProperty("--glance-d", `${-rnd(0, glance).toFixed(1)}s`);
    f.style.setProperty("--gx", `${(side * rnd(2.4, 4)).toFixed(1)}px`);
    f.style.setProperty("--gy", `${rnd(-1.2, 1.2).toFixed(1)}px`);
    f.style.setProperty("--breath", `${breath.toFixed(1)}s`);
    f.style.setProperty("--breath-d", `${-rnd(0, breath).toFixed(1)}s`);
    f.classList.add("is-live");
  }
  // Pause faces that are off-screen.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-paused", !e.isIntersecting)));
    faces.forEach((f) => io.observe(f));
  }

  // Tap the hero face: a small squash and hop, like tapping a face in the app.
  const poke = document.querySelector(".poke");
  poke?.addEventListener("click", () => {
    const f = poke.querySelector(".face"); if (!f || reduce.matches) return;
    f.classList.remove("is-poked"); void f.getBoundingClientRect(); f.classList.add("is-poked");
  });

  // Top bar hairline once the page scrolls.
  const bar = document.querySelector(".bar");
  const onScroll = () => bar.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // Desktop: the phone shows the screen for whichever answer is in view.
  const shots = new Map([...document.querySelectorAll(".phone-stage .shot")].map((i) => [i.dataset.name, i]));
  const show = (name) => { if (!shots.has(name)) return; shots.forEach((img, n) => img.classList.toggle("is-on", n === name)); };
  if ("IntersectionObserver" in window) {
    const sections = [...document.querySelectorAll("main [data-shot]")];
    const so = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) show(vis[0].target.dataset.shot);
    }, { rootMargin: "-35% 0px -55% 0px" });
    sections.forEach((s) => so.observe(s));
  }

  // The live status line cycles through real phrases from src/ui/activity.ts.
  const st = document.querySelector(".status-text");
  if (st && !reduce.matches) {
    const phrases = st.dataset.phrases.split("|"); let i = 0, timer;
    const tick = () => {
      st.classList.add("is-out");
      setTimeout(() => { i = (i + 1) % phrases.length; st.textContent = phrases[i]; st.classList.remove("is-out"); }, 240);
    };
    const so = new IntersectionObserver(([e]) => { clearInterval(timer); if (e.isIntersecting) timer = setInterval(tick, 2600); });
    so.observe(st);
  }
})();
