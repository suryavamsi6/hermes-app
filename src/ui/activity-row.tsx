// The live status line while Hermes works: a small thinking face and a softly pulsing phrase
// ("Searching the web", "Running git status") instead of bare typing dots. Each new phrase
// fades in once; the pulse runs on the UI thread.
//
// No Reanimated layout animations (entering/exiting) here: this row lives inside the chat's inverted
// FlatList, and on Android an `exiting` view keeps its removed ancestors alive as a "ghost" drawn over
// the list until the animation ends. When the reply row was replaced mid-animation (stream finished,
// history re-synced) the ghost of the whole reply bubble stuck on top of the chat (v0.10.4 fix).
import { memo, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import type { Bot } from "../backend";
import { idlePool, nextPhrase, phraseDelay, type IdleKind } from "./activity";
import type { FaceMood } from "./face-state";
import { Avatar } from "./kit";
import { Rise, usePulse } from "./motion";
import { colors, type } from "./theme";

/** While nothing concrete is happening, rotate calm phrases every 4-6 s (random, no immediate repeat).
 *  A concrete line (a running tool, a thinking summary, "Waiting for your OK") always wins. */
function useLine(bot: Bot, text: string, idle?: IdleKind | null): string {
  const pool = idle ? idlePool(idle, bot) : null;
  const key = pool ? pool.join("|") : "";
  const recent = useRef<string[]>([]);
  const [phrase, setPhrase] = useState(() => (pool ? nextPhrase(pool, []) : text));
  useEffect(() => {
    if (!pool) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = (first: boolean) => {
      const p = first && pool.includes(phrase) ? phrase : nextPhrase(pool, recent.current);
      recent.current = [...recent.current, p].slice(-6);
      setPhrase(p);
      timer = setTimeout(() => step(false), phraseDelay());
    };
    step(true);
    return () => clearTimeout(timer);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return pool ? phrase : text;
}

/** Soft opacity crossfade when the phrase changes, on the text only (the row itself never animates
 *  in or out). Reduced motion: a plain swap. */
function useCrossfade(target: string): [string, ReturnType<typeof useAnimatedStyle>] {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const o = useSharedValue(1);
  useEffect(() => {
    if (target === shown) return;
    if (reduced) { setShown(target); return; }
    o.value = withTiming(0, { duration: 180 });
    const t = setTimeout(() => { setShown(target); o.value = withTiming(1, { duration: 260 }); }, 180);
    return () => clearTimeout(t);
  }, [target, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return [shown, useAnimatedStyle(() => ({ opacity: o.value }))];
}

export const ActivityRow = memo(function ActivityRow({ bot, text, idle, mood = "thinking" }: { bot: Bot; text: string; idle?: IdleKind | null; mood?: FaceMood }) {
  const pulse = usePulse();
  const [shown, fade] = useCrossfade(useLine(bot, text, idle));
  return (
    <Rise dy={0} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingVertical: 2 }}>
      <Avatar bot={bot} size={24} mood={mood} badge={false} />
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        <Animated.View style={pulse}>
          <Animated.Text numberOfLines={1} accessibilityLiveRegion="polite" style={[type.body, { color: colors.muted }, fade]}>{shown}</Animated.Text>
        </Animated.View>
      </View>
    </Rise>
  );
});
