// Photos for a message: pick or shoot, shrink to at most 1568 px on the long edge (what vision
// models look at anyway) as JPEG, and keep a data: URL for Hermes plus a local URI for the bubble.
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { FILE_TEXT_LIMIT, fileKind } from "./files";
import { createStore, useStore } from "./store";

export type Attachment = { uri: string; dataUrl: string };
export const MAX_ATTACHMENTS = 4;
const EDGE = 1568;

export async function prepareImage(uri: string, width?: number, height?: number): Promise<Attachment> {
  const ctx = ImageManipulator.manipulate(uri);
  const long = Math.max(width ?? 0, height ?? 0);
  if (!long || long > EDGE) {
    if (!width || !height) ctx.resize({ width: EDGE });
    else ctx.resize(width >= height ? { width: EDGE } : { height: EDGE });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!out.base64) throw new Error("Couldn't read that photo.");
  return { uri: out.uri, dataUrl: `data:image/jpeg;base64,${out.base64}` };
}

/** Opens the gallery (several photos) or the camera; returns [] when cancelled. */
export async function pickImages(from: "library" | "camera", room: number): Promise<Attachment[]> {
  if (room <= 0) return [];
  let r: ImagePicker.ImagePickerResult;
  if (from === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is off for Hermes. Turn it on in Android Settings → Apps → Hermes.");
    r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
  } else {
    r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: room > 1, selectionLimit: room, quality: 1 });
  }
  if (r.canceled) return [];
  return Promise.all(r.assets.slice(0, room).map((a) => prepareImage(a.uri, a.width, a.height)));
}

/** Photos waiting in each bot's composer (the share sheet fills these too). */
const pending = createStore<Record<string, Attachment[]>>({});
const NONE: Attachment[] = [];
export const useAttachments = (botId: string) => useStore(pending, (s) => s[botId] ?? NONE);
export const setAttachments = (botId: string, f: (a: Attachment[]) => Attachment[]) =>
  pending.set((s) => ({ ...s, [botId]: f(s[botId] ?? NONE).slice(0, MAX_ATTACHMENTS) }));

// ---- Files (documents) -------------------------------------------------------------------------
// Picked with the system file picker. Images among them become photos; text files are read here and
// inlined when sent (see ../files.ts); other types are refused with a reason, since Hermes's runs
// API doesn't accept file parts.

export type FileAttachment = { name: string; text: string; size: number };
export const MAX_FILES = 4;
const MAX_FILE_BYTES = 512 * 1024;

export type PickedFiles = { images: Attachment[]; files: FileAttachment[]; skipped: string[] };

export async function pickFiles(roomImages: number, roomFiles: number): Promise<PickedFiles> {
  const out: PickedFiles = { images: [], files: [], skipped: [] };
  const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
  if (r.canceled) return out;
  for (const a of r.assets) {
    const kind = fileKind(a.name, a.mimeType);
    if (kind === "image") {
      if (out.images.length >= roomImages) { out.skipped.push(`${a.name}: photo limit reached`); continue; }
      out.images.push(await prepareImage(a.uri));
    } else if (kind === "text") {
      if (out.files.length >= roomFiles) { out.skipped.push(`${a.name}: file limit reached`); continue; }
      if ((a.size ?? 0) > MAX_FILE_BYTES) { out.skipped.push(`${a.name}: larger than ${MAX_FILE_BYTES / 1024} KB`); continue; }
      const text = await new File(a.uri).text();
      out.files.push({ name: a.name, text: text.slice(0, FILE_TEXT_LIMIT * 2), size: a.size ?? text.length });
    } else {
      out.skipped.push(`${a.name}: Hermes can take photos and text files from the phone, not this type yet`);
    }
  }
  return out;
}

const pendingFiles = createStore<Record<string, FileAttachment[]>>({});
const NO_FILES: FileAttachment[] = [];
export const useFileAttachments = (botId: string) => useStore(pendingFiles, (s) => s[botId] ?? NO_FILES);
export const setFileAttachments = (botId: string, f: (a: FileAttachment[]) => FileAttachment[]) =>
  pendingFiles.set((s) => ({ ...s, [botId]: f(s[botId] ?? NO_FILES).slice(0, MAX_FILES) }));
