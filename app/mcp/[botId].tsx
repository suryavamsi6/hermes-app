// MCP servers for one bot: list, add (URL + optional auth header), enable/disable, remove, and install
// from Hermes's approved MCP catalog (live: through hermes-bridge).
import { useLocalSearchParams } from "expo-router";
import { Plug, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { McpCatalogEntry } from "../../src/backend";
import { useApp, useBot } from "../../src/app-state";
import { useLoad } from "../../src/use-load";
import { Button, Chip, ComingSoon, Empty, ErrorText, Field, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { colors, font, type } from "../../src/ui/theme";
import { SkeletonRows } from "../../src/ui/motion";

export default function McpScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const servers = useLoad(bot && backend ? () => backend.listMcp(bot) : null, [bot?.id, backend]);
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false); const [restart, setRestart] = useState<"idle" | "busy" | "done">("idle");
  const [tab, setTab] = useState<"connected" | "catalog">("connected");
  const catalog = useLoad(bot && backend?.listMcpCatalog && tab === "catalog" ? () => backend.listMcpCatalog!(bot) : null, [bot?.id, backend, tab]);
  const [open, setOpen] = useState<string | null>(null); const [env, setEnv] = useState<Record<string, string>>({});
  if (!bot || !backend) return null;

  async function act(f: () => Promise<void>) {
    setError(null);
    try { await f(); setChanged(true); } catch (e: any) { setError(String(e?.message ?? e)); }
    void servers.reload();
  }
  async function add() {
    setBusy(true); setError(null);
    try { await backend!.addMcp(bot!, { name: name.trim(), url: url.trim(), authHeader: auth.trim() || undefined }); setName(""); setUrl(""); setAuth(""); setChanged(true); await servers.reload(); }
    catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  }
  return (
    <Screen title="MCP servers" subtitle={`${bot.emoji} ${bot.name}`}>
      {servers.comingSoon ? <ComingSoon what="Managing MCP servers" /> : (
        <>
          {backend.listMcpCatalog ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Connected" selected={tab === "connected"} onPress={() => setTab("connected")} />
              <Chip label="Catalog" selected={tab === "catalog"} onPress={() => setTab("catalog")} />
            </View>
          ) : null}
          {tab === "catalog" ? (
            <>
              {(catalog.data ?? []).map((e) => <CatalogCard key={e.name} e={e} open={open === e.name} env={env} busy={busy}
                onOpen={() => { setOpen(open === e.name ? null : e.name); setEnv({}); setError(null); }}
                onEnv={(k, v) => setEnv({ ...env, [k]: v })}
                onInstall={async () => { setBusy(true); setError(null); try { await backend.installMcpCatalog!(bot, e.name, env); setOpen(null); setEnv({}); setChanged(true); await catalog.reload(); void servers.reload(); } catch (err: any) { setError(String(err?.message ?? err)); } finally { setBusy(false); } }} />)}
              {catalog.loading && !catalog.data ? <SkeletonRows /> : null}
              {catalog.data?.length === 0 ? <Empty emoji="📚" title="Catalog is empty" body="This Hermes has no approved MCP entries." /> : null}
              {changed ? <Text style={[type.bodySm, { color: colors.success }]}>Installed. Open Connected and tap "Restart Hermes to apply".</Text> : null}
              <ErrorText error={catalog.error} />
              <ErrorText error={error} />
            </>
          ) : null}
          {tab === "connected" ? <>
          <Section title="Connected">
            {(servers.data ?? []).map((s, i, all) => (
              <Row key={s.name} last={i === all.length - 1} icon={<Plug size={18} color={s.enabled ? colors.success : colors.dim} />}
                title={s.name} detail={`${s.url}${s.tools != null ? ` · ${s.tools} tools` : ""}${s.hasAuth ? " · 🔒" : ""}`}
                right={<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Toggle value={s.enabled} onChange={(v) => void act(() => backend.setMcpEnabled(bot, s.name, v))} />
                  <Pressable hitSlop={8} accessibilityLabel={`Remove ${s.name}`} onPress={() => void act(() => backend.removeMcp(bot, s.name))}><Trash2 size={17} color={colors.dim} /></Pressable>
                </View>} />
            ))}
            {servers.data?.length === 0 ? <Empty emoji="🔌" title="Nothing plugged in" body={`Give ${bot.name} new powers by connecting an MCP server.`} /> : null}
          </Section>
          {changed && backend.restartGateway ? (
            <Section footer="MCP changes take effect on the next Hermes gateway restart. Restarting stops replies that are in progress.">
              <View style={{ padding: 12 }}>
                <Button kind="secondary" title={restart === "busy" ? "Restarting…" : restart === "done" ? "Restart requested ✓" : "Restart Hermes to apply"} disabled={restart !== "idle"}
                  onPress={async () => { setRestart("busy"); setError(null); try { await backend.restartGateway!(); setRestart("done"); } catch (e: any) { setError(String(e?.message ?? e)); setRestart("idle"); } }} />
              </View>
            </Section>
          ) : null}
          <Section title="Add a server" footer="Saved to this bot's config.yaml. A token is stored in its .env, never in config.">
            <View style={{ padding: 12, gap: 12 }}>
              <Field label="Name" placeholder="tools-hub" autoCapitalize="none" value={name} onChangeText={setName} />
              <Field label="URL" placeholder="https://mcp.example.com/mcp" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} />
              <Field label="Bearer token (optional)" placeholder="Sent as Authorization: Bearer …" autoCapitalize="none" secureTextEntry value={auth} onChangeText={setAuth} />
              <Button title={busy ? "Connecting…" : "Connect"} disabled={!name.trim() || !url.trim() || busy} onPress={() => void add()} />
              <ErrorText error={error} />
            </View>
          </Section>
          </> : null}
        </>
      )}
      <ErrorText error={servers.error} />
    </Screen>
  );
}

