#!/usr/bin/env python3
"""Builds site/index.html from site/index.template.html, inlining the bot-face SVGs.

Face geometry mirrors src/ui/bot-face.tsx, src/ui/face-personality.ts, src/ui/face-state.ts (POSE)
and src/appearance.ts (shape paths, faceInk). Shape paths come from scripts/site-face-paths.json,
generated from appearance.ts. Run: python3 scripts/build-site.py

It also copies the demo-mode screenshots from docs/screenshots/ into site/assets/shots/ and subsets
assets/fonts/Inter-*.ttf into site/assets/fonts/*.woff2 (needs `pip install fonttools brotli`), so the
repo holds each binary once; those generated files are gitignored (site/.gitignore).
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATHS = json.loads((ROOT / "scripts/site-face-paths.json").read_text())
INK, LIGHT = "#121214", "#f7f7f7"

def lum(h):
    h = h.lstrip("#"); cs = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    cs = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in cs]
    return 0.2126 * cs[0] + 0.7152 * cs[1] + 0.0722 * cs[2]

def contrast(a, b): return (max(a, b) + 0.05) / (min(a, b) + 0.05)

def face_ink(c, c2=None):
    l = (lum(c) + lum(c2)) / 2 if c2 else lum(c)
    return LIGHT if contrast(l, lum(LIGHT)) >= contrast(l, lum(INK)) else INK

# face-personality.ts, precomputed for the seeds used here (see the tsx run in the build notes)
PERSONALITY = {
    "atlas": dict(eyeW=.12, eyeH=.19, gap=.22, eyeY=.34, blink=(2800, 5500)),
    "forge": dict(eyeW=.15, eyeH=.14, gap=.22, eyeY=.34, blink=(3200, 6000)),  # eyes: "wide"
    "nova":  dict(eyeW=.12, eyeH=.16, gap=.25, eyeY=.38, blink=(2400, 5000)),
}
# face-state.ts POSE
POSE = {
    "idle":      dict(lookX=0,    lookY=0,    eyeX=1,    eyeY=1,    tilt=0,  lift=0,     joy=0, worry=0),
    "listening": dict(lookX=0,    lookY=-.5,  eyeX=1.06, eyeY=1.1,  tilt=0,  lift=-.02,  joy=0, worry=0),
    "thinking":  dict(lookX=.7,   lookY=-.8,  eyeX=1,    eyeY=.92,  tilt=3,  lift=0,     joy=0, worry=0),
    "working":   dict(lookX=0,    lookY=.45,  eyeX=1.04, eyeY=.72,  tilt=0,  lift=0,     joy=0, worry=0),
    "waiting":   dict(lookX=.25,  lookY=0,    eyeX=1,    eyeY=1,    tilt=6,  lift=0,     joy=0, worry=0),
    "success":   dict(lookX=0,    lookY=0,    eyeX=1,    eyeY=1,    tilt=0,  lift=0,     joy=1, worry=0),
    "error":     dict(lookX=0,    lookY=.55,  eyeX=.96,  eyeY=.7,   tilt=-3, lift=.02,   joy=0, worry=1),
}
f = lambda n: f"{n:.2f}".rstrip("0").rstrip(".")
_gid = [0]

def face(seed, shape, color, color2=None, mood="idle", cls="", label=None, motion=True):
    p, pose = PERSONALITY[seed], POSE[mood]
    ink = face_ink(color, color2)
    ew, eh = p["eyeW"] * 100, p["eyeH"] * 100
    top, gap = p["eyeY"] * 100, p["gap"] * 100
    eye_x = lambda side: 50 + side * (gap / 2 + ew / 2) - ew / 2
    fill = color
    defs = ""
    if color2:
        _gid[0] += 1; gid = f"fg{_gid[0]}"; fill = f"url(#{gid})"
        defs = f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{color}"/><stop offset="1" stop-color="{color2}"/></linearGradient></defs>'
    lx, ly = pose["lookX"] * 5, pose["lookY"] * 3.5
    eyes = []
    for side in (-1, 1):
        x = eye_x(side); cx, cy = x + ew / 2, top + eh / 2
        rot = -side * pose["worry"] * 13
        tf = f'translate({f(cx)} {f(cy)}) rotate({f(rot)}) scale({f(pose["eyeX"])} {f(pose["eyeY"])}) translate({f(-cx)} {f(-cy)})'
        eyes.append(f'<g transform="{tf}"><rect class="f-blink" x="{f(x)}" y="{f(top)}" width="{f(ew)}" height="{f(eh)}" rx="{f(ew/2)}" fill="{ink}"/></g>')
    joy = ""
    if pose["joy"]:
        ring = 4.5; r = ew / 2
        arcs = []
        for side in (-1, 1):
            x = eye_x(side); yc = top + eh * .25 + r
            arcs.append(f'<path d="M{f(x + ring/2)} {f(yc)}A{f(r - ring/2)} {f(r - ring/2)} 0 0 1 {f(x + ew - ring/2)} {f(yc)}" fill="none" stroke="{ink}" stroke-width="{ring}" stroke-linecap="round"/>')
        joy = "".join(arcs)
        eyes_markup = ""
    else:
        eyes_markup = f'<g class="f-glance" transform="translate({f(lx)} {f(ly)})"><g class="f-glance-a">{"".join(eyes)}</g></g>'
    tile_tf = f'rotate({f(pose["tilt"])} 50 50) translate(0 {f(pose["lift"] * 100)})'
    a11y = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
    lo, hi = p["blink"]
    data = f' data-blink="{lo},{hi}" data-mood="{mood}"' if motion else ""
    op = f' opacity="{f(1 - pose["worry"] * .1)}"' if pose["worry"] else ""
    return (f'<svg class="face {cls}" viewBox="-8 -8 116 116" {a11y}{data}>{defs}'
            f'<g transform="{tile_tf}"{op}><g class="f-breath"><path d="{PATHS[shape]}" fill="{fill}"/>{eyes_markup}{joy}</g></g></svg>')

SHOTS = ["home", "faces", "chat-tool-steps", "approval", "routines", "settings", "home-needs-ok"]
UNICODES = "U+0000-00FF,U+2013-2014,U+2018-201D,U+2026,U+2190-2193,U+2022,U+00B7,U+2212"

def assets():
    import shutil, subprocess
    shots = ROOT / "site/assets/shots"; shots.mkdir(parents=True, exist_ok=True)
    for n in SHOTS:
        shutil.copyfile(ROOT / f"docs/screenshots/{n}.webp", shots / f"{n}.webp")
    fonts = ROOT / "site/assets/fonts"; fonts.mkdir(parents=True, exist_ok=True)
    for w in ("Regular", "Medium", "SemiBold"):
        out = fonts / f"inter-{w.lower()}.woff2"
        subprocess.run(["pyftsubset", str(ROOT / f"assets/fonts/Inter-{w}.ttf"), f"--unicodes={UNICODES}",
                        "--layout-features=kern,liga,calt,tnum,ss01,cv11", "--flavor=woff2", f"--output-file={out}"], check=True)
    print("copied", len(SHOTS), "screenshots and subset 3 fonts")

def render():
    tpl = (ROOT / "site/index.template.html").read_text()
    def sub(m):
        args = json.loads(m.group(1))
        return face(**args)
    out = re.sub(r"<!--face (\{.*?\})-->", sub, tpl)
    (ROOT / "site/index.html").write_text(out)
    print("wrote site/index.html", len(out), "bytes")

if __name__ == "__main__":
    assets()
    render()
