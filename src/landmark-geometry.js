export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3D(a, b) {
  const dz = Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z - b.z : 0;
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

export function jointAngleDegrees(a, b, c) {
  const useDepth = Number.isFinite(a.z) && Number.isFinite(b.z) && Number.isFinite(c.z);
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = useDepth ? a.z - b.z : 0;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = useDepth ? c.z - b.z : 0;
  const denominator = Math.hypot(bax, bay, baz) * Math.hypot(bcx, bcy, bcz);
  if (!denominator) return 0;
  const cosine = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy + baz * bcz) / denominator));
  return Math.acos(cosine) * (180 / Math.PI);
}

function fingerIsExtended(handPoints, mcpIndex, pipIndex, dipIndex, tipIndex) {
  const pipAngle = jointAngleDegrees(handPoints[mcpIndex], handPoints[pipIndex], handPoints[dipIndex]);
  const dipAngle = jointAngleDegrees(handPoints[pipIndex], handPoints[dipIndex], handPoints[tipIndex]);
  return pipAngle > 135 && dipAngle > 135
    && distance3D(handPoints[tipIndex], handPoints[pipIndex])
      > distance3D(handPoints[dipIndex], handPoints[pipIndex]) * 0.72;
}

function readFingers(handPoints) {
  return [
    fingerIsExtended(handPoints, 5, 6, 7, 8),
    fingerIsExtended(handPoints, 9, 10, 11, 12),
    fingerIsExtended(handPoints, 13, 14, 15, 16),
    fingerIsExtended(handPoints, 17, 18, 19, 20),
  ];
}

export function handLandmarkSpace(landmarks, worldLandmarks, videoWidth, videoHeight) {
  if (worldLandmarks?.length >= 21 && worldLandmarks.every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  ))) return worldLandmarks;

  return landmarks.map((point) => ({
    x: point.x * videoWidth,
    y: point.y * videoHeight,
    z: (point.z || 0) * videoWidth,
  }));
}

export function isClosedFist(landmarks, worldLandmarks, videoWidth, videoHeight) {
  const handPoints = handLandmarkSpace(landmarks, worldLandmarks, videoWidth, videoHeight);
  if (readFingers(handPoints).some(Boolean)) return false;

  const palm = { x: 0, y: 0, z: 0 };
  for (const index of [0, 5, 9, 13, 17]) {
    palm.x += handPoints[index].x / 5;
    palm.y += handPoints[index].y / 5;
    palm.z += handPoints[index].z / 5;
  }

  const palmWidth = distance3D(handPoints[5], handPoints[17]);
  if (!palmWidth) return false;

  let tuckedFingers = 0;
  let tipDistance = 0;
  for (const index of [8, 12, 16, 20]) {
    const ratio = distance3D(handPoints[index], palm) / palmWidth;
    tipDistance += ratio;
    if (ratio < 0.82) tuckedFingers += 1;
  }

  const thumbGap = Math.min(
    distance3D(handPoints[4], handPoints[5]),
    distance3D(handPoints[4], handPoints[6]),
    distance3D(handPoints[4], handPoints[9]),
  ) / palmWidth;

  return tuckedFingers >= 3 && tipDistance / 4 < 0.82 && thumbGap < 1.05;
}

export function isBackOfHandFacingCamera(landmarks, handedness, videoWidth = 1, videoHeight = 1) {
  if (handedness !== 'Left' && handedness !== 'Right') return false;

  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const ax = (indexMcp.x - wrist.x) * videoWidth;
  const ay = (indexMcp.y - wrist.y) * videoHeight;
  const bx = (pinkyMcp.x - wrist.x) * videoWidth;
  const by = (pinkyMcp.y - wrist.y) * videoHeight;
  const area = ax * by - ay * bx;
  const scale = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!scale || Math.abs(area) / scale < 0.28) return false;

  // MediaPipe handedness assumes a mirrored selfie input; TypeFlux sends the unmirrored video frame.
  const palmFacingSign = handedness === 'Left' ? 1 : -1;
  return area * palmFacingSign < 0;
}

export function mapLandmarkToScreen(landmark, videoWidth, videoHeight, screenWidth, screenHeight) {
  const sourceWidth = videoWidth || screenWidth;
  const sourceHeight = videoHeight || screenHeight;
  const coverScale = Math.max(screenWidth / sourceWidth, screenHeight / sourceHeight);
  const renderWidth = sourceWidth * coverScale;
  const renderHeight = sourceHeight * coverScale;
  const cropX = (renderWidth - screenWidth) / 2;
  const cropY = (renderHeight - screenHeight) / 2;
  return {
    x: (1 - landmark.x) * renderWidth - cropX,
    y: landmark.y * renderHeight - cropY,
  };
}
