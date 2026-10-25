// The tool calls Hermes made while writing a reply. Collapsed to one summary line ("3 steps · terminal,
// web_search"); tapping opens the list, and tapping a step shows its full output.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Step } from "../chat-model";
import { summary } from "./steps-row-summary";
import { colors, font, type } from "./theme";

const mark = { running: "◌", completed: "✓", failed: "✕" } as const;
const tint = { running: colors.muted, completed: colors.success, failed: colors.danger } as const;

export function StepsRow({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  const failed = steps.some((s) => s.status === "failed");
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[type.label, failed && { color: colors.danger }]}>{summary(steps)}</Text>
        <Text style={[type.label, { color: colors.dim }]}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open ? <View style={{ gap: 4, paddingLeft: 2 }}>{steps.map((s) => <StepLine key={s.id} step={s} />)}</View> : null}
    </View>
  );
}

function StepLine({ step }: { step: Step }) {
  const [full, setFull] = useState(false);
  const body = full ? step.result || step.preview : step.preview;
  return (
    <Pressable onPress={() => setFull((f) => !f)} style={{ gap: 2, paddingVertical: 3 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={{ width: 14, textAlign: "center", color: tint[step.status], fontFamily: font.semibold, fontSize: 12 }}>{mark[step.status]}</Text>
        <Text style={[type.label, { color: colors.textSecondary }]}>{step.tool}</Text>
      </View>
      {body ? (
        <Text selectable={full} numberOfLines={full ? undefined : 2} style={[type.label, { marginLeft: 22, fontFamily: font.mono, color: colors.dim }]}>{body}</Text>
      ) : null}
    </Pressable>
  );
}
