import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Bot } from "../backend";
import { reconcileAttentionKey, type AttentionItem } from "./attention-items";
import { attentionMorphProgress, cardGeometry, cardWidthFor, reconcileMorphSelection, ringSelectionFromScrollOffset, settleTarget, spacingFor, MORPH_END_OFFSET, MORPH_START_OFFSET } from "./attention-geometry";
import { Avatar } from "./kit";
import { colors, font, type } from "./theme";

type Props = {
  items: AttentionItem[];
  bots: Bot[];
  loading?: boolean;
  scrollY: SharedValue<number>;
  onSelectRing: () => void;
};

export const ATTENTION_CLIP_HEIGHT = 238;

export function AttentionCarousel({ items, bots, loading = false, scrollY, onSelectRing }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = cardWidthFor(windowWidth);
  const spacing = spacingFor(cardWidth);
  const reducedMotion = useReducedMotion();
  const firstKey = items[0]?.key;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(firstKey);
  const [compact, setCompact] = useState(false);
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const index = Math.max(0, items.findIndex((item) => item.key === selectedKey));
  const reconciledIndex = useRef(index);
  const previousItems = useRef(items);
  const position = useSharedValue(index);
  const dragOrigin = useSharedValue(index);
  const botById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots]);
  const updateCompact = useCallback((value: boolean) => setCompact(value), []);
  const selectAt = useCallback((nextIndex: number) => {
    const item = items[nextIndex];
    if (!item) return;
    selectedKeyRef.current = item.key;
    setSelectedKey(item.key);
  }, [items]);

  useAnimatedReaction(
    () => reducedMotion ? scrollY.get() >= MORPH_END_OFFSET : ringSelectionFromScrollOffset(scrollY.get(), items.length, index).compact,
    (next, previous) => { if (next !== previous) scheduleOnRN(updateCompact, next); },
    [items.length, index, reducedMotion, scrollY, updateCompact],
  );

  useEffect(() => {
    if (!items.length) {
      setSelectedKey(undefined);
      selectedKeyRef.current = undefined;
      reconciledIndex.current = 0;
      previousItems.current = items;
      position.set(0);
      return;
    }
    if (items.some((item) => item.key === selectedKeyRef.current)) {
      if (index !== reconciledIndex.current) position.set(reducedMotion ? index : withSpring(index, { duration: 400, dampingRatio: 0.8 }));
      reconciledIndex.current = index;
      previousItems.current = items;
      return;
    }
    const nextKey = reconcileAttentionKey(selectedKeyRef.current, previousItems.current, items)
      ?? items[reconcileMorphSelection(reconciledIndex.current, previousItems.current.length, items.length)]?.key
      ?? items[0].key;
    const nextIndex = items.findIndex((item) => item.key === nextKey);
    selectedKeyRef.current = nextKey;
    setSelectedKey(nextKey);
    position.set(reducedMotion ? nextIndex : withSpring(nextIndex, { duration: 400, dampingRatio: 0.8 }));
    reconciledIndex.current = nextIndex;
    previousItems.current = items;
  }, [firstKey, index, items, position, reducedMotion]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onStart(() => { cancelAnimation(position); dragOrigin.set(position.get()); })
    .onUpdate((event) => position.set(Math.max(0, Math.min(items.length - 1, dragOrigin.get() - event.translationX / spacing))))
    .onEnd((event) => {
      const target = settleTarget(position.get(), event.velocityX, spacing, items.length);
      if (reducedMotion) { position.set(target); scheduleOnRN(selectAt, target); return; }
      position.set(withSpring(target, { duration: 400, dampingRatio: 0.8, velocity: -event.velocityX / spacing }, (finished) => {
        if (finished) scheduleOnRN(selectAt, target);
      }));
    }), [dragOrigin, items.length, position, reducedMotion, selectAt, spacing]);

  const ringMorph = useAnimatedStyle(() => {
    const progress = reducedMotion ? (scrollY.get() >= MORPH_END_OFFSET ? 1 : 0) : attentionMorphProgress(scrollY.get());
    return { opacity: progress, transform: [{ translateY: reducedMotion ? 0 : interpolate(progress, [0, 1], [-10, 0]) }] };
  });
  const hintMorph = useAnimatedStyle(() => {
    const progress = reducedMotion ? (scrollY.get() >= MORPH_END_OFFSET ? 1 : 0) : attentionMorphProgress(scrollY.get());
    return { opacity: 1 - progress };
  });

  return (
    <View style={{ height: ATTENTION_CLIP_HEIGHT, overflow: "hidden", marginBottom: 8 }}>
      {loading ? <View accessibilityLabel="Loading attention" style={{ position: "absolute", left: 20, right: 20, top: 35, height: 168, borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, opacity: 0.65 }} />
        : items.length === 0 ? <View accessibilityLabel="No attention items" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={[type.bodySm, { color: colors.muted }]}>Nothing needs your attention</Text></View>
          : <>
            <GestureDetector gesture={pan}>
              <View pointerEvents={compact ? "none" : "auto"} accessibilityElementsHidden={compact} importantForAccessibility={compact ? "no-hide-descendants" : "auto"} style={{ flex: 1, overflow: "hidden" }}>
                {items.map((item, itemIndex) => {
                  const bot = item.botId ? botById.get(item.botId) : undefined;
                  const selected = item.key === selectedKey;
                  return <AttentionCard key={item.key} item={item} bot={bot} index={itemIndex} selected={selected} width={cardWidth} spacing={spacing} position={position} scrollY={scrollY} reducedMotion={reducedMotion}
                    onSelect={() => {
                      if (selected) return;
                      if (reducedMotion) { position.set(itemIndex); selectAt(itemIndex); }
                      else position.set(withSpring(itemIndex, { duration: 400, dampingRatio: 0.8 }, (finished) => { if (finished) scheduleOnRN(selectAt, itemIndex); }));
                    }} />;
                })}
              </View>
            </GestureDetector>
            {items.length > 1 ? <Animated.Text pointerEvents="none" style={[{ position: "absolute", bottom: 8, alignSelf: "center", color: colors.muted, fontFamily: font.medium, fontSize: 12 }, hintMorph]}>
              Drag to explore
            </Animated.Text> : null}
            <RingRow items={items} selectedIndex={index} compact={compact} style={ringMorph} onSelect={(nextIndex) => {
              selectAt(nextIndex);
              onSelectRing();
            }} />
          </>}
    </View>
  );
}

