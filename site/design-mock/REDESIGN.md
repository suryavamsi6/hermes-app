# Hermes mobile redesign

Design mock only. The existing chat-first model stays: a conversation contains messages, tool steps, live activity and approval requests. The HTML is a static dark-mode proposal, not an implementation or a tested native screen. Appllama MCP was unavailable as specified, so these decisions apply the installed skill's encoded standards rather than claiming research on live reference screens.

## Shared language

- Use a 4 pt grid: 16 pt screen gutters, 8 pt related gaps, 24 pt between groups. Minimum interactive area 44 × 44 pt. Respect safe areas and allow text to grow and wrap at accessibility sizes. **Appllama: spacing rhythm; safe areas; Dynamic Type.**
- Dark canvas `#09090b`, raised surface `#151518`, control `#222225`, primary text `#f2f2f1`, secondary `#b0b0b0`, separator `#303033`. One neutral grey family. Use warm `#D97757` for the enabled primary action and genuinely active progress, with a dark foreground; use red only for failure. In production map roles to accessible semantic colors in both themes, including a separately tested light palette. **Appllama: semantic colors; one accent, locked; one grey family.**
- Inter or the system sans in a platform type ramp: 28/34 large title, 17/23 headline, 16/24 conversation body, 13/18 supporting label. Counts use tabular figures. Actions are capsules, cards and message surfaces 16 pt, inner fields 8 pt. Native continuous corners in implementation. **Appllama: typography is hierarchy; shape lock; continuous corners.**
- Use native navigation and platform symbols in production; HTML line icons are schematic. Native push/pop for drill-down, system keyboard and menus. Press feedback is a subtle highlight or 0.97 scale within 100–150 ms; no scroll or decorative animation. Reduce Motion removes spatial motion. **Appllama: native controls; navigation titles; motion frequency gate.**

## Home

Today: a large centered primary-bot hero with a star, Today card, other bot rows, top avatar/add controls, and bottom grid plus search. Replace the oversized hero with a compact, left-aligned primary conversation row under “Continue”, followed by a scannable “Your assistants” list. Keep avatar identity, recent preview, status, search, settings, add, and the existing secondary destinations through a native menu. Make opening the primary conversation the visual primary action; a row is the action, not an extra CTA. Use 16 pt gutters, 16 pt between sections, 56–72 pt rows, 16/23 titles and 13/18 previews. Delete the oversized 128 pt hero, yellow star badge, entrance stagger, and permanently prominent bottom grid/search dock; search moves to the header. Empty state explains how to add an assistant; loading uses rows matching the final shape; failed connection has an inline explanation and retry. **Appllama: one accent; typography hierarchy; full state cycles; frequency gate.**

## Chat

Today: `bot/bits.tsx` assembles centered steps, live activity, approval and segmented markdown bubbles; `screen.tsx` positions the composer beneath the conversation. Keep that ordering and the markdown, long-press actions, streaming and approval behavior. Align assistant content, steps and activity to a common 16 pt leading edge; use an unboxed assistant response with 16/24 text and retain a subdued 16 pt rounded user bubble. Separate turns by 24 pt, with 8–12 pt inside a turn. Keep a native title/back header and a quiet overflow menu. Delete bubble segmentation and decorative entrance motion around routine content. Preserve selectable/copyable content, links, code and long-message scrolling. Loading reveals content progressively; connection errors are inline and retryable. **Appllama: typography hierarchy; native navigation; perceived performance; motion frequency gate.**

## Steps pill and page

Today: `steps-row.tsx` already uses a neutral bordered pill with status icon and chevron (red is used on failure); it opens the separate steps route on tap or right swipe. Keep the disclosure and push destination, but align it with the assistant text, give it a 44 pt hit target around the compact visible capsule, and replace raw tool names in the pill with “3 steps” plus a concise state. The page presents an ordered, divided list with human-readable tool names, status in words, and a short input preview. Expand an item to reveal selectable input/output, with errors and retry guidance inline when available. Keep raw tool names in the detail, not the summary. Delete the pill's swipe-to-open gesture and the repeated bordered step cards; a standard tap and native back/edge swipe are sufficient. Running uses a quiet accent indicator; completed is neutral; failed is red with text. Empty and loading states explain what will appear. **Appllama: push goes deeper; one accent; full state cycles; frequency gate.**

## Live activity

Today: `activity-row.tsx` shows a face with a pulsing, sometimes rotating phrase. Use a small status mark and a factual phrase such as “Searching the web…” directly below the steps pill. Keep it to one line when possible and announce meaningful changes politely. Delete idle phrase rotation and continuous opacity pulse; show “Working…” when no specific action is known. On completion, replace the line with the response without shifting already-read text unnecessarily. **Appllama: motion must have a purpose; data being read never moves for style; progressive reveal.**

## Composer

Today: a separate attach circle precedes a pill containing input, microphone and a send/stop control. Make a single 16 pt radius input surface with attach and voice as quiet secondary controls and one 40 pt primary send control inside a 44 pt target. The warm action appears only when sending is possible; disabled is neutral. During a run, the same primary position becomes Stop, or Add to reply when steering is available and text exists; retain a separately reachable Stop in the latter case. Preserve attachments, slash commands, voice, drafts and edit cancellation. Delete the separate floating attach disc and send icon pop. Grow to a bounded multiline field, track the actual keyboard, retain safe-area clearance and preserve drafts on failure. **Appllama: one accent; one label per intent; native controls; frequency gate.**

## Approval card

Today: the inline approval card interrupts the assistant turn and offers choices. Keep it inline and make the requested action, target and consequence readable before any decision; show command details in a selectable, expandable inset. Use a 16 pt card with 16 pt padding and 8 pt internal rhythm. One warm primary “Allow once” action; “Deny” remains a clearly visible neutral action, with other existing scopes available only when supported. Pending disables both actions and communicates progress; failure preserves the request and offers retry. Delete ornamental warning color and competing filled buttons; use red for actual failure, not an ordinary request for permission. No automatic approval. **Appllama: one accent; typography hierarchy; full state cycles; one primary action.**

## Validation before implementation ships

This mock is a static artifact: native interaction, contrast, light theme, Dynamic Type and motion have not been verified. Implement with semantic platform colors and native controls, then test both themes, large text, long tool output, keyboard, safe areas, failure/recovery and every back path. Record the full flow on a simulator and measure a release build on the slowest supported device, including Reduce Motion, per the Appllama simulator and motion rules.
