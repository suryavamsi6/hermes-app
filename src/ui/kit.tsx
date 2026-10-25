// Small shared building blocks so every screen keeps the same dark, rounded look.
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react-native";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot } from "../backend";
import { BotFace, type FaceMood } from "./bot-face";
import { colors, font, radii, type } from "./theme";

/** A bot's animated face (see bot-face.tsx). Seed = bot id, so personality stays stable on rename. */
export const Avatar = memo(function Avatar({ bot, size = 36, busy = false, mood, animate = true, badge = true }: {
  bot: Pick<Bot, "emoji" | "color" | "color2" | "shape" | "eyes"> & { id?: string; name?: string }; size?: number; busy?: boolean; mood?: FaceMood; animate?: boolean; badge?: boolean;
}) {
  return <BotFace seed={bot.id ?? slug(bot.name ?? "")} color={bot.color} color2={bot.color2} shape={bot.shape} eyes={bot.eyes} emoji={bot.emoji} size={size} mood={mood ?? (busy ? "thinking" : "idle")} animate={animate} badge={badge} />;
});
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Three bouncing dots, shown while a bot is thinking. */
export function TypingDots() {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const anims = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 140), Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }), Animated.delay((2 - i) * 140),
    ])));
    anims.forEach((a) => a.start()); return () => anims.forEach((a) => a.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingVertical: 6 }}>
      {dots.map((d, i) => <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted, opacity: d }} />)}
    </View>
  );
}

export function Screen({ title, subtitle, right, children, scroll = true }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 52, paddingHorizontal: 8, gap: 4 }}>
        <Pressable hitSlop={10} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ padding: 6 }}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={type.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={type.label} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <Body style={{ flex: 1 }} contentContainerStyle={scroll ? { padding: 16, paddingBottom: insets.bottom + 32, gap: 16 } : undefined} keyboardShouldPersistTaps="handled">
        {children}
      </Body>
    </View>
  );
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={[type.label, { paddingHorizontal: 4, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 11 }]}>{title}</Text> : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>{children}</View>
      {footer ? <Text style={[type.label, { paddingHorizontal: 4 }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({ icon, title, detail, onPress, right, last, danger }: {
  icon?: ReactNode; title: string; detail?: string; onPress?: () => void; right?: ReactNode; last?: boolean; danger?: boolean;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: pressed ? colors.control : "transparent", borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border })}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { fontSize: 15, lineHeight: 21 }, danger && { color: colors.danger }]} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={type.label} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.dim} /> : null)}
    </Pressable>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.success, false: colors.controlActive }} thumbColor="#ffffff" />;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.dim} autoCorrect={false} {...props}
        style={[{ backgroundColor: colors.control, color: colors.text, fontFamily: font.regular, fontSize: 15, borderRadius: radii.inset,
          borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }, props.multiline && { minHeight: 96, textAlignVertical: "top" }, props.style]} />
    </View>
  );
}

export function Button({ title, onPress, kind = "primary", disabled }: { title: string; onPress: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean }) {
  const bg = kind === "primary" ? colors.action : kind === "danger" ? "rgba(255,96,105,0.14)" : colors.control;
  const fg = kind === "primary" ? colors.actionForeground : kind === "danger" ? colors.danger : colors.text;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => ({ backgroundColor: bg, borderRadius: radii.chip, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
      <Text style={{ fontFamily: font.semibold, fontSize: 15, color: fg }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.chip, borderWidth: 1,
      borderColor: selected ? colors.text : colors.borderStrong, backgroundColor: selected ? colors.text : "transparent" }}>
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: selected ? colors.canvas : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

/** Shown in live mode for features that need the planned companion service. */
export function ComingSoon({ what }: { what: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 14, borderRadius: radii.card, backgroundColor: "rgba(122,184,255,0.08)", borderWidth: 1, borderColor: "rgba(122,184,255,0.25)" }}>
      <Sparkles size={18} color={colors.accentText} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.body, { fontFamily: font.semibold, fontSize: 15 }]}>Needs hermes-bridge</Text>
        <Text style={type.bodySm}>{what} needs hermes-bridge on your homelab (Hermes's chat API doesn't offer it). Add the bridge key in Settings, or try it in demo mode.</Text>
      </View>
    </View>
  );
}

export function ErrorText({ error }: { error?: string | null }) {
  return error ? <Text style={[type.label, { color: colors.danger }]}>{error}</Text> : null;
}

export function Empty({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 32 }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text style={type.title}>{title}</Text>
      <Text style={[type.bodySm, { textAlign: "center", color: colors.muted, maxWidth: 280 }]}>{body}</Text>
    </View>
  );
}
