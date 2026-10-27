// Shared building blocks keep the app's light and dark themes coherent.
import { router } from "expo-router";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react-native";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { doneHaptic, tapHaptic } from "./haptics";
import { toast } from "./toast";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot } from "../backend";
import { BotFace, type FaceMood } from "./bot-face";
import { colors, font, hit, radii, type } from "./theme";

/** A bot's animated face (see bot-face.tsx). Seed = bot id, so personality stays stable on rename. */
export const Avatar = memo(function Avatar({ bot, size = 36, busy = false, mood, animate = true, badge = true, poke }: {
  bot: Pick<Bot, "emoji" | "color" | "color2" | "shape" | "eyes"> & { id?: string; name?: string }; size?: number; busy?: boolean; mood?: FaceMood; animate?: boolean; badge?: boolean; poke?: number;
}) {
  return <BotFace seed={bot.id ?? slug(bot.name ?? "")} color={bot.color} color2={bot.color2} shape={bot.shape} eyes={bot.eyes} emoji={bot.emoji} size={size} mood={mood ?? (busy ? "thinking" : "idle")} animate={animate} badge={badge} poke={poke} />;
});

/** A face you can tap: it reacts (squash, blink, hop) with a light haptic. For big, standalone faces
 *  (bot settings, new bot, empty chat), not list rows, where a tap navigates. */
export function TapFace(props: Omit<Parameters<typeof Avatar>[0], "poke"> & { label?: string }) {
  const [poke, setPoke] = useState(0);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.label ?? `${props.bot.name ?? "Bot"} face`} accessibilityHint="Says hi"
      onPress={() => { tapHaptic(); setPoke((n) => n + 1); }} hitSlop={8}>
      <Avatar {...props} poke={poke} />
    </Pressable>
  );
}
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function Screen({ title, subtitle, right, children, scroll = true }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 58, paddingHorizontal: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={({ pressed }) => ({ width: hit, height: hit, borderRadius: hit / 2, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.control : "transparent" })}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={type.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={type.label} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <Body style={{ flex: 1 }} contentContainerStyle={scroll ? { padding: 16, paddingTop: 18, paddingBottom: insets.bottom + 32, gap: 18 } : undefined} keyboardShouldPersistTaps="handled">
        {children}
      </Body>
    </View>
  );
}

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={[type.label, { paddingHorizontal: 4, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 11 }]}>{title}</Text> : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden", shadowColor: colors.text, shadowOpacity: 0.035, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}>{children}</View>
      {footer ? <Text style={[type.caption, { paddingHorizontal: 4, color: colors.muted }]}>{footer}</Text> : null}
    </View>
  );
}

export function Row({ icon, title, detail, onPress, right, last, danger }: {
  icon?: ReactNode; title: string; detail?: string; onPress?: () => void; right?: ReactNode; last?: boolean; danger?: boolean;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={detail ? `${title}, ${detail}` : title}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: pressed ? colors.control : "transparent", borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong })}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { fontSize: 15, lineHeight: 21 }, danger && { color: colors.danger }]} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={type.label} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.dim} /> : null)}
    </Pressable>
  );
}

/** A switch that answers at once: it flips immediately (with a tick) while the change is saved; if
 *  onChange returns a promise that fails, it flips back and a toast says why. */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void | Promise<unknown>; disabled?: boolean }) {
  const [pending, setPending] = useState<boolean | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { setPending(null); }, [value]);
  useEffect(() => () => clearTimeout(settle.current), []);
  const shown = pending ?? value;
  return <Switch value={shown} disabled={disabled} accessibilityRole="switch" accessibilityState={{ checked: shown, disabled: !!disabled }}
    onValueChange={(v) => {
      tapHaptic(); setPending(v);
      const r = onChange(v);
      const later = () => { clearTimeout(settle.current); settle.current = setTimeout(() => setPending(null), 2500); };
      if (!r || typeof (r as Promise<unknown>).then !== "function") { later(); return; }
      (r as Promise<unknown>).then(
        // Saved: the parent usually reloads right after; drop the local value once it has had time to.
        later,
        (e: any) => { setPending(null); toast(String(e?.message ?? e ?? "Couldn't change that"), "error"); });
    }}
    trackColor={{ true: colors.success, false: colors.controlActive }} thumbColor="#ffffff" />;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.dim} autoCorrect={false} accessibilityLabel={label} {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }} onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[{ backgroundColor: colors.control, color: colors.text, fontFamily: font.regular, fontSize: 15, borderRadius: radii.inset, minHeight: 48,
          borderWidth: 1, borderColor: focused ? colors.muted : colors.border, paddingHorizontal: 14, paddingVertical: 12 }, props.multiline && { minHeight: 96, textAlignVertical: "top" }, props.style]} />
    </View>
  );
}

