// Gateway-injected turns and escaped text.
//
// Hermes re-enters process/cron/relay notifications into a session as role=user messages and appends
// INTERNAL_NOTIFICATION_FOOTER (gateway/run_notifications.py). They're machinery, not something the
// owner said, so the chat shows them as a small event chip instead of a user bubble. Their payload is
// often a JSON dump whose strings arrive with literal \n and \u2014 escapes; decodeEscapes fixes those.

export const NOTICE_MARKER = "[INTERNAL NOTIFICATION";

export const isGatewayNotice = (text: string) => text.includes(NOTICE_MARKER);

/** Literal escape sequences (\n, \t, \", \uXXXX) turned into the characters they stand for. Text in
 *  ``` fences is left alone (code may mean the backslash). */
export function decodeEscapes(s: string): string {
  return s.split(/(```[\s\S]*?```)/g).map((chunk, i) => (i % 2 ? chunk : chunk
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\r\\n|\\n/g, "\n").replace(/\\t/g, "  ").replace(/\\"/g, '"'))).join("");
}

/** Only fixes text that clearly arrived double-encoded: \uXXXX for non-ASCII characters, or several
 *  literal \n with no real line breaks. Ordinary replies pass through untouched. */
export function tidyEscapes(s: string): string {
  const uni = /\\u(?:00[89a-fA-F][0-9a-fA-F]|0[1-9a-fA-F][0-9a-fA-F]{2}|[1-9a-fA-F][0-9a-fA-F]{3})/.test(s);
  const lits = (s.match(/\\n/g) ?? []).length;
  const real = (s.match(/\n/g) ?? []).length;
  return uni || (lits >= 2 && lits > real * 2) ? decodeEscapes(s) : s;
}

const TEXT_KEYS = ["message", "text", "content", "reply", "summary", "output", "result", "body"];

function textsIn(v: unknown, out: string[], depth = 0) {
  if (depth > 4 || out.length >= 6) return;
  if (Array.isArray(v)) { v.forEach((x) => textsIn(x, out, depth + 1)); return; }
  if (v && typeof v === "object") {
    for (const k of TEXT_KEYS) { const x = (v as any)[k]; if (typeof x === "string" && x.trim()) { out.push(x.trim()); return; } }
    Object.values(v).forEach((x) => typeof x === "object" && textsIn(x, out, depth + 1));
  }
}

export type Notice = { title: string; body: string };

/** Title (one line) and readable body for a gateway notice. */
export function parseNotice(raw: string): Notice {
  let text = raw.slice(0, raw.indexOf(NOTICE_MARKER) >= 0 ? raw.indexOf(NOTICE_MARKER) : raw.length).trim();
  // A JSON payload (array or object) anywhere in it: show its message strings, not the dump.
  // Try each "[" / "{" as the start of a JSON tail ("[SYSTEM: …]" headers come first).
  let lead = text, body = "";
  for (let start = text.search(/[[{]/), tries = 0; start >= 0 && tries < 20; start = text.slice(start + 1).search(/[[{]/) + start + 1, tries++) {
    let parsed: unknown;
    try { parsed = JSON.parse(text.slice(start)); } catch { if (text.slice(start + 1).search(/[[{]/) < 0) break; continue; }
    const found: string[] = [];
    textsIn(parsed, found);
    if (found.length) { lead = text.slice(0, start).trim(); body = found.join("\n\n"); }
    break;
  }
  if (!body) body = decodeEscapes(text);
  const head = decodeEscapes(lead).split("\n").map((l) => l.replace(/^\[|\]$/g, "").replace(/^(SYSTEM|NOTICE)\s*:\s*/i, "").trim()).find((l) => l && !/^[[{]/.test(l));
  const title = (head && head.length <= 90 ? head : head ? `${head.slice(0, 87)}…` : "") || (/deliver|routine|cron|job/i.test(text) ? "Background update delivered" : "Background update");
  return { title, body: body.trim() };
}
