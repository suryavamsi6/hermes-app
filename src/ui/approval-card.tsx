// Shown inside a reply when Hermes pauses a run to ask before running a command.
// The user allows it once or denies it; the answer goes back to Hermes, which resumes the run.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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

  return (
    <View style={{ marginTop: 10, padding: 14, gap: 10, borderRadius: radii.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning }}>
      <Text style={[type.label, { color: colors.warning, letterSpacing: 0.4 }]}>NEEDS YOUR OK</Text>
      <Text style={type.title}>{approval.title}</Text>
      {approval.detail ? (
        <View style={{ padding: 10, borderRadius: radii.inset, backgroundColor: colors.control }}>
          <Text selectable style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: colors.textSecondary }}>{approval.detail}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Choice label="Deny" busy={sending === "deny"} onPress={() => answer("deny")} />
        {onEdit ? <Choice label="Edit" busy={false} onPress={() => { void answer("deny"); onEdit(approval.detail ?? approval.title); }} /> : null}
        <Choice label="Allow once" primary busy={sending === "once"} onPress={() => answer("once")} />
      </View>
      <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
        <Pressable hitSlop={6} onPress={() => answer("session")}><Text style={[type.label, { color: colors.accentText }]}>{sending === "session" ? "…" : "Allow for this chat"}</Text></Pressable>
        <Pressable hitSlop={6} onPress={() => answer("always")}><Text style={[type.label, { color: colors.accentText }]}>{sending === "always" ? "…" : "Always allow"}</Text></Pressable>
      </View>
      {failed ? <Text style={[type.bodySm, { color: colors.danger }]}>{failed}</Text> : null}
    </View>
  );
}

function Choice({ label, primary, busy, onPress }: { label: string; primary?: boolean; busy: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({
      flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radii.chip, opacity: pressed || busy ? 0.6 : 1,
      backgroundColor: primary ? colors.action : colors.control,
    })}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: primary ? colors.actionForeground : colors.text }}>{busy ? "…" : label}</Text>
    </Pressable>
  );
}
