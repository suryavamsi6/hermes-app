// Per-bot settings: look, persona, model, toolsets, skills, and links to memory, MCP, plugins,
// routines and older sessions. Live mode edits only what Hermes's HTTP API allows.
import { router, useLocalSearchParams } from "expo-router";
import { Activity, BellOff, Blocks, Brain, CalendarClock, History, KeyRound, Phone, Plug, Trash2, Star } from "lucide-react-native";
import { setBotNotify, usePrefs } from "../../src/prefs";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useApp, useBot, useMood } from "../../src/app-state";
import { type Look, lookOf } from "../../src/appearance";
import type { Bot } from "../../src/backend";
import { AppearancePicker, useCheer } from "../../src/ui/appearance-picker";
import { KEY_WARNING, useSetupChat } from "../../src/ui/setup-chat";
import { useLoad } from "../../src/use-load";
import { Avatar, Button, TapFace, ComingSoon, ErrorText, Field, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { ModelPicker } from "../../src/ui/model-picker";
import { SkeletonRows } from "../../src/ui/motion";
import { colors, type } from "../../src/ui/theme";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export default function BotInfo() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend, reloadBots, primaryId, setPrimary } = useApp();
  const liveMood = useMood(botId ?? "");
  const [draft, setDraft] = useState<Bot | undefined>(bot);
  const [cheer, fire] = useCheer();
  // Keep unsaved text edits when the bot reloads (e.g. after an instant appearance save).
  useEffect(() => setDraft((d) => (d && bot && d.id === bot.id ? { ...d, ...lookOf(bot) } : bot)), [bot]);
  const toolsets = useLoad(bot && backend ? () => backend.listToolsets(bot) : null, [bot?.id, backend]);
  const skills = useLoad(bot && backend ? () => backend.listSkills(bot) : null, [bot?.id, backend]);
  const models = useLoad(bot && backend && !bot.needsKey ? () => backend.listModels(bot) : null, [bot?.id, backend, bot?.needsKey]);
  // The persona lives in the profile's SOUL.md on the server; load it into the draft once.
  const soulOn = !!(bot && backend?.getPersona && backend.supports("editPersona"));
  const soul = useLoad(soulOn ? () => backend!.getPersona!(bot!) : null, [bot?.id, backend]);
  const soulLoading = soulOn && soul.loading;
  useEffect(() => { if (soul.data !== null) setDraft((d) => (d ? { ...d, persona: soul.data ?? "" } : d)); }, [soul.data]);
  // Select stable references only (a fresh object per read would loop useSyncExternalStore).
  const allPrefs = usePrefs((p) => p);
  const notif = { ...allPrefs.bots[botId ?? ""], g: allPrefs };
  const usage = useLoad(bot && backend?.getUsage && backend.supports("createBot") ? () => backend.getUsage!(bot, 30) : null, [bot?.id, backend]);
  const setup = useSetupChat();
  const [skillError, setSkillError] = useState<string | null>(null);
  if (!bot || !draft || !backend) return null;
  const canPersona = soulOn && !!backend.setPersona && soul.data !== null && !soul.error;
  const canToggle = backend.supports("toggleToolsets");
  const canSkills = backend.supports("toggleSkills") && !!backend.setSkill;
  const fromServer = backend.kind === "live" && backend.supports("createBot"); // roster = the server's profiles

  // Appearance is cosmetic and saves straight away (on the phone in live mode), without touching other unsaved edits.
  async function pickLook(patch: Partial<Look>) {
    setDraft((d) => (d ? { ...d, ...patch } : d)); fire();
    await backend!.updateBot({ ...bot!, ...patch }); await reloadBots();
  }
  async function save() {
    if (canPersona && (draft!.persona ?? "") !== (soul.data ?? "")) { await backend!.setPersona!(bot!, draft!.persona ?? ""); void soul.reload(); }
    await backend!.updateBot(draft!); await reloadBots(); fire();
  }
  return (
    <Screen title={bot.name} subtitle={`Hermes profile · ${bot.profile}`}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <TapFace bot={draft} size={104} mood={cheer ? "success" : liveMood} label={`${bot.name}'s face`} />
      </View>
      <Section footer="The primary bot sits big at the top of Home. You can also long-press any bot there.">
        <Row icon={<Star size={18} color={colors.star} fill={primaryId === bot.id ? colors.star : "transparent"} />} title="Primary bot"
          detail={primaryId === bot.id ? "This bot is on top" : "Show this bot on top"} last
          right={<Toggle value={primaryId === bot.id} disabled={primaryId === bot.id} onChange={(v) => { if (v) void setPrimary(bot.id); }} />} />
      </Section>
      <Section title="Appearance" footer={backend.kind === "live" ? "Saved on this phone right away. Hermes never sees it." : "Saved right away."}>
        <View style={{ padding: 12 }}><AppearancePicker look={draft} onPick={(p) => void pickLook(p)} /></View>
      </Section>
      <Field label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
      <Field label="Short description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} />
      <Field label="Persona (SOUL.md)" multiline value={draft.persona ?? ""} editable={canPersona} placeholder={canPersona ? "How should this bot behave?" : soulLoading ? "Loading SOUL.md…" : "Edit SOUL.md on the homelab for now"}
        onChangeText={(persona) => setDraft({ ...draft, persona })} />
      {soul.error ? <ErrorText error={soul.error} /> : null}
      {!canPersona && !soulLoading ? (backend.kind === "live"
        ? <Text style={[type.label, { color: colors.dim }]}>The persona is {bot.profile === "default" ? "~/.hermes" : `~/.hermes/profiles/${bot.profile}`}/SOUL.md on the server. Edit it there.</Text>
        : <ComingSoon what="Editing the persona" />) : null}

      <Section title="Model" footer="Sent with each message, so it applies to this bot's chat right away.">
        <View style={{ paddingTop: 12 }}>
          <ModelPicker models={models.data} loading={!bot.needsKey && models.loading} error={models.error} selected={draft.model} selectedProvider={draft.provider} maxHeight={320}
            onPick={(model, provider) => setDraft({ ...draft, model, provider })} />
        </View>
      </Section>
      <Button title="Save changes" doneLabel="Saved" onPress={save} />

      <Section title="Toolsets" footer={canToggle ? "What this bot is allowed to use." : "Read from Hermes. Turning toolsets on or off is coming soon."}>
        {(toolsets.data ?? []).map((t, i, all) => (
          <Row key={t.name} title={t.label} detail={t.description} last={i === all.length - 1}
            right={<Toggle value={t.enabled} disabled={!canToggle} onChange={async (v) => { await backend.setToolset(bot, t.name, v); void toolsets.reload(); }} />} />
        ))}
        {toolsets.loading && !toolsets.data ? <SkeletonRows /> : null}
        {toolsets.error ? <View style={{ padding: 12 }}><ErrorText error={toolsets.error} /></View> : null}
      </Section>

      <Section title="Skills" footer={canSkills ? "Turned-off skills stay installed; this bot just won't use them." : undefined}>
        {(skills.data ?? []).map((s, i, all) => <Row key={s.name} title={s.name} detail={s.description} last={i === all.length - 1}
          right={canSkills ? <Toggle value={s.enabled !== false} onChange={async (v) => {
            setSkillError(null);
            try { await backend.setSkill!(bot, s.name, v); } catch (e: any) { setSkillError(String(e?.message ?? e)); }
            void skills.reload();
          }} /> : undefined} />)}
        {skillError ? <View style={{ padding: 12 }}><ErrorText error={skillError} /></View> : null}
        {skills.data?.length === 0 ? <View style={{ padding: 14 }}><Text style={type.label}>No skills yet. {bot.name} learns them as it works.</Text></View> : null}
        {skills.loading && !skills.data ? <SkeletonRows /> : null}
        {skills.error ? <View style={{ padding: 12 }}><ErrorText error={skills.error} /></View> : null}
      </Section>

      {usage.data ? (
        <Section title="Usage · last 30 days" footer="From Hermes's session records. Cost is the provider's figure when known, else Hermes's estimate.">
          <Row title={`${fmt(usage.data.input + usage.data.output)} tokens`} detail={`${fmt(usage.data.input)} in · ${fmt(usage.data.output)} out · ${usage.data.apiCalls} API calls`} />
          <Row title={`$${usage.data.costUsd.toFixed(2)}`} detail={`${usage.data.sessions} sessions`} last />
        </Section>
      ) : null}

      <Section title="Notifications" footer="Overrides Settings → Notifications for this bot.">
        <Row icon={<BellOff size={18} color={colors.muted} />} title="Mute this bot" detail="No notifications at all" right={<Toggle value={!!notif.muted} onChange={(v) => setBotNotify(bot.id, { muted: v })} />} />
        <Row title="Replies" right={<Toggle value={notif.replies ?? notif.g.notifyReplies} disabled={!!notif.muted} onChange={(v) => setBotNotify(bot.id, { replies: v })} />} />
        <Row title="Approvals" right={<Toggle value={notif.approvals ?? notif.g.notifyApprovals} disabled={!!notif.muted} onChange={(v) => setBotNotify(bot.id, { approvals: v })} />} />
        <Row title="Errors" last right={<Toggle value={notif.errors ?? notif.g.notifyErrors} disabled={!!notif.muted} onChange={(v) => setBotNotify(bot.id, { errors: v })} />} />
      </Section>

      <Section title="More">
        <Row icon={<Phone size={18} color={colors.muted} />} title="Voice call" detail="Talk hands-free; replies are read aloud" onPress={() => router.push(`/call/${bot.id}`)} />
        <Row icon={<Activity size={18} color={colors.muted} />} title="Activity" detail="Tool calls, the current plan, and connected-app switches" onPress={() => router.push(`/activity/${bot.id}`)} />
        <Row icon={<Brain size={18} color={colors.muted} />} title="Memory" detail="What it remembers about you" onPress={() => router.push(`/memory/${bot.id}`)} />
        <Row icon={<Plug size={18} color={colors.muted} />} title="MCP servers" detail="Connect outside tools" onPress={() => router.push(`/mcp/${bot.id}`)} />
        <Row icon={<Blocks size={18} color={colors.muted} />} title="Plugins" detail="Browsers, context engines, extra tools" onPress={() => router.push(`/plugins/${bot.id}`)} />
        <Row icon={<CalendarClock size={18} color={colors.muted} />} title="Routines" detail="Recurring jobs that report back here" onPress={() => router.push(`/routines?bot=${bot.id}`)} />
        <Row icon={<History size={18} color={colors.muted} />} title="Topics & sessions" detail="Side threads and routine runs; new, rename, archive" onPress={() => router.push(`/history/${bot.id}`)} last />
      </Section>
      {bot.needsKey && setup.available ? (
        <Section title="Chat" footer={KEY_WARNING}>
          <Row icon={<KeyRound size={18} color={colors.accentText} />} title={setup.busy ? "Setting up…" : "Set up chat"} detail="Lets this phone chat with this profile" last
            onPress={setup.busy ? undefined : () => void setup.run(bot)} />
          {setup.error ? <View style={{ padding: 12 }}><ErrorText error={setup.error} /></View> : null}
        </Section>
      ) : null}
      {bot.profile !== "default" && !fromServer ? (
        <Section>
          <Row icon={<Trash2 size={18} color={colors.danger} />} danger title={backend.kind === "live" ? "Remove from this phone" : "Delete bot"} last
            onPress={async () => { await backend.removeBot(bot.id); await reloadBots(); if (router.canDismiss()) router.dismissAll(); router.replace("/"); }} />
        </Section>
      ) : null}
      {bot.profile !== "default" && fromServer ? (
        <Text selectable style={[type.label, { color: colors.dim, textAlign: "center" }]}>This bot is the Hermes profile "{bot.profile}". To delete it, run on the server: hermes profile delete {bot.profile}</Text>
      ) : null}
    </Screen>
  );
}
