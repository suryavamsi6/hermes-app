# Hermes bots: a 2.5D character study

This is a design mock, not an implementation proposal already wired to app state. Appllama MCP was unavailable; decisions below use the installed Appllama design skill's encoded rules, not claimed external research. The mock is dark-only by request; a shipping component must also resolve semantic colors and verify light and dark themes (native fidelity law 1).

## Identity and layers

Keep the recognizable two-eye, mouthless face and the existing appearance seed. A character is a shallow stack, not a rendered 3D object: (1) a soft contact shadow anchored behind the body, (2) a darker identity-colored side/back plane, (3) the face plane, (4) two ink feature planes in front. Use a shared perspective and pivot near the center. At rest, the back peeks out along the lower edge; on drag the planes separate by different amounts, so the silhouette and eyes have real relative displacement. Depth is proportional to size, capped for small avatars. No independent glow, texture, chrome or decorative backdrop. This enforces Appllama's anti-slop laws 1 and 4 (brand-derived material and shape lock), native fidelity law 6 (shadow communicates elevation), and motion law “name the purpose” (spatial feedback).

- **Atlas:** squircle, #8c7bff → #1d2b4f, as seeded. Broad continuous corners; inset eyes sit above a shallow rim.
- **Nova:** flower silhouette, seeded #ffd66b. The mock uses the existing Honey swatch #ffd66b → #9a3b2e to make the requested warm orange character; the seed itself has no second color. Eight gentle lobes share one depth profile.
- **Forge:** rounded hexagon, seeded #1f5a42 with wide eyes. The mock uses the existing Lagoon swatch #8cc8ff → #1d6670 to show the requested blue character; this is an appearance variant, not Forge's seeded color. Six soft corners keep the rim coherent.
- Other existing shapes (rounded, circle, blob, cloud, ghost) use their existing outline for both face and back, never a mismatched generic circle. Preserve each eye-style choice and contrast-aware ink. At 32–52 pt reduce rim and shadow, retain eye separation and avoid tiny ornament. Hero and row use the same geometry (anti-slop shape lock; native fidelity typography/hierarchy).

## State and expression

The existing state priority remains: approval/queued → waiting, live run → thinking or working, transient completion → success, failure → error, typing → listening, otherwise idle. In this spec and mock “happy” is the visual name for existing `success`; it is a brief real completion, not a permanent mood in production. `sleeping` is a proposed explicit inactive state only; the current `FaceMood` has no sleeping state, so never infer it from errors or mere inactivity. Keep textual state labels alongside the face.

| State | Layer pose and motion | Purpose / Appllama rule |
| --- | --- | --- |
| Idle | Centered eyes, slow breath; asynchronous blink and tiny glance. | Personality without moving reading content; motion purpose and frequency gate. |
| Working | Lower, narrower eyes; restrained rhythmic forward nod across body and features. | Explain live work, not a decorative loader; motion purpose. |
| Thinking | Eyes up and to one side; slow sideways tilt and feature drift. | Distinguish the pre-response state; state change. |
| Happy / success | Raised, smiling arc eyes; one small lift and settle, then hold. | One rare completion accent; frequency gate. |
| Listening | Wide eyes lifted toward the person; body leans slightly forward. | Feedback to composer focus; state change. |
| Error | Lower, concerned eyes, slight asymmetric lean; no frantic shake. | Calm, legible failure; full state cycles. |
| Waiting | Eyes directed toward the approval, slight held tilt; optional infrequent check. | Explain a required action; full state cycles. |
| Sleeping | Closed eyes and relaxed body, optionally very slow breath when active. | Explicit state only; motion purpose. |

All expressions have distinct static poses; no state depends on color or animation alone. Mood changes ease out in roughly 200–280 ms. Reduced Motion switches immediately to that mood's calm pose.

## Motion vocabulary

- Idle breathing changes scale by at most 1% over roughly 3.4–4.8 seconds. Blink closes in ~70 ms and reopens in ~130 ms, with irregular 2.4–6 second gaps and occasional double blinks. Seed rhythm and phase per bot so a list never moves in sync. Glances are infrequent and small.
- Drag captures the current pose, tracks the finger directly and clamps rotation to about ±14° horizontally and ±12° vertically. Front features move farther than the face, the back and contact shadow less. Pointer release carries its velocity into a damped return, and a new grab interrupts it. A gentle spring approximates the existing `gentle` token: stiffness 190, damping 22, mass 0.8; it settles quickly with little overshoot. Bounce is reserved for an energetic release, not every tap. This enforces Appllama's “if a finger was involved, it’s a spring” and shared motion vocabulary.
- Optional device tilt is opt-in, permission-aware, bounded to ±4°, low-pass filtered, and suspended during drag; never request sensor permission on launch. The mock demonstrates direct drag only. Gesture feedback should not fight scrolling: activate after intent is clear and keep row navigation separate from drag.
- In production use Reanimated shared values and gesture worklets, never per-frame React state or a JS-thread gesture bridge (Appllama gesture/thread rule). Only transform and opacity animate; pre-render paths and shadows, do not animate layout, blur or gradients. Stop ambient work offscreen, in background, and on covered screens. Target a measured sustained 60 fps on the slowest supported release device, including a list of avatars (Appllama performance rule).
- Under Reduce Motion stop breathing, blinking, drift, gestures, sensor motion and spring loops; show a stable, state-specific pose. Respect changes to the setting while open. Native screen transitions remain system-owned (Appllama Reduce Motion rule).

## Replace, don't accumulate

Delete `ShapeTile`'s duplicate overlay/stroke treatment as the simulated depth once the new back/face planes replace it; remove the current single-plane tilt/lift, tap squash/hop and separate ambient nod/drift implementation that would otherwise double-drive the new stack. Consolidate independent eye and body clocks into the layer motion model; keep deterministic personality, state priority, eye styles, labels and inactive/reduced-motion policy. Retire obsolete mouth/pupil compatibility fields only after callers are migrated. Do not add an extra glow, perpetual celebration, or a second motion system.

## Verification before shipping

The HTML is a design prototype; native implementation still needs the Appllama simulator loop: inspect hero, 32/52 pt row and chat header, all state transitions, interruptions and Reduce Motion; record and scrub full motion, check Dynamic Type and both themes, then measure release-build frame rate on the slowest supported device. The mock does not establish native performance or device-sensor behavior.
