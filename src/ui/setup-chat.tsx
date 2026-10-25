// "Set up chat" for a server profile this phone has no chat key for (live + hermes-bridge): the bridge
// sets a new API_SERVER_KEY for that profile and the phone keeps it. Nothing is shown on screen.
import { useState } from "react";
import { Text, View } from "react-native";
import { useApp } from "../app-state";
import type { Bot } from "../backend";
import { Avatar, Button, ErrorText } from "./kit";
import { colors, type } from "./theme";

export function useSetupChat() {
  const { backend, reloadBots, loadChat } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (bot: Bot) => {
    if (!backend?.setupChat) return;
    setBusy(true); setError(null);
    try { const b = await backend.setupChat(bot); await reloadBots(); await loadChat(b, true); }
    catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  return { run, busy, error, available: !!backend?.setupChat };
}

export const KEY_WARNING = "This sets a new API key for the profile on your server and keeps it on this phone. Anything else that uses the profile's old key (another phone, a script) will need the new one.";

export function SetupChat({ bot }: { bot: Bot }) {
  const s = useSetupChat();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
      <Avatar bot={bot} size={84} mood={s.busy ? "thinking" : s.error ? "error" : "idle"} />
      <Text style={[type.title, { fontSize: 20 }]}>Set up chat with {bot.name}</Text>
      <Text style={[type.bodySm, { color: colors.muted, textAlign: "center" }]}>
        {bot.name} is the Hermes profile "{bot.profile}" on your server. To chat from this phone it needs its own key.
      </Text>
      <Text style={[type.label, { color: colors.dim, textAlign: "center" }]}>{KEY_WARNING}</Text>
      <View style={{ alignSelf: "stretch" }}>
        <Button title={s.busy ? "Setting up…" : "Set up chat"} disabled={s.busy || !s.available} onPress={() => void s.run(bot)} />
      </View>
      <ErrorText error={s.error} />
    </View>
  );
}
