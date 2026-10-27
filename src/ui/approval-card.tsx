// Shown inside a reply when Hermes pauses a run to ask before running a command.
// The user allows it once or denies it; the answer goes back to Hermes, which resumes the run. The
// card only goes away once Hermes has accepted the answer (approve() clears it after the request
// succeeds); until then the pressed choice shows a spinner and the others are disabled, and a failed
// answer keeps the card with the error so you can try again. Nothing here claims the command ran.
import { ShieldQuestion } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Approval, ApprovalChoice } from "../chat-model";
import { tapHaptic } from "./haptics";
import { colors, font, radii, type } from "./theme";

type Choice = ApprovalChoice;

/** Shows exactly what will run (the full command or target), then Deny / Edit / Allow once, plus
 *  "Allow for this chat" and "Always allow" (Hermes adds it to the allowlist). Edit denies the call and
 *  puts the command in the composer so you can say what to do instead. */
export function ApprovalCard({ approval, respond, onEdit }: { approval: Approval; respond: (c: Choice) => Promise<void>; onEdit?: (detail: string) => void }) {
  const [sending, setSending] = useState<Choice | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const answer = async (c: Choice) => {
    if (sending) return;
    tapHaptic();
    setSending(c);
    setFailed(null);
    try { await respond(c); } catch (e) { setFailed(e instanceof Error ? e.message : String(e)); }
    finally { setSending(null); }
  };
  const busy = sending !== null;

  return (
    <View accessibilityRole="alert" style={{ marginTop: 4, padding: 16, gap: 12, borderRadius: radii.card, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.warning, shadowColor: colors.warning, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(245,183,41,0.14)" }}>
          <ShieldQuestion size={15} color={colors.warning} />
        </View>
        <Text style={[type.label, { color: colors.warning, letterSpacing: 0.5, fontFamily: font.semibold }]}>NEEDS YOUR OK</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={type.title}>{approval.title}</Text>
        <Text style={type.bodySm}>The run is paused. Nothing happens until you choose.</Text>
      </View>
      {approval.detail ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.inset, backgroundColor: colors.control }}>
          <Text selectable style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: colors.text }}>{approval.detail}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <ChoiceButton label="Deny" busy={sending === "deny"} disabled={busy} onPress={() => answer("deny")} />
        {onEdit ? <ChoiceButton label="Edit" busy={false} disabled={busy} onPress={() => { void answer("deny"); onEdit(approval.detail ?? approval.title); }} /> : null}
        <ChoiceButton label="Allow once" primary busy={sending === "once"} disabled={busy} onPress={() => answer("once")} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
        <LinkChoice label="Allow for this chat" busy={sending === "session"} disabled={busy} onPress={() => answer("session")} />
        <LinkChoice label="Always allow" busy={sending === "always"} disabled={busy} onPress={() => answer("always")} />
      </View>
      {failed ? <Text accessibilityLiveRegion="polite" style={[type.bodySm, { color: colors.danger }]}>Hermes didn't get that answer: {failed}. The run is still waiting; try again.</Text> : null}
    </View>
  );
}

function ChoiceButton({ label, primary, busy, disabled, onPress }: { label: string; primary?: boolean; busy: boolean; disabled: boolean; onPress: () => void }) {
  const fg = primary ? colors.actionForeground : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.chip,
        opacity: disabled && !busy ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
        backgroundColor: primary ? (pressed ? "#d9d9de" : colors.action) : pressed ? colors.controlActive : colors.control })}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: fg }}>{label}</Text>}
    </Pressable>
  );
}

function LinkChoice({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, justifyContent: "center", borderRadius: 999, opacity: disabled && !busy ? 0.45 : 1, backgroundColor: pressed ? colors.control : "transparent" })}>
      {busy ? <ActivityIndicator size="small" color={colors.accentText} /> : <Text style={[type.label, { color: colors.accentText }]}>{label}</Text>}
    </Pressable>
  );
}
