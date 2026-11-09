import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawGreenLanternRing,
  drawSudarshanChakra,
} from '../src/hand-artifacts.js';

function handPoints() {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  points[5] = { x: 100, y: 100, z: 0 };
  points[9] = { x: 70, y: 80, z: 0 };
  points[10] = { x: 75, y: 60, z: 0 };
  points[13] = { x: 50, y: 100, z: 0 };
  points[17] = { x: 0, y: 100, z: 0 };
  points[8] = { x: 150, y: 200, z: -0.2 };
  return points;
}

function mockContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  return {
    calls,
    save(...args) { calls.push(['save', ...args]); },
    restore(...args) { calls.push(['restore', ...args]); },
    beginPath(...args) { calls.push(['beginPath', ...args]); },
    closePath(...args) { calls.push(['closePath', ...args]); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); },
    rotate(...args) { calls.push(['rotate', ...args]); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill(...args) { calls.push(['fill', ...args]); },
    stroke(...args) { calls.push(['stroke', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
    createLinearGradient(...args) { calls.push(['createLinearGradient', ...args]); return gradient; },
    createRadialGradient(...args) { calls.push(['createRadialGradient', ...args]); return gradient; },
  };
}

function assertCanvasStateRestored(ctx) {
  assert.equal(
    ctx.calls.filter(([name]) => name === 'save').length,
    ctx.calls.filter(([name]) => name === 'restore').length,
  );
}

test('Green Lantern ring follows the middle finger and sits over its base', () => {
  const ctx = mockContext();
  const points = handPoints();
  const centerX = 70 + (75 - 70) * 0.34;
  const centerY = 80 + (60 - 80) * 0.34;

  assert.equal(drawGreenLanternRing(ctx, points), true);
  assert.deepEqual(ctx.calls.find(([name]) => name === 'translate'), ['translate', centerX, centerY]);
  assert.ok(ctx.calls.some(([name]) => name === 'createRadialGradient'));
  assert.ok(ctx.calls.some(([name]) => name === 'arc'));
  assertCanvasStateRestored(ctx);
});

test('Green Lantern ring skips a finger that is too narrow or too short', () => {
  const narrowCtx = mockContext();
  const narrowHand = handPoints();
  narrowHand[5] = { x: 20, y: 100 };
  assert.equal(drawGreenLanternRing(narrowCtx, narrowHand), false);
  assert.equal(narrowCtx.calls.length, 0);

  const shortCtx = mockContext();
  const shortHand = handPoints();
  shortHand[10] = { ...shortHand[9] };
  assert.equal(drawGreenLanternRing(shortCtx, shortHand), false);
  assert.equal(shortCtx.calls.length, 0);
});

test('Sudarshan Chakra scales from palm width and eases toward the depth-adjusted radius', () => {
  const ctx = mockContext();
  const points = handPoints();
  const landmarks = Array.from({ length: 21 }, () => ({ z: 0 }));
  landmarks[8] = { z: -0.2 };
  const targetRadius = 172 * 1.22;
  const expectedRadius = 150 + (targetRadius - 150) * 0.2;

  const radius = drawSudarshanChakra(
    ctx,
    points[8],
    points,
    landmarks,
    150,
    1000,
  );

  assert.ok(Math.abs(radius - expectedRadius) < 1e-10);
  assert.ok(ctx.calls.some(([name, glyph]) => name === 'fillText' && glyph === 'ॐ'));
  assertCanvasStateRestored(ctx);
});

test('Sudarshan Chakra stays above the fingertip while its glyph rings rotate', () => {
  const points = handPoints();
  const landmarks = Array.from({ length: 21 }, () => ({ z: 0 }));
  const firstCtx = mockContext();
  const secondCtx = mockContext();

  const radius = drawSudarshanChakra(firstCtx, points[8], points, landmarks, undefined, 1000);
  drawSudarshanChakra(secondCtx, points[8], points, landmarks, radius, 2000);

  const firstRotation = firstCtx.calls.find(([name]) => name === 'rotate')[1];
  const secondRotation = secondCtx.calls.find(([name]) => name === 'rotate')[1];
  const firstCenter = firstCtx.calls.findLast(([name, glyph, x]) => (
    name === 'fillText' && glyph === 'ॐ' && x === points[8].x
  ));
  const secondCenter = secondCtx.calls.findLast(([name, glyph, x]) => (
    name === 'fillText' && glyph === 'ॐ' && x === points[8].x
  ));

  const radiusY = radius * 0.285;
  const firstExpected = Math.atan2(radiusY * Math.cos(1.15), -radius * Math.sin(1.15));
  const secondExpected = Math.atan2(radiusY * Math.cos(2.3), -radius * Math.sin(2.3));
  assert.ok(Math.abs(firstRotation - firstExpected) < 1e-10);
  assert.ok(Math.abs(secondRotation - secondExpected) < 1e-10);
  assert.deepEqual(firstCenter.slice(1), secondCenter.slice(1));
  assert.deepEqual(firstCenter.slice(1), ['ॐ', points[8].x, points[8].y - radius * 0.285 * 0.68]);
  assert.equal(firstCtx.calls.some(([name]) => name === 'lineTo' || name === 'arc'), false);
  assert.equal(secondCtx.calls.some(([name]) => name === 'lineTo' || name === 'arc'), false);
});

test('Sudarshan Chakra clamps its target size at both palm-width bounds', () => {
  const ctx = mockContext();
  const points = handPoints();
  points[5] = { x: 20, y: 100 };
  points[17] = { x: 0, y: 100 };
  const landmarks = Array.from({ length: 21 }, () => ({ z: 0 }));

  assert.equal(drawSudarshanChakra(ctx, points[8], points, landmarks, undefined, 0), 118);

  points[5] = { x: 500, y: 100 };
  assert.equal(drawSudarshanChakra(ctx, points[8], points, landmarks, undefined, 0), 275);
});
