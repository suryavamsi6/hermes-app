// Older sessions for a bot (routine runs, side threads). The Bot Chat stays the main conversation.
import { useLocalSearchParams } from "expo-router";
import { MessageSquare } from "lucide-react-native";
import { useApp, useBot } from "../../src/app-state";
import { BOT_CHAT_TITLE } from "../../src/backend";
import { useLoad } from "../../src/use-load";
import { Empty, ErrorText, Row, Screen, Section } from "../../src/ui/kit";
import { colors } from "../../src/ui/theme";
import { SkeletonRows } from "../../src/ui/motion";

export default function HistoryScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const sessions = useLoad(bot && backend ? () => backend.listSessions(bot) : null, [bot?.id, backend]);
  if (!bot) return null;
  const list = sessions.data ?? [];
  return (
    <Screen title="Older sessions" subtitle={`${bot.emoji} ${bot.name}`}>
      <Section footer="Read-only for now. Your main conversation is always the Bot Chat.">
        {list.map((s, i) => (
          <Row key={s.id} last={i === list.length - 1} icon={<MessageSquare size={18} color={s.title === BOT_CHAT_TITLE ? colors.accentText : colors.dim} />}
            title={s.title === BOT_CHAT_TITLE ? "Bot Chat (main)" : s.title} detail={s.updated ? String(s.updated) : undefined} />
        ))}
      </Section>
      {sessions.loading && !sessions.data ? <SkeletonRows rows={4} /> : null}
      {sessions.data && !list.length ? <Empty emoji="🗂️" title="Nothing older" body="Routine runs and side threads will show up here." /> : null}
      <ErrorText error={sessions.error} />
    </Screen>
  );
}
