// Composer: a round Plugins button (opens the bot's Plugins screen), then an "Ask <bot>" pill with the
// attachment strip, an attach button (photos, camera, files), a dictation mic and one round action button: send when idle; while a reply is running it's
// "add to this reply" (steer) if you typed something, else stop.
import { ArrowUp, Blocks, Camera, CornerDownRight, FileText, Image as ImageIcon, Mic, Paperclip, Square, X } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { setDraftText, useDraft } from "../app-state";
import { type Attachment, type FileAttachment, MAX_ATTACHMENTS, MAX_FILES, pickFiles, pickImages, setAttachments, setFileAttachments, useAttachments, useFileAttachments } from "../attach";
import { Sheet } from "./sheet";
import { useDictation } from "./dictation";
import { tapHaptic } from "./haptics";
import Reanimated from "react-native-reanimated";
import { enter, PressScale } from "./motion";
import { colors, font, radii, type } from "./theme";

type Props = {
  botId: string; busy: boolean;
  onSend: (t: string, images: Attachment[], files: FileAttachment[]) => void;
  onStop: () => void;
  /** Add the text to the running reply; resolve false to keep the draft (e.g. the run already ended). */
  onSteer?: (t: string) => Promise<boolean>;
  canSteer?: boolean;
  onPlus?: () => void;
  placeholder?: string;
  /** Shown above the pill while editing a sent message. */
  editing?: boolean; onCancelEdit?: () => void;
};

