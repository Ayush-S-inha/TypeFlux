import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPowerGesture } from '../src/gesture-recognition.js';
import {
  distance2D,
  distance3D,
  handLandmarkSpace,
  isBackOfHandFacingCamera,
  isClosedFist,
  jointAngleDegrees,
  mapLandmarkToScreen,
} from '../src/landmark-geometry.js';

function createHandPose(extendedFingers = []) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  landmarks[0] = { x: 0, y: 0.25, z: 0 };
  landmarks[1] = { x: -0.1, y: 0.15, z: 0 };
  landmarks[2] = { x: -0.2, y: 0.12, z: 0 };
  landmarks[3] = { x: -0.25, y: 0.02, z: 0 };
  landmarks[4] = { x: -0.26, y: -0.05, z: 0 };

  const fingers = [
    ['index', [5, 6, 7, 8], -0.15],
    ['middle', [9, 10, 11, 12], -0.05],
    ['ring', [13, 14, 15, 16], 0.05],
    ['pinky', [17, 18, 19, 20], 0.15],
  ];

  for (const [name, joints, x] of fingers) {
    const [mcp, pip, dip, tip] = joints;
    landmarks[mcp] = { x, y: 0, z: 0 };
    if (extendedFingers.includes(name)) {
      landmarks[pip] = { x, y: -0.2, z: 0 };
      landmarks[dip] = { x, y: -0.4, z: 0 };
      landmarks[tip] = { x, y: -0.6, z: 0 };
    } else {
      landmarks[pip] = { x, y: -0.12, z: 0 };
      landmarks[dip] = { x: x + 0.12, y: -0.1, z: 0 };
      landmarks[tip] = { x: x + 0.02, y: -0.02, z: 0 };
    }
  }
  return landmarks;
}

function toImageLandmarks(worldLandmarks, videoWidth, videoHeight) {
  return worldLandmarks.map((point) => ({
    x: point.x / videoWidth,
    y: point.y / videoHeight,
    z: point.z / videoWidth,
  }));
}

test('distance and joint geometry handle 2D, depth, and zero-length segments', () => {
  assert.equal(distance2D({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distance3D({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 6 }), 7);
  assert.equal(jointAngleDegrees({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), 180);
  assert.equal(jointAngleDegrees({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }), 0);
});

test('handLandmarkSpace prefers complete world landmarks', () => {
  const imageLandmarks = createHandPose();
  const worldLandmarks = createHandPose();
  worldLandmarks[8] = { x: 0.4, y: -0.2, z: 0.1 };

  assert.equal(handLandmarkSpace(imageLandmarks, worldLandmarks, 1280, 720), worldLandmarks);
});

test('handLandmarkSpace scales image landmarks against portrait and landscape video sizes', () => {
  const worldLandmarks = createHandPose();
  const imageLandmarks = toImageLandmarks(worldLandmarks, 720, 1280);
  const scaled = handLandmarkSpace(imageLandmarks, null, 720, 1280);

  assert.ok(Math.abs(scaled[8].x - worldLandmarks[8].x) < 1e-9);
  assert.ok(Math.abs(scaled[8].y - worldLandmarks[8].y) < 1e-9);
  assert.ok(Math.abs(scaled[8].z - worldLandmarks[8].z) < 1e-9);
});

test('power classifier recognizes Spider-Man, Iron Man, and Sudarshan Chakra poses', () => {
  const poses = [
    [createHandPose(['index', 'pinky']), 'SPIDER-MAN WEB'],
    [createHandPose(['index', 'middle', 'ring', 'pinky']), 'IRON MAN BLAST'],
    [createHandPose(['index']), 'SUDARSHAN CHAKRA'],
  ];

  for (const [landmarks, expectedGesture] of poses) {
    assert.equal(classifyPowerGesture(landmarks, landmarks).gesture, expectedGesture);
    const imageLandmarks = toImageLandmarks(landmarks, 1280, 720);
    assert.equal(classifyPowerGesture(imageLandmarks, null, {}, 1280, 720).gesture, expectedGesture);
  }
});

test('closed-fist detection rejects extended fingers and accepts a curled hand', () => {
  const openPalm = createHandPose(['index', 'middle', 'ring', 'pinky']);
  const closedFist = createHandPose();

  assert.equal(isClosedFist(openPalm, openPalm, 1280, 720), false);
  assert.equal(isClosedFist(closedFist, closedFist, 1280, 720), true);
});

test('back-of-hand orientation rejects unknown handedness and edge-on geometry', () => {
  const landmarks = createHandPose();
  landmarks[0] = { x: 0, y: 0, z: 0 };
  landmarks[5] = { x: 1, y: 0, z: 0 };
  landmarks[17] = { x: 0, y: 1, z: 0 };

  assert.equal(isBackOfHandFacingCamera(landmarks, 'Right'), true);
  assert.equal(isBackOfHandFacingCamera(landmarks, 'Left'), false);
  assert.equal(isBackOfHandFacingCamera(landmarks, 'Unknown'), false);
  landmarks[17] = { x: 2, y: 0, z: 0 };
  assert.equal(isBackOfHandFacingCamera(landmarks, 'Right'), false);
});

test('screen projection accounts for cover cropping and mirrored camera input', () => {
  const point = mapLandmarkToScreen({ x: 0.25, y: 0.5 }, 1280, 720, 1000, 1000);
  assert.ok(Math.abs(point.x - 944.4444444444445) < 1e-9);
  assert.equal(point.y, 500);
});
