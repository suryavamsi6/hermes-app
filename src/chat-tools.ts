// Pure helpers behind the chat screen's search, export, edit-and-resend and photo sending.
import type { AssistantTurn, Turn } from "./chat-model";
import type { ContentPart, TurnInput } from "./run-stream";
import { skillDisplay } from "./slash";

/** The run input for a message: plain text, or (with photos) text plus image parts. Hermes takes
 *  images as data: URLs (gateway/platforms/api_server.py _normalize_multimodal_content). */
export function buildInput(text: string, images: string[] = []): TurnInput {
  if (!images.length) return text;
  const parts: ContentPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const url of images) parts.push({ type: "image_url", image_url: { url } });
  return parts;
}

/** Approximate request size of data: URLs, to stay under Hermes's 10 MB request cap. */
export const imagesBytes = (images: string[]) => images.reduce((n, u) => n + u.length, 0);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Turns whose text contains `query` (case-insensitive), oldest first, with each turn's hit count. */
export function findMatches(turns: Turn[], query: string): { id: string; count: number }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: { id: string; count: number }[] = [];
  for (const t of turns) {
    const s = t.text.toLowerCase();
    let n = 0;
    for (let i = s.indexOf(q); i !== -1; i = s.indexOf(q, i + q.length)) n++;
    if (n) out.push({ id: t.id, count: n });
  }
  return out;
}

const stamp = (ms?: number) => {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return ` · ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** The chat as a Markdown document (Export / Share). Steps and approvals are left out; photos become
 *  a placeholder because their bytes stay on the phone. */
export function chatToMarkdown(botName: string, turns: Turn[], now = Date.now()): string {
  const lines = [`# Chat with ${botName}`, "", `_Exported ${stamp(now).slice(3)}_`, ""];
  for (const t of turns) {
    if (t.role === "user") {
      const photos = t.images?.length ?? t.imageCount ?? 0;
      lines.push(`## You${stamp(t.at)}`, "");
      if (photos) lines.push(`_[${photos === 1 ? "1 photo" : `${photos} photos`}]_`, "");
      if (t.text) lines.push(skillDisplay(t.text) ?? t.text, "");
    } else {
      if (!t.text && t.status !== "completed") continue;
      lines.push(`## ${botName}${stamp(t.at)}`, "");
      for (const s of t.steers ?? []) lines.push(`> Added while answering: ${s}`, "");
      lines.push(t.text || "_(no reply)_", "");
      if (t.status === "failed" || t.status === "cancelled") lines.push(`_(${t.status === "failed" ? "failed" : "stopped"})_`, "");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** The last user message, if nothing is running after it: the one Edit & resend can change. */
export function editableLast(turns: Turn[]): { userId: string; text: string } | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "assistant" && t.status === "streaming") return undefined;
    if (t.role === "user") return t.text ? { userId: t.id, text: t.text } : undefined;
  }
  return undefined;
}

/** The reply that's still being written (the one steering text goes to). */
export function runningTurn(turns: Turn[]): AssistantTurn | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "assistant") return t.status === "streaming" ? t : undefined;
  }
  return undefined;
}

/** Steering needs the run's id (only /v1/runs streams have one); legacy session streams can't steer. */
export const canSteer = (t?: AssistantTurn) => !!t?.runId && t.status === "streaming" && !t.approval;
