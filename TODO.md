# TODO (paused at 0.9.0-dev)

Work stopped early to save usage. Remaining items, roughly in priority order.

## Enhancements: started, not finished
- **Approve from a notification.** `src/notify.ts` posts "needs your OK" notifications while the app is backgrounded. The Allow once / Deny buttons are disabled: `categoryIdentifier` was removed until `onNotificationTap()` is wired into `app/_layout.tsx` (call `approve(bot, turnId, choice)`, open `/bot/<id>` on tap).
- **"Reply ready" notification.** Posted by `notifyDone`; tapping it only opens the app, with no routing to the chat yet. Untested on a device.
- **Message menu.** Add "Read aloud" (`expo-speech` is installed) and "Edit & resend" (`editableLast()` in `src/chat-tools.ts`; the composer already has `editing` / `onCancelEdit` props). Hermes's HTTP API has no rewind or edit route, so an edit goes as a new message.

## Enhancements: not started
- Search within a chat (`findMatches()` exists in `src/chat-tools.ts`; Markdown needs a `highlight` prop).
- A per-chat model picker in the chat header (bot-info already has one; use `listModels` + `updateBot`).
- Export chat as Markdown from a header menu (`chatToMarkdown()` exists).
- Swipe to reply (quote).
- Share-to-Hermes from other apps (`expo-share-intent` 9.x supports Expo 58; it was removed before the build to keep it safe).
- Unit tests for `src/chat-tools.ts`.
- Skipped on purpose: home-screen widget / quick tile (heavy native work), new chat/clear (breaks Bot Chat sync).

## Marketplace
- The app's Plugins / MCP screens have Marketplace and Catalog tabs (`app/plugins/[botId].tsx`, `app/mcp/[botId].tsx`). They haven't been tested against a real dashboard.
- Bridge endpoints `GET/POST /v1/profiles/<p>/plugin-catalog[/install]` are in hermes-bridge (commit bff36ed). The server running Hermes needs the new bridge deployed before the tabs work live.

## Release
- Build the v0.9.0 APK (version and versionCode 12 are already set in app.json). New native modules: expo-image-picker, expo-image-manipulator, expo-notifications, expo-speech, expo-speech-recognition. Run `npx expo prebuild -p android --clean`, restore the signing keystore, then `./gradlew assembleRelease`.
