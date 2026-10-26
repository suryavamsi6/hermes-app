// One reply's tool steps, off to the side of the chat. Opens from the steps pill (tap or swipe
// right) and slides in from the right, so the chat itself stays a list of messages.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Step } from "../../../src/chat-model";
import { useChat } from "../../../src/app-state";
import { toolPhrase } from "../../../src/ui/activity";
import { useStepsPage } from "../../../src/ui/steps-page";
import { Empty, Screen } from "../../../src/ui/kit";
import { colors, font, radii, type } from "../../../src/ui/theme";

const WORD = { running: "running", completed: "done", failed: "failed" } as const;
const DOT = { running: colors.accentText, completed: colors.success, failed: colors.danger } as const;

export default function StepsScreen() {
  const { botId, turnId } = useLocalSearchParams<{ botId: string; turnId: string }>();
  const id = String(turnId ?? "");
  const live = useChat(String(botId ?? "")).turns.find((t) => t.id === id && t.role === "assistant");
  const open = useStepsPage(String(botId ?? ""), id);
  const steps = (live && "steps" in live && live.steps.length ? live.steps : open?.steps) ?? [];
  const failed = steps.filter((s) => s.status === "failed").length;
  return (
    <Screen title="Steps" subtitle={steps.length ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}${failed ? ` · ${failed} failed` : ""}` : "This reply"}>
      {steps.length ? steps.map((s) => <StepCard key={s.id} step={s} />) : (
        <Empty emoji="🛠️" title="No steps here" body="Open this from a reply's steps pill. If the reply is still running, they'll appear as it works." />
      )}
    </Screen>
  );
}

function StepCard({ step }: { step: Step }) {
  const [full, setFull] = useState(false);
  const output = step.result && step.result !== step.preview ? step.result : undefined;
  return (
    <Pressable onPress={() => setFull((f) => !f)} accessibilityRole="button" accessibilityState={{ expanded: full }}
      accessibilityLabel={`${toolPhrase(step.tool)}, ${WORD[step.status]}`} accessibilityHint={full ? "Show less" : "Show the full input and output"}
      style={({ pressed }) => ({ gap: 8, padding: 14, borderRadius: radii.card, backgroundColor: pressed ? colors.control : colors.surface, borderWidth: 1, borderColor: colors.border })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DOT[step.status] }} />
        <Text style={[type.body, { flex: 1, fontFamily: font.medium }]}>{toolPhrase(step.tool)}</Text>
        <Text style={[type.caption, { color: DOT[step.status] }]}>{WORD[step.status]}</Text>
      </View>
      <Text style={[type.caption, { fontFamily: font.mono, color: colors.dim }]}>{step.tool}</Text>
      {step.preview ? <Text selectable={full} numberOfLines={full ? undefined : 4} style={[type.bodySm, { fontFamily: font.mono, color: colors.muted, lineHeight: 20 }]}>{step.preview}</Text> : null}
      {full && output ? <Text selectable style={[type.bodySm, { fontFamily: font.mono, color: colors.text, lineHeight: 20 }]}>{output}</Text> : null}
      {!full && output ? <Text style={[type.label, { color: colors.accentText }]}>Show output</Text> : null}
    </Pressable>
  );
}
