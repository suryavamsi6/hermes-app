// Plugins for one bot. "Installed" lists what Hermes has loaded (with each plugin's tools and an on/off
// switch); "Marketplace" is Hermes's curated plugin catalog with one-tap installs.
// Live: both come through hermes-bridge. Hermes's dashboard API installs and toggles plugins only for
// the profile it runs as, so other profiles get the server command to run instead.
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useApp, useBot } from "../../src/app-state";
import type { CatalogPlugin, Plugin } from "../../src/backend";
import { useLoad } from "../../src/use-load";
import { Button, Chip, ComingSoon, Empty, ErrorText, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { colors, font, radii, type } from "../../src/ui/theme";
import { SkeletonRows } from "../../src/ui/motion";

const KIND_LABEL: Record<Plugin["kind"], string> = { tools: "🧰 Tools", browser: "🌐 Browser", "context-engine": "🧩 Context engine", "memory-provider": "🧠 Memory", "model-provider": "🤖 Models", platform: "💬 Platform" };

export default function PluginsScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const [tab, setTab] = useState<"installed" | "market">("installed");
  const plugins = useLoad(bot && backend ? () => backend.listPlugins(bot) : null, [bot?.id, backend]);
  const catalog = useLoad(bot && backend?.listPluginCatalog && tab === "market" ? () => backend.listPluginCatalog!(bot) : null, [bot?.id, backend, tab]);
  const toolsets = useLoad(bot && backend && backend.kind === "live" && plugins.comingSoon ? () => backend.listToolsets(bot) : null, [bot?.id, backend, plugins.comingSoon]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = catalog.data?.entries ?? [];
    return q ? all.filter((e) => `${e.name} ${e.title} ${e.description} ${e.category ?? ""}`.toLowerCase().includes(q)) : all;
  }, [catalog.data, query]);

  if (!bot || !backend) return null;
  const toggle = async (p: Plugin, v: boolean) => {
    setError(null);
    try { await backend.setPluginEnabled(bot, p.name, v); } catch (e: any) { setError(String(e?.message ?? e)); }
    void plugins.reload();
  };
  const install = async (e: CatalogPlugin) => {
    setBusy(e.name); setError(null); setDone(null);
    try { await backend.installPlugin(bot, e.name); setDone(e.title); void plugins.reload(); await catalog.reload(); }
    catch (err: any) { setError(String(err?.message ?? err)); }
    finally { setBusy(null); }
  };

  if (plugins.comingSoon) return (
    <Screen title="Plugins" subtitle={`${bot.emoji} ${bot.name}`}>
      <ComingSoon what="Installing and toggling plugins" />
      <Section title="Toolsets Hermes reports (plugin tools show up here)">
        {(toolsets.data ?? []).map((t, i, all) => <Row key={t.name} title={t.label} detail={t.description} last={i === all.length - 1} />)}
      </Section>
      <ErrorText error={toolsets.error} />
    </Screen>
  );

  return (
    <Screen title="Plugins" subtitle={`${bot.emoji} ${bot.name}`}>
      {backend.listPluginCatalog ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Installed" selected={tab === "installed"} onPress={() => setTab("installed")} />
          <Chip label="Marketplace" selected={tab === "market"} onPress={() => setTab("market")} />
        </View>
      ) : null}

      {tab === "installed" ? (
        <>
          {(plugins.data ?? []).map((p) => (
            <Section key={p.name}>
              <Row title={`${p.name}${p.version ? `  v${p.version}` : ""}`} detail={`${KIND_LABEL[p.kind]}${p.source ? ` · ${p.source}` : ""}${p.description ? ` · ${p.description}` : ""}`} last
                right={!p.toggleHint ? <Toggle value={p.enabled} onChange={(v) => void toggle(p, v)} /> : <View />} />
              {p.tools.length || p.skills.length ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 2 }}>
                  {p.tools.length ? <Text style={type.label}>Tools: {p.tools.join(", ")}</Text> : null}
                  {p.skills.length ? <Text style={type.label}>Skills: {p.skills.join(", ")}</Text> : null}
                </View>
              ) : null}
              {p.toggleHint ? <Text selectable style={[type.label, { paddingHorizontal: 14, paddingBottom: 12, color: colors.dim }]}>{p.enabled ? "On" : "Off"} for {bot.name}. Hermes's API switches plugins only for the default profile; to change it here, run on the server: {p.toggleHint}</Text> : null}
            </Section>
          ))}
          {plugins.data?.length === 0 ? <Empty emoji="🧩" title="No plugins yet" body={backend.listPluginCatalog ? "Find some in the Marketplace." : "Install them on the server with: hermes plugins install <name>"} /> : null}
        </>
      ) : (
        <>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search plugins" placeholderTextColor={colors.dim} autoCapitalize="none"
            style={{ fontFamily: font.regular, fontSize: 15, color: colors.text, backgroundColor: colors.control, borderRadius: radii.chip, paddingHorizontal: 16, paddingVertical: 10 }} />
          {catalog.data && !catalog.data.installSupported ? (
            <Text style={[type.label, { color: colors.warning }]}>Hermes installs plugins from its dashboard API only for the default profile. For {bot.name}, run the command shown on each plugin on the server.</Text>
          ) : null}
          {done ? <Text style={[type.bodySm, { color: colors.success }]}>Installed {done}. New tools reach chats after the next Hermes restart.</Text> : null}
          {entries.map((e) => (
            <Section key={e.name}>
              <View style={{ padding: 14, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={type.title}>{e.title}</Text>
                  {e.tier ? <Badge label={e.tier} tint={e.tier === "official" ? colors.success : colors.muted} /> : null}
                  {e.version ? <Text style={type.label}>v{e.version}</Text> : null}
                </View>
                {e.description ? <Text style={type.bodySm}>{e.description}</Text> : null}
                <Text style={[type.label, { color: colors.dim }]}>
                  {[e.category, e.maintainer && `by ${e.maintainer}`, e.tools.length ? `${e.tools.length} tool${e.tools.length === 1 ? "" : "s"}` : null, e.requiresEnv.length ? `needs ${e.requiresEnv.join(", ")}` : null].filter(Boolean).join(" · ")}
                </Text>
                {catalog.data?.installSupported ? (
                  e.installed && !e.updateAvailable ? <Text style={[type.label, { color: colors.success }]}>Installed ✓</Text> : (
                    <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
                      <Button kind="secondary" title={busy === e.name ? "Installing…" : e.installed ? "Installed · update on server" : "Install"} disabled={busy !== null || e.installed} onPress={() => void install(e)} />
                    </View>
                  )
                ) : (
                  <Text selectable style={[type.label, { fontFamily: font.mono, color: colors.textSecondary }]}>{e.installed ? "Installed ✓" : `hermes -p ${bot.profile} plugins install ${e.name}`}</Text>
                )}
              </View>
            </Section>
          ))}
          {catalog.data && entries.length === 0 ? <Empty emoji="🔎" title="Nothing found" body={query ? "Try another word." : "Hermes's catalog is empty."} /> : null}
          {catalog.loading && !catalog.data ? <SkeletonRows /> : null}
          <ErrorText error={catalog.error} />
        </>
      )}
      <ErrorText error={error} />
      <ErrorText error={plugins.error} />
    </Screen>
  );
}

function Badge({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.chip, borderWidth: 1, borderColor: tint }}>
      <Text style={{ fontFamily: font.medium, fontSize: 11, color: tint }}>{label}</Text>
    </View>
  );
}
