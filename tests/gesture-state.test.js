import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GESTURE_GAP_MS,
  GESTURE_HOLD_MS,
  GESTURE_RELEASE_MS,
  HAND_LOST_RESET_MS,
} from '../src/config.js';
import { createGestureStateStore } from '../src/gesture-state.js';

const fingerShapes = (shape) => ({
  index: shape,
  middle: shape,
  ring: shape,
  pinky: shape,
});

test('keeps finger history separate for each hand', () => {
  const store = createGestureStateStore();
  const leftFingers = fingerShapes('extended');
  const rightFingers = fingerShapes('curled');

  store.settle('Left', 'HAND TRACKED', leftFingers, 1000);
  store.settle('Right', 'HAND TRACKED', rightFingers, 1000);

  assert.equal(store.getFingerStates('Left'), leftFingers);
  assert.equal(store.getFingerStates('Right'), rightFingers);
  assert.equal(store.getFingerStates('Unknown'), undefined);
});

test('activates a pose after the configured hold time', () => {
  const store = createGestureStateStore();
  const fingerState = fingerShapes('extended');
  const start = 2000;

  assert.equal(store.settle('Left', 'SPIDER-MAN WEB', fingerState, start).entered, false);
  assert.equal(
    store.settle('Left', 'SPIDER-MAN WEB', fingerState, start + GESTURE_HOLD_MS - 1).entered,
    false,
  );
  assert.equal(
    store.settle('Left', 'SPIDER-MAN WEB', fingerState, start + GESTURE_HOLD_MS).entered,
    true,
  );
  assert.equal(
    store.settle('Left', 'SPIDER-MAN WEB', fingerState, start + GESTURE_HOLD_MS + 1).entered,
    false,
  );
});

test('requires a relaxed pose before the same gesture can fire again', () => {
  const store = createGestureStateStore();
  const fingerState = fingerShapes('extended');
  const start = 3000;
  const firedAt = start + GESTURE_HOLD_MS;

  store.settle('Left', 'SPIDER-MAN WEB', fingerState, start);
  assert.equal(store.settle('Left', 'SPIDER-MAN WEB', fingerState, firedAt).entered, true);
  assert.equal(
    store.settle('Left', 'SPIDER-MAN WEB', fingerState, firedAt + GESTURE_RELEASE_MS + GESTURE_HOLD_MS).entered,
    false,
  );

  const relaxedAt = firedAt + GESTURE_RELEASE_MS;
  store.settle('Left', 'HAND TRACKED', fingerState, firedAt + 1);
  store.settle('Left', 'HAND TRACKED', fingerState, firedAt + GESTURE_GAP_MS);
  store.settle('Left', 'HAND TRACKED', fingerState, relaxedAt);
  assert.equal(
    store.settle('Left', 'HAND TRACKED', fingerState, relaxedAt + GESTURE_HOLD_MS).gesture,
    'HAND TRACKED',
  );
  store.settle('Left', 'SPIDER-MAN WEB', fingerState, relaxedAt + GESTURE_HOLD_MS + 1);
  assert.equal(
    store.settle('Left', 'SPIDER-MAN WEB', fingerState, relaxedAt + GESTURE_HOLD_MS * 2 + 1).entered,
    true,
  );
});

test('expires a missing hand at the configured timeout', () => {
  const store = createGestureStateStore();
  store.settle('Left', 'HAND TRACKED', fingerShapes('extended'), 4000);

  store.expireUnseen(new Set(), 4100);
  store.expireUnseen(new Set(), 4100 + HAND_LOST_RESET_MS - 1);
  assert.notEqual(store.getFingerStates('Left'), undefined);

  store.expireUnseen(new Set(), 4100 + HAND_LOST_RESET_MS);
  assert.equal(store.getFingerStates('Left'), undefined);
});

test('a reappearing hand restarts the missing-hand timeout', () => {
  const store = createGestureStateStore();
  const fingerState = fingerShapes('curled');
  store.settle('Right', 'HAND TRACKED', fingerState, 5000);

  store.expireUnseen(new Set(), 5100);
  store.settle('Right', 'HAND TRACKED', fingerState, 5300);
  store.expireUnseen(new Set(), 5301);
  store.expireUnseen(new Set(), 5301 + HAND_LOST_RESET_MS - 1);
  assert.notEqual(store.getFingerStates('Right'), undefined);

  store.expireUnseen(new Set(), 5301 + HAND_LOST_RESET_MS);
  assert.equal(store.getFingerStates('Right'), undefined);
});

test('clears all hand state when the camera stops', () => {
  const store = createGestureStateStore();
  store.settle('Left', 'HAND TRACKED', fingerShapes('extended'), 6000);
  store.settle('Right', 'HAND TRACKED', fingerShapes('curled'), 6000);

  store.clear();

  assert.equal(store.getFingerStates('Left'), undefined);
  assert.equal(store.getFingerStates('Right'), undefined);
});