function RingRow({ items, selectedIndex, compact, style, onSelect }: {
  items: AttentionItem[]; selectedIndex: number; compact: boolean; style: object; onSelect: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const ringSize = Math.max(28, Math.min(44, (width - 40 - Math.max(0, items.length - 1) * 8) / Math.max(1, items.length)));
  return <Animated.View pointerEvents={compact ? "auto" : "none"} accessibilityElementsHidden={!compact} importantForAccessibility={compact ? "auto" : "no-hide-descendants"}
    style={[{ position: "absolute", left: 16, right: 16, top: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48 }, style]}>
    {items.map((item, itemIndex) => {
      const active = itemIndex === selectedIndex;
      const tint = colors.accentText;
      return <Pressable key={item.key} onPress={() => onSelect(itemIndex)} accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.metric ? `, ${item.metric}` : ""}`} accessibilityState={{ selected: active }}
        accessibilityHint={active ? "Selected attention item" : "Select and expand this attention item"}
        style={({ pressed }) => ({ width: ringSize, height: ringSize, borderRadius: ringSize / 2, alignItems: "center", justifyContent: "center",
          borderWidth: active ? 2 : 1, borderColor: active ? tint : colors.borderStrong, backgroundColor: active ? `${tint}18` : colors.surface,
          opacity: pressed ? 0.76 : 1, shadowColor: active ? tint : "transparent", shadowOpacity: active ? 0.38 : 0,
          shadowRadius: active ? 8 : 0, shadowOffset: { width: 0, height: 0 }, elevation: active ? 3 : 0 })}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? tint : colors.muted, fontFamily: font.semibold, fontSize: Math.max(10, Math.min(13, ringSize * 0.31)), fontVariant: ["tabular-nums"] }}>{item.metric}</Text>
      </Pressable>;
    })}
  </Animated.View>;
}

function AttentionCard({ item, bot, index, selected, width, spacing, position, scrollY, reducedMotion, onSelect }: {
  item: AttentionItem; bot?: Bot; index: number; selected: boolean; width: number; spacing: number; position: SharedValue<number>;
  scrollY: SharedValue<number>; reducedMotion: boolean; onSelect: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const distance = index - position.get();
    const geometry = cardGeometry(distance, width);
    const progress = reducedMotion ? (scrollY.get() >= MORPH_END_OFFSET ? 1 : 0) : attentionMorphProgress(scrollY.get());
    return { opacity: geometry.opacity * (1 - progress), transform: [
      { perspective: 1000 }, { translateX: distance * spacing }, { translateY: geometry.translateY - (reducedMotion ? 0 : progress * 14) },
      { rotateY: `${geometry.rotateY}deg` }, { scale: geometry.scale }, { translateZ: geometry.zPush },
    ] };
  });
  const labelColor = item.kind === "failed" ? colors.danger : item.kind === "approval" ? colors.warning : colors.accentText;
  const title = item.title.length > 88 ? `${item.title.slice(0, 85)}…` : item.title;
  return <Animated.View style={[{ position: "absolute", left: "50%", marginLeft: -width / 2, top: 20, width, minHeight: 174 }, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}${item.detail ? `, ${item.detail}` : ""}${item.metric ? `, ${item.metric}` : ""}`}
      accessibilityState={{ selected }} accessibilityHint={selected ? "Currently centered" : "Center this card"} onPress={onSelect}
      style={({ pressed }) => ({ minHeight: 174, flex: 1, gap: 8, padding: 16, borderRadius: 20, borderWidth: 1,
        borderColor: selected ? colors.borderStrong : colors.border, backgroundColor: pressed ? colors.control : colors.surface, justifyContent: "center" })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {bot ? <Avatar bot={bot} size={36} badge={false} mood={item.kind === "approval" ? "waiting" : item.kind === "failed" ? "error" : "working"} /> : null}
        <View style={{ flex: 1, gap: 2 }}><Text style={[type.label, { color: labelColor, letterSpacing: 0.3 }]} numberOfLines={1}>{item.kind === "time" ? "LOCAL TIME" : item.kind.toUpperCase()}</Text>
          <Text style={[type.title, { fontFamily: font.semibold }]} numberOfLines={2}>{bot?.name ?? "Your device"}</Text></View>
        <Text style={[type.label, { color: labelColor, fontVariant: ["tabular-nums"] }]} numberOfLines={1}>{item.metric}</Text>
      </View>
      <Text style={[type.body, { fontFamily: font.medium }]} numberOfLines={2}>{title}</Text>
      {item.detail ? <Text style={[type.bodySm, { color: colors.muted }]} numberOfLines={2}>{item.detail}</Text> : null}
    </Pressable>
  </Animated.View>;
}
