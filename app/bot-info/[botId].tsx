// Per-bot settings: look, persona, model, toolsets, skills, and links to memory, MCP, plugins,
// routines and older sessions. Live mode edits only what Hermes's HTTP API allows.
import { router, useLocalSearchParams } from "expo-router";
import { Blocks, Brain, CalendarClock, History, KeyRound, Plug, Trash2, Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useApp, useBot, useMood } from "../../src/app-state";
import { type Look, lookOf } from "../../src/appearance";
import type { Bot } from "../../src/backend";
import { AppearancePicker, useCheer } from "../../src/ui/appearance-picker";
import { KEY_WARNING, useSetupChat } from "../../src/ui/setup-chat";
import { useLoad } from "../../src/use-load";
import { Avatar, Button, Chip, ComingSoon, ErrorText, Field, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { colors, type } from "../../src/ui/theme";

export default function BotInfo() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend, reloadBots, primaryId, setPrimary } = useApp();
  const liveMood = useMood(botId ?? "");
  const [draft, setDraft] = useState<Bot | undefined>(bot);
  const [saved, setSaved] = useState(false);
  const [cheer, fire] = useCheer();
  // Keep unsaved text edits when the bot reloads (e.g. after an instant appearance save).
  useEffect(() => setDraft((d) => (d && bot && d.id === bot.id ? { ...d, ...lookOf(bot) } : bot)), [bot]);
  const toolsets = useLoad(bot && backend ? () => backend.listToolsets(bot) : null, [bot?.id, backend]);
  const skills = useLoad(bot && backend ? () => backend.listSkills(bot) : null, [bot?.id, backend]);
  const models = useLoad(bot && backend && !bot.needsKey ? () => backend.listModels(bot) : null, [bot?.id, backend, bot?.needsKey]);
  const setup = useSetupChat();
  const [skillError, setSkillError] = useState<string | null>(null);
  if (!bot || !draft || !backend) return null;
  const canPersona = backend.supports("editPersona");
  const canToggle = backend.supports("toggleToolsets");
  const canSkills = backend.supports("toggleSkills") && !!backend.setSkill;
  const fromServer = backend.kind === "live" && backend.supports("createBot"); // roster = the server's profiles

  // Appearance is cosmetic and saves straight away (on the phone in live mode), without touching other unsaved edits.
  async function pickLook(patch: Partial<Look>) {
    setDraft((d) => (d ? { ...d, ...patch } : d)); fire();
    await backend!.updateBot({ ...bot!, ...patch }); await reloadBots();
  }
  async function save() {
    await backend!.updateBot(draft!); await reloadBots(); setSaved(true); setTimeout(() => setSaved(false), 1500);
  }
  return (
    <Screen title={bot.name} subtitle={`Hermes profile · ${bot.profile}`}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <Avatar bot={draft} size={104} mood={saved || cheer ? "happy" : liveMood} />
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
      <Field label="Persona (SOUL.md)" multiline value={draft.persona ?? ""} editable={canPersona} placeholder={canPersona ? "How should this bot behave?" : "Edit SOUL.md on the homelab for now"}
        onChangeText={(persona) => setDraft({ ...draft, persona })} />
      {!canPersona ? (backend.kind === "live"
        ? <Text style={[type.label, { color: colors.dim }]}>The persona is {bot.profile === "default" ? "~/.hermes" : `~/.hermes/profiles/${bot.profile}`}/SOUL.md on the server. Edit it there.</Text>
        : <ComingSoon what="Editing the persona" />) : null}

      <Section title="Model" footer="Sent with each message, so it applies to this bot's chat right away.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
          <Chip label="Profile default" selected={!draft.model} onPress={() => setDraft({ ...draft, model: undefined, provider: undefined })} />
          {(models.data ?? []).slice(0, 12).map((m) => <Chip key={`${m.provider}/${m.id}`} label={m.id} selected={draft.model === m.id} onPress={() => setDraft({ ...draft, model: m.id, provider: m.provider })} />)}
        </View>
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}><ErrorText error={models.error} /></View>
      </Section>
      <Button title={saved ? "Saved ✓" : "Save changes"} onPress={() => void save()} />

      <Section title="Toolsets" footer={canToggle ? "What this bot is allowed to use." : "Read from Hermes. Turning toolsets on or off is coming soon."}>
        {(toolsets.data ?? []).map((t, i, all) => (
          <Row key={t.name} title={t.label} detail={t.description} last={i === all.length - 1}
            right={<Toggle value={t.enabled} disabled={!canToggle} onChange={async (v) => { await backend.setToolset(bot, t.name, v); void toolsets.reload(); }} />} />
        ))}
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
        {skills.error ? <View style={{ padding: 12 }}><ErrorText error={skills.error} /></View> : null}
      </Section>

      <Section title="More">
        <Row icon={<Brain size={18} color={colors.muted} />} title="Memory" detail="What it remembers about you" onPress={() => router.push(`/memory/${bot.id}`)} />
        <Row icon={<Plug size={18} color={colors.muted} />} title="MCP servers" detail="Connect outside tools" onPress={() => router.push(`/mcp/${bot.id}`)} />
        <Row icon={<Blocks size={18} color={colors.muted} />} title="Plugins" detail="Browsers, context engines, extra tools" onPress={() => router.push(`/plugins/${bot.id}`)} />
        <Row icon={<CalendarClock size={18} color={colors.muted} />} title="Routines" detail="Recurring jobs that report back here" onPress={() => router.push(`/routines?bot=${bot.id}`)} />
        <Row icon={<History size={18} color={colors.muted} />} title="Older sessions" detail="Routine runs and side threads" onPress={() => router.push(`/history/${bot.id}`)} last />
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
