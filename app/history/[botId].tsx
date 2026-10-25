// Topics & sessions for a bot: the Bot Chat (main), side topics and routine runs. Topics are Hermes
// sessions of the same profile, so they share its memory. New / rename / archive use
// POST and PATCH /api/sessions. Chatting inside a topic from the phone is not wired up yet.
import { useLocalSearchParams } from "expo-router";
import { Archive, MessageSquare } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useApp, useBot } from "../../src/app-state";
import { BOT_CHAT_TITLE } from "../../src/backend";
import { useLoad } from "../../src/use-load";
import { Button, Empty, ErrorText, Field, Row, Screen, Section } from "../../src/ui/kit";
import { SkeletonRows } from "../../src/ui/motion";
import { colors } from "../../src/ui/theme";

export default function HistoryScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const sessions = useLoad(bot && backend && !bot.needsKey ? () => backend.listSessions(bot) : null, [bot?.id, backend]);
  const [title, setTitle] = useState("");
  const [edit, setEdit] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!bot || !backend) return null;
  const list = sessions.data ?? [];
  const act = async (f: () => Promise<void>) => { setError(null); try { await f(); await sessions.reload(); } catch (e: any) { setError(String(e?.message ?? e)); } };
  return (
    <Screen title="Topics & sessions" subtitle={`${bot.emoji ?? ""} ${bot.name}`}>
      <Section footer="Tap a topic to rename or archive it. Topics share this bot's memory; chatting in them from the phone is coming later (use Hermes's dashboard or CLI for now).">
        {list.map((s, i) => (
          <View key={s.id}>
            <Row last={i === list.length - 1 && edit?.id !== s.id} icon={<MessageSquare size={18} color={s.title === BOT_CHAT_TITLE ? colors.accentText : colors.dim} />}
              title={s.title === BOT_CHAT_TITLE ? "Bot Chat (main)" : s.title} detail={s.updated ? String(s.updated) : undefined}
              onPress={s.title === BOT_CHAT_TITLE || !backend.updateSession ? undefined : () => setEdit(edit?.id === s.id ? null : { id: s.id, title: s.title })} />
            {edit?.id === s.id ? (
              <View style={{ padding: 12, gap: 10 }}>
                <Field label="Title" value={edit.title} onChangeText={(t) => setEdit({ ...edit, title: t })} />
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ flex: 1 }}><Button title="Rename" disabled={!edit.title.trim()} onPress={() => act(async () => { await backend.updateSession!(bot, s.id, { title: edit.title.trim() }); setEdit(null); })} /></View>
                  <Pressable accessibilityLabel="Archive" hitSlop={8} onPress={() => act(async () => { await backend.updateSession!(bot, s.id, { archived: true }); setEdit(null); })}>
                    <Archive size={22} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </Section>
      {sessions.loading && !sessions.data ? <SkeletonRows rows={4} /> : null}
      {sessions.data && !list.length ? <Empty emoji="🗂️" title="Nothing else yet" body="Routine runs and side topics will show up here." /> : null}
      {backend.createTopic ? (
        <Section title="New topic">
          <View style={{ padding: 12, gap: 10 }}>
            <Field label="Topic name" placeholder="Trip to Trichy" value={title} onChangeText={setTitle} />
            <Button title="Create topic" disabled={!title.trim()} onPress={() => act(async () => { await backend.createTopic!(bot, title.trim()); setTitle(""); })} />
          </View>
        </Section>
      ) : null}
      <ErrorText error={error ?? sessions.error} />
    </Screen>
  );
}
