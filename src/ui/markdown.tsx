// Native rendering of a parsed reply (see ../md.ts). Text stays selectable; links open in the browser;
// code and wide tables scroll sideways. `highlight` marks matches of a chat search.
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Check, Copy } from "lucide-react-native";
import { Fragment, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { tapHaptic } from "./haptics";
import { parse, type Block, type Inline } from "../md";
import { clipLong, hideOpenTail, safeHref, tidyText } from "../text-safety";
import { colors, font, radii, type } from "./theme";

type Ctx = { highlight?: string };

function marked(s: string, key: string, ctx: Ctx): ReactNode {
  const q = ctx.highlight?.trim().toLowerCase();
  if (!q) return s;
  const parts: ReactNode[] = [];
  const low = s.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, i + q.length)) {
    if (i > at) parts.push(s.slice(at, i));
    parts.push(<Text key={`${key}h${i}`} style={{ backgroundColor: colors.warning, color: colors.actionForeground }}>{s.slice(i, i + q.length)}</Text>);
    at = i + q.length;
  }
  if (!parts.length) return s;
  parts.push(s.slice(at));
  return parts;
}

function runs(nodes: Inline[], key: string, ctx: Ctx): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.k) {
      case "text": return <Fragment key={k}>{marked(n.s, k, ctx)}</Fragment>;
      case "code": return <Text key={k} style={{ fontFamily: font.mono, fontSize: 14, color: colors.text, backgroundColor: colors.control }}>{` ${n.s} `}</Text>;
      case "b": return <Text key={k} style={{ fontFamily: font.semibold }}>{runs(n.c, k, ctx)}</Text>;
      case "i": return <Text key={k} style={{ fontStyle: "italic" }}>{runs(n.c, k, ctx)}</Text>;
      case "s": return <Text key={k} style={{ textDecorationLine: "line-through", color: colors.muted }}>{runs(n.c, k, ctx)}</Text>;
      case "link": {
        const href = safeHref(n.href);
        if (!href) return <Text key={k}>{runs(n.c, k, ctx)}</Text>; // unsafe scheme: plain text, not tappable
        return <Text key={k} style={{ color: colors.accentText, textDecorationLine: "underline" }} onPress={() => void Linking.openURL(href).catch(() => {})}>{runs(n.c, k, ctx)}</Text>;
      }
    }
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  return (
    <View style={{ borderRadius: radii.inset, backgroundColor: colors.control, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 12, paddingRight: 4, minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Text style={[type.caption, { fontFamily: font.mono }]}>{lang || "code"}</Text>
        <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel={copied ? "Copied" : "Copy code"}
          onPress={() => { void Clipboard.setStringAsync(code); tapHaptic(); setCopied(true); }}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: pressed ? colors.controlActive : "transparent" })}>
          {copied ? <Check size={13} color={colors.success} /> : <Copy size={13} color={colors.muted} />}
          <Text style={[type.label, { color: copied ? colors.success : colors.muted }]}>{copied ? "Copied" : "Copy"}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal nestedScrollEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingTop: 10 }}>
        <Text selectable style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: colors.text }}>{code}</Text>
      </ScrollView>
    </View>
  );
}

function render(b: Block, key: string, ctx: Ctx): ReactNode {
  switch (b.k) {
    case "p": return <Text key={key} selectable style={type.chat}>{runs(b.c, key, ctx)}</Text>;
    case "h": return <Text key={key} selectable style={[type.h, b.level >= 3 && { fontSize: 17, lineHeight: 24 }]}>{runs(b.c, key, ctx)}</Text>;
    case "code": return <CodeBlock key={key} lang={b.lang} code={b.s} />;
    case "hr": return <View key={key} style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />;
    case "quote":
      return (
        <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: 12, gap: 8 }}>
          {b.c.map((c, i) => render(c, `${key}.${i}`, ctx))}
        </View>
      );
    case "list":
      return (
        <View key={key} style={{ gap: 6 }}>
          {b.items.map((item, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={[type.chat, { color: colors.muted, minWidth: b.ordered ? 22 : 12 }]}>{b.ordered ? `${b.start + i}.` : "•"}</Text>
              <View style={{ flex: 1, gap: 6 }}>{item.map((c, j) => render(c, `${key}.${i}.${j}`, ctx))}</View>
            </View>
          ))}
        </View>
      );
    case "table": {
      const cell = (c: Inline[], j: number, head: boolean, k: string) => (
        <View key={j} style={{ minWidth: 96, maxWidth: 260, paddingHorizontal: 10, paddingVertical: 7, borderRightWidth: j < b.head.length - 1 ? 1 : 0, borderColor: colors.border }}>
          <Text selectable style={[type.body, { textAlign: b.align[j] ?? "left" }, head && { fontFamily: font.semibold }]}>{runs(c, k, ctx)}</Text>
        </View>
      );
      return (
        <ScrollView key={key} horizontal nestedScrollEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator={false}>
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.inset, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", backgroundColor: colors.control }}>{b.head.map((c, j) => cell(c, j, true, `${key}.h${j}`))}</View>
            {b.rows.map((r, i) => (
              <View key={i} style={{ flexDirection: "row", borderTopWidth: 1, borderColor: colors.border }}>
                {b.head.map((_, j) => cell(r[j] ?? [], j, false, `${key}.${i}.${j}`))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
  }
}

export const Markdown = memo(function Markdown({ text, highlight, streaming }: { text: string; highlight?: string; streaming?: boolean }) {
  const [all, setAll] = useState(false);
  const tidy = useMemo(() => (streaming ? hideOpenTail(tidyText(text)) : tidyText(text)), [text, streaming]);
  const shown = useMemo(() => (all || highlight ? { text: tidy, clipped: false } : clipLong(tidy)), [tidy, all, highlight]);
  const tree = useMemo(() => parse(shown.text), [shown.text]);
  const ctx = { highlight };
  return (
    <View style={{ gap: 10 }}>
      {tree.map((b, i) => render(b, String(i), ctx))}
      {shown.clipped ? (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.label, { color: colors.accentText }]}>Show the rest ({Math.round((tidy.length - shown.text.length) / 1000)}k more characters)</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/** Plain text with search matches marked (user bubbles; replies use Markdown's own highlight). */
export function MarkedText({ text, highlight }: { text: string; highlight?: string }) {
  return <Text style={type.chat}>{marked(text, "m", { highlight })}</Text>;
}
