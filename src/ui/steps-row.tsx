// The tool calls Hermes made while writing a reply. Collapsed to one quiet pill: a status icon
// (turning loader while a tool runs, check when all finished, cross if one failed), "3 steps ·
// terminal, web_search" and a chevron. Tap to open the list; tap a step to see its full output.
// Lives inside chat rows: no layout animations (see test/list-rows.test.mjs). Opening fades the list
// in with Rise (shared values) and turns the chevron.
import { ChevronRight, CircleCheck, CircleX, LoaderCircle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { Step } from "../chat-model";
import { toolPhrase } from "./activity";
import { tapHaptic } from "./haptics";
import { Rise, Spin, useToggleProgress } from "./motion";
import { summary } from "./steps-row-summary";
import { colors, font, radii, type } from "./theme";

const STATUS_WORD = { running: "running", completed: "done", failed: "failed" } as const;

function StatusIcon({ status, size = 14 }: { status: Step["status"]; size?: number }) {
  if (status === "running") return <Spin><LoaderCircle size={size} color={colors.accentText} /></Spin>;
  if (status === "failed") return <CircleX size={size} color={colors.danger} />;
  return <CircleCheck size={size} color={colors.success} />;
}

export function StepsRow({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  const failed = steps.some((s) => s.status === "failed");
  const running = steps.some((s) => s.status === "running");
  const overall: Step["status"] = running ? "running" : failed ? "failed" : "completed";
  const p = useToggleProgress(open);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 90}deg` }] }));
  const text = summary(steps);
  return (
    <View style={{ gap: 6, alignSelf: "stretch" }}>
      <Pressable onPress={() => { tapHaptic(); setOpen((o) => !o); }} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${text}, ${running ? "a tool is running" : failed ? "one failed" : "all done"}`} accessibilityHint={open ? "Hide the tool steps" : "Show the tool steps"}
        style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 32, paddingLeft: 10, paddingRight: 8,
          borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.control : "transparent" })}>
        <StatusIcon status={overall} size={13} />
        <Text style={[type.label, { color: failed ? colors.danger : colors.textSecondary }]} numberOfLines={1}>{text}</Text>
        <Animated.View style={chevron}><ChevronRight size={14} color={colors.dim} /></Animated.View>
      </Pressable>
      {open ? (
        <Rise dy={-4} style={{ gap: 2, padding: 6, borderRadius: radii.inset, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          {steps.map((s) => <StepLine key={s.id} step={s} />)}
        </Rise>
      ) : null}
    </View>
  );
}

function StepLine({ step }: { step: Step }) {
  const [full, setFull] = useState(false);
  const output = step.result && step.result !== step.preview ? step.result : undefined;
  const body = full ? [step.preview, output].filter(Boolean).join("\n→ ") : step.preview;
  return (
    <Pressable onPress={() => setFull((f) => !f)} accessibilityRole="button" accessibilityState={{ expanded: full }}
      accessibilityLabel={`${step.tool}, ${STATUS_WORD[step.status]}`} accessibilityHint={full ? "Show less" : "Show the full input and output"}
      style={({ pressed }) => ({ gap: 4, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? colors.control : "transparent" })}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <StatusIcon status={step.status} />
        <Text style={[type.label, { color: colors.text, fontFamily: font.medium, flexShrink: 1 }]} numberOfLines={1}>{toolPhrase(step.tool)}</Text>
        <Text style={[type.caption, { fontFamily: font.mono, marginLeft: "auto" }]} numberOfLines={1}>{step.tool}</Text>
      </View>
      {body ? (
        <Text selectable={full} numberOfLines={full ? undefined : 2} style={[type.caption, { marginLeft: 22, fontFamily: font.mono, color: colors.muted, lineHeight: 17 }]}>{body}</Text>
      ) : null}
      {!full && output ? <Text style={[type.caption, { marginLeft: 22, color: colors.accentText }]}>Show output</Text> : null}
    </Pressable>
  );
}
