// Pure helpers that keep odd replies from breaking the chat: safe link schemes, tidy whitespace, and
// a cap on how much of a huge reply renders at once.

/** Only web, mail and phone links open; javascript:, intent:, file:, content: and the rest don't. */
export function safeHref(href: string): string | undefined {
  const h = href.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  if (/^www\./i.test(h)) return `https://${h}`;
  return undefined;
}

/** Trailing spaces off, runs of blank lines collapsed to one, ends trimmed. A model that "degenerates"
 *  into thousands of newlines would otherwise make one enormous empty bubble. */
export function tidyText(s: string): string {
  return s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Replies longer than this render cut at a paragraph boundary with a "Show the rest" toggle: a
 *  single Android view taller than the GPU texture limit draws as an empty box. */
export const LONG_REPLY = 6000;
export function clipLong(s: string, limit = LONG_REPLY): { text: string; clipped: boolean } {
  if (s.length <= limit) return { text: s, clipped: false };
  const cut = s.lastIndexOf("\n\n", limit);
  return { text: s.slice(0, cut > limit / 2 ? cut : limit).trimEnd(), clipped: true };
}
