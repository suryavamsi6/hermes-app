# Hermes App: plan for agents

## What this is
- `hermes-app/`: Expo (React Native) Android app for talking to a self-hosted Hermes agent. Each Hermes profile is its own bot. Grok-style dark UI, animated bot faces, 120 Hz.
- `hermes-bridge/`: standalone Python service (pip, uvx or Docker) that exposes an allowlisted, bearer-key-protected slice of Hermes's dashboard API to the app (profiles, MCP, plugins and marketplace, routines, skills, memory). It never exposes the terminal, files or secrets.
- The homelab packaging lives separately in `~/Dotfiles/nixos-config` (`modules/hosts/hermes-bridge/`).

## Rules for agents
- Never commit keystores, `.env*`, API keys or tokens. The signing key is in `hermes-app/keys/` (gitignored). Updates install over the existing app only if they're signed with it.
- Keep the app ID `home.surya.hermesmobile`.
- Don't copy OpenBot code (PolyForm Noncommercial). Write everything from scratch.
- The Hermes dashboard (port 9119) must never be made public. Only the chat API and `/bridge` go on Tailscale Funnel.
- Base API calls on hermes-agent source. Don't invent endpoints.
- Run `npm test` and `npx tsc --noEmit` before every push.

## Status (Oct 25, 2026, after the work session)
- **Two signed APKs in `dist/`** (both signed with the key in `keys/`, cert SHA-256 fac61745…3b9c,
  so either installs over the live v0.8.0):
  - `dist/hermes-v0.9.0-vc12.apk` — the plan's v0.9.0 build, without the new chat features.
  - `dist/hermes-v0.9.1-vc13.apk` — everything in v0.9.0 **plus** the TODO chat features below.
  Neither is smoke-tested (no phone attached during the session). Install v0.9.0 first if you want
  to smoke-test it — Android won't downgrade to it after v0.9.1 without losing app data; or just
  install v0.9.1 directly.
- The TODO chat features (notification taps wired + approval buttons back on, read aloud,
  edit & resend, search, model picker, export as Markdown, swipe-to-quote, chat-tools tests) are
  done in code; `npm test` 57/57 and `tsc --noEmit` clean.
- **Emulator smoke test passed (x86_64 build of the same v0.9.1 JS)**: install, launch, no
  crashes; live setup screen renders; demo mode, deep links (`hermes://bot/pi-ops`), the "…" menu,
  search end-to-end ("3/3" counter, prev/next, auto-scroll, yellow highlights), long-press menu
  with Read aloud / Edit & resend, the editing banner + prefilled draft + cancel, swipe-left-to-
  quote, and the Plugins Marketplace and MCP Catalog tabs all verified on Android 15 (API 35).
- Still untested: the arm64 APK on the actual S25, notifications (the emulator has no
  notification shade behavior worth testing), and the marketplace tabs against the **real** Hermes
  (needs the bridge deploy below).
- The bridge marketplace deploy is **build-verified**: the hermes-bridge module + homelab host
  wiring are staged in `~/Dotfiles/nixos-config`, and `nixos-rebuild build --flake .#homelab`
  succeeds with `services.hermesBridge.enable = true`. Not switched yet (remote sudo needs a
  password). SSH to the homelab works via the 1Password agent:
  `SSH_AUTH_SOCK=~/.1password/agent.sock ssh surya@homelab.home.arpa`.
- The app is linked to Expo/EAS (project baa598c3-3119-4985-8bb1-927c10370602, projectId +
  owner in app.json), and the 25 official Expo/EAS agent skills are installed in
  `.agents/skills/`.

## Next steps, in order
1. Install and smoke-test on the S25 (see above for which APK first; `adb install -r`).
2. Deploy the bridge: `cd ~/Dotfiles/nixos-config && nixos-rebuild switch --flake .#homelab
   --target-host surya@homelab.home.arpa --sudo` (needs the sudo password; the closure is already
   built locally), then check per docs/hermes-bridge.md and test the plugin/MCP marketplace tabs
   against the real Hermes.
3. Add share-to-Hermes (`expo-share-intent`) — needs a prebuild; keep it out of patch releases.
4. Make hermes-bridge public (the MIT LICENSE.md is already in the repo; it just needs publishing).
5. Delete the old private repo `suryavamsi6/hermes-mobile`.
6. Later: a home-screen widget or quick tile, and a publishable app ID and branding if the app goes public.
