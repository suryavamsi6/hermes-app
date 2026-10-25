// Files for a message. Hermes's /v1/runs takes text and images only (api_server.py
// _normalize_multimodal_content rejects file/input_file parts), so: images go as image parts, text
// files are inlined into the message inside a marked block, anything else is refused with a reason.
export const FILE_TEXT_LIMIT = 48_000; // chars per message of inlined file text (Hermes caps a part at 64 KB)
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|toml|ini|cfg|conf|env\.example|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|fish|sql|log|tex|srt|vtt|ics|vcf|gitignore|dockerfile|nix)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

export type FileKind = "image" | "text" | "unsupported";
export function fileKind(name: string, mime?: string | null): FileKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  if (m.startsWith("text/") || /json|xml|yaml|csv|javascript|x-sh|sql|toml/.test(m) || TEXT_EXT.test(name)) return "text";
  return "unsupported";
}

const OPEN = (name: string) => `<attached-file name="${name.replace(/"/g, "'")}">`;
const CLOSE = "</attached-file>";

/** The block a text file becomes inside the message. */
export const fileBlock = (name: string, text: string) => `${OPEN(name)}\n${text}\n${CLOSE}`;

/** Typed text plus file blocks, keeping the total file text under the limit. */
export function withFiles(text: string, files: { name: string; text: string }[]): string {
  let room = FILE_TEXT_LIMIT;
  const blocks = files.map((f) => {
    const body = f.text.length > room ? `${f.text.slice(0, Math.max(0, room))}\n[… cut: the file was longer than Hermes accepts in one message]` : f.text;
    room = Math.max(0, room - f.text.length);
    return fileBlock(f.name, body);
  });
  return [text.trim(), ...blocks].filter(Boolean).join("\n\n");
}

/** A message back from history: its own text and the names of the files it carried. */
export function splitFiles(message: string): { text: string; files: string[] } {
  const files: string[] = [];
  const text = message.replace(/<attached-file name="([^"]*)">\n[\s\S]*?\n<\/attached-file>/g, (_, n) => { files.push(n); return ""; });
  return { text: files.length ? text.replace(/\n{3,}/g, "\n\n").trim() : message, files };
}
