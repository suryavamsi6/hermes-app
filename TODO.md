# TODO (after the Oct 25, 2026 session)

## v0.11.0 (versionCode 22): polish, personality and motion
Shipped (evolution of the existing look: same palette, layouts, navigation, faces and backend):
- **Motion system** (`src/ui/motion-tokens.ts`): press 90 ms, quick 140, base 200, sheet 240/180,
  expression 280, one success hop; springs `press`/`gentle`/`pop`; `motionPolicy()` = Reduce Motion
  turns off every loop and flourish, a hidden surface (backgrounded / covered screen) stops ambient loops.
  `src/ui/live-surface.ts` gives one shared AppState, screen-focus and live Reduce Motion signal.
- **Faces** (`bot-face.tsx`, `face-state.ts`): Reanimated shared values, no JS timers. Moods from real
  state only: idle (blink / glance / breath at each bot's own uneven rhythm + random phase), listening
  (composer focused or dictating), thinking, working (tool running or reply streaming), waiting
  (approval pending or queued), success (reply finished / saved), error (concerned, not "napping").
  Tap reaction on the hero, bot settings, new bot, empty chat and the face gallery.
  Every mood also has words (header, Home rows, screen-reader label).
- **Micro-interactions**: send button disabled → ready → stop/steer; sheets slide out on close;
  toast confirmations (copy, routine actions, MCP connect/install); async Button (spinner → "Saved" +
  check + haptic, toast on failure); optimistic switches that flip back with a toast on failure;
  code-block copy confirmation; chevron + fade for tool steps.
- **Agent activity**: tool-step pill with running / done / failed status and readable step list with
  full output on tap; clearer approval card (paused-run explanation, spinner on the answer sent,
  card only clears after Hermes accepts); Home rows and hero say "Needs your OK" / what the bot is
  doing / "Needs attention".
- **Fixes**: user/assistant bubbles no longer wrap at a narrow width (max width on the swipe wrapper);
  streaming replies no longer flash an unfinished `**`/`` ` `` opener.
- **Screens**: Home skeleton, routine actions as 40 pt buttons with delete confirmation, MCP rows say
  On/Off and "token set" in words.
- Screenshots: `docs/polish/before/` (v0.10.5), `docs/polish/after/`, `docs/polish/after-reduced-motion/`,
  made with `docs/polish/shots.mjs` against the demo web export.

Not verified / left:
- Web preview screenshots only for most screens; motion timing, haptics and the sheet exit were not
  felt on the S25. Check: faces on Home (no sync, calm), a long streaming reply (no jank), approval
  flow, attach sheet, Reduce Motion ("Remove animations") on Android.
- Faces in long lists keep idling while scrolled into view; they stop only when the screen is covered
  or the app is in the background (FlatList unmounts far-offscreen rows).
- No offline banner (no NetInfo dependency added); a lost connection still shows as the calm
  "Reconnecting…" / "Couldn't reach Hermes" notes.

## v0.10.0 (versionCode 16): features checked against hermes-agent (Oct 14 build) and the bridge
Shipped:
- **Home "Today" card**: runs waiting for your OK, unread replies, bots working, routines whose last run failed.
- **Approval cards**: full command/target, Deny / Edit / Allow once, plus "Allow for this chat" and
  "Always allow" (Hermes choices `session`/`always`; refused in shared rooms). Edit = deny + puts the
  command in the composer so you can say what to do instead (Hermes can't run an edited command).
- **Activity** (bot settings → Activity): tool-call timeline from the Bot Chat's messages, the current
  plan (Hermes's `todo` tool list), and on/off switches per MCP server and toolset.
- **Routines**: tap a routine to edit name/schedule/prompt (`PATCH /api/jobs/{id}`); pause/resume/run/delete as before.
- **Notifications**: global replies/approvals/errors, quiet hours (approvals still come through),
  hide message text, and per-bot mute and switches (bot settings → Notifications).
- **Topics & sessions**: create a topic, rename, archive (`POST/PATCH /api/sessions`).
- **Voice call**: hands-free listen → send → read reply aloud → listen (chat "…" menu or bot settings).
- **Usage** (bot settings): 30-day tokens, API calls, cost, sessions via bridge `GET /v1/profiles/<p>/usage`
  (**needs the bridge redeployed**, like the persona endpoint).
- **Settings hub** (Home ⚙): connection, chat (times, status lines, read-aloud speed), notifications,
  per-bot list, security (fingerprint app lock), primary bot, appearance note, reset, about.

Not supported by Hermes, or left for later:
- **Files tab**: Hermes only exposes workspace files through the dashboard's `/api/files`, which the
  bridge deliberately never forwards (it's a full filesystem API). `/v1/artifacts/download/{id}` needs
  an artifact id that runs don't report. Skipped.
- **Permission levels** (do freely / ask / never): lives in Hermes config (`approvals.mode`,
  `command_allowlist`); the bridge doesn't allow config writes. "Always allow" on an approval is the
  supported way to pre-approve. Skipped.
- **Goals**: no goals API. The Activity screen's "Current plan" (todo list) is the closest thing.
- **Voice messages as audio**: `/v1/runs` takes text and images only, so the voice call sends text.
- **Chatting inside topics**: create/rename/archive work; the chat screen still talks only to the Bot Chat.
- **Android home-screen widget**, **share into Hermes**: need native modules (react-native-android-widget,
  expo-share-intent) plus a custom entry; next native round.
- **Offline send queue**, theme/accent/text size, 120 Hz toggle (always on): later.

## v0.9.3 (versionCode 15): motion
- react-native-reanimated 4.7.1 + react-native-worklets 0.13.0 (via `npx expo install`). Shared
  primitives in `src/ui/motion.tsx` (Rise, PressScale, Skeleton/SkeletonRows, usePulse, enter/leave
  presets); UI thread, transform/opacity only, Reduce Motion respected.
- New messages rise in (history never animates; each message once), approval card pops in, live
  status line crossfades between steps, send button presses and its icon pops when it becomes Stop,
  jump-to-bottom button scales in/out, sheets spring up, Home staggers in once per launch, hero
  press-scale, skeleton loaders (bot settings, routines, history, memory, plugin/MCP catalogs),
  screens slide in from the right.
- Not done: per-token text fade while streaming (Markdown re-layout would jank); test on the S25.

## v0.9.2 (versionCode 14), Oct 25 evening
- Grok-style times: "Today 4:28 PM" dividers on a new day or after a 15-minute gap, and a small
  time at the end of each burst of messages (`src/ui/chat-rows.ts`).
- Live status line instead of typing dots: "Running git status", "Searching the web for …",
  "Reading main.py", Hermes's thinking summary (`reasoning.available`), else "Thinking"
  (`src/ui/activity.ts`, `activity-row.tsx`).
- Calmer faces: two well-spaced solid oval eyes, no pupils or mouth, gentler thinking motion.
- Model picker: searchable, grouped by provider, only providers Hermes has credentials for
  (`/api/model/options?include_unconfigured=false`), "Profile default" first (chat "…" menu and bot settings).
- Persona: bot settings loads and saves SOUL.md through hermes-bridge `GET/PUT /v1/profiles/<p>/soul`.
  **Needs the bridge redeployed** (the vendored copy in nixos-config is already updated); until then
  the field shows "Update hermes-bridge…".
- Chat persistence checked against hermes-agent source: `/v1/runs` with `session_id` loads that
  session's history and writes the turn into the same SessionDB session (rotation-safe via
  `resolve_resume_session_id`), so replies show in Hermes's own session list and reload on reopen.

## Needs a device (S25)
- The emulator smoke test (x86_64 build of the same v0.9.1 JS, Android 15) passed: install/launch,
  setup screen, demo mode, deep links, chat, the "…" menu, search (counter/prev-next/highlight),
  long-press menu with Read aloud + Edit & resend, editing banner + prefilled draft, swipe-to-quote,
  and the Plugins Marketplace + MCP Catalog tabs. Still wanted on the S25: the arm64 `dist/` APKs,
  the notification shade (approval buttons, tap-to-open), and the marketplace tabs against the real
  Hermes once the bridge is deployed.
- `dist/` has both `hermes-v0.9.0-vc12.apk` and `hermes-v0.9.1-vc13.apk`; both are signed with the
  key in `keys/` and install over the live v0.8.0. Install v0.9.0 first if you want to test it in
  isolation (no downgrades after v0.9.1 without losing app data), or go straight to v0.9.1.

## Done in code this session — in the v0.9.1 APK
- Notification taps: `onNotificationTap` wired in `app/_layout.tsx` (answers approvals in the
  background, plain taps open `/bot/<id>`, including the notification that cold-launched the app);
  approval `categoryIdentifier` re-enabled in `src/notify.ts`; a chat's notifications are cleared
  when you open it.
- Message menu: "Read aloud" (expo-speech, toggles) and "Edit & resend" (`editableLast`, composer
  editing banner; sends as a new message).
- "…" header menu: Search in chat (match counter, prev/next, `Markdown`/`MarkedText` highlight),
  Model picker (`listModels` + `updateBot`, like bot-info), Export as Markdown (`chatToMarkdown`
  via the share sheet), Bot settings.
- Swipe a bubble left to quote it (PanResponder, no new native deps).
- Unit tests for `src/chat-tools.ts` (test/chat-tools.test.mjs, in `npm test`).

## Still open
- Share-to-Hermes from other apps (`expo-share-intent` 9.x supports Expo 58; left out on purpose —
  it needs a native module and therefore a prebuild).
- Skipped on purpose: home-screen widget / quick tile (heavy native work), new chat/clear (breaks
  Bot Chat sync).

## Marketplace
- The app's Plugins/MCP screens with their Marketplace/Catalog tabs are UI-verified on an
  emulator (demo mode). Bridge endpoints `GET/POST /v1/profiles/<p>/plugin-catalog[/install]` are
  verified (bridge's 20 unittest tests pass) and vendored unchanged in
  `~/Dotfiles/nixos-config/modules/hosts/hermes-bridge/hermes_bridge/` — identical to
  `~/Projects/hermes-bridge/src`.
- The module **and** the homelab host wiring (`nixos-homelab.nix`) are now staged in the Dotfiles
  repo, and `nixos-rebuild build --flake .#homelab` succeeds with the bridge enabled — the deploy
  is verified to build. What's left (needs the sudo password):
  `cd ~/Dotfiles/nixos-config && nixos-rebuild switch --flake .#homelab --target-host
  surya@homelab.home.arpa --sudo` (SSH needs the 1Password agent:
  `SSH_AUTH_SOCK=~/.1password/agent.sock`), then the checks in docs/hermes-bridge.md and testing
  the app's Plugins / MCP Marketplace tabs against the real Hermes.


## Notifications when the app is killed (v0.10.1 note)

Today notifications are local: the app's own JS posts them while it is open or backgrounded. Once
Hermes is swiped away (or Samsung's battery saver freezes it), nothing can post. Fix in v0.10.1: the
Android 13 permission is now requested at launch (it used to be asked only from the background, where
Android can't show the dialog, so it was never granted), plus Settings → Send test notification.

Real push for a killed app needs a server-side sender. Plan, Hermes-compatible:
1. Surya: create a Firebase project, add the Android app `home.surya.hermesmobile`, put
   `google-services.json` in the app (android.googleServicesFile) and upload the FCM V1 service-account
   key to Expo (`eas credentials`). Without this, Android can't get an Expo push token.
2. App: `getExpoPushTokenAsync` after permission, POST it to the bridge (`/v1/push/register`).
3. Bridge: store tokens (0600 file), watch each profile's Bot Chat session (poll `/api/sessions/{id}/messages`
   every ~30 s, or a Hermes hook if one is added) and cron `last_run_at`, and send to
   `https://exp.host/--/api/v2/push/send` for new assistant replies, pending approvals and failed routines.
