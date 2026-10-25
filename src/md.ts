// A small Markdown parser for chat replies. It covers what assistants actually send: paragraphs,
// headings, fenced code, block quotes, nested lists, pipe tables, rules, and inline bold, italic,
// strikethrough, code and links. Output is a plain tree that the native renderer walks.

export type Inline =
  | { k: "text"; s: string }
  | { k: "code"; s: string }
  | { k: "b" | "i" | "s"; c: Inline[] }
  | { k: "link"; href: string; c: Inline[] };

export type Block =
  | { k: "p"; c: Inline[] }
  | { k: "h"; level: number; c: Inline[] }
  | { k: "code"; lang: string; s: string }
  | { k: "quote"; c: Block[] }
  | { k: "list"; ordered: boolean; start: number; items: Block[][] }
  | { k: "table"; head: Inline[][]; rows: Inline[][][]; align: ("left" | "center" | "right")[] }
  | { k: "hr" };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/;
const DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const startsBlock = (line: string, next?: string) =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line) ||
  (line.includes("|") && next !== undefined && DIVIDER.test(next) && next.includes("-"));

export function parse(src: string): Block[] {
  return blocks(src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"));
}

function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(fence[1][0].repeat(fence[1].length)) && !lines[i].trim().slice(fence[1].length).trim())) body.push(lines[i++]);
      i++; // closing fence (or end of text)
      out.push({ k: "code", lang: fence[2] || "", s: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) { out.push({ k: "h", level: heading[1].length, c: inline(heading[2]) }); i++; continue; }

    if (RULE.test(line)) { out.push({ k: "hr" }); i++; continue; }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim() && (QUOTE.test(lines[i]) || !startsBlock(lines[i]))) inner.push(lines[i++].replace(QUOTE, ""));
      out.push({ k: "quote", c: blocks(inner) });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && DIVIDER.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left") as "left" | "center" | "right");
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]).map(inline));
      out.push({ k: "table", head: head.map(inline), rows, align });
      continue;
    }

    const item = ITEM.exec(line);
    if (item) { i = list(lines, i, out); continue; }

    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    out.push({ k: "p", c: inline(para.join("\n")) });
  }
  return out;
}

/** Parses one list starting at lines[i]; returns the index after it. */
function list(lines: string[], i: number, out: Block[]): number {
  const first = ITEM.exec(lines[i])!;
  const indent = first[1].length;
  const ordered = first[3] !== undefined;
  const items: string[][] = [];
  while (i < lines.length) {
    const line = lines[i];
    const m = ITEM.exec(line);
    if (m && m[1].length === indent && (m[3] !== undefined) === ordered) {
      items.push([m[4]]);
      i++;
      continue;
    }
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = lines[j];
      const nm = next !== undefined ? ITEM.exec(next) : null;
      const continues = next !== undefined && (lead(next) > indent || (nm && nm[1].length === indent && (nm[3] !== undefined) === ordered));
      if (!continues) break;
      items[items.length - 1].push("");
      i++;
      continue;
    }
    if (lead(line) > indent) { items[items.length - 1].push(line.slice(Math.min(lead(line), indent + 2))); i++; continue; }
    if (!startsBlock(line, lines[i + 1])) { items[items.length - 1].push(line.trim()); i++; continue; }
    break;
  }
  out.push({ k: "list", ordered, start: ordered ? Number(first[3]) : 1, items: items.map(blocks) });
  return i;
}

const lead = (s: string) => s.length - s.trimStart().length;

function cells(row: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let t = row.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") { cur += "|"; i++; } else if (t[i] === "|") { parts.push(cur.trim()); cur = ""; } else cur += t[i];
  }
  parts.push(cur.trim());
  return parts;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: "\u00a0" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e]);

// One alternation, tried left to right at each position. Groups:
// 1 escaped char | 2-3 code span | 4-5 [text](url) | 6 bare URL | 7 **bold** | 8 __bold__ | 9 ~~strike~~ | 10 *italic* | 11 _italic_
const INLINE = /\\([\\`*_~[\]()#+\-.!|>])|(`+)([\s\S]*?[^`])\2(?!`)|\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_~])|\*\*(?=\S)([\s\S]*?\S)\*\*|\b__(?=\S)([\s\S]*?\S)__\b|~~(?=\S)([\s\S]*?\S)~~|\*(?=[^\s*])([\s\S]*?[^\s*])\*|\b_(?=[^\s_])([\s\S]*?[^\s_])_\b/g;

export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.k === "text") last.s += decode(s); else out.push({ k: "text", s: decode(s) });
  };
  let at = 0;
  INLINE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = INLINE.exec(src)); ) {
    text(src.slice(at, m.index));
    at = m.index + m[0].length;
    const re = INLINE.lastIndex;
    if (m[1] !== undefined) text(m[1]);
    else if (m[3] !== undefined) out.push({ k: "code", s: m[3].length > 2 && m[3].startsWith(" ") && m[3].endsWith(" ") ? m[3].slice(1, -1) : m[3] });
    else if (m[4] !== undefined) out.push({ k: "link", href: m[5], c: inline(m[4]) });
    else if (m[6] !== undefined) out.push({ k: "link", href: m[6], c: [{ k: "text", s: m[6] }] });
    else if (m[7] !== undefined || m[8] !== undefined) out.push({ k: "b", c: inline(m[7] ?? m[8]) });
    else if (m[9] !== undefined) out.push({ k: "s", c: inline(m[9]) });
    else out.push({ k: "i", c: inline(m[10] ?? m[11]) });
    INLINE.lastIndex = re;
  }
  text(src.slice(at));
  return out;
}

/** Plain text of an inline run (used for search and for copy). */
export const plain = (c: Inline[]): string => c.map((n) => (n.k === "text" || n.k === "code" ? n.s : plain(n.c))).join("");
