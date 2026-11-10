import assert from 'node:assert/strict';
import test from 'node:test';
import { drawFlashLightning } from '../src/flash-lightning.js';

function handPoints(scale = 1) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  points[0] = { x: 150 * scale, y: 300 * scale };
  points[5] = { x: 100 * scale, y: 180 * scale };
  points[9] = { x: 130 * scale, y: 170 * scale };
  points[13] = { x: 160 * scale, y: 175 * scale };
  points[17] = { x: 190 * scale, y: 190 * scale };
  return points;
}

function mockContext() {
  const calls = [];
  let path = [];
  return {
    calls,
    save() { calls.push({ type: 'save' }); },
    restore() { calls.push({ type: 'restore' }); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ x, y }); },
    lineTo(x, y) { path.push({ x, y }); },
    stroke() {
      calls.push({
        type: 'stroke',
        path: path.map((point) => ({ ...point })),
        lineWidth: this.lineWidth,
        strokeStyle: this.strokeStyle,
        shadowBlur: this.shadowBlur,
      });
    },
  };
}

test('draws layered lightning around the fist and forearm', () => {
  const ctx = mockContext();

  assert.equal(drawFlashLightning(ctx, handPoints(), 900, 'Left'), true);
  const strokes = ctx.calls.filter((call) => call.type === 'stroke');

  assert.equal(strokes.length, 36);
  assert.ok(strokes.every((stroke) => stroke.path.length >= 3));
  const boltWidth = Math.hypot(90, 10) * 0.025;
  assert.deepEqual(
    strokes.slice(0, 3).map((stroke) => stroke.lineWidth),
    [boltWidth * 4.2, boltWidth * 1.8, Math.max(1, boltWidth * 0.48)],
  );
  assert.equal(ctx.calls.filter((call) => call.type === 'save').length, 12);
  assert.equal(ctx.calls.filter((call) => call.type === 'restore').length, 12);
});

test('uses the same bolt paths for the same hand and frame time', () => {
  const first = mockContext();
  const second = mockContext();

  drawFlashLightning(first, handPoints(), 900, 'Left');
  drawFlashLightning(second, handPoints(), 900, 'Left');

  assert.deepEqual(
    first.calls.filter((call) => call.type === 'stroke'),
    second.calls.filter((call) => call.type === 'stroke'),
  );
});

test('changes bolt flicker and path shape as frame time advances', () => {
  const first = mockContext();
  const later = mockContext();

  drawFlashLightning(first, handPoints(), 900, 'Left');
  drawFlashLightning(later, handPoints(), 980, 'Left');

  const firstStroke = first.calls.find((call) => call.type === 'stroke');
  const laterStroke = later.calls.find((call) => call.type === 'stroke');
  assert.notDeepEqual(firstStroke.path, laterStroke.path);
  assert.notEqual(firstStroke.strokeStyle, laterStroke.strokeStyle);
});

test('keeps each hand key on a separate lightning phase', () => {
  const left = mockContext();
  const right = mockContext();

  drawFlashLightning(left, handPoints(), 900, 'Left');
  drawFlashLightning(right, handPoints(), 900, 'Right');

  const leftStroke = left.calls.find((call) => call.type === 'stroke');
  const rightStroke = right.calls.find((call) => call.type === 'stroke');
  assert.notDeepEqual(leftStroke.path, rightStroke.path);
});

test('scales bolt width with palm width', () => {
  const narrow = mockContext();
  const wide = mockContext();

  drawFlashLightning(narrow, handPoints(), 900, 'Left');
  drawFlashLightning(wide, handPoints(2), 900, 'Left');

  const narrowWidth = narrow.calls.find((call) => call.type === 'stroke').lineWidth;
  const wideWidth = wide.calls.find((call) => call.type === 'stroke').lineWidth;
  assert.equal(wideWidth, narrowWidth * 2);
});

test('skips missing, incomplete, and non-finite hand anchors', () => {
  const ctx = mockContext();
  const points = handPoints();

  assert.equal(drawFlashLightning(ctx, null, 900, 'Left'), false);
  assert.equal(drawFlashLightning(ctx, [], 900, 'Left'), false);
  assert.equal(drawFlashLightning(ctx, points.slice(0, 17), 900, 'Left'), false);
  points[9] = { x: Number.NaN, y: 170 };
  assert.equal(drawFlashLightning(ctx, points, 900, 'Left'), false);
  assert.equal(ctx.calls.length, 0);
});

test('skips hands with no usable palm width or forearm length', () => {
  const ctx = mockContext();
  const narrowPalm = handPoints();
  narrowPalm[17] = { x: 110, y: 181 };
  const shortForearm = handPoints();
  shortForearm[0] = { x: 145, y: 178.75 };

  assert.equal(drawFlashLightning(ctx, narrowPalm, 900, 'Left'), false);
  assert.equal(drawFlashLightning(ctx, shortForearm, 900, 'Left'), false);
  assert.equal(ctx.calls.length, 0);
});
