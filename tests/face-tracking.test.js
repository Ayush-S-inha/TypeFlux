import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EYE_RELEASE_HOLD_MS,
  EYE_SQUINT_HOLD_MS,
  FACE_LOST_RESET_MS,
} from '../src/config.js';
import { createFaceTrackingState } from '../src/face-tracking.js';

function makeFace() {
  return Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
}

function makeDetection(faceLandmarks, leftScore = 0, rightScore = 0) {
  return {
    faceLandmarks: [faceLandmarks],
    faceBlendshapes: [{
      categories: [
        { categoryName: 'eyeSquintLeft', score: leftScore },
        { categoryName: 'eyeSquintRight', score: rightScore },
      ],
    }],
  };
}

function projectPoint(landmark) {
  return { x: landmark.x * 1000, y: landmark.y * 700 };
}

function setEyeLandmarks(face, leftIrisX = 0.45, rightIrisX = 0.6) {
  face[468] = { x: leftIrisX, y: 0.42, z: 0 };
  face[473] = { x: rightIrisX, y: 0.42, z: 0 };
  face[33] = { x: 0.4, y: 0.43, z: 0 };
  face[133] = { x: 0.5, y: 0.43, z: 0 };
  face[159] = { x: 0.45, y: 0.4, z: 0 };
  face[145] = { x: 0.45, y: 0.44, z: 0 };
  face[362] = { x: 0.55, y: 0.43, z: 0 };
  face[263] = { x: 0.65, y: 0.43, z: 0 };
  face[386] = { x: 0.6, y: 0.4, z: 0 };
  face[374] = { x: 0.6, y: 0.44, z: 0 };
}

test('ignores missing and incomplete face landmarks', () => {
  const tracker = createFaceTrackingState();
  assert.equal(tracker.update({ faceLandmarks: [], faceBlendshapes: [] }, 1000, projectPoint), null);
  assert.equal(tracker.update(makeDetection(makeFace().slice(0, 477), 0.8, 0.8), 1100, projectPoint), null);
});

test('a single-eye squeeze does not trigger heat vision', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  const start = 2000;

  tracker.update(makeDetection(face, 0.8, 0), start, projectPoint);
  assert.equal(
    tracker.update(makeDetection(face, 0.8, 0), start + EYE_SQUINT_HOLD_MS + 20, projectPoint).laserFired,
    false,
  );
});

test('requires both eyes to stay squeezed for the configured hold time', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  const start = 2500;

  assert.equal(tracker.update(makeDetection(face, 0.8, 0.8), start, projectPoint).laserFired, false);
  assert.equal(
    tracker.update(makeDetection(face, 0.8, 0.8), start + EYE_SQUINT_HOLD_MS - 1, projectPoint).laserFired,
    false,
  );
  assert.equal(
    tracker.update(makeDetection(face, 0.8, 0.8), start + EYE_SQUINT_HOLD_MS, projectPoint).laserFired,
    true,
  );
});

test('does not fire again until both eyes reopen for the release interval', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  const start = 3000;
  const firedAt = start + EYE_SQUINT_HOLD_MS;

  tracker.update(makeDetection(face, 0.8, 0.8), start, projectPoint);
  assert.equal(tracker.update(makeDetection(face, 0.8, 0.8), firedAt, projectPoint).laserFired, true);
  assert.equal(tracker.update(makeDetection(face, 0, 0), firedAt + 1, projectPoint).laserFired, false);
  const reopenedAt = firedAt + 1 + EYE_RELEASE_HOLD_MS;
  tracker.update(makeDetection(face, 0, 0), reopenedAt, projectPoint);
  tracker.update(makeDetection(face, 0.8, 0.8), reopenedAt + 1, projectPoint);
  assert.equal(
    tracker.update(makeDetection(face, 0.8, 0.8), reopenedAt + EYE_SQUINT_HOLD_MS + 1, projectPoint).laserFired,
    true,
  );
});

test('resets squeeze timing after the face-loss cutoff', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  const start = 4000;

  tracker.update(makeDetection(face, 0.8, 0.8), start, projectPoint);
  assert.equal(tracker.update({ faceLandmarks: [], faceBlendshapes: [] }, start + FACE_LOST_RESET_MS + 1, projectPoint), null);
  const reacquiredAt = start + FACE_LOST_RESET_MS + 2;
  assert.equal(tracker.update(makeDetection(face, 0.8, 0.8), reacquiredAt, projectPoint).laserFired, false);
  assert.equal(
    tracker.update(makeDetection(face, 0.8, 0.8), reacquiredAt + EYE_SQUINT_HOLD_MS, projectPoint).laserFired,
    true,
  );
});

test('smooths iris positions while the eyes are open', () => {
  const tracker = createFaceTrackingState();
  const firstFace = makeFace();
  setEyeLandmarks(firstFace);
  const first = tracker.update(makeDetection(firstFace), 5000, projectPoint);
  assert.equal(first.eyes[0].x, 450);
  assert.equal(first.eyes[1].x, 600);

  const nextFace = makeFace();
  setEyeLandmarks(nextFace, 0.55, 0.7);
  const next = tracker.update(makeDetection(nextFace), 5067, projectPoint);
  assert.equal(next.eyes[0].x, 490);
  assert.equal(next.eyes[1].x, 640);
});

test('returns a finite unit gaze direction', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  setEyeLandmarks(face, 0.48, 0.63);
  const tracking = tracker.update(makeDetection(face), 6000, projectPoint);
  const magnitude = Math.hypot(tracking.direction.vx, tracking.direction.vy);

  assert.ok(Number.isFinite(magnitude));
  assert.ok(Math.abs(magnitude - 1) < 1e-9);
});

test('clears face history when the camera stops', () => {
  const tracker = createFaceTrackingState();
  const face = makeFace();
  tracker.update(makeDetection(face, 0.8, 0.8), 7000, projectPoint);

  tracker.reset();

  assert.equal(tracker.update(makeDetection(face, 0.8, 0.8), 7001, projectPoint).laserFired, false);
});
