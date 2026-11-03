import {
  FACE_DETECTION_CONFIDENCE,
  FACE_MODEL,
  FACE_PRESENCE_CONFIDENCE,
  FACE_TRACKING_CONFIDENCE,
  HAND_DETECTION_CONFIDENCE,
  HAND_MODEL,
  HAND_PRESENCE_CONFIDENCE,
  HAND_TRACKING_CONFIDENCE,
  TRACKING_MODULE,
  TRACKING_WASM,
} from './config.js';

export async function createHandTracker() {
  const { FilesetResolver, HandLandmarker } = await import(/* @vite-ignore */ TRACKING_MODULE);
  const vision = await FilesetResolver.forVisionTasks(TRACKING_WASM);
  const options = {
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: HAND_DETECTION_CONFIDENCE,
    minHandPresenceConfidence: HAND_PRESENCE_CONFIDENCE,
    minTrackingConfidence: HAND_TRACKING_CONFIDENCE,
  };

  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
    });
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' },
    });
  }
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
