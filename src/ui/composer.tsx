// Composer: a round "+" (photos, camera, bot settings), then an "Ask <bot>" pill with the photo strip,
// a dictation mic and one round action button: send when idle; while a reply is running it's
// "add to this reply" (steer) if you typed something, else stop.
import { ArrowUp, Blocks, CornerDownRight, Image as ImageIcon, Mic, Square, X } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { setDraftText, useDraft } from "../app-state";
import { type Attachment, MAX_ATTACHMENTS, pickImages, setAttachments, useAttachments } from "../attach";
import { useDictation } from "./dictation";
import { tapHaptic } from "./haptics";
import Reanimated from "react-native-reanimated";
import { enter, PressScale } from "./motion";
import { colors, font, radii, type } from "./theme";

type Props = {
  botId: string; busy: boolean;
  onSend: (t: string, images: Attachment[]) => void;
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
  const [working, setWorking] = useState(false);
  const setText = (t: string) => setDraftText(botId, t);
  const current = useCallback(() => text, [text]);
  const voice = useDictation(botId, current);
  const hasText = text.trim().length > 0;
  const mode = busy ? (hasText && canSteer ? "steer" : "stop") : "send";
  const canSend = hasText || images.length > 0;

  const attach = async (from: "library" | "camera") => {
    try {
      setWorking(true);
      const got = await pickImages(from, MAX_ATTACHMENTS - images.length);
      if (got.length) setAttachments(botId, (a) => [...a, ...got]);
    } catch (e: any) { Alert.alert("Couldn't add the photo", String(e?.message ?? e)); }
    finally { setWorking(false); }
  };
  const press = async () => {
    if (mode === "stop") return onStop();
    tapHaptic();
    if (mode === "steer") {
      const t = text.trim(); setText("");
      if (!(await onSteer?.(t))) setText(t);
      return;
    }
    if (!canSend) return;
    onSend(text.trim(), images); setText(""); setAttachments(botId, () => []);
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
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6, paddingBottom: 2 }}>
              {images.map((a, i) => (
                <View key={a.uri + i}>
                  <Image source={{ uri: a.uri }} style={{ width: 56, height: 56, borderRadius: radii.inset, backgroundColor: colors.control }} />
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
            <Pressable accessibilityLabel="Add a photo (long-press for the camera)" disabled={images.length >= MAX_ATTACHMENTS || working} hitSlop={4}
              onPress={() => void attach("library")} onLongPress={() => void attach("camera")}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", opacity: images.length >= MAX_ATTACHMENTS ? 0.4 : 1 }}>
              {working ? <ActivityIndicator color={colors.muted} /> : <ImageIcon size={20} color={colors.muted} />}
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
    </View>
  );
});

