import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_STEP,
  EASE_BEND,
  EASE_FLICK,
  EASE_FLIP,
  EASE_GLIDE,
  RING_CIRC,
  RING_COUNT,
  RING_DEFAULTS,
  RING_RADIUS,
  cardPose,
  frontCardIndex,
  parseCssColor,
  wrapArc,
} from '../src/renderer/card-ring-engine.mjs';

test('ring geometry closes smoothly and wraps arc positions into [-C/2, C/2)', () => {
  assert.equal(RING_COUNT, 22);
  assert.equal(CARD_STEP, 198);
  assert.equal(RING_CIRC, 22 * 198);
  assert.ok(Math.abs(RING_RADIUS - 693.28) < 0.05);

  assert.equal(wrapArc(0), 0);
  assert.equal(wrapArc(RING_CIRC), 0);
  assert.equal(wrapArc(-RING_CIRC), 0);
  assert.ok(wrapArc(RING_CIRC * 0.5 - 1) > 0);
  assert.ok(wrapArc(RING_CIRC * 0.5) === -RING_CIRC * 0.5);

  assert.equal(frontCardIndex(0), 0);
  assert.equal(frontCardIndex(CARD_STEP), 1);
  assert.equal(frontCardIndex(-CARD_STEP), RING_COUNT - 1);
});

test('signed curvature places cards accurately in Inside, flat, and Outside states', () => {
  const insideFront = cardPose(0, 0, 1, 0);
  assert.equal(insideFront.cx, 0);
  assert.equal(insideFront.cz, 0);
  assert.equal(insideFront.theta, 0);

  // Inside: side cards curve toward the viewer (+z)
  const insideSide = cardPose(2, 0, 1, 0);
  assert.ok(insideSide.cx > 0);
  assert.ok(insideSide.cz > 0);

  // Flat: c = 0 places cards along x = s, z = 0
  const flatSide = cardPose(2, 0, 0, 0);
  assert.equal(flatSide.cx, 2 * CARD_STEP);
  assert.equal(flatSide.cz, 0);
  assert.equal(flatSide.a, 0);

  // Outside: side cards curve away from viewer (-z), and full flip turns front card by PI
  const outsideFront = cardPose(0, 0, -1, 1);
  assert.equal(outsideFront.cx, 0);
  assert.equal(outsideFront.cz, 0);
  assert.ok(Math.abs(outsideFront.turn - Math.PI) < 1e-6);

  const outsideSide = cardPose(2, 0, -1, 1);
  assert.ok(outsideSide.cz < 0);

  // Mid-flip wave: front card leads side cards
  const midFront = cardPose(0, 0, -1, 0.5);
  const midSide = cardPose(4, 0, -1, 0.5);
  assert.ok(midFront.turn > midSide.turn);
});

test('cubic-bezier easings, defaults, and CSS color parser match spec', () => {
  for (const fn of [EASE_BEND, EASE_FLIP, EASE_GLIDE, EASE_FLICK]) {
    assert.equal(fn(0), 0);
    assert.equal(fn(1), 1);
    const mid = fn(0.5);
    assert.ok(mid > 0 && mid < 1);
  }
  assert.deepEqual(RING_DEFAULTS, {
    pIn: 860,
    rim: 160,
    dispersion: 25,
    pOut: 1500,
    blur: 14,
    farFade: 50,
    flow: 20,
    corner: 32,
  });
  assert.deepEqual(parseCssColor('#ffffff'), [1, 1, 1]);
  assert.deepEqual(parseCssColor('rgb(0, 255, 0)'), [0, 1, 0]);
});
