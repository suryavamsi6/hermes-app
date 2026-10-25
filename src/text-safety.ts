// Pure helpers that keep odd replies from breaking the chat: safe link schemes, tidy whitespace, and
// a cap on how much of a huge reply renders at once.
import { parse, type Block } from "./md";

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

/** Most characters one bubble piece holds. A long message renders as a stack of pieces that look like
 *  one bubble, so no single Android view (the bubble's background view or a Text) gets tall enough to
 *  hit the GPU size limit and draw as an empty grey box (v0.11.2: a 3.9k-character reply and a 2.6k
 *  user message, both under LONG_REPLY, each made one ~3,000 dp view). ~1,400 characters is about
 *  1,200 dp at the chat font, well under the limit even with large system font sizes. */
export const PIECE = 1400;
/** Code fences longer than this many lines are split into several fences (each is one Text). */
export const PIECE_LINES = 50;

/** Splits text into pieces of at most ~`max` characters at paragraph boundaries, never inside a code
 *  fence (huge fences are re-fenced in parts), long paragraphs at sentence, line or word breaks. Joining
 *  the pieces with blank lines gives back the same Markdown. */
export function pieces(s: string, max = PIECE, maxLines = PIECE_LINES): string[] {
  if (s.length <= max && (s.match(/\n/g) ?? []).length <= maxLines) return [s];
  const units: string[] = [];
  const lines = s.split("\n");
  let para: string[] = [];
  const flush = () => { if (para.length) { units.push(...splitPara(para.join("\n"), max)); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*(```+|~~~+)(.*)$/.exec(lines[i]);
    if (open) {
      flush();
      const fence = open[1], lang = open[2].trim();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence)) body.push(lines[j++]);
      const closed = j < lines.length;
      for (let k = 0; k < Math.max(1, body.length); k += maxLines) {
        const part = body.slice(k, k + maxLines);
        units.push(`${fence}${lang}\n${part.join("\n")}${closed || k + maxLines < body.length ? `\n${fence}` : ""}`);
      }
      i = closed ? j : lines.length;
      continue;
    }
    if (!lines[i].trim()) flush(); else para.push(lines[i]);
  }
  flush();
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    const lines = (x: string) => x.split("\n").length;
    if (cur && (cur.length + 2 + u.length > max || lines(cur) + 1 + lines(u) > maxLines + 2)) { out.push(cur); cur = u; } else cur = cur ? `${cur}\n\n${u}` : u;
  }
  if (cur) out.push(cur);
  return out.length ? out : [s];
}

function splitPara(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const out: string[] = [];
  let rest = p;
  while (rest.length > max) {
    const win = rest.slice(0, max);
    let cut = Math.max(win.lastIndexOf(". "), win.lastIndexOf("! "), win.lastIndexOf("? "), win.lastIndexOf("\n"));
    if (cut < max / 2) cut = win.lastIndexOf(" ");
    if (cut < max / 2) cut = max - 1;
    out.push(rest.slice(0, cut + 1).trimEnd());
    rest = rest.slice(cut + 1).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Code blocks scroll sideways, so their Text is as wide as the longest line. Prose pasted into a fence
 *  (the v0.11.2 fixture has a 623-character line, ~4,900 dp wide) would make a view wider than Android
 *  can draw, so blocks with lines past this wrap instead. */
export const WRAP_CODE_AT = 160;
export const wrapsCode = (code: string) => code.split("\n").some((l) => l.length > WRAP_CODE_AT);

/** True when a reply has a block that scrolls sideways (a code block that doesn't wrap, or a table).
 *  Such a bubble must have a definite width: on Android a shrink-to-fit bubble around a horizontal
 *  ScrollView gets laid out far taller than its content, so it shows as a tall empty grey box that
 *  also overlaps the message above (the real "grey box" cause, reproduced on an Android emulator:
 *  a 3-line code block between two short paragraphs left ~1,000 px of empty bubble). */
export function scrollsSideways(text: string): boolean {
  const walk = (bs: Block[]): boolean => bs.some((b) =>
    b.k === "table" || (b.k === "code" && !wrapsCode(b.s)) || (b.k === "quote" && walk(b.c)) || (b.k === "list" && b.items.some(walk)));
  return walk(parse(text));
}
