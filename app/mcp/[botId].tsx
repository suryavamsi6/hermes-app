// MCP servers for one bot: list, add (URL + optional auth header), enable/disable, remove.
import { useLocalSearchParams } from "expo-router";
import { Plug, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useApp, useBot } from "../../src/app-state";
import { useLoad } from "../../src/use-load";
import { Button, ComingSoon, Empty, ErrorText, Field, Row, Screen, Section, Toggle } from "../../src/ui/kit";
import { colors } from "../../src/ui/theme";

export default function McpScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { backend } = useApp();
  const servers = useLoad(bot && backend ? () => backend.listMcp(bot) : null, [bot?.id, backend]);
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false); const [restart, setRestart] = useState<"idle" | "busy" | "done">("idle");
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
        </>
      )}
      <ErrorText error={servers.error} />
    </Screen>
  );
}
