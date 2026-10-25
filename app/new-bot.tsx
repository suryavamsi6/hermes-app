// Create a bot = create a Hermes profile (name, persona/SOUL.md, avatar, model, toolsets).
// Live with hermes-bridge: creates the profile on the server and keeps its new chat key on the phone.
// Live without it: add an existing profile by name + key.
import { router } from "expo-router";
import { Shuffle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../src/app-state";
import { GRADIENTS, PALETTE, SHAPES } from "../src/appearance";
import { AVATAR_EMOJI, type NewBot, STARTER_TOOLSETS as TOOLSETS } from "../src/backend";
import { profileIdFrom } from "../src/live-backend";
import { AppearancePicker, useCheer } from "../src/ui/appearance-picker";
import { useLoad } from "../src/use-load";
import { Button, Chip, TapFace, ComingSoon, ErrorText, Field, Screen, Section } from "../src/ui/kit";
import { colors, type } from "../src/ui/theme";

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export default function NewBotScreen() {
  const { backend, reloadBots } = useApp();
  const [b, setB] = useState<NewBot>({ name: "", emoji: "🦊", color: PALETTE[1].a, shape: "blob", description: "", persona: "", toolsets: ["web", "memory"] });
  const [profile, setProfile] = useState(""); const [key, setKey] = useState("");
  const [cheer, fire] = useCheer();
  const look = (patch: Partial<NewBot>) => { setB((x) => ({ ...x, ...patch })); fire(); };
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const models = useLoad(backend ? () => backend.listModels({ id: "default", profile: "default", name: "", emoji: "", color: "", description: "" }) : null, [backend]);
  if (!backend) return null;
  const canCreate = backend.supports("createBot");

  async function create() {
    setBusy(true); setError(null);
    try { const bot = await backend!.createBot(b); await reloadBots(); router.replace(`/bot/${bot.id}`); }
    catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  }
  // Hermes profile ids are the lowercase folder names (hermes_cli/profiles.py normalize_profile_name).
  const profileId = profile.trim().toLowerCase();
  async function addExisting() {
    const p = profileId; if (!p) return;
    setBusy(true); setError(null);
    try {
      await backend!.checkProfile?.(p, key.trim());
      const name = b.name.trim() || profile.trim().replace(/^./, (c) => c.toUpperCase());
      const bot = await backend!.addExistingBot({ id: p, profile: p, name, emoji: b.emoji, color: b.color, color2: b.color2, shape: b.shape, eyes: b.eyes, description: b.description || `Hermes profile ${p}`, apiKey: key.trim() || undefined, model: b.model, provider: b.provider });
      await reloadBots(); router.replace(`/bot/${bot.id}`);
    } catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  }

  return (
    <Screen title={canCreate ? "New bot" : "Add a bot"} subtitle="Every bot is its own Hermes profile">
      <View style={{ alignItems: "center", gap: 12 }}>
        <TapFace bot={b} size={104} mood={busy ? "thinking" : error ? "error" : cheer ? "success" : "idle"} />
        <Pressable onPress={() => { const c = pick([...PALETTE, ...GRADIENTS]); look({ emoji: pick(AVATAR_EMOJI), color: c.a, color2: c.b, shape: pick([...SHAPES]) }); }} style={{ flexDirection: "row", gap: 6, alignItems: "center" }} accessibilityLabel="Randomise avatar">
          <Shuffle size={15} color={colors.muted} /><Text style={type.label}>Shuffle the look</Text>
        </Pressable>
        <AppearancePicker look={b} onPick={look} />
      </View>
      {!canCreate ? (
        <Section title="Your Hermes profile" footer={"Hermes has no endpoint that lists profiles, so add each one by name. Its key is the API_SERVER_KEY in ~/.hermes/profiles/<name>/.env on your Hermes server; the main key isn't accepted for other profiles."}>
          <View style={{ padding: 12, gap: 12 }}>
            <Field label="Profile name" placeholder="research" autoCapitalize="none" value={profile} onChangeText={setProfile} />
            <Field label="That profile's API_SERVER_KEY" secureTextEntry autoCapitalize="none" value={key} onChangeText={setKey} />
            <Field label="Display name (optional)" placeholder={profile.trim() ? profile.trim().replace(/^./, (c) => c.toUpperCase()) : "Research"} value={b.name} onChangeText={(name) => setB({ ...b, name })} />
            <Button title={busy ? "Checking…" : `Check & add ${profileId || "profile"}`} disabled={!profileId || !key.trim() || busy} onPress={() => void addExisting()} />
            <ErrorText error={error} />
          </View>
        </Section>
      ) : null}
      {canCreate ? <>
      <Field label="Name" placeholder="e.g. Chef, Scout, Atlas" value={b.name} onChangeText={(name) => setB({ ...b, name })} />
      {backend.kind === "live" ? <Field label="Hermes profile id" placeholder={profileIdFrom(b.name) || "chef"} autoCapitalize="none" autoCorrect={false}
        value={b.profile ?? ""} onChangeText={(profile) => setB({ ...b, profile })} /> : null}
      <Field label="One-line description" placeholder="What is this bot for?" value={b.description} onChangeText={(description) => setB({ ...b, description })} />
      <Field label="Persona" multiline placeholder="Cheerful sous-chef who plans weekly meals and keeps a shopping list." value={b.persona} onChangeText={(persona) => setB({ ...b, persona })} />
      <Section title="Model">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
          <Chip label="Same as main" selected={!b.model} onPress={() => setB({ ...b, model: undefined, provider: undefined })} />
          {(models.data ?? []).slice(0, 10).map((m) => <Chip key={`${m.provider}/${m.id}`} label={m.id} selected={b.model === m.id} onPress={() => setB({ ...b, model: m.id, provider: m.provider })} />)}
        </View>
      </Section>
      <Section title="Toolsets">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
          {TOOLSETS.map(([id, label]) => <Chip key={id} label={label} selected={b.toolsets.includes(id)}
            onPress={() => setB({ ...b, toolsets: b.toolsets.includes(id) ? b.toolsets.filter((x) => x !== id) : [...b.toolsets, id] })} />)}
        </View>
      </Section>
          {backend.kind === "live" ? <Text style={[type.label, { color: colors.dim }]}>Creates the profile "{profileIdFrom(b.profile || b.name) || "…"}" on your Hermes server. Its chat key is made for you and kept only on this phone.</Text> : null}
          <Button title={busy ? "Hatching…" : `Create ${b.name || "bot"}`} disabled={!b.name.trim() || busy} onPress={() => void create()} />
          <ErrorText error={error} />
      </> : <ComingSoon what="Creating a brand-new Hermes profile from the phone" />}
    </Screen>
  );
}
