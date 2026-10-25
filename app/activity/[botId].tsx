// A bot's activity: its current plan (Hermes's todo list), a timeline of tool calls from the Bot Chat,
// and off switches for each connected app (MCP servers and toolsets).
import { useLocalSearchParams } from "expo-router";
import { Check, Circle, CircleDot, X } from "lucide-react-native";
import { View } from "react-native";
import { activityLog, currentPlan } from "../../src/activity-log";
import { useApp, useBot } from "../../src/app-state";
import { messageTime } from "../../src/ui/chat-rows";
import { Empty, ErrorText, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { SkeletonRows } from "../../src/ui/motion";
import { colors } from "../../src/ui/theme";
import { useLoad } from "../../src/use-load";

export default function ActivityScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const raw = useLoad(bot && backend && !bot.needsKey ? async () => backend.chat(bot).messages(await backend.botChatSession(bot)) : null, [bot?.id, backend]);
  const mcp = useLoad(bot && backend ? () => backend.listMcp(bot) : null, [bot?.id, backend]);
  const toolsets = useLoad(bot && backend ? () => backend.listToolsets(bot) : null, [bot?.id, backend]);
  if (!bot || !backend) return null;
  const log = raw.data ? activityLog(raw.data) : [];
  const plan = raw.data ? currentPlan(raw.data) : null;
  const canToggle = backend.supports("toggleToolsets");
  return (
    <Screen title="Activity" subtitle={`${bot.emoji ?? ""} ${bot.name}`}>
      {plan?.length ? (
        <Section title="Current plan" footer="Hermes's own to-do list for this chat (its todo tool).">
          {plan.map((p, i) => (
            <Row key={p.id} last={i === plan.length - 1} title={p.content}
              icon={p.status === "completed" ? <Check size={18} color={colors.success} /> : p.status === "in_progress" ? <CircleDot size={18} color={colors.accentText} />
                : p.status === "cancelled" ? <X size={18} color={colors.dim} /> : <Circle size={18} color={colors.dim} />} />
          ))}
        </Section>
      ) : null}

      <Section title="Connected apps" footer={canToggle ? "Turn an app off and this bot stops using it. MCP changes apply after Hermes restarts its gateway." : "Needs hermes-bridge to switch apps on or off."}>
        {(mcp.data ?? []).map((s) => (
          <Row key={`mcp-${s.name}`} title={s.name} detail={`MCP server${s.tools ? ` · ${s.tools} tools` : ""}`}
            right={<Toggle value={s.enabled} disabled={!backend.supports("mcp")} onChange={async (v) => { await backend.setMcpEnabled(bot, s.name, v); void mcp.reload(); }} />} />
        ))}
        {(toolsets.data ?? []).map((t, i, all) => (
          <Row key={`ts-${t.name}`} title={t.label} detail={t.description} last={i === all.length - 1}
            right={<Toggle value={t.enabled} disabled={!canToggle} onChange={async (v) => { await backend.setToolset(bot, t.name, v); void toolsets.reload(); }} />} />
        ))}
        {(mcp.loading && !mcp.data) || (toolsets.loading && !toolsets.data) ? <SkeletonRows rows={2} /> : null}
        <View style={{ paddingHorizontal: 12 }}><ErrorText error={mcp.error ?? toolsets.error} /></View>
      </Section>

      <Section title="Timeline" footer="Tool calls in this bot's main chat, newest first.">
        {log.map((e, i) => (
          <Row key={`${e.id}-${i}`} last={i === log.length - 1} title={e.summary} detail={[e.tool, e.at ? messageTime(e.at) : null, e.failed ? "failed" : null].filter(Boolean).join(" · ")} />
        ))}
        {raw.loading && !raw.data ? <SkeletonRows rows={5} /> : null}
      </Section>
      {raw.data && !log.length ? <Empty emoji="🛠️" title="No tool calls yet" body="When this bot runs commands, searches or uses apps, they show up here." /> : null}
      <ErrorText error={raw.error} />
    </Screen>
  );
}
