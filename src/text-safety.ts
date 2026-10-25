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

/** While a reply is still streaming, its last line can end inside an unfinished `**bold**` or
 *  `` `code` `` span, which would flash as raw asterisks/backticks until the closing marker arrives.
 *  Drop an unmatched trailing opener on the last line (outside code fences). Finished replies are
 *  never touched. */
export function hideOpenTail(s: string): string {
  if ((s.match(/^```/gm) ?? []).length % 2 === 1) return s; // inside an open code fence: shown as code
  const cut = s.lastIndexOf("\n") + 1;
  let line = s.slice(cut);
  const ticks = (line.match(/`/g) ?? []).length;
  if (ticks % 2 === 1) { const i = line.lastIndexOf("`"); line = line.slice(0, i) + line.slice(i + 1); }
  const outside = line.replace(/`[^`]*`/g, "");
  if ((outside.match(/\*\*/g) ?? []).length % 2 === 1) { const i = line.lastIndexOf("**"); line = line.slice(0, i) + line.slice(i + 2); }
  else if ((outside.replace(/\*\*/g, "").match(/(^|[^*])\*(?!\*)/g) ?? []).length % 2 === 1 && /\*\S*$/.test(line)) { const i = line.lastIndexOf("*"); line = line.slice(0, i) + line.slice(i + 1); }
  return s.slice(0, cut) + line;
}
