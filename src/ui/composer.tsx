// Composer: a round "+" button on the left (the only attach control; opens Photos / Camera / Files, long
// press = camera), then an "Ask <bot>" pill with the attachment strip, a dictation mic and one round action button: send when idle; while a reply is running it's
// "add to this reply" (steer) if you typed something, else stop.
import { ArrowUp, Camera, CornerDownRight, FileText, Image as ImageIcon, Mic, Plus, Square, X } from "lucide-react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { setDraftText, setListening, useDraft } from "../app-state";
import { type Attachment, type FileAttachment, MAX_ATTACHMENTS, MAX_FILES, pickFiles, pickImages, setAttachments, setFileAttachments, useAttachments, useFileAttachments } from "../attach";
import { Sheet } from "./sheet";
import { SlashPicker } from "./slash-picker";
import { filterCommands, pickerQuery, type SlashCommand } from "../slash";
import { useDictation } from "./dictation";
import { tapHaptic } from "./haptics";
import Reanimated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "./live-surface";
import { DUR } from "./motion-tokens";
import { colors, font, radii, type } from "./theme";

type Props = {
  botId: string; busy: boolean;
  onSend: (t: string, images: Attachment[], files: FileAttachment[]) => void;
  onStop: () => void;
  /** Add the text to the running reply; resolve false to keep the draft (e.g. the run already ended). */
  onSteer?: (t: string) => Promise<boolean>;
  canSteer?: boolean;
  placeholder?: string;
  /** Shown above the pill while editing a sent message. */
  editing?: boolean; onCancelEdit?: () => void;
  /** Commands for the "/" picker. */
  commands?: SlashCommand[];
  /** Runs a typed "/command". "sent": it used the attachments too; "done": clear the text, keep them;
   *  "kept": handled, leave everything (to fix the command); false: not a command, send as text. */
  onSlash?: (text: string, images: Attachment[], files: FileAttachment[]) => "sent" | "done" | "kept" | false;
};