/** A full-width action. If onPress returns a promise the button shows a spinner while it runs (and
 *  ignores repeat taps); on success it shows `doneLabel` with a check for a moment (plus a success
 *  haptic), and a failure shows a toast. Nothing waits on the animation. */
export function Button({ title, onPress, kind = "primary", disabled, doneLabel }: { title: string; onPress: () => void | Promise<unknown>; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; doneLabel?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  useEffect(() => { if (state !== "done") return; const t = setTimeout(() => setState("idle"), 1600); return () => clearTimeout(t); }, [state]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const bg = kind === "primary" ? colors.action : kind === "danger" ? "rgba(255,96,105,0.14)" : colors.control;
  const fg = kind === "primary" ? colors.actionForeground : kind === "danger" ? colors.danger : colors.text;
  const press = () => {
    if (state === "busy") return;
    if (kind === "primary") tapHaptic();
    const r = onPress();
    if (!r || typeof (r as Promise<unknown>).then !== "function") return;
    setState("busy");
    (r as Promise<unknown>).then(() => {
      if (!alive.current) return;
      if (doneLabel) { doneHaptic(); setState("done"); } else setState("idle");
    }, (e: any) => { if (alive.current) setState("idle"); toast(String(e?.message ?? e ?? "That didn't work"), "error"); });
  };
  const label = state === "done" && doneLabel ? doneLabel : title;
  return (
    <Pressable disabled={disabled} onPress={press} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: state === "busy" }}
      style={({ pressed }) => ({ backgroundColor: bg, borderRadius: radii.chip, minHeight: 48, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed && !disabled ? 0.98 : 1 }] })}>
      {state === "busy" ? <ActivityIndicator size="small" color={fg} /> : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {state === "done" ? <Check size={17} color={kind === "primary" ? colors.actionForeground : colors.success} strokeWidth={2.6} /> : null}
          <Text style={{ fontFamily: font.semibold, fontSize: 15, color: fg }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress && (() => { tapHaptic(); onPress(); })} hitSlop={4} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({ minHeight: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.chip, borderWidth: 1,
      borderColor: selected ? colors.text : colors.borderStrong, backgroundColor: selected ? colors.text : pressed ? colors.control : "transparent" })}>
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
        <Text style={type.bodySm}>{what} needs hermes-bridge on your Hermes server (Hermes's chat API doesn't offer it). Add the bridge key in Settings, or try it in demo mode.</Text>
      </View>
    </View>
  );
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radii.inset,
      backgroundColor: "rgba(255,100,100,0.08)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,100,100,0.35)" }}>
      <AlertCircle size={16} color={colors.danger} style={{ marginTop: 1 }} />
      <Text selectable style={[type.bodySm, { flex: 1, color: colors.danger }]}>{error}</Text>
    </View>
  );
}

export function Empty({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24 }}>
      <View style={{ width: 76, height: 76, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.botBubble, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}>
        <Text style={{ fontSize: 32 }}>{emoji}</Text>
      </View>
      <Text style={type.title}>{title}</Text>
      <Text style={[type.bodySm, { textAlign: "center", color: colors.muted, maxWidth: 280 }]}>{body}</Text>
    </View>
  );
}
