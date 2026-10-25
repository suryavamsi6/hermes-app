// Face gallery (not linked from Home's list; open it from the grid menu or hermes://faces). Every
// expression with a live face (tap one to see its reaction), then every shape × a few colours.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { GRADIENTS, PALETTE, SHAPE_LABELS, SHAPES } from "../src/appearance";
import { BotFace } from "../src/ui/bot-face";
import { FACE_MOODS, type FaceMood } from "../src/ui/face-state";
import { tapHaptic } from "../src/ui/haptics";
import { Screen, Section } from "../src/ui/kit";
import { colors, type } from "../src/ui/theme";

const COLS: { c: string; c2?: string; mood: FaceMood; label: string }[] = [
  { c: PALETTE[0].a, mood: "idle", label: "Midnight" },
  { c: PALETTE[11].a, mood: "success", label: "Butter" },
  { c: GRADIENTS[2].a, c2: GRADIENTS[2].b, mood: "thinking", label: "Dusk" },
  { c: PALETTE[9].a, mood: "waiting", label: "Mint" },
  { c: PALETTE[4].a, mood: "error", label: "Ember" },
];

function Expression({ mood, i }: { mood: FaceMood; i: number }) {
  const [poke, setPoke] = useState(0);
  return (
    <Pressable onPress={() => { tapHaptic(); setPoke((n) => n + 1); }} accessibilityRole="button" accessibilityLabel={`${mood} face`}
      style={({ pressed }) => ({ width: "25%", alignItems: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? colors.control : "transparent" })}>
      <BotFace seed={`expr-${i}`} color={GRADIENTS[2].a} color2={GRADIENTS[2].b} shape="squircle" mood={mood} size={56} badge={false} poke={poke} />
      <Text style={[type.label, { textTransform: "capitalize" }]}>{mood}</Text>
    </Pressable>
  );
}

export default function Faces() {
  return (
    <Screen title="Faces & colours" subtitle="Tap a face to say hi">
      <Section title="Expressions" footer="Faces only change with what a bot is really doing: listening while you type, thinking and working during a run, waiting for your OK, a short hop when a reply lands, and a concerned look when something failed.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 8 }}>
          {FACE_MOODS.map((m, i) => <Expression key={m} mood={m} i={i} />)}
        </View>
      </Section>
      <Section title="Shapes">
        <View style={{ padding: 10, gap: 4 }}>
          <View style={{ flexDirection: "row", paddingLeft: 62 }}>
            {COLS.map((c) => <Text key={c.label} style={[type.caption, { flex: 1, textAlign: "center" }]}>{c.label}</Text>)}
          </View>
          {SHAPES.map((sh, r) => (
            <View key={sh} style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.label, { width: 62 }]}>{SHAPE_LABELS[sh]}</Text>
              {COLS.map((c, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
                  <BotFace seed={`${sh}-${i}`} shape={sh} color={c.c} color2={c.c2} mood={c.mood} size={44} badge={false} eyes={(["auto", "round", "tall", "wide", "dot"] as const)[(r + i) % 5]} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}
