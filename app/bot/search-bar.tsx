export function SearchBar({ query, setQuery, position, onNext, onPrev, onClose }: { query: string; setQuery: (q: string) => void; position: [number, number]; onNext: () => void; onPrev: () => void; onClose: () => void }) {
  const circle = { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.control } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 8 }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.floating, borderWidth: 1, borderColor: colors.border }}>
        <Search size={16} color={colors.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search this chat" placeholderTextColor={colors.muted} accessibilityLabel="Search this chat" returnKeyType="search" style={{ flex: 1, color: colors.text, fontFamily: type.chat.fontFamily, fontSize: 15, paddingVertical: 0 }} />
        {query ? <Text style={[type.label, { color: colors.muted }]}>{position[0]}/{position[1]}</Text> : null}
      </View>
      {query ? <>
        <Pressable hitSlop={6} accessibilityLabel="Previous match" onPress={onPrev} style={circle}><ChevronUp size={18} color={colors.text} /></Pressable>
        <Pressable hitSlop={6} accessibilityLabel="Next match" onPress={onNext} style={circle}><ChevronDown size={18} color={colors.text} /></Pressable>
      </> : null}
      <Pressable hitSlop={6} accessibilityLabel="Close search" onPress={onClose} style={circle}><X size={18} color={colors.text} /></Pressable>
    </View>
  );
}
export { default } from "./screen";
