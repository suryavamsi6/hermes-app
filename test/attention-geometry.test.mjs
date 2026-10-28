import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

execSync("npx -y esbuild@0.24.0 test/attention-geometry-entry.ts --bundle --platform=node --format=esm --outfile=/tmp/hm-test/attention-geometry.js --log-level=error");
const m = await import("/tmp/hm-test/attention-geometry.js");

test("carousel widths fit narrow viewports and keep an ordered gap across fractional drags", () => {
  for (const viewport of [240, 320, 390, 768]) {
    const width = m.cardWidthFor(viewport);
    assert.ok(width <= viewport - 24);
    for (const selected of [0, 0.25, 1, 1.75, 4, 4.5, 5]) {
      const centers = Array.from({ length: 6 }, (_, i) => m.cardCenterX(i, selected, viewport, width));
      for (let i = 1; i < centers.length; i++) assert.ok(centers[i] - centers[i - 1] >= width + m.CARD_GAP - 1e-9);
      for (let i = 0; i < centers.length - 1; i++) {
        const a = m.cardGeometry(i - selected, width).projectedWidth;
        const b = m.cardGeometry(i + 1 - selected, width).projectedWidth;
        assert.ok(centers[i + 1] - centers[i] > (a + b) / 2, `${viewport}px viewport at ${selected}`);
      }
    }
    const center = m.cardGeometry(0, width).projectedWidth;
    assert.ok(viewport / 2 - center / 2 >= 0);
    assert.ok(viewport / 2 + center / 2 <= viewport);
  }
});

test("cards recede monotonically from the center and tilt inward", () => {
  const rows = [0, 0.5, 1, 2, 3, 5].map((distance) => m.cardGeometry(distance, 280));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].zPush <= rows[i - 1].zPush);
    assert.ok(rows[i].scale < rows[i - 1].scale);
    assert.ok(rows[i].opacity < rows[i - 1].opacity);
    assert.ok(rows[i].translateY > rows[i - 1].translateY);
  }
  assert.equal(m.cardGeometry(-1, 280).rotateY, 40);
  assert.equal(m.cardGeometry(1, 280).rotateY, -40);
  assert.equal(rows[0].rotateY, 0);
});

test("release velocity projects to a clamped nearest spring target", () => {
  assert.equal(m.settleTarget(1.1, -1000, 200, 5), 2);
  assert.equal(m.settleTarget(1.1, 1000, 200, 5), 0);
  assert.equal(m.settleTarget(4, -900, 200, 5), 4);
  assert.equal(m.settleTarget(0, 900, 200, 5), 0);
  assert.equal(m.settleTarget(0.5, 0, 200, 5), 1);
  assert.equal(m.settleTarget(9, 0, 200, 0), 0);
  assert.equal(m.settleTarget(0, 0, 200, 1), 0);
  for (const count of [1, 2, 7]) {
    for (const index of [0, count - 0.5, count - 1]) {
      const target = m.settleTarget(index, 0, 180, count);
      assert.ok(target >= 0 && target < count);
    }
  }
});

test("attention morph maps scroll offset to bounded progress with stable boundaries", () => {
  assert.equal(m.attentionMorphProgress(0), 0);
  assert.equal(m.attentionMorphProgress(m.MORPH_START_OFFSET), 0);
  assert.equal(m.attentionMorphProgress((m.MORPH_START_OFFSET + m.MORPH_END_OFFSET) / 2), 0.5);
  assert.equal(m.attentionMorphProgress(m.MORPH_END_OFFSET), 1);
  assert.equal(m.attentionMorphProgress(1000), 1);
  assert.equal(m.attentionMorphProgress(4, 8, 8), 0);
  assert.equal(m.attentionMorphProgress(8, 8, 8), 1);
});

test("scroll ring selection preserves the selected node and clamps to surviving items", () => {
  assert.deepEqual(m.ringSelectionFromScrollOffset(0, 4, 2), { activeIndex: 2, compact: false });
  assert.deepEqual(m.ringSelectionFromScrollOffset(m.MORPH_END_OFFSET, 4, 2), { activeIndex: 2, compact: true });
  assert.deepEqual(m.ringSelectionFromScrollOffset(500, 2, 8), { activeIndex: 1, compact: true });
  assert.deepEqual(m.ringSelectionFromScrollOffset(0, 0, 3), { activeIndex: 0, compact: false });
});

test("re-expansion keeps the old position where possible and chooses the nearest survivor", () => {
  assert.equal(m.reconcileMorphSelection(2, 4, 5), 2);
  assert.equal(m.reconcileMorphSelection(3, 4, 2), 1);
  assert.equal(m.reconcileMorphSelection(0, 0, 2), 0);
  assert.equal(m.reconcileMorphSelection(2, 3, 0), 0);
});
