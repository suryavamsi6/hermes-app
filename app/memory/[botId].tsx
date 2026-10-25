// Memory. Demo: view/edit MEMORY.md (agent notes) and USER.md (what it knows about you).
// Live (hermes-bridge): which memory provider the bot uses, the providers Hermes found, and how much is
// in the built-in memory files. Hermes's APIs don't return the files' text, so it isn't shown here.
import { useLocalSearchParams } from "expo-router";
import { Brain } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useApp, useBot } from "../../src/app-state";
import type { Memory } from "../../src/backend";
import { useLoad } from "../../src/use-load";
import { Button, ComingSoon, ErrorText, Field, Row, Screen, Section } from "../../src/ui/kit";
import { colors, type } from "../../src/ui/theme";
import { SkeletonRows } from "../../src/ui/motion";

const size = (n: number) => (n === 0 ? "empty" : n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`);

export default function MemoryScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  if (!bot || !backend) return null;
  return backend.getMemoryStatus ? <LiveMemory /> : <EditableMemory />;
}

function LiveMemory() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId)!;
  const { backend } = useApp();
  const st = useLoad(() => backend!.getMemoryStatus!(bot), [bot.id, backend]);
  const home = bot.profile === "default" ? "~/.hermes" : `~/.hermes/profiles/${bot.profile}`;
  return (
    <Screen title="Memory" subtitle={`What ${bot.name} remembers`}>
      {st.comingSoon ? <ComingSoon what="Seeing how memory is set up" /> : null}
      {st.data ? <>
        <Section title="Built-in memory" footer={`Hermes doesn't share the text of these files over its APIs. They live in ${home}/memories/ on the server.`}>
          <Row icon={<Brain size={18} color={colors.muted} />} title="About you (USER.md)" detail={size(st.data.files.user)} />
          <Row icon={<Brain size={18} color={colors.muted} />} title={`${bot.name}'s notes (MEMORY.md)`} detail={size(st.data.files.memory)} last />
        </Section>
        <Section title="Memory provider" footer={`An extra provider adds long-term memory on top of the built-in files. Choose one on the server with: hermes${bot.profile === "default" ? "" : ` -p ${bot.profile}`} memory setup`}>
          <Row title={st.data.active || "Built-in only"} detail="In use" last={!st.data.providers.length} />
          {st.data.providers.map((p, i, all) => (
            <Row key={p.name} title={p.name} last={i === all.length - 1}
              detail={`${p.status ?? (p.configured ? "configured" : p.available ? "available" : "not installed")}${p.description ? ` · ${p.description}` : ""}`} />
          ))}
        </Section>
      </> : null}
      {st.loading && !st.data ? <SkeletonRows /> : null}
      <ErrorText error={st.error} />
    </Screen>
  );
}

function EditableMemory() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId)!;
  const { backend } = useApp();
  const mem = useLoad(() => backend!.getMemory(bot), [bot.id, backend]);
  const [draft, setDraft] = useState<Memory>({ memory: "", user: "" });
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (mem.data) setDraft(mem.data); }, [mem.data]);
  return (
    <Screen title="Memory" subtitle={`What ${bot.name} remembers`}>
      {mem.comingSoon ? <ComingSoon what="Viewing memory" /> : (
        <View style={{ gap: 14 }}>
          <Field label="About you (USER.md)" multiline value={draft.user} onChangeText={(user) => setDraft({ ...draft, user })} />
          <Field label={`${bot.name}'s notes (MEMORY.md)`} multiline value={draft.memory} onChangeText={(memory) => setDraft({ ...draft, memory })} style={{ minHeight: 160 }} />
          <Button title={saved ? "Saved ✓" : "Save memory"} onPress={async () => { await backend!.setMemory(bot, draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }} />
        </View>
      )}
      <ErrorText error={mem.error} />
    </Screen>
  );
}
