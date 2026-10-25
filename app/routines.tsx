// Routines tab: Hermes cron jobs for every bot (api_server /api/jobs, per profile). Results are
// delivered to the bot's own chat ("bot-chat" delivery).
import { useLocalSearchParams } from "expo-router";
import { Pause, Play, Trash2, Zap } from "lucide-react-native";
import { useState } from "react";
import { isFailing } from "../src/job-text";
import { Alert, Pressable, Text, View } from "react-native";
import { useApp } from "../src/app-state";
import type { Bot, Job } from "../src/backend";
import { useLoad } from "../src/use-load";
import { Avatar, Button, Chip, Empty, ErrorText, Field, Screen, Section } from "../src/ui/kit";
import { colors, type } from "../src/ui/theme";
import { SkeletonRows } from "../src/ui/motion";
import { tapHaptic } from "../src/ui/haptics";
import { toast } from "../src/ui/toast";

const PRESETS = [["Every morning", "0 8 * * *"], ["Weekdays 9:00", "0 9 * * 1-5"], ["Hourly", "0 * * * *"], ["Sundays", "0 10 * * 0"]];

export default function Routines() {
  // ?job=<id> (with ?bot=) opens one routine, e.g. from Home's "routine failed"; ?failed=1 shows only failed ones.
  const { bot: initial, job: focus, failed } = useLocalSearchParams<{ bot?: string; job?: string; failed?: string }>();
  const [onlyFailed, setOnlyFailed] = useState(failed === "1");
  const { backend, bots } = useApp();
  const [filter, setFilter] = useState<string | undefined>(initial);
  const jobs = useLoad<{ bot: Bot; jobs: Job[]; error?: string }[]>(backend && bots.length ? () => Promise.all(bots.map(async (b) => {
    try { return { bot: b, jobs: await backend.listJobs(b) }; } catch (e: any) { return { bot: b, jobs: [], error: String(e?.message ?? e) }; }
  })) : null, [backend, bots]);
  const [form, setForm] = useState({ name: "", schedule: PRESETS[0][1], prompt: "" });
  const [error, setError] = useState<string | null>(null);
  /** The routine being edited (its bot and id), or null when the form adds a new one. */
  const [editing, setEditing] = useState<{ bot: Bot; id: string } | null>(null);
  if (!backend) return null;
  const target = editing?.bot ?? bots.find((b) => b.id === (filter ?? bots[0]?.id));
  // The focused routine first, and only failed ones when that filter is on.
  const groups = (jobs.data ?? []).filter((g) => !filter || g.bot.id === filter).map((g) => ({ ...g,
    jobs: g.jobs.filter((j) => !onlyFailed || isFailing(j)).sort((a, b) => Number(b.id === focus) - Number(a.id === focus)) }))
    .filter((g) => !onlyFailed || g.jobs.length);
  const act = async (f: () => Promise<void>, ok?: string) => {
    setError(null);
    try { await f(); if (ok) toast(ok); await jobs.reload(); } catch (e: any) { setError(String(e?.message ?? e)); }
  };
  const confirmDelete = (bot: Bot, j: Job) => Alert.alert(`Delete "${j.name}"?`, "Hermes stops running it. This can't be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => void act(() => backend.deleteJob(bot, j.id), "Routine deleted") },
  ]);

  return (
    <Screen title="Routines" subtitle="Recurring jobs that report back to each bot">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label="All bots" selected={!filter} onPress={() => setFilter(undefined)} />
        <Chip label="Failed" selected={onlyFailed} onPress={() => setOnlyFailed(!onlyFailed)} />
        {bots.map((b) => <Chip key={b.id} label={`${b.emoji} ${b.name}`} selected={filter === b.id} onPress={() => setFilter(b.id)} />)}
      </View>
      {groups.map(({ bot, jobs: list, error: e }) => (
        <Section key={bot.id} title={`${bot.emoji}  ${bot.name}`}>
          {list.map((j, i) => (
            <View key={j.id} style={{ flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: j.paused ? 0.55 : 1,
              ...(j.id === focus ? { borderLeftWidth: 3, borderLeftColor: isFailing(j) ? colors.danger : colors.accentText } : null) }}>
              <Avatar bot={bot} size={30} animate={false} />
              <Pressable style={{ flex: 1, gap: 2 }} accessibilityLabel={`Edit ${j.name}`} disabled={!backend.updateJob}
                onPress={() => { setEditing({ bot, id: j.id }); setForm({ name: j.name, schedule: j.schedule, prompt: j.prompt }); }}>
                <Text style={[type.body, { fontSize: 15 }]}>{j.name}{j.paused ? "  · paused" : ""}</Text>
                <Text style={type.label}>{j.schedule}{j.nextRun ? ` · next ${j.nextRun}` : ""}{j.lastRun ? ` · ran ${j.lastRun}` : ""}{j.lastStatus ? ` (${j.lastStatus})` : ""}</Text>
                <Text style={[type.label, { color: colors.dim }]} numberOfLines={2}>{j.prompt}</Text>
                {isFailing(j) ? (
                  <Text selectable style={[type.label, { color: colors.danger, marginTop: 4 }]} numberOfLines={j.id === focus ? undefined : 3}>
                    {j.lastError ? `Last run failed: ${j.lastError}` : "Last run failed (Hermes gave no error text)"}
                  </Text>
                ) : null}
              </Pressable>
              <View style={{ gap: 2, alignItems: "center", marginRight: -6 }}>
                <IconAction label={`Run ${j.name} now`} onPress={() => act(() => backend.runJob(bot, j.id), `Started ${j.name}`)}><Zap size={17} color={colors.accentText} /></IconAction>
                <IconAction label={j.paused ? `Resume ${j.name}` : `Pause ${j.name}`} onPress={() => act(() => backend.setJobPaused(bot, j.id, !j.paused), j.paused ? "Resumed" : "Paused")}>
                  {j.paused ? <Play size={17} color={colors.muted} /> : <Pause size={17} color={colors.muted} />}
                </IconAction>
                <IconAction label={`Delete ${j.name}`} onPress={() => confirmDelete(bot, j)}><Trash2 size={17} color={colors.dim} /></IconAction>
              </View>
            </View>
          ))}
          {list.length === 0 && !e ? <View style={{ padding: 14 }}><Text style={type.label}>No routines yet. {bot.name} is free all week 🌴</Text></View> : null}
          {e ? <View style={{ padding: 14 }}><ErrorText error={e} /></View> : null}
        </Section>
      ))}
      {jobs.loading && !jobs.data ? <SkeletonRows rows={4} /> : null}
      {jobs.data && onlyFailed && !groups.length ? <Empty emoji="✅" title="No failed routines" body="Every routine's last run went fine." /> : null}
      {jobs.data && !onlyFailed && groups.every((g) => !g.jobs.length) ? <Empty emoji="⏰" title="Nothing scheduled" body="Routines are Hermes cron jobs. Add one below and its results land in the bot's chat." /> : null}
      {target ? (
        <Section title={editing ? `Edit routine · ${target.emoji} ${target.name}` : `New routine for ${target.emoji} ${target.name}`}>
          <View style={{ padding: 12, gap: 12 }}>
            <Field label="Name" placeholder="Morning brief" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PRESETS.map(([label, cron]) => <Chip key={cron} label={label} selected={form.schedule === cron} onPress={() => setForm({ ...form, schedule: cron })} />)}
            </View>
            <Field label="Schedule (cron or 'every 2h')" autoCapitalize="none" value={form.schedule} onChangeText={(schedule) => setForm({ ...form, schedule })} />
            <Field label="What should it do?" multiline placeholder="Summarise my inbox and calendar" value={form.prompt} onChangeText={(prompt) => setForm({ ...form, prompt })} />
            <Button title={editing ? "Save changes" : "Add routine"} disabled={!form.name.trim() || !form.prompt.trim()}
              onPress={() => act(async () => {
                if (editing) await backend.updateJob!(editing.bot, editing.id, form); else await backend.createJob(target, form);
                setEditing(null); setForm({ name: "", schedule: PRESETS[0][1], prompt: "" });
              }, editing ? "Routine saved" : "Routine added")} />
            {editing ? <Button title="Cancel" kind="secondary" onPress={() => { setEditing(null); setForm({ name: "", schedule: PRESETS[0][1], prompt: "" }); }} /> : null}
          </View>
        </Section>
      ) : null}
      <ErrorText error={error ?? jobs.error} />
    </Screen>
  );
}

/** A 40-pt round icon button with a pressed state (routine actions). */
function IconAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tapHaptic(); onPress(); }} hitSlop={2}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.controlActive : "transparent" })}>
      {children}
    </Pressable>
  );
}