/** The text is the bot's draft (kept per bot, across restarts), so only this component re-renders while typing. */
export const Composer = memo(function Composer({ botId, busy, onSend, onStop, onSteer, canSteer, placeholder = "Ask Hermes", editing, onCancelEdit, commands, onSlash }: Props) {
  const text = useDraft(botId);
  const images = useAttachments(botId);
  const files = useFileAttachments(botId);
  const [working, setWorking] = useState(false);
  const [menu, setMenu] = useState(false);
  const setText = (t: string) => setDraftText(botId, t);
  const current = useCallback(() => text, [text]);
  const voice = useDictation(botId, current);
  const hasText = text.trim().length > 0;
  // The bot's face looks "listening" while you type to it or dictate (cleared when you leave).
  const [focused, setFocused] = useState(false);
  useEffect(() => { setListening(botId, focused || voice.listening); }, [botId, focused, voice.listening]);
  useEffect(() => () => setListening(botId, false), [botId]);
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
  const clearAll = () => { setText(""); setAttachments(botId, () => []); setFileAttachments(botId, () => []); };
  // A "/command" runs instead of being sent or steered ("//text" sends "/text").
  const slash = (t: string) => {
    const r = onSlash?.(t, images, files);
    if (r === "sent") clearAll(); else if (r === "done") setText("");
    return !!r;
  };
  const query = commands ? pickerQuery(text) : null;
  const picks = query !== null && commands ? filterCommands(commands, query) : [];
  const pick = (c: SlashCommand) => {
    tapHaptic();
    if (c.args && (!c.optional || c.kind === "skill")) setText(`/${c.name} `);
    else slash(`/${c.name}`);
  };
  const press = async () => {
    const typed = text.trim();
    // Send with the picker open and a partial name ("/sta") takes the highlighted first row.
    if (picks.length && !picks.some((c) => c.name === query?.toLowerCase() || c.aliases?.includes(query?.toLowerCase() ?? ""))) return pick(picks[0]);
    if (typed.startsWith("/") && !typed.startsWith("//")) { tapHaptic(); if (slash(typed)) return; }
    if (mode === "stop") return onStop();
    tapHaptic();
    if (mode === "steer") {
      const t = typed.startsWith("//") ? typed.slice(1) : typed; setText("");
      if (!(await onSteer?.(t))) setText(t);
      return;
    }
    if (!canSend) return;
    onSend(typed.startsWith("//") ? typed.slice(1) : typed, images, files); clearAll();
  };

  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6 }}>
      {picks.length ? <SlashPicker items={picks} onPick={pick} /> : null}
      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 }}>
          <Text style={[type.bodySm, { color: colors.accentText, flex: 1 }]}>Editing. Sends as a new message; Hermes keeps the original.</Text>
          <Pressable accessibilityLabel="Cancel editing" hitSlop={8} onPress={onCancelEdit}><X size={16} color={colors.muted} /></Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <Pressable accessibilityLabel="Attach photos or files" accessibilityHint="Opens Photos, Camera and Files" disabled={working} hitSlop={6}
          onPress={() => { tapHaptic(); setMenu(true); }} onLongPress={() => void attach("camera")}
          style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.control : colors.floating, borderWidth: 1, borderColor: colors.border })}>
          {working ? <ActivityIndicator color={colors.muted} /> : <Plus size={24} strokeWidth={2.2} color={colors.text} />}
        </Pressable>
        <View style={{ flex: 1, minHeight: 52, backgroundColor: colors.surface, borderRadius: radii.pill, borderWidth: 1.5,
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
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              multiline style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 17, maxHeight: 140, paddingVertical: 9 }} />
            <Pressable accessibilityLabel={voice.listening ? "Stop voice typing" : "Voice typing"} onPress={voice.toggle} hitSlop={4}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: voice.listening ? colors.controlActive : "transparent" }}>
              <Mic size={20} color={voice.listening ? colors.accentText : colors.muted} />
            </Pressable>
            {busy && mode === "steer" ? (
              <Pressable accessibilityLabel="Stop" onPress={onStop} hitSlop={4} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }}>
                <Square size={14} color={colors.muted} fill={colors.muted} />
              </Pressable>
            ) : null}
            <SendButton mode={mode} ready={mode !== "send" || canSend} onPress={press} />
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


/** The one round action button. Disabled (nothing to send): a quiet grey disc with a dim arrow.
 *  Ready: the white disc. While a reply runs it becomes Stop (or "add to this reply" when you've typed
 *  something). The colour eases between states, the icon pops on each change, and a press dips it. */
function SendButton({ mode, ready, onPress }: { mode: "send" | "steer" | "stop"; ready: boolean; onPress: () => void }) {
  const reduced = useReduceMotion();
  const on = useSharedValue(ready ? 1 : 0), press = useSharedValue(0), pop = useSharedValue(1);
  useEffect(() => { on.value = reduced ? (ready ? 1 : 0) : withTiming(ready ? 1 : 0, { duration: DUR.quick }); }, [ready, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!reduced) pop.value = withSequence(withTiming(0.6, { duration: 1 }), withTiming(1, { duration: DUR.base, easing: Easing.out(Easing.back(2)) }));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const disc = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.controlActive, colors.action]),
    transform: [{ scale: 1 - press.value * 0.12 }],
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fg = ready ? colors.actionForeground : colors.dim;
  const label = mode === "stop" ? "Stop" : mode === "steer" ? "Add to this reply" : "Send";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={onPress} hitSlop={4}
      onPressIn={() => { if (!reduced) press.value = withTiming(1, { duration: DUR.press }); }}
      onPressOut={() => { press.value = reduced ? 0 : withTiming(0, { duration: DUR.quick }); }}>
      <Reanimated.View style={[{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }, disc]}>
        <Reanimated.View style={icon}>
          {mode === "stop" ? <Square size={14} color={fg} fill={fg} />
            : mode === "steer" ? <CornerDownRight size={19} color={fg} />
            : <ArrowUp size={20} color={fg} strokeWidth={2.4} />}
        </Reanimated.View>
      </Reanimated.View>
    </Pressable>
  );
}
