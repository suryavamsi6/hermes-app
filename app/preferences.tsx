// Settings hub: connection, chat, notifications (global + per bot), security, primary bot, about.
// The connection form itself stays at /settings.
import Constants from "expo-constants";
import { router } from "expo-router";
import { Bell, ExternalLink, Lock, Server, Star } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useApp } from "../src/app-state";
import { notificationStatus, openNotificationSettings, sendTestNotification, type NotifStatus } from "../src/notify";
import { describeNotifStatus } from "../src/notify-status";
import { setPrefs, usePrefs } from "../src/prefs";
import { canUseAppLock } from "../src/ui/app-lock";
import { Avatar, Chip, Row, Screen, Section, Toggle } from "../src/ui/kit";
import { colors, type } from "../src/ui/theme";

const QUIET: { label: string; v: [number | null, number | null] }[] = [
  { label: "Off", v: [null, null] }, { label: "10 PM–7 AM", v: [22, 7] }, { label: "11 PM–8 AM", v: [23, 8] }, { label: "9 PM–7 AM", v: [21, 7] },
];
const RATES = [0.8, 1, 1.2, 1.5];

export default function Preferences() {
  const { config, demo, bots, primaryId, setPrimary, backend } = useApp();
  const p = usePrefs((x) => x);
  const [lockNote, setLockNote] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotifStatus | null>(null);
  const refreshNotif = useCallback(() => { void notificationStatus().then(setNotif); }, []);
  useEffect(refreshNotif, [refreshNotif]);
  const notifLine = describeNotifStatus(notif);
  const host = config?.baseUrl ? config.baseUrl.replace(/^https?:\/\//, "") : demo ? "Demo mode" : "Not connected";
  const bridge = backend?.supports("createBot") ? "hermes-bridge connected" : "no hermes-bridge";
  const version = `${Constants.expoConfig?.version ?? "?"} (${Constants.expoConfig?.android?.versionCode ?? "?"})`;

  return (
    <Screen title="Settings">
      <Section title="Connection">
        <Row icon={<Server size={18} color={colors.muted} />} title={host} detail={`${bridge} · tap to edit or test`} onPress={() => router.push("/settings")} last />
      </Section>

      <Section title="Chat">
        <Row title="Message times" detail="Small time under each burst of messages" right={<Toggle value={p.showTimestamps} onChange={(v) => setPrefs({ showTimestamps: v })} />} />
        <Row title="Live status lines" detail={'"Searching the web…" while a bot works'} right={<Toggle value={p.showStatus} onChange={(v) => setPrefs({ showStatus: v })} />} last />
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={type.label}>Read-aloud speed</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {RATES.map((r) => <Chip key={r} label={`${r}×`} selected={p.readAloudRate === r} onPress={() => setPrefs({ readAloudRate: r })} />)}
          </View>
        </View>
      </Section>

      <Section title="Notifications" footer="Notifications come from the app itself: they work while Hermes is open or in the background, not after it's swiped away. On Samsung, set Hermes's battery use to Unrestricted so Android doesn't freeze it. Approvals still come through during quiet hours.">
        <Row icon={<Bell size={18} color={notifLine.ok ? colors.muted : colors.danger} />} title="Send test notification" detail={notifLine.text}
          onPress={() => { void sendTestNotification().then(setNotif); }} />
        <Row title="Android notification & battery settings" detail="Permission, channel, battery: Unrestricted" onPress={() => { openNotificationSettings(); setTimeout(refreshNotif, 1500); }} />
        <Row title="Replies" right={<Toggle value={p.notifyReplies} onChange={(v) => setPrefs({ notifyReplies: v })} />} />
        <Row title="Approvals" right={<Toggle value={p.notifyApprovals} onChange={(v) => setPrefs({ notifyApprovals: v })} />} />
        <Row title="Errors" right={<Toggle value={p.notifyErrors} onChange={(v) => setPrefs({ notifyErrors: v })} />} />
        <Row title="Hide message text" detail="Notifications say 'New reply' only" right={<Toggle value={p.hidePreviews} onChange={(v) => setPrefs({ hidePreviews: v })} />} last />
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={type.label}>Quiet hours</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {QUIET.map((q) => <Chip key={q.label} label={q.label} selected={p.quietStart === q.v[0] && p.quietEnd === q.v[1]} onPress={() => setPrefs({ quietStart: q.v[0], quietEnd: q.v[1] })} />)}
          </View>
        </View>
        {bots.map((b, i) => (
          <Row key={b.id} icon={<Avatar bot={b} size={26} badge={false} animate={false} />} title={b.name}
            detail={p.bots[b.id]?.muted ? "Muted" : "Notifications on"} onPress={() => router.push(`/bot-info/${b.id}`)} last={i === bots.length - 1} />
        ))}
      </Section>

      <Section title="Security" footer="Locks Hermes with your fingerprint or screen lock on launch and after a minute away.">
        <Row icon={<Lock size={18} color={colors.muted} />} title="App lock" detail={lockNote ?? undefined} last
          right={<Toggle value={p.appLock} onChange={async (v) => {
            if (v && !(await canUseAppLock())) { setLockNote("Set up a fingerprint or screen lock on the phone first."); return; }
            setLockNote(null); setPrefs({ appLock: v });
          }} />} />
      </Section>

      {bots.length > 1 ? (
        <Section title="Primary bot" footer="Shown big at the top of Home.">
          {bots.map((b, i) => <Row key={b.id} icon={<Star size={18} color={colors.star} fill={primaryId === b.id ? colors.star : "transparent"} />} title={b.name}
            onPress={() => void setPrimary(b.id)} last={i === bots.length - 1} />)}
        </Section>
      ) : null}

      <Section title="Appearance" footer="Animations follow Android's 'Remove animations' setting. Each bot's look is set in its own settings.">
        <Row title="Reduce motion" detail="Follows the system setting" last />
      </Section>

      <Section title="Data">
        <Row title="Reset preferences" danger last onPress={() => Alert.alert("Reset preferences?", "Chat, notification and security settings go back to their defaults.", [
          { text: "Cancel", style: "cancel" },
          { text: "Reset", style: "destructive", onPress: () => setPrefs({ showTimestamps: true, showStatus: true, readAloudRate: 1, notifyReplies: true, notifyApprovals: true, notifyErrors: true, hidePreviews: false, quietStart: null, quietEnd: null, bots: {}, appLock: false }) },
        ])} />
      </Section>

      <Section title="About">
        <Row title="Hermes for Android" detail={`Version ${version} · MIT licence`} />
        <Row icon={<ExternalLink size={18} color={colors.muted} />} title="Source on GitHub" detail="suryavamsi6/hermes-app" onPress={() => void Linking.openURL("https://github.com/suryavamsi6/hermes-app")} last />
      </Section>
    </Screen>
  );
}
