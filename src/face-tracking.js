import {
  EYE_RELEASE_HOLD_MS,
  EYE_SQUEEZE_ENTER_THRESHOLD,
  EYE_SQUEEZE_EXIT_THRESHOLD,
  EYE_SQUEEZE_SMOOTHING,
  EYE_SQUINT_HOLD_MS,
  FACE_DETECTION_CONFIDENCE,
  FACE_LOST_RESET_MS,
  FACE_MODEL,
  FACE_PRESENCE_CONFIDENCE,
  FACE_TRACKING_CONFIDENCE,
  TRACKING_MODULE,
  TRACKING_WASM,
} from './config.js';
import { distance2D } from './landmark-geometry.js';

function createEyeSqueezeState() {
  return {
    left: 0,
    right: 0,
    initialized: false,
    squeezed: false,
    squeezedSince: null,
    openSince: null,
    armed: true,
  };
}

function resetEyeSqueeze(eyeState) {
  eyeState.left = 0;
  eyeState.right = 0;
  eyeState.initialized = false;
  eyeState.squeezed = false;
  eyeState.squeezedSince = null;
  eyeState.openSince = null;
  eyeState.armed = true;
}

function updateEyeSqueeze(eyeState, leftScore, rightScore, now) {
  if (!eyeState.initialized) {
    eyeState.left = leftScore;
    eyeState.right = rightScore;
    eyeState.initialized = true;
  } else {
    eyeState.left += (leftScore - eyeState.left) * EYE_SQUEEZE_SMOOTHING;
    eyeState.right += (rightScore - eyeState.right) * EYE_SQUEEZE_SMOOTHING;
  }

  const rawOpen = leftScore <= EYE_SQUEEZE_EXIT_THRESHOLD
    || rightScore <= EYE_SQUEEZE_EXIT_THRESHOLD;
  const closed = eyeState.squeezed
    ? eyeState.left > EYE_SQUEEZE_EXIT_THRESHOLD && eyeState.right > EYE_SQUEEZE_EXIT_THRESHOLD
    : eyeState.left > EYE_SQUEEZE_ENTER_THRESHOLD && eyeState.right > EYE_SQUEEZE_ENTER_THRESHOLD;

  if (closed) {
    if (eyeState.squeezedSince === null) eyeState.squeezedSince = now;
    eyeState.squeezed = true;
    if (rawOpen) {
      if (eyeState.openSince === null) eyeState.openSince = now;
      return false;
    }

    eyeState.openSince = null;
    if (eyeState.armed && now - eyeState.squeezedSince >= EYE_SQUINT_HOLD_MS) {
      eyeState.armed = false;
      return true;
    }
    return false;
  }

  eyeState.squeezed = false;
  eyeState.squeezedSince = null;
  if (eyeState.openSince === null) eyeState.openSince = now;
  if (now - eyeState.openSince >= EYE_RELEASE_HOLD_MS) eyeState.armed = true;
  return false;
}

function getHeatVisionEyes(face, projectPoint) {
  const irises = [face[468], face[473]];
  if (!irises.every((iris) => (
    iris && Number.isFinite(iris.x) && Number.isFinite(iris.y)
  ))) return null;
  return irises.map(projectPoint);
}

function inferHeatVisionDirection(face, projectPoint) {
  const eyeDefinitions = [
    { iris: 468, corners: [33, 133], upper: 159, lower: 145 },
    { iris: 473, corners: [362, 263], upper: 386, lower: 374 },
  ];
  const samples = [];

  for (const definition of eyeDefinitions) {
    const irisLandmark = face[definition.iris];
    const firstCorner = face[definition.corners[0]];
    const secondCorner = face[definition.corners[1]];
    const upperLid = face[definition.upper];
    const lowerLid = face[definition.lower];
    if (![irisLandmark, firstCorner, secondCorner, upperLid, lowerLid].every(Boolean)) continue;

    const iris = projectPoint(irisLandmark);
    const cornerA = projectPoint(firstCorner);
    const cornerB = projectPoint(secondCorner);
    const eyeWidth = Math.max(1, distance2D(cornerA, cornerB));
    const centerX = (cornerA.x + cornerB.x) / 2;
    const centerY = (projectPoint(upperLid).y + projectPoint(lowerLid).y) / 2;
    const horizontalOffset = (iris.x - centerX) / eyeWidth;
    const verticalOffset = (centerY - iris.y) / eyeWidth;

    const normalizeOffset = (offset, deadZone, range) => {
      const magnitude = Math.max(0, Math.abs(offset) - deadZone) / range;
      return Math.sign(offset) * Math.min(1, magnitude);
    };
    samples.push({
      x: normalizeOffset(horizontalOffset, 0.045, 0.13),
      up: normalizeOffset(verticalOffset, 0.025, 0.12),
    });
  }

  if (!samples.length) return null;
  const gazeX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
  const gazeUp = samples.reduce((sum, sample) => sum + sample.up, 0) / samples.length;
  const vx = gazeX * 0.86;
  const vy = 0.55 - gazeUp * 0.62;
  const magnitude = Math.max(0.001, Math.hypot(vx, vy));
  return { vx: vx / magnitude, vy: vy / magnitude };
}

