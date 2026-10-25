# Hermes Mobile (v0.8.0)

**0.8.0:** replies survive dropped connections. The app sends each message as a Hermes run (`POST
/v1/runs` with an `Idempotency-Key`) and follows its events, resuming with `Last-Event-ID` after a
drop, so "Software caused connection abort" becomes a quiet "Reconnecting…". If the event buffer is
gone, it polls the run status, then the chat history. Retry after a lost connection reuses the key, so
Hermes never stores the message twice. Servers without `/v1/runs` use the old session stream. Also:
- chats open at the newest message, with a jump-to-bottom button and a new-message count;
- date dividers between days;
- long-press menu (react, time, copy, share, quote, retry, ask again), tap-to-expand tool steps;
- haptics, per-bot drafts, unread counts on Home, and resync on open and on return to the app;
- routines readable whatever shape Hermes sends, and paused routines listed (they used to vanish).

**0.7.0:** works with [hermes-bridge](https://github.com/suryavamsi6/hermes-bridge), a small management API that runs next to Hermes.
Add the bridge key in Settings → Hermes bridge. The bridge URL defaults to `<server>/bridge`. With the key set:
- Home lists every Hermes profile on the server automatically.
- Add bot creates a real profile and keeps its new chat key on the phone (never shown).
- Profiles the phone has no key for get a "Set up chat" button, which sets a new key for that profile.
- The MCP, Plugins (with each plugin's tools), Routines (run, pause, resume), Memory (provider and file sizes)
  and Skills screens work live, including toggles.

Without the key, nothing changes: add profiles by hand as before.

**0.6.0:** Grok-style Home and chat. Home shows your primary bot big at the top with a star, then the other
bots with their last message and relative time, plus a grid menu and a Search pill. Make a bot primary by
long-pressing it on Home or with the toggle in its settings; the choice is saved per mode. In chat, user messages
sit in light-grey bubbles, replies in dark cards with larger text, under a floating pill header. The composer
is `+` (bot options), an "Ask <bot>" pill, and a mic with a voice button; dictation and voice are placeholders.
The drawer is gone because Home replaces it.

An Expo / React Native Android app for [Hermes Agent](https://hermes-agent.nousresearch.com/) running
on your own server, reachable from the phone through Tailscale Funnel (no domain needed) or any HTTPS
reverse proxy. The look is dark and minimal. All code, the name and the "H" icon are original to this project.

## Features
- **Bots:** every Hermes profile is a bot in the left drawer, with an emoji avatar, colour, description,
  last message, an unread dot and a "typing…" status. This mirrors Hermes's own [Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode).
- **One continuous chat per bot**, kept in a session titled `Bot Chat`. Older sessions live under Bot info → Older sessions.
- **Chat:** replies stream in as markdown (tables, code with copy). There's a "N steps ›" tool activity line,
  thinking dots with a bouncing avatar, inline Allow/Deny approval cards, Stop, long-press tapback
  reactions, and suggestion chips when a chat is empty.
- **New bot:** avatar (emoji and colour, or shuffle), name, description, persona, model and toolsets.
- **Per-bot settings:** look, persona, model, toolsets, skills, plus links to memory, MCP, plugins, routines and history.
- **MCP servers** (URL plus an optional auth header, enable/disable, remove), **Plugins** (installed and browse,
  with each plugin's kind, tools and skills), **Routines** (all bots, with run now, pause and delete),
  and a **Memory** editor (USER.md and MEMORY.md).

## Live vs demo
| Feature | Live (real Hermes HTTP API) | Demo |
|---|---|---|
| Bot Chat: stream, steps, approvals, stop | `POST /api/sessions`, `/api/sessions/{id}/chat/stream`, `/v1/runs/{id}/approval`, `/stop` | ✅ |
| Several bots (profiles) | One listener with `gateway.multiplex_profiles: true`, at `/p/<profile>/…` with each profile's own `API_SERVER_KEY`. With the bridge, the roster is the server's profile list (`GET /v1/profiles`); without it, it's kept on the phone ("add existing profile") | ✅ |
| Per-bot model | `model` and `provider` sent with each session-chat request; list from `GET /api/model/options` | ✅ |
| Skills, toolsets | Read: `GET /v1/skills`, `GET /v1/toolsets`. With the bridge: read and toggle via `/v1/profiles/<p>/skills`, `/toolsets` | ✅ |
| Routines | With the bridge: list, pause/resume and run via `/v1/profiles/<p>/jobs`. Create and delete: `POST /api/jobs`, `DELETE /api/jobs/{id}` (delivery `bot-chat`) | ✅ |
| Older sessions | `GET /api/sessions` | ✅ |
| Avatar, name, description, reactions, unread | Stored on the phone | ✅ |
| Create a profile (with persona and model) | Bridge: `POST /v1/profiles`, which returns the profile's new key once | ✅ |
| Delete a profile, edit persona later | Server only (`hermes profile delete`, edit `SOUL.md`) | ✅ |
| Memory | Bridge: active provider, provider status and built-in file sizes. The files' text has no Hermes API | ✅ (editable) |
| MCP servers | Bridge: list, add (URL plus optional bearer token), enable/disable, remove, and "Restart Hermes to apply" | ✅ |
| Plugins | Bridge: installed plugins with their tools. Switching one on or off works for the bridge's own profile (`default`); other profiles show the `hermes -p <p> plugins …` command | ✅ |
| Attachments, push notifications | Not built. The API takes inline images but no file uploads | ✗ |

Bridge features without a bridge key show "Needs hermes-bridge". The bridge has its own key: the app never
sends the Hermes key to the bridge, and never sends the bridge key to Hermes (tested in `test/bridge.test.mjs`
against the real bridge package).

## Layout
| Path | Purpose |
|---|---|
| `app/bot/[botId].tsx` | Bot Chat screen |
| `app/bot-info/[botId].tsx` | Per-bot settings hub |
| `app/new-bot.tsx` | Create a bot (live: add an existing profile) |
| `app/mcp/[botId].tsx`, `app/plugins/[botId].tsx`, `app/memory/[botId].tsx`, `app/history/[botId].tsx` | Per-bot feature screens |
| `app/routines.tsx` | Routines for all bots |
| `app/settings.tsx` | Connection, plus "Try demo" |
| `src/backend.ts` | `Backend` interface and types, `ComingSoonError`, the list of bridge-only features |
| `src/live-backend.ts` | Live mode: Hermes HTTP API only |
| `src/demo-backend.ts`, `src/mock-hermes.ts` | Offline demo: three seeded bots (Hermes, Pi Ops, Market) |
| `src/app-state.tsx` | Roster, per-bot chats, unread, previews, reactions |
| `src/hermes.ts` | HTTP client (bearer key, optional CF Access headers, `/p/<profile>` prefix, SSE streaming) |
| `src/chat-model.ts`, `src/sse.ts` | Stream reducer and SSE parser |
| `src/ui/*` | Theme, kit (avatar, typing dots, rows, toggles, coming-soon), drawer, composer, markdown, steps, approvals, reactions |
| `test/*.mjs` | `npm test`: SSE parser, reducer, demo backend |
| `homelab/` | Hermes `.env` example |

## Demo mode (no connection)
There are two ways to turn it on:
- **Build flag:** set `EXPO_PUBLIC_DEMO=1` when you build. The app opens straight into the demo.
- **In the app:** tap **Try demo (no connection)** on the Connect screen.

Demo mode makes no network calls. Things to try:
- In **Pi Ops**, say "delete old logs" to get an approval card.
- Create a bot.
- Add an MCP server.
- Install a plugin.
- Add a routine.
- Edit memory.
- Long-press a message to react.

## Server setup
1. **Enable the Hermes API server** on your server. Append `homelab/hermes.env.example` to `~/.hermes/.env`
   with a real key (`openssl rand -hex 32`), then restart `hermes gateway`. Check it with
   `curl -H "Authorization: Bearer $KEY" http://127.0.0.1:8642/v1/capabilities`.
   For more bots, set `gateway.multiplex_profiles: true` and give each profile its own `API_SERVER_KEY`.
   If you manage the server declaratively (NixOS, Ansible, …), put the same settings in that config.
2. **Publish it with Tailscale Funnel.** Enable MagicDNS, HTTPS certificates and the `funnel` node
   attribute in the tailnet admin console, then run
   `sudo tailscale funnel --bg --https=443 http://<hermes-ip>:8642` on the server.
   Funnel is public, so the Hermes key is the lock. Test it with
   `curl -H "Authorization: Bearer $KEY" https://<your-host>.ts.net/v1/capabilities`
   (401 without the key, 200 with it).
3. In the app's Connect screen, enter `https://<your-host>.ts.net` and the Hermes key. Leave
   **Cloudflare Access (optional)** empty. It is only for a server behind Cloudflare Access, and its
   headers are sent only when both the client ID and the secret are filled in.
4. **Other profiles (e.g. work, finance).** Hermes's API has no endpoint that lists profiles, so add each
   one in the app: drawer → New bot → "Your Hermes profile", with its lowercase name and that profile's own
   `API_SERVER_KEY` (`~/.hermes/profiles/<name>/.env`). The main key is rejected under `/p/<name>/`.
   The app checks the name (404 = not served) and the key (401 = wrong key) before adding it.

## Build
```
npm install --legacy-peer-deps
npm run typecheck && npm test
EXPO_PUBLIC_DEMO=1 npx expo prebuild -p android --clean   # omit the env var for a live build
cd android && ./gradlew assembleRelease                   # JDK 17 + Android SDK
```
The output is `android/app/build/outputs/apk/release/app-release.apk`, signed with the debug key and built
for arm64 only (`reactNativeArchitectures=arm64-v8a`). Install it with `adb install`, or copy it to the phone.

Not in this repo (see `.gitignore`): `node_modules/`, the generated `android/` and `ios/` projects (recreate them
with `expo prebuild`), APKs and other `dist/` output, and signing material. Keep a copy of
`android/app/debug.keystore` from the machine that builds the APK: updates install over the existing app only
when they are signed with the same key. The Inter fonts (`assets/fonts/Inter-{Regular,Medium,SemiBold}.ttf`) and
`assets/icon.png` are required to build.

## Verified vs untested
- **Verified on the box:**
  - `tsc --noEmit` passes.
  - `npm test` passes: 5 tests covering the SSE parser, reducer, demo roster, create bot, routines, MCP, plugins, memory, and the approval deny flow.
  - Expo's project checker passes.
  - The web export drives every demo screen in headless Chrome with no page errors (screenshots in `dist/screens/`).
  - The demo APK builds.
- **Untested:**
  - Nothing has been run against a real Hermes.
  - Several response shapes aren't documented, so they're parsed defensively: sessions, messages, `/api/jobs`, `/v1/skills`,
    `/v1/toolsets`, `/api/model/options`, the SSE event fields and the approval event name.
  - API-server sessions are separate from Desktop/CLI-owned Bot Chats. Hermes refuses foreign
    sessions with 409, so the phone's Bot Chat is its own `api_server` session titled `Bot Chat`.
  - The APK hasn't been run on a device.

## Bot faces (v0.3)

Every bot avatar is an animated face (`src/ui/bot-face.tsx`, RN `Animated` with the native driver, no extra deps).
Personality (eye shape and spacing, blink rate, mouth width) comes from the bot id (`src/ui/face-personality.ts`).
Moods come from `moodOf(botId)` in `app-state.tsx`:

- idle: random blinks, glances around, breathing
- thinking: eyes up and darting, "o" mouth, bob and wobble
- happy (~1.2 s after a reply or a reaction): ^ ^ eyes, open smile, double hop
- approval: head tilt, one raised brow, side-eye
- error/offline: flat sleepy eyes, "z", dimmed

Reduce Motion falls back to a static face. Drawer faces pause while the drawer is closed.

## Appearance (v0.4)

Bot info → Appearance, and New bot, let you pick:

- **Shape** (8): Rounded, Circle, Squircle, Blob, Hexagon, Flower, Cloud, Ghost. These are SVG paths from `src/appearance.ts`, and the face sits on top of them with every mood intact.
- **Colour**: 12 solids (Midnight, Grape, Forest, Teal, Ember, Plum, Ochre, Slate, Sky, Mint, Coral, Butter) and 6 gradients (Sunset, Aurora, Dusk, Honey, Lagoon, Berry). Eyes and mouth switch between light and dark ink by contrast.
- **Face**: Auto (derived from the bot id), Round, Tall, Wide, Dots.
- **Badge** emoji.

Each pick makes the preview hop and saves right away. In demo mode it lives in the demo store. In live mode it's kept on the phone under `hermes.look.<profile>` in SecureStore (localStorage on web). It's purely cosmetic, so Hermes is never involved and it works fully live.
The unlinked route `hermes://faces` shows every shape × colour × mood.

## Performance and 120 Hz (v0.5)

- Fast-changing chat state (turns, unread, previews, reactions, moods) lives in a small selector store (`src/store.ts`) instead of React context. A streaming token re-renders the streaming row and the header mood, not the whole app.
- Stream events are batched to at most one state update per frame.
- Chat rows, header, drawer, drawer rows, composer, avatars, faces and Markdown blocks are memoised. While a reply streams, only the tail Markdown block re-renders.
- Faces: each mood is one native-driver clock (`Animated.loop(timing)` runs as a native loop), and the animated node graph is rebuilt only when the mood changes.
- Release build: Hermes, New Architecture, R8 and resource shrinking. Enforced by `plugins/with-high-refresh-rate.js`, so `expo prebuild` keeps them.
- 120 Hz: the same plugin makes `MainActivity` request the display mode with the highest refresh rate at the current resolution (`preferredDisplayModeId` / `preferredRefreshRate`). On Samsung, set **Settings → Display → Motion smoothness → Adaptive**.
- Bench: `dist/bench/bench.mjs` (web build, 4× CPU throttle); raw runs are in `dist/bench/web-bench-runs.jsonl`.
