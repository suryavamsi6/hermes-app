// Grok-style composer: a round "+" on the left, then an "Ask <bot>" pill that grows with text, with a mic
// and a round white button on the right. The white button is voice (placeholder) when empty, send when
// there is text, and stop while a reply is running.
import { ArrowUp, AudioLines, Mic, Plus, Square } from "lucide-react-native";
import { memo } from "react";
import { Pressable, TextInput, View } from "react-native";
import { setDraftText, useDraft } from "../app-state";
import { tapHaptic } from "./haptics";
import { colors, font, radii } from "./theme";

type Props = { botId: string; busy: boolean; onSend: (t: string) => void; onStop: () => void; onPlus?: () => void; placeholder?: string };

/** The text is the bot's draft (kept per bot, across restarts), so only this component re-renders while typing. */
export const Composer = memo(function Composer({ botId, busy, onSend, onStop, onPlus, placeholder = "Ask Hermes" }: Props) {
  const text = useDraft(botId);
  const setText = (t: string) => setDraftText(botId, t);
  const hasText = text.trim().length > 0;
  const mode = busy ? "stop" : hasText ? "send" : "voice";
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingBottom: 8 }}>
      <Pressable accessibilityLabel="Bot options" onPress={onPlus} hitSlop={6}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
        <Plus size={24} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", minHeight: 48, backgroundColor: colors.floating,
        borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingLeft: 18, paddingRight: 5, paddingVertical: 4 }}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={placeholder}
          multiline style={{ flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 17, maxHeight: 140, paddingVertical: 9 }} />
        {mode === "voice" ? (
          <View accessibilityLabel="Dictation (coming soon)" style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center", opacity: 0.6 }}>
            <Mic size={20} color={colors.muted} />
          </View>
        ) : null}
        <Pressable accessibilityLabel={mode === "stop" ? "Stop" : mode === "send" ? "Send" : "Voice chat (coming soon)"} disabled={mode === "voice"}
          onPress={() => { if (mode === "stop") return onStop(); tapHaptic(); onSend(text.trim()); setText(""); }}
          style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.action }}>
          {mode === "stop" ? <Square size={14} color={colors.actionForeground} fill={colors.actionForeground} />
            : mode === "send" ? <ArrowUp size={20} color={colors.actionForeground} />
            : <AudioLines size={20} color={colors.actionForeground} />}
        </Pressable>
      </View>
    </View>
  );
});
