// Voice typing with Android's own speech recognizer (no paid service): words appear in the
// composer as you speak, after whatever was already typed. Tap the mic again to stop.
import { useCallback, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { setDraftText } from "../app-state";

const join = (base: string, said: string) => (base && !/\s$/.test(base) ? `${base} ${said}` : base + said);

export function useDictation(botId: string, current: () => string) {
  const [listening, setListening] = useState(false);
  const base = useRef("");
  const mine = useRef(false);

  useSpeechRecognitionEvent("result", (e) => {
    if (!mine.current) return;
    const said = e.results[0]?.transcript?.trim();
    if (said) setDraftText(botId, join(base.current, said));
    if (e.isFinal && said) base.current = join(base.current, said);
  });
  useSpeechRecognitionEvent("end", () => { if (mine.current) { mine.current = false; setListening(false); } });
  useSpeechRecognitionEvent("error", (e) => {
    if (!mine.current) return;
    mine.current = false; setListening(false);
    if (e.error === "aborted" || e.error === "no-speech" || e.error === "speech-timeout") return;
    Alert.alert("Voice typing stopped", e.error === "not-allowed" ? "Microphone access is off for Hermes. Turn it on in Android Settings → Apps → Hermes." : e.message || e.error);
  });

  const toggle = useCallback(async () => {
    if (mine.current) { ExpoSpeechRecognitionModule.stop(); return; }
    try {
      if (Platform.OS !== "web" && !ExpoSpeechRecognitionModule.isRecognitionAvailable())
        return Alert.alert("Voice typing unavailable", "This phone has no speech recognizer. Install or enable Google's speech services.");
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return Alert.alert("Microphone needed", "Allow the microphone for Hermes to type by voice.");
      base.current = current(); mine.current = true; setListening(true);
      ExpoSpeechRecognitionModule.start({ interimResults: true, continuous: false, addsPunctuation: true });
    } catch (e: any) { mine.current = false; setListening(false); Alert.alert("Voice typing unavailable", String(e?.message ?? e)); }
  }, [current]);

  return { listening, toggle };
}