export async function createFaceTracker() {
  const { FilesetResolver, FaceLandmarker } = await import(/* @vite-ignore */ TRACKING_MODULE);
  const vision = await FilesetResolver.forVisionTasks(TRACKING_WASM);
  const options = {
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: FACE_DETECTION_CONFIDENCE,
    minFacePresenceConfidence: FACE_PRESENCE_CONFIDENCE,
    minTrackingConfidence: FACE_TRACKING_CONFIDENCE,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
    });
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
    });
  }
}

export function createFaceTrackingState() {
  const eyeState = createEyeSqueezeState();
  let lastFaceSeenAt = 0;
  let lastHeatVisionDirection = { vx: 0, vy: 1 };
  let lastHeatVisionEyes = null;

  function reset() {
    resetEyeSqueeze(eyeState);
    lastFaceSeenAt = 0;
    lastHeatVisionDirection = { vx: 0, vy: 1 };
    lastHeatVisionEyes = null;
  }

  function update(faceDetection, now, projectPoint) {
    const face = faceDetection.faceLandmarks?.[0];
    const blendshapes = faceDetection.faceBlendshapes?.[0]?.categories || [];
    const scores = new Map(blendshapes.map((blendshape) => [blendshape.categoryName, blendshape.score]));

    if (!face || face.length < 478) {
      if (lastFaceSeenAt && now - lastFaceSeenAt > FACE_LOST_RESET_MS) reset();
      return null;
    }

    if (lastFaceSeenAt && now - lastFaceSeenAt > FACE_LOST_RESET_MS) reset();
    lastFaceSeenAt = now;

    const leftClosure = Math.max(
      scores.get('eyeSquintLeft') || 0,
      (scores.get('eyeBlinkLeft') || 0) * 0.9,
    );
    const rightClosure = Math.max(
      scores.get('eyeSquintRight') || 0,
      (scores.get('eyeBlinkRight') || 0) * 0.9,
    );
    const laserFired = updateEyeSqueeze(eyeState, leftClosure, rightClosure, now);

    if (!eyeState.squeezed) {
      const eyes = getHeatVisionEyes(face, projectPoint);
      if (eyes) {
        const smoothing = 0.4;
        lastHeatVisionEyes = lastHeatVisionEyes
          ? eyes.map((eye, index) => ({
            x: lastHeatVisionEyes[index].x + (eye.x - lastHeatVisionEyes[index].x) * smoothing,
            y: lastHeatVisionEyes[index].y + (eye.y - lastHeatVisionEyes[index].y) * smoothing,
          }))
          : eyes;
      }

      const direction = inferHeatVisionDirection(face, projectPoint);
      if (direction) {
        const smoothing = 0.32;
        const vx = lastHeatVisionDirection.vx * (1 - smoothing) + direction.vx * smoothing;
        const vy = lastHeatVisionDirection.vy * (1 - smoothing) + direction.vy * smoothing;
        const magnitude = Math.max(0.001, Math.hypot(vx, vy));
        lastHeatVisionDirection = { vx: vx / magnitude, vy: vy / magnitude };
      }
    }

    return {
      face,
      laserFired,
      eyes: lastHeatVisionEyes,
      direction: lastHeatVisionDirection,
    };
  }

  return { reset, update };
}
