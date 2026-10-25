// Searchable model picker: "Profile default" first, then the models of the providers Hermes has
// credentials for (GET /api/model/options?include_unconfigured=false), grouped by provider.
import { Check, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { ModelOption } from "../backend";
import { groupModels } from "./model-groups";
import { colors, type } from "./theme";

export function ModelPicker({ models, loading, error, selected, selectedProvider, onPick, footer, maxHeight = 420, initialQuery = "" }: {
  models?: ModelOption[] | null; loading?: boolean; error?: string | null; selected?: string; selectedProvider?: string;
  onPick: (id: string | undefined, provider?: string) => void; footer?: string; maxHeight?: number; initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const groups = useMemo(() => groupModels(models ?? [], query), [models, query]);
  const isSel = (m: ModelOption) => selected === m.id && (!selectedProvider || !m.provider || selectedProvider === m.provider);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.canvas }}>
        <Search size={16} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search models" placeholderTextColor={colors.muted} accessibilityLabel="Search models"
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, fontFamily: type.body.fontFamily, fontSize: 15, paddingVertical: 0 }} />
      </View>
      <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {!query ? <PickRow label="Profile default" detail="Whatever this Hermes profile is set to" on={!selected} onPress={() => onPick(undefined)} /> : null}
        {groups.map((g) => (
          <View key={g.provider}>
            <Text style={[type.label, { fontSize: 12, color: colors.dim, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, textTransform: "uppercase" }]}>{g.title}</Text>
            {g.models.map((m) => <PickRow key={`${m.provider}/${m.id}`} label={m.id} on={isSel(m)} onPress={() => onPick(m.id, m.provider)} />)}
          </View>
        ))}
        {!loading && !error && models && !groups.length ? <Text style={[type.label, { paddingHorizontal: 20, paddingVertical: 12 }]}>No models match "{query}".</Text> : null}
      </ScrollView>
      <Text style={[type.label, { color: error ? colors.danger : colors.dim, paddingHorizontal: 20, paddingBottom: 8 }]}>
        {loading ? "Loading models…" : error ? error : footer ?? ""}
      </Text>
    </View>
  );
}

function PickRow({ label, detail, on, onPress }: { label: string; detail?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: pressed ? colors.controlActive : "transparent" })}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[type.body, { color: on ? colors.text : colors.textSecondary }]}>{label}</Text>
        {detail ? <Text style={[type.label, { fontSize: 12, color: colors.dim }]}>{detail}</Text> : null}
      </View>
      {on ? <Check size={18} color={colors.accentText} /> : null}
    </Pressable>
  );
}
