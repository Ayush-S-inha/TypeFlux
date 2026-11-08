import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIronManRepulsorEffects,
  createSpiderManWebEffect,
  distanceToEdge,
  drawIronManRepulsor,
  drawIronManRepulsorFlash,
  drawSpiderManWeb,
} from '../src/hand-effects.js';

function handPoints() {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  points[0] = { x: 100, y: 200 };
  points[5] = { x: 110, y: 180 };
  points[8] = { x: 130, y: 150 };
  points[9] = { x: 120, y: 178 };
  points[12] = { x: 140, y: 120 };
  points[13] = { x: 125, y: 183 };
  points[17] = { x: 90, y: 185 };
  return points;
}

function mockContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); },
    arc() { calls.push('arc'); },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
  };
  return ctx;
}

test('Spider-Man web starts between the wrist and palm and follows the index finger', () => {
  const points = handPoints();
  const effect = createSpiderManWebEffect(points);
  const palm = {
    x: (100 + 110 + 120 + 125 + 90) / 5,
    y: (200 + 180 + 178 + 183 + 185) / 5,
  };
  const length = Math.hypot(20, -30);

  assert.equal(effect.type, 'web');
  assert.equal(effect.x, 100 * 0.58 + palm.x * 0.42);
  assert.equal(effect.y, 200 * 0.58 + palm.y * 0.42);
  assert.ok(Math.abs(effect.vx - 20 / length) < 1e-12);
  assert.ok(Math.abs(effect.vy + 30 / length) < 1e-12);
  assert.equal(effect.duration, 820);
  assert.equal(effect.flightRatio, 0.52);
});

test('Spider-Man web rejects missing landmarks and a zero-length index direction', () => {
  const points = handPoints();
  assert.equal(createSpiderManWebEffect([]), null);
  points[8] = { ...points[5] };
  assert.equal(createSpiderManWebEffect(points), null);
});

test('Iron Man repulsor starts at the palm and follows the middle finger', () => {
  const effects = createIronManRepulsorEffects(handPoints());
  const palmX = (100 + 110 + 120 + 125 + 90) / 5;
  const palmY = (200 + 180 + 178 + 183 + 185) / 5;
  const length = Math.hypot(40, -80);

  assert.equal(effects.length, 2);
  assert.equal(effects[0].type, 'repulsor');
  assert.equal(effects[0].x, palmX);
  assert.equal(effects[0].y, palmY);
  assert.ok(Math.abs(effects[0].vx - 40 / length) < 1e-12);
  assert.ok(Math.abs(effects[0].vy + 80 / length) < 1e-12);
  assert.equal(effects[0].duration, 620);
  assert.equal(effects[1].type, 'repulsor-flash');
  assert.equal(effects[1].duration, 260);
});

test('Iron Man repulsor rejects a missing palm or zero-length firing direction', () => {
  const points = handPoints();
  assert.deepEqual(createIronManRepulsorEffects([]), []);
  points[12] = { ...points[0] };
  assert.deepEqual(createIronManRepulsorEffects(points), []);
});

test('screen edge distance follows the first boundary reached', () => {
  assert.equal(distanceToEdge(40, 50, 1, 0, 100, 100), 60);
  assert.equal(distanceToEdge(40, 50, 0, -1, 100, 100), 50);
  assert.equal(distanceToEdge(40, 50, 0, 0, 100, 100), Math.hypot(100, 100));
});

test('web and repulsor render through the supplied Canvas context', () => {
  const ctx = mockContext();
  const web = createSpiderManWebEffect(handPoints());
  const [repulsor, flash] = createIronManRepulsorEffects(handPoints());

  drawSpiderManWeb(ctx, web, 0.32, distanceToEdge(web.x, web.y, web.vx, web.vy, 800, 600));
  drawIronManRepulsor(ctx, repulsor, 0.3, 800, 600);
  drawIronManRepulsorFlash(ctx, flash, 0.3);

  assert.ok(ctx.calls.includes('lineTo'));
  assert.ok(ctx.calls.includes('stroke'));
  assert.ok(ctx.calls.includes('arc'));
  assert.ok(ctx.calls.includes('fill'));
  assert.equal(ctx.calls.filter((call) => call === 'save').length,
    ctx.calls.filter((call) => call === 'restore').length);
});
