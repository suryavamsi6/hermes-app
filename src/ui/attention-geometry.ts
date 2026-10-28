// Worklet-safe carousel math. Card centers keep a full card-width gap throughout every
// fractional drag position; perspective only narrows cards as they recede.
export const CARD_GAP = 16;
export const MAX_CARD_WIDTH = 296;
export const MIN_CARD_WIDTH = 176;
export const CAROUSEL_PERSPECTIVE = 1000;
export const MORPH_START_OFFSET = 8;
export const MORPH_END_OFFSET = 104;

/** Progress from expanded cards (0) to the pinned ring row (1). */
export function attentionMorphProgress(offset: number, start = 8, end = 104): number {
  "worklet";
  if (end <= start) return offset >= end ? 1 : 0;
  return Math.max(0, Math.min(1, (offset - start) / (end - start)));
}

/** Keep the selected attention key stable while Home scrolls; clamp only when the list changes. */
export function ringSelectionFromScrollOffset(offset: number, itemCount: number, selectedIndex: number): { activeIndex: number; compact: boolean } {
  "worklet";
  if (itemCount <= 0) return { activeIndex: 0, compact: attentionMorphProgress(offset) >= 0.5 };
  const clampedSelection = Math.max(0, Math.min(itemCount - 1, Math.round(selectedIndex)));
  return { activeIndex: clampedSelection, compact: attentionMorphProgress(offset) >= 0.5 };
}

export function reconcileMorphSelection(previousIndex: number, previousCount: number, nextCount: number): number {
  "worklet";
  if (nextCount <= 0) return 0;
  return Math.max(0, Math.min(nextCount - 1, previousCount <= 0 ? 0 : Math.round(previousIndex)));
}

export function cardWidthFor(viewportWidth: number): number {
  "worklet";
  return Math.max(1, Math.min(296, Math.max(176, viewportWidth * 0.74), viewportWidth - 24));
}

export function spacingFor(cardWidth: number): number {
  "worklet";
  return cardWidth + 16;
}

export function settleTarget(index: number, velocityX: number, spacing: number, count: number): number {
  "worklet";
  if (count <= 0) return 0;
  const projected = index - (velocityX / Math.max(1, spacing)) * 0.2;
  return Math.max(0, Math.min(count - 1, Math.round(projected)));
}

export function cardGeometry(distance: number, cardWidth: number) {
  "worklet";
  const d = Math.abs(distance);
  const perspective = 1000;
  const angle = Math.min(40, d * 40);
  const zPush = Math.max(0, 28 - d * 14);
  const scale = Math.max(0.66, 1 - d * 0.105);
  const perspectiveScale = perspective / (perspective - zPush);
  const projectedWidth = cardWidth * scale * Math.cos((angle * Math.PI) / 180) * perspectiveScale;
  return {
    rotateY: distance === 0 ? 0 : -Math.sign(distance) * angle,
    zPush,
    scale,
    translateY: Math.min(4, d) ** 2 * 10,
    opacity: Math.max(0.38, 1 - d * 0.17),
    projectedWidth,
  };
}

export function cardCenterX(index: number, selectedIndex: number, viewportWidth: number, cardWidth: number): number {
  "worklet";
  return viewportWidth / 2 + (index - selectedIndex) * spacingFor(cardWidth);
}
