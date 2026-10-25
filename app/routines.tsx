// Routines tab: Hermes cron jobs for every bot (api_server /api/jobs, per profile). Results are
// delivered to the bot's own chat ("bot-chat" delivery).
import { useLocalSearchParams } from "expo-router";
import { Pause, Play, Trash2, Zap } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../src/app-state";
import type { Bot, Job } from "../src/backend";
import { useLoad } from "../src/use-load";
import { Avatar, Button, Chip, Empty, ErrorText, Field, Screen, Section } from "../src/ui/kit";
import { colors, type } from "../src/ui/theme";

const PRESETS = [["Every morning", "0 8 * * *"], ["Weekdays 9:00", "0 9 * * 1-5"], ["Hourly", "0 * * * *"], ["Sundays", "0 10 * * 0"]];

export default function Routines() {
  const { bot: initial } = useLocalSearchParams<{ bot?: string }>();
  const { backend, bots } = useApp();
  const [filter, setFilter] = useState<string | undefined>(initial);
  const jobs = useLoad<{ bot: Bot; jobs: Job[]; error?: string }[]>(backend && bots.length ? () => Promise.all(bots.map(async (b) => {
    try { return { bot: b, jobs: await backend.listJobs(b) }; } catch (e: any) { return { bot: b, jobs: [], error: String(e?.message ?? e) }; }
  })) : null, [backend, bots]);
  const [form, setForm] = useState({ name: "", schedule: PRESETS[0][1], prompt: "" });
  const [error, setError] = useState<string | null>(null);
  if (!backend) return null;
  const target = bots.find((b) => b.id === (filter ?? bots[0]?.id));
  const groups = (jobs.data ?? []).filter((g) => !filter || g.bot.id === filter);
  const act = async (f: () => Promise<void>) => { try { await f(); await jobs.reload(); } catch (e: any) { setError(String(e?.message ?? e)); } };

  return (
    <Screen title="Routines" subtitle="Recurring jobs that report back to each bot">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label="All bots" selected={!filter} onPress={() => setFilter(undefined)} />
        {bots.map((b) => <Chip key={b.id} label={`${b.emoji} ${b.name}`} selected={filter === b.id} onPress={() => setFilter(b.id)} />)}
      </View>
      {groups.map(({ bot, jobs: list, error: e }) => (
        <Section key={bot.id} title={`${bot.emoji}  ${bot.name}`}>
          {list.map((j, i) => (
            <View key={j.id} style={{ flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: j.paused ? 0.55 : 1 }}>
              <Avatar bot={bot} size={30} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, { fontSize: 15 }]}>{j.name}{j.paused ? "  · paused" : ""}</Text>
                <Text style={type.label}>{j.schedule}{j.nextRun ? ` · next ${j.nextRun}` : ""}{j.lastRun ? ` · ran ${j.lastRun}` : ""}{j.lastStatus ? ` (${j.lastStatus})` : ""}</Text>
                <Text style={[type.label, { color: colors.dim }]} numberOfLines={2}>{j.prompt}</Text>
              </View>
              <View style={{ gap: 12, alignItems: "center" }}>
                <Pressable hitSlop={8} accessibilityLabel="Run now" onPress={() => act(() => backend.runJob(bot, j.id))}><Zap size={17} color={colors.accentText} /></Pressable>
                <Pressable hitSlop={8} accessibilityLabel={j.paused ? "Resume" : "Pause"} onPress={() => act(() => backend.setJobPaused(bot, j.id, !j.paused))}>
                  {j.paused ? <Play size={17} color={colors.muted} /> : <Pause size={17} color={colors.muted} />}
                </Pressable>
                <Pressable hitSlop={8} accessibilityLabel="Delete" onPress={() => act(() => backend.deleteJob(bot, j.id))}><Trash2 size={17} color={colors.dim} /></Pressable>
              </View>
            </View>
          ))}
          {list.length === 0 && !e ? <View style={{ padding: 14 }}><Text style={type.label}>No routines yet. {bot.name} is free all week 🌴</Text></View> : null}
          {e ? <View style={{ padding: 14 }}><ErrorText error={e} /></View> : null}
        </Section>
      ))}
      {jobs.data && groups.every((g) => !g.jobs.length) ? <Empty emoji="⏰" title="Nothing scheduled" body="Routines are Hermes cron jobs. Add one below and its results land in the bot's chat." /> : null}
      {target ? (
        <Section title={`New routine for ${target.emoji} ${target.name}`}>
          <View style={{ padding: 12, gap: 12 }}>
            <Field label="Name" placeholder="Morning brief" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PRESETS.map(([label, cron]) => <Chip key={cron} label={label} selected={form.schedule === cron} onPress={() => setForm({ ...form, schedule: cron })} />)}
            </View>
            <Field label="Schedule (cron or 'every 2h')" autoCapitalize="none" value={form.schedule} onChangeText={(schedule) => setForm({ ...form, schedule })} />
            <Field label="What should it do?" multiline placeholder="Summarise my inbox and calendar" value={form.prompt} onChangeText={(prompt) => setForm({ ...form, prompt })} />
            <Button title="Add routine" disabled={!form.name.trim() || !form.prompt.trim()}
              onPress={() => act(async () => { await backend.createJob(target, form); setForm({ name: "", schedule: PRESETS[0][1], prompt: "" }); })} />
          </View>
        </Section>
      ) : null}
      <ErrorText error={error ?? jobs.error} />
    </Screen>
  );
}
