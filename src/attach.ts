// Photos for a message: pick or shoot, shrink to at most 1568 px on the long edge (what vision
// models look at anyway) as JPEG, and keep a data: URL for Hermes plus a local URI for the bubble.
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
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
