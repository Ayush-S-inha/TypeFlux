import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrackerRegistry } from '../src/tracker-resources.js';

test('tracker registry closes every registered tracker once', () => {
  const registry = createTrackerRegistry();
  let closed = 0;
  const tracker = { close() { closed += 1; } };

  assert.equal(registry.add(tracker), tracker);
  registry.closeAll();
  registry.closeAll();
  assert.equal(closed, 1);
});

test('tracker registry closes resources that finish loading after page teardown', () => {
  const registry = createTrackerRegistry();
  registry.closeAll();
  let closed = 0;
  const tracker = { close() { closed += 1; } };

  assert.equal(registry.add(tracker), tracker);
  assert.equal(closed, 1);
});

test('tracker registry ignores objects without a close method', () => {
  const registry = createTrackerRegistry();
  const tracker = {};
  assert.equal(registry.add(tracker), tracker);
  assert.doesNotThrow(() => registry.closeAll());
});


test('tracker registry keeps closing tasks after one close throws', () => {
  const registry = createTrackerRegistry();
  let closed = 0;
  const warn = console.warn;
  console.warn = () => {};

  try {
    registry.add({ close() { throw new Error('GPU context already closed'); } });
    registry.add({ close() { closed += 1; } });
    registry.closeAll();
  } finally {
    console.warn = warn;
  }

  assert.equal(closed, 1);
});
