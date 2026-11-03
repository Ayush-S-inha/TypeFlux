export const TRACKING_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
export const TRACKING_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
export const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
export const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const HAND_DETECTION_CONFIDENCE = 0.55;
export const HAND_PRESENCE_CONFIDENCE = 0.55;
export const HAND_TRACKING_CONFIDENCE = 0.5;
export const FACE_DETECTION_CONFIDENCE = 0.55;
export const FACE_PRESENCE_CONFIDENCE = 0.55;
export const FACE_TRACKING_CONFIDENCE = 0.5;

export const FRAME_INTERVAL = 1000 / 24;
export const FACE_FRAME_INTERVAL = 1000 / 15;
export const EYE_SQUINT_HOLD_MS = 180;
export const EYE_RELEASE_HOLD_MS = 160;
export const EYE_SQUINT_THRESHOLD = 0.52;
export const FACE_LOST_RESET_MS = 240;
export const GESTURE_HOLD_MS = 150;
export const HAND_LOST_RESET_MS = 450;

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
