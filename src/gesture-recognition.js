import { distance3D, handLandmarkSpace, jointAngleDegrees } from './landmark-geometry.js';
import {
  EYE_RELEASE_HOLD_MS,
  EYE_SQUEEZE_ENTER_THRESHOLD,
  EYE_SQUEEZE_EXIT_THRESHOLD,
  EYE_SQUEEZE_SMOOTHING,
  EYE_SQUINT_HOLD_MS,
  GESTURE_GAP_MS,
  GESTURE_HOLD_MS,
  GESTURE_RELEASE_MS,
} from './config.js';

const HAND_TRACKED = 'HAND TRACKED';

const FINGER_JOINTS = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function fingerShape(handPoints, joints, priorShape) {
  const [mcpIndex, pipIndex, dipIndex, tipIndex] = joints;
  const mcp = handPoints[mcpIndex];
  const pip = handPoints[pipIndex];
  const dip = handPoints[dipIndex];
  const tip = handPoints[tipIndex];
  const pipAngle = jointAngleDegrees(mcp, pip, dip);
  const dipAngle = jointAngleDegrees(pip, dip, tip);
  const chainLength = distance3D(mcp, pip) + distance3D(pip, dip) + distance3D(dip, tip);
  const reach = chainLength ? distance3D(mcp, tip) / chainLength : 0;
  const straightness = Math.min(pipAngle, dipAngle);
  const extended = priorShape === 'extended'
    ? straightness > 126 && reach > 0.66
    : straightness > 140 && reach > 0.73;
  const curled = priorShape === 'curled'
    ? straightness < 122 || reach < 0.73
    : straightness < 108 || reach < 0.65;

  return extended ? 'extended' : curled ? 'curled' : 'bent';
}

export function classifyPowerGesture(landmarks, worldLandmarks, previousFingers = {}, videoWidth = 1280, videoHeight = 720) {
  const handPoints = handLandmarkSpace(landmarks, worldLandmarks, videoWidth, videoHeight);
  const fingers = {};
  for (const [name, joints] of Object.entries(FINGER_JOINTS)) {
    fingers[name] = fingerShape(handPoints, joints, previousFingers[name]);
  }

  const extended = (name) => fingers[name] === 'extended';
  const curled = (name) => fingers[name] === 'curled';
  let gesture = HAND_TRACKED;

  if (['index', 'middle', 'ring', 'pinky'].every(extended)) {
    gesture = 'IRON MAN BLAST';
  } else if (extended('index') && extended('pinky') && curled('middle') && curled('ring')) {
    gesture = 'SPIDER-MAN WEB';
  } else if (extended('index') && curled('middle') && curled('ring') && curled('pinky')) {
    gesture = 'SUDARSHAN CHAKRA';
  }

  return { gesture, fingers };
}

export function createGestureState(now) {
  return {
    candidate: HAND_TRACKED,
    candidateSince: now,
    candidateLostSince: null,
    active: HAND_TRACKED,
    activeLostSince: null,
    missingSince: null,
    armed: true,
    fingerStates: {},
  };
}

export function settleGesture(previous, detectedGesture, now) {
  const state = previous || createGestureState(now);
  state.missingSince = null;

  if (detectedGesture === HAND_TRACKED) {
    if (state.candidateLostSince === null) state.candidateLostSince = now;
    if (now - state.candidateLostSince < GESTURE_GAP_MS) {
      if (state.active !== HAND_TRACKED) {
        if (state.activeLostSince === null) state.activeLostSince = now;
        if (now - state.activeLostSince < GESTURE_RELEASE_MS) {
          return { state, gesture: state.active, entered: false };
        }
      }
      return { state, gesture: state.active, entered: false };
    }
  } else {
    state.candidateLostSince = null;
    state.activeLostSince = null;
  }

  if (detectedGesture !== state.candidate) {
    state.candidate = detectedGesture;
    state.candidateSince = now;
  }

  if (now - state.candidateSince < GESTURE_HOLD_MS || state.active === state.candidate) {
    return { state, gesture: state.active, entered: false };
  }

  state.active = state.candidate;
  if (state.active === HAND_TRACKED) {
    state.armed = true;
    state.activeLostSince = null;
    return { state, gesture: state.active, entered: false };
  }

  const entered = state.armed;
  state.armed = false;
  return { state, gesture: state.active, entered };
}

export function updateEyeSqueeze(state, leftScore, rightScore, now) {
  const smoothing = EYE_SQUEEZE_SMOOTHING;
  if (!state.initialized) {
    state.left = leftScore;
    state.right = rightScore;
    state.initialized = true;
  } else {
    state.left += (leftScore - state.left) * smoothing;
    state.right += (rightScore - state.right) * smoothing;
  }

  const rawOpen = leftScore <= EYE_SQUEEZE_EXIT_THRESHOLD
    || rightScore <= EYE_SQUEEZE_EXIT_THRESHOLD;
  const closed = state.squeezed
    ? state.left > EYE_SQUEEZE_EXIT_THRESHOLD && state.right > EYE_SQUEEZE_EXIT_THRESHOLD
    : state.left > EYE_SQUEEZE_ENTER_THRESHOLD && state.right > EYE_SQUEEZE_ENTER_THRESHOLD;

  if (closed) {
    if (state.squeezedSince === null) state.squeezedSince = now;
    state.squeezed = true;
    if (rawOpen) {
      if (state.openSince === null) state.openSince = now;
      return false;
    }

    state.openSince = null;
    if (state.armed && now - state.squeezedSince >= EYE_SQUINT_HOLD_MS) {
      state.armed = false;
      return true;
    }
    return false;
  }

  state.squeezed = false;
  state.squeezedSince = null;
  if (state.openSince === null) state.openSince = now;
  if (now - state.openSince >= EYE_RELEASE_HOLD_MS) state.armed = true;
  return false;
}

export function resetEyeSqueeze(state) {
  state.left = 0;
  state.right = 0;
  state.initialized = false;
  state.squeezed = false;
  state.squeezedSince = null;
  state.openSince = null;
  state.armed = true;
}
