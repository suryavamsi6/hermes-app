import { router } from "expo-router";
import { ChevronDown, ChevronRight, X } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BridgeClient } from "../src/bridge";
import { bridgeTarget, type HermesConfig } from "../src/config";
import { HermesClient } from "../src/hermes";
import { useApp } from "../src/app-state";
import { Logo } from "../src/ui/logo";
import { colors, font, radii, type } from "../src/ui/theme";

export default function Settings() {
  const { config, save, demo, setDemo } = useApp();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<HermesConfig>({ bridgeUrl: "", bridgeKey: "", ...(config ?? { baseUrl: "", apiKey: "", cfClientId: "", cfClientSecret: "" }) });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [failed, setFailed] = useState(false);
  // Cloudflare Access is only for a Cloudflare Tunnel setup; Tailscale Funnel needs just the key.
  const [cfOpen, setCfOpen] = useState(!!(config?.cfClientId || config?.cfClientSecret));
  const field = (k: keyof HermesConfig, label: string, opts: { secret?: boolean; placeholder: string; hint: string; url?: boolean }) => (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={f[k]} onChangeText={(v) => setF({ ...f, [k]: v })} secureTextEntry={opts.secret} autoCapitalize="none" autoCorrect={false}
        placeholder={opts.placeholder} keyboardType={opts.url ? "url" : "default"} accessibilityLabel={label}
        placeholderTextColor={colors.dim} style={{ backgroundColor: colors.control, color: colors.text, fontFamily: font.regular, fontSize: 15,
          borderRadius: radii.inset, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }} />
      <Text style={[type.label, { fontSize: 12, color: colors.dim }]}>{opts.hint}</Text>
    </View>
  );
  // Trim, drop trailing slashes, and add https:// when the scheme is missing.
  const url = (v = "") => { const u = v.trim().replace(/\/+$/, ""); return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u; };
  const normalized = (): HermesConfig => ({
    baseUrl: url(f.baseUrl), apiKey: f.apiKey.trim(), cfClientId: f.cfClientId.trim(), cfClientSecret: f.cfClientSecret.trim(),
    bridgeUrl: url(f.bridgeUrl), bridgeKey: (f.bridgeKey ?? "").trim(),
  });
  /** hermes-bridge is optional: a problem with it is reported, but the Hermes connection is still saved. */
  async function checkBridge(c: HermesConfig): Promise<string | null> {
    const t = bridgeTarget(c);
    if (!t) return null;
    try {
      const st = await new BridgeClient({ ...t, cfClientId: c.cfClientId, cfClientSecret: c.cfClientSecret }).status();
      return st.ok ? null : (st.message ?? st.code ?? "not ready");
    } catch (e: any) { return String(e?.message ?? e); }
  }
  const explain = (msg: string) =>
    /^403\b/.test(msg) ? (f.cfClientId ? "Cloudflare Access refused (403). Check the Access client ID and secret, and that the app's policy is Service Auth with this token." : "The server refused the request (403). If it sits behind Cloudflare Access, fill in the Cloudflare Access section.")
    : /^401\b/.test(msg) ? "Hermes refused the API key (401). Use the API_SERVER_KEY from the homelab."
    : /^404\b/.test(msg) ? "Reached a server, but not the Hermes API (404). Check the server URL."
    : /network|fetch|failed to connect|unable to resolve/i.test(msg) ? `Can't reach the server (${msg}). Check the URL and that Funnel is on (tailscale funnel status on the homelab).`
    : msg;
  async function saveOnly() { const c = normalized(); await save(c); router.replace("/"); }

  async function testAndSave() {
    setBusy(true); setStatus(null); setFailed(false);
    const c = normalized(); setF(c);
    if (!c.baseUrl || !c.apiKey) { setStatus({ ok: false, text: "Fill in the server URL and the Hermes API key." }); setBusy(false); return; }
    if (!/^https:\/\//i.test(c.baseUrl)) { setStatus({ ok: false, text: "Use an https:// address (your Cloudflare hostname)." }); setBusy(false); return; }
    // The bridge key travels with every bridge call: never over plain http.
    if (c.bridgeUrl?.trim() && !/^https:\/\//i.test(c.bridgeUrl.trim())) { setStatus({ ok: false, text: "The bridge URL must be https:// too." }); setBusy(false); return; }
    try {
      await new HermesClient(c).capabilities(); // authenticated: proves CF Access + Hermes key
      await save(c);
      const bridgeProblem = await checkBridge(c);
      if (bridgeProblem) { setStatus({ ok: false, text: `Connected to Hermes and saved. hermes-bridge isn't working yet: ${bridgeProblem}` }); return; }
      setStatus({ ok: true, text: bridgeTarget(c) ? "Connected · hermes-bridge ready" : "Connected" });
      router.replace("/");
    } catch (e: any) { setStatus({ ok: false, text: explain(String(e?.message ?? e)) }); setFailed(true); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Logo /><Text style={type.title}>Connect to Hermes</Text></View>
          {config || demo ? <Pressable hitSlop={10} onPress={() => router.back()}><X size={22} color={colors.muted} /></Pressable> : null}
        </View>
        <Text style={type.bodySm}>Your Hermes API server on the homelab, published with Tailscale Funnel. These values are kept in the phone's encrypted secure storage (Android Keystore) and only sent to this server.</Text>
        {field("baseUrl", "Server URL", { url: true, placeholder: "https://homelab.your-tailnet.ts.net", hint: "On the server: tailscale funnel status" })}
        {field("apiKey", "Hermes API key", { secret: true, placeholder: "API_SERVER_KEY", hint: "On the server: API_SERVER_KEY in ~/.hermes/.env" })}
        <Pressable onPress={() => setCfOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: cfOpen }}
          accessibilityLabel="Cloudflare Access (optional)" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
          {cfOpen ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />}
          <Text style={[type.label, { color: colors.textSecondary }]}>Cloudflare Access (optional)</Text>
          {!cfOpen && (f.cfClientId || f.cfClientSecret) ? <Text style={[type.label, { color: colors.dim }]}>· set</Text> : null}
        </Pressable>
        {cfOpen ? (
          <View style={{ gap: 18, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border }}>
            <Text style={[type.label, { fontSize: 12, color: colors.dim }]}>Only if the server sits behind Cloudflare Access. Leave empty for Tailscale Funnel; the headers are sent only when both are filled in.</Text>
            {field("cfClientId", "Cloudflare Access Client ID", { placeholder: "xxxxxxxx.access", hint: "Zero Trust → Access → Service Tokens." })}
            {field("cfClientSecret", "Cloudflare Access Client Secret", { secret: true, placeholder: "Client Secret", hint: "Shown once when the service token is created." })}
          </View>
        ) : null}
        <View style={{ gap: 6, paddingTop: 4 }}>
          <Text style={[type.title, { fontSize: 17 }]}>Hermes bridge (optional)</Text>
          <Text style={[type.label, { fontSize: 12, color: colors.dim }]}>With hermes-bridge on the server, every Hermes profile shows up here automatically, "New bot" creates a real profile, and MCP servers, plugins, routines, skills and memory settings work from the phone. Without it, add profiles by hand.</Text>
        </View>
        {field("bridgeKey", "Bridge key", { secret: true, placeholder: "Leave empty to skip", hint: "On the server: the key hermes-bridge was started with" })}
        {f.bridgeKey?.trim() ? field("bridgeUrl", "Bridge URL", { url: true, placeholder: `${url(f.baseUrl) || "https://homelab.your-tailnet.ts.net"}/bridge`, hint: "Leave empty to use your server URL + /bridge" }) : null}
        <Pressable disabled={busy} onPress={testAndSave}
          style={{ backgroundColor: colors.action, borderRadius: radii.chip, paddingVertical: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 16, color: colors.actionForeground }}>{busy ? "Testing…" : "Test & save"}</Text>
        </Pressable>
        <Pressable onPress={async () => { await setDemo(!demo); router.replace("/"); }}
          style={{ borderRadius: radii.chip, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong }}>
          <Text style={{ fontFamily: font.semibold, fontSize: 16, color: colors.text }}>{demo ? "Leave demo mode" : "Try demo (no connection)"}</Text>
        </Pressable>
        {status ? <Text selectable style={[type.bodySm, { color: status.ok ? colors.success : colors.danger }]}>{status.text}</Text> : null}
        {failed ? (
          <Pressable onPress={() => void saveOnly()} accessibilityLabel="Save without testing" style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={[type.label, { color: colors.accentText }]}>Save anyway (test later)</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
