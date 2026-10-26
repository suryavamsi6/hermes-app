// The tool calls Hermes made while writing a reply. One quiet pill in the chat: a status icon,
// "3 steps · terminal, web_search" and a chevron. Tap it, or swipe it right, to open the steps on
// their own page (it slides in from the right). Nothing expands inside the chat, so rows stay short.
import { router } from "expo-router";
import { ChevronRight, CircleCheck, CircleX, LoaderCircle } from "lucide-react-native";
import { useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import type { Step } from "../chat-model";
import { setStepsPage } from "./steps-page";
import { tapHaptic } from "./haptics";
import { Spin } from "./motion";
import { summary } from "./steps-row-summary";
import { colors, type } from "./theme";

function StatusIcon({ status, size = 14 }: { status: Step["status"]; size?: number }) {
  if (status === "running") return <Spin><LoaderCircle size={size} color={colors.accentText} /></Spin>;
  if (status === "failed") return <CircleX size={size} color={colors.danger} />;
  return <CircleCheck size={size} color={colors.success} />;
}

export function StepsRow({ steps, botId, turnId }: { steps: Step[]; botId: string; turnId: string }) {
  const failed = steps.some((s) => s.status === "failed");
  const running = steps.some((s) => s.status === "running");
  const text = summary(steps);
  const open = () => {
    tapHaptic();
    setStepsPage(botId, turnId, steps);
    router.push(`/steps/${encodeURIComponent(botId)}/${encodeURIComponent(turnId)}`);
  };
  const x = useRef(new Animated.Value(0)).current;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dx > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(0, Math.min(64, g.dx))),
    onPanResponderRelease: (_e, g) => {
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      if (g.dx > 48) open();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  return (
    <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
      <Pressable onPress={open} hitSlop={6} accessibilityRole="button"
        accessibilityLabel={`${text}, ${running ? "a tool is running" : failed ? "one failed" : "all done"}`} accessibilityHint="Opens the steps"
        style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 32, paddingLeft: 10, paddingRight: 8,
          borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.control : "transparent" })}>
        <StatusIcon status={running ? "running" : failed ? "failed" : "completed"} size={13} />
        <Text style={[type.label, { color: failed ? colors.danger : colors.textSecondary }]} numberOfLines={1}>{text}</Text>
        <ChevronRight size={14} color={colors.dim} />
      </Pressable>
    </Animated.View>
  );
}
