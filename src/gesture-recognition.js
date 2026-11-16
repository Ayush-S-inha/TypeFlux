import { distance3D, handLandmarkSpace, jointAngleDegrees } from './landmark-geometry.js';
const HAND_TRACKED = 'HAND TRACKED';

const FINGER_JOINTS = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function fingerShape(handPoints, joints, priorShape, fingerName) {
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
  const isPinky = fingerName === 'pinky';
  const extended = priorShape === 'extended'
    ? straightness > (isPinky ? 120 : 126) && reach > (isPinky ? 0.62 : 0.66)
    : straightness > (isPinky ? 132 : 140) && reach > (isPinky ? 0.68 : 0.73);
  const curled = priorShape === 'curled'
    ? straightness < 122 || reach < 0.73
    : straightness < 108 || reach < 0.65;

  return extended ? 'extended' : curled ? 'curled' : 'bent';
}

export function classifyPowerGesture(landmarks, worldLandmarks, previousFingers = {}, videoWidth = 1280, videoHeight = 720) {
  const handPoints = handLandmarkSpace(landmarks, worldLandmarks, videoWidth, videoHeight);
  const fingers = {};
  for (const [name, joints] of Object.entries(FINGER_JOINTS)) {
    fingers[name] = fingerShape(handPoints, joints, previousFingers[name], name);
  }

  const extended = (name) => fingers[name] === 'extended';
  const curled = (name) => fingers[name] === 'curled';
  const spiderCandidate = extended('index') && extended('pinky')
    && !extended('middle') && !extended('ring');
  let gesture = HAND_TRACKED;

  if (spiderCandidate) {
    gesture = 'SPIDER-MAN WEB';
  } else if (['index', 'middle', 'ring', 'pinky'].every(extended)) {
    gesture = 'IRON MAN BLAST';
  } else if (extended('index') && curled('middle') && curled('ring') && curled('pinky')) {
    gesture = 'SUDARSHAN CHAKRA';
  }

  return { gesture, fingers, spiderCandidate };
}