function CatalogCard({ e, open, env, busy, onOpen, onEnv, onInstall }: {
  e: McpCatalogEntry; open: boolean; env: Record<string, string>; busy: boolean;
  onOpen: () => void; onEnv: (k: string, v: string) => void; onInstall: () => void;
}) {
  const missing = e.requiredEnv.some((v) => v.required && !env[v.name]?.trim());
  return (
    <Section>
      <View style={{ padding: 14, gap: 6 }}>
        <Text style={type.title}>{e.name}</Text>
        {e.description ? <Text style={type.bodySm}>{e.description}</Text> : null}
        <Text selectable style={[type.label, { fontFamily: font.mono, color: colors.dim }]} numberOfLines={2}>{e.url || e.command || e.transport}</Text>
        {e.installed ? <Text style={[type.label, { color: colors.success }]}>Installed{e.enabled ? "" : " (off)"} ✓</Text> : !open ? (
          <View style={{ alignSelf: "flex-start", marginTop: 4 }}><Button kind="secondary" title="Install" onPress={onOpen} /></View>
        ) : (
          <View style={{ gap: 10, marginTop: 6 }}>
            {e.requiredEnv.map((v) => <Field key={v.name} label={`${v.name}${v.required ? "" : " (optional)"}`} placeholder={v.prompt || "Value"} autoCapitalize="none" secureTextEntry
              value={env[v.name] ?? ""} onChangeText={(t) => onEnv(v.name, t)} />)}
            {e.authType === "oauth" ? <Text style={[type.label, { color: colors.warning }]}>This one signs in with OAuth. After installing, finish sign-in from the Hermes dashboard on the server.</Text> : null}
            {e.requiredEnv.length ? <Text style={[type.label, { color: colors.dim }]}>Values go to this bot's .env on the server, never into config.yaml.</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button kind="secondary" title="Cancel" onPress={onOpen} />
              <Button title={busy ? "Installing…" : "Install"} disabled={busy || missing} onPress={onInstall} />
            </View>
          </View>
        )}
      </View>
    </Section>
  );
}
