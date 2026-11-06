import {
  GESTURE_GAP_MS,
  GESTURE_HOLD_MS,
  GESTURE_RELEASE_MS,
  HAND_LOST_RESET_MS,
} from './config.js';

const HAND_TRACKED = 'HAND TRACKED';

function createGestureState(now) {
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

function settleGesture(previous, detectedGesture, now) {
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

export function createGestureStateStore() {
  const handStates = new Map();

  return {
    getFingerStates(handKey) {
      return handStates.get(handKey)?.fingerStates;
    },
    settle(handKey, detectedGesture, fingerStates, now) {
      const settled = settleGesture(handStates.get(handKey), detectedGesture, now);
      settled.state.fingerStates = fingerStates;
      handStates.set(handKey, settled.state);
      return settled;
    },
    expireUnseen(seenHandKeys, now) {
      for (const [handKey, handState] of handStates) {
        if (seenHandKeys.has(handKey)) continue;
        if (handState.missingSince === null) handState.missingSince = now;
        if (now - handState.missingSince >= HAND_LOST_RESET_MS) handStates.delete(handKey);
      }
    },
    clear() {
      handStates.clear();
    },
  };
}