/** The text is the bot's draft (kept per bot, across restarts), so only this component re-renders while typing. */
export const Composer = memo(function Composer({ botId, busy, onSend, onStop, onSteer, canSteer, onPlus, placeholder = "Ask Hermes", editing, onCancelEdit }: Props) {
  const text = useDraft(botId);
  const images = useAttachments(botId);
  const files = useFileAttachments(botId);
  const [working, setWorking] = useState(false);
  const [menu, setMenu] = useState(false);
  const setText = (t: string) => setDraftText(botId, t);
  const current = useCallback(() => text, [text]);
  const voice = useDictation(botId, current);
  const hasText = text.trim().length > 0;
  const mode = busy ? (hasText && canSteer ? "steer" : "stop") : "send";
  const canSend = hasText || images.length > 0 || files.length > 0;

  const attach = async (from: "library" | "camera") => {
    try {
      setWorking(true);
      const got = await pickImages(from, MAX_ATTACHMENTS - images.length);
      if (got.length) setAttachments(botId, (a) => [...a, ...got]);
    } catch (e: any) { Alert.alert("Couldn't add the photo", String(e?.message ?? e)); }
    finally { setWorking(false); }
  };
  const attachFiles = async () => {
    try {
      setWorking(true);
      const got = await pickFiles(MAX_ATTACHMENTS - images.length, MAX_FILES - files.length);
      if (got.images.length) setAttachments(botId, (a) => [...a, ...got.images]);
      if (got.files.length) setFileAttachments(botId, (a) => [...a, ...got.files]);
      if (got.skipped.length) Alert.alert("Some files weren't added", got.skipped.join("\n"));
    } catch (e: any) { Alert.alert("Couldn't add the file", String(e?.message ?? e)); }
    finally { setWorking(false); }
  };
  const choose = (f: () => Promise<void>) => { setMenu(false); setTimeout(() => void f(), 250); };
  const press = async () => {
    if (mode === "stop") return onStop();
    tapHaptic();
    if (mode === "steer") {
      const t = text.trim(); setText("");
      if (!(await onSteer?.(t))) setText(t);
      return;
    }
    if (!canSend) return;
    onSend(text.trim(), images, files); setText(""); setAttachments(botId, () => []); setFileAttachments(botId, () => []);
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6 }}>
      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 }}>
          <Text style={[type.bodySm, { color: colors.accentText, flex: 1 }]}>Editing. Sends as a new message; Hermes keeps the original.</Text>
          <Pressable accessibilityLabel="Cancel editing" hitSlop={8} onPress={onCancelEdit}><X size={16} color={colors.muted} /></Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        {onPlus ? (
          <Pressable accessibilityLabel="Plugins" onPress={onPlus} hitSlop={6}
            style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.control : colors.floating, borderWidth: 1, borderColor: colors.border })}>
            <Blocks size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minHeight: 48, backgroundColor: colors.floating, borderRadius: radii.pill, borderWidth: 1,
          borderColor: voice.listening ? colors.accentText : colors.border, paddingLeft: 18, paddingRight: 5, paddingVertical: 4 }}>
          {files.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8, paddingBottom: 2 }}>
              {files.map((f, i) => (
                <View key={f.name + i} style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 200, height: 36, paddingLeft: 10, paddingRight: 4, borderRadius: radii.inset, backgroundColor: colors.control }}>
                  <FileText size={15} color={colors.muted} />
                  <Text numberOfLines={1} style={[type.label, { flexShrink: 1, color: colors.text }]}>{f.name}</Text>
                  <Pressable accessibilityLabel={`Remove ${f.name}`} hitSlop={8} onPress={() => setFileAttachments(botId, (x) => x.filter((_, k) => k !== i))}
                    style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
                    <X size={13} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6, paddingBottom: 2 }}>
              {images.map((a, i) => (
                <View key={a.uri + i}>
                  <Image source={{ uri: a.uri }} resizeMethod="resize" style={{ width: 56, height: 56, borderRadius: radii.inset, backgroundColor: colors.control }} />
                  <Pressable accessibilityLabel="Remove photo" hitSlop={6} onPress={() => setAttachments(botId, (x) => x.filter((_, k) => k !== i))}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.controlActive, alignItems: "center", justifyContent: "center" }}>
                    <X size={12} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <TextInput value={text} onChangeText={setText} placeholder={voice.listening ? "Listening…" : busy && canSteer ? "Add to this reply…" : placeholder}
              placeholderTextColor={colors.muted} accessibilityLabel={placeholder}
              multiline style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 17, maxHeight: 140, paddingVertical: 9 }} />
            <Pressable accessibilityLabel="Attach photos or files" disabled={working} hitSlop={4}
              onPress={() => { tapHaptic(); setMenu(true); }} onLongPress={() => void attach("camera")}
              style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.controlActive : "transparent" })}>
              {working ? <ActivityIndicator color={colors.muted} /> : <Paperclip size={20} color={colors.muted} />}
            </Pressable>
            <Pressable accessibilityLabel={voice.listening ? "Stop voice typing" : "Voice typing"} onPress={voice.toggle} hitSlop={4}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: voice.listening ? colors.controlActive : "transparent" }}>
              <Mic size={20} color={voice.listening ? colors.accentText : colors.muted} />
            </Pressable>
            {busy && mode === "steer" ? (
              <Pressable accessibilityLabel="Stop" onPress={onStop} hitSlop={4} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }}>
                <Square size={14} color={colors.muted} fill={colors.muted} />
              </Pressable>
            ) : null}
            <PressScale accessibilityLabel={mode === "stop" ? "Stop" : mode === "steer" ? "Add to this reply" : "Send"} disabled={mode === "send" && !canSend}
              onPress={press} to={0.86}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.action, opacity: mode === "send" && !canSend ? 0.35 : 1 }}>
              {/* Keyed by mode: the icon pops when send turns into stop (and back). */}
              <Reanimated.View key={mode} entering={enter.pop}>
                {mode === "stop" ? <Square size={14} color={colors.actionForeground} fill={colors.actionForeground} />
                  : mode === "steer" ? <CornerDownRight size={19} color={colors.actionForeground} />
                  : <ArrowUp size={20} color={colors.actionForeground} />}
              </Reanimated.View>
            </PressScale>
          </View>
        </View>
      </View>
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Attach">
        <AttachRow icon={<ImageIcon size={20} color={colors.text} />} title="Photos" detail="From your gallery" disabled={images.length >= MAX_ATTACHMENTS} onPress={() => choose(() => attach("library"))} />
        <AttachRow icon={<Camera size={20} color={colors.text} />} title="Camera" detail="Take a photo" disabled={images.length >= MAX_ATTACHMENTS} onPress={() => choose(() => attach("camera"))} />
        <AttachRow icon={<FileText size={20} color={colors.text} />} title="Files" detail="Text, code, CSV, JSON, Markdown, images" disabled={files.length >= MAX_FILES && images.length >= MAX_ATTACHMENTS} onPress={() => choose(attachFiles)} />
      </Sheet>
    </View>
  );
});

function AttachRow({ icon, title, detail, disabled, onPress }: { icon: React.ReactNode; title: string; detail: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.inset,
        backgroundColor: pressed ? colors.controlActive : "transparent", opacity: disabled ? 0.4 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.controlActive }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: colors.text }]}>{title}</Text>
        <Text style={type.label}>{detail}</Text>
      </View>
    </Pressable>
  );
}

