# TODO (after the Oct 25, 2026 session)

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
