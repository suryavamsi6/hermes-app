// Plugins for one bot: browser providers, context engines, memory providers and tool plugins.
// Live (hermes-bridge): the plugins Hermes has installed, each with its tools; switching one on or off
// works for the profile the bridge's dashboard runs as, other profiles show the command to run instead.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useApp, useBot } from "../../src/app-state";
import type { Plugin } from "../../src/backend";
import { useLoad } from "../../src/use-load";
import { Button, Chip, ComingSoon, ErrorText, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { colors, type } from "../../src/ui/theme";

const KIND_LABEL: Record<Plugin["kind"], string> = { tools: "🧰 Tools", browser: "🌐 Browser", "context-engine": "🧩 Context engine", "memory-provider": "🧠 Memory", "model-provider": "🤖 Models", platform: "💬 Platform" };

export default function PluginsScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const plugins = useLoad(bot && backend ? () => backend.listPlugins(bot) : null, [bot?.id, backend]);
  const toolsets = useLoad(bot && backend && backend.kind === "live" ? () => backend.listToolsets(bot) : null, [bot?.id, backend]);
  const [tab, setTab] = useState<"installed" | "browse">("installed");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!bot || !backend) return null;
  const canBrowse = (plugins.data ?? []).some((p) => !p.installed);
  const list = (plugins.data ?? []).filter((p) => (tab === "installed" || !canBrowse ? p.installed : !p.installed));
  const toggle = async (p: Plugin, v: boolean) => {
    setError(null);
    try { await backend.setPluginEnabled(bot, p.name, v); } catch (e: any) { setError(String(e?.message ?? e)); }
    void plugins.reload();
  };

  return (
    <Screen title="Plugins" subtitle={`${bot.emoji} ${bot.name}`}>
      {plugins.comingSoon ? (
        <>
          <ComingSoon what="Installing and toggling plugins" />
          <Section title="Toolsets Hermes reports (plugin tools show up here)">
            {(toolsets.data ?? []).map((t, i, all) => <Row key={t.name} title={t.label} detail={t.description} last={i === all.length - 1} />)}
          </Section>
          <ErrorText error={toolsets.error} />
        </>
      ) : (
        <>
          {canBrowse ? <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Installed" selected={tab === "installed"} onPress={() => setTab("installed")} />
            <Chip label="Browse" selected={tab === "browse"} onPress={() => setTab("browse")} />
          </View> : null}
          {list.map((p) => (
            <Section key={p.name}>
              <Row title={`${p.name}${p.version ? `  v${p.version}` : ""}`} detail={`${KIND_LABEL[p.kind]}${p.source ? ` · ${p.source}` : ""}${p.description ? ` · ${p.description}` : ""}`} last
                right={p.installed && !p.toggleHint ? <Toggle value={p.enabled} onChange={(v) => void toggle(p, v)} /> : <View />} />
              {p.tools.length || p.skills.length ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 2 }}>
                  {p.tools.length ? <Text style={type.label}>Tools: {p.tools.join(", ")}</Text> : null}
                  {p.skills.length ? <Text style={type.label}>Skills: {p.skills.join(", ")}</Text> : null}
                </View>
              ) : null}
              {p.toggleHint ? <Text selectable style={[type.label, { paddingHorizontal: 14, paddingBottom: 12, color: colors.dim }]}>{p.enabled ? "On" : "Off"} for {bot.name}. Hermes's API switches plugins only for the default profile; to change it here, run on the server: {p.toggleHint}</Text> : null}
              {!p.installed ? <View style={{ padding: 12, paddingTop: 0 }}>
                <Button title={busy === p.name ? "Installing…" : "Install"} kind="secondary" disabled={busy !== null}
                  onPress={async () => { setBusy(p.name); await backend.installPlugin(bot, p.name); setBusy(null); setTab("installed"); void plugins.reload(); }} />
              </View> : null}
            </Section>
          ))}
          {list.length === 0 && plugins.data ? <Text style={[type.bodySm, { textAlign: "center" }]}>{backend.kind === "live" ? "No plugins installed. Install them on the server with: hermes plugins install <name>" : tab === "installed" ? "No plugins yet. Have a browse ✨" : "You've installed everything 🎉"}</Text> : null}
          <ErrorText error={error} />
        </>
      )}
      <ErrorText error={plugins.error} />
    </Screen>
  );
}
