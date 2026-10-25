// Face gallery (not linked from the UI; open hermes://faces). Every shape × a few colours and moods.
import { ScrollView, Text, View } from "react-native";
import { GRADIENTS, PALETTE, SHAPE_LABELS, SHAPES } from "../src/appearance";
import { BotFace, type FaceMood } from "../src/ui/bot-face";
import { colors, type } from "../src/ui/theme";

const COLS: { c: string; c2?: string; mood: FaceMood; label: string }[] = [
  { c: PALETTE[0].a, mood: "idle", label: "Midnight" },
  { c: PALETTE[11].a, mood: "happy", label: "Butter" },
  { c: GRADIENTS[2].a, c2: GRADIENTS[2].b, mood: "thinking", label: "Dusk" },
  { c: PALETTE[9].a, mood: "approval", label: "Mint" },
  { c: PALETTE[4].a, mood: "error", label: "Ember" },
];

export default function Faces() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: 14, paddingTop: 18, gap: 10 }}>
      <View style={{ flexDirection: "row", paddingLeft: 66 }}>
        {COLS.map((c) => <Text key={c.label} style={[type.label, { width: 66, textAlign: "center", fontSize: 11 }]}>{c.label}{"\n"}{c.mood}</Text>)}
      </View>
      {SHAPES.map((sh, r) => (
        <View key={sh} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[type.label, { width: 66, fontSize: 12 }]}>{SHAPE_LABELS[sh]}</Text>
          {COLS.map((c, i) => (
            <View key={i} style={{ width: 66, alignItems: "center", paddingVertical: 6 }}>
              <BotFace seed={`${sh}-${i}`} shape={sh} color={c.c} color2={c.c2} mood={c.mood} size={50} badge={false} eyes={(["auto", "round", "tall", "wide", "dot"] as const)[(r + i) % 5]} />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
