// Hands-free voice call with a bot: listen (Android speech recognizer) → send → wait for the reply →
// read it aloud → listen again, until you hang up. Text goes through the normal Bot Chat, so the
// call shows up in the chat afterwards. Hermes's API takes text only, so no audio is uploaded.
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { router, useLocalSearchParams } from "expo-router";
import { Mic, PhoneOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useBot, useChat } from "../../src/app-state";
import type { AssistantTurn } from "../../src/chat-model";
import { getPrefs } from "../../src/prefs";
import { tapHaptic } from "../../src/ui/haptics";
import { Avatar } from "../../src/ui/kit";
import { colors, font, type } from "../../src/ui/theme";

type Phase = "starting" | "listening" | "thinking" | "speaking" | "ended";
const speakable = (md: string) => md.replace(/```[\s\S]*?```/g, " (code) ").replace(/[#*_`>|]+/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();

export default function CallScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const bot = useBot(botId);
  const { send } = useApp();
  const chat = useChat(bot?.id);
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("starting");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const live = useRef(true);
  const waitingFor = useRef<number>(0); // number of turns when we sent; the reply is the next assistant turn

  const listen = useCallback(async () => {
    if (!live.current) return;
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) { setNote("Allow the microphone for Hermes to use voice calls."); setPhase("ended"); return; }
      setHeard(""); setPhase("listening");
      ExpoSpeechRecognitionModule.start({ interimResults: true, continuous: false, addsPunctuation: true });
    } catch (e: any) { setNote(String(e?.message ?? e)); setPhase("ended"); }
  }, []);

  useSpeechRecognitionEvent("result", (e) => {
    if (!live.current) return;
    const said = e.results[0]?.transcript?.trim() ?? "";
    setHeard(said);
    if (e.isFinal && said && bot) { tapHaptic(); waitingFor.current = chat.turns.length; setPhase("thinking"); void send(bot, said); }
  });
  useSpeechRecognitionEvent("error", (e) => {
    if (!live.current) return;
    if (e.error === "no-speech" || e.error === "speech-timeout") { void listen(); return; } // keep the line open
    if (e.error !== "aborted") { setNote(e.message || e.error); setPhase("ended"); }
  });

  // When the reply to what we said finishes, read it aloud, then listen again.
  useEffect(() => {
    if (phase !== "thinking") return;
    const reply = chat.turns.slice(waitingFor.current).find((t) => t.role === "assistant") as AssistantTurn | undefined;
    if (!reply || reply.status === "streaming") return;
    const text = reply.status === "completed" ? speakable(reply.text) : "Sorry, that didn't work.";
    setPhase("speaking");
    Speech.speak(text || "Done.", { rate: getPrefs().readAloudRate, onDone: () => void listen(), onStopped: () => {}, onError: () => void listen() });
  }, [chat.turns, phase, listen]);

  useEffect(() => { void listen(); return () => { live.current = false; try { ExpoSpeechRecognitionModule.abort(); } catch {} Speech.stop(); }; }, [listen]);

  const hangUp = () => { live.current = false; try { ExpoSpeechRecognitionModule.abort(); } catch {} Speech.stop(); setPhase("ended"); router.back(); };
  if (!bot) return null;
  const label = { starting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", ended: note ?? "Call ended" }[phase];
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "space-between", paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }}>
      <View style={{ alignItems: "center", gap: 18 }}>
        <Avatar bot={bot} size={150} mood={phase === "thinking" ? "thinking" : phase === "speaking" ? "working" : phase === "listening" ? "listening" : "idle"} badge={false} />
        <Text style={[type.title, { fontSize: 26, lineHeight: 32 }]}>{bot.name}</Text>
        <Text style={[type.body, { color: colors.muted }]} accessibilityLiveRegion="polite">{label}</Text>
        {heard ? <Text style={[type.body, { color: colors.textSecondary, textAlign: "center", paddingHorizontal: 32 }]} numberOfLines={4}>"{heard}"</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 40 }}>
        {phase === "ended" || phase === "speaking" ? (
          <Pressable accessibilityLabel="Talk" onPress={() => { Speech.stop(); live.current = true; void listen(); }}
            style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.control, alignItems: "center", justifyContent: "center" }}>
            <Mic size={28} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel="Hang up" onPress={hangUp}
          style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
          <PhoneOff size={28} color="#fff" />
        </Pressable>
      </View>
      <Text style={{ fontFamily: font.regular, fontSize: 12, color: colors.dim }}>Uses the phone's speech recognizer and voice. Text only is sent to Hermes.</Text>
    </View>
  );
}
