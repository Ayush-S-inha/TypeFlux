import './style.css';

const video = document.querySelector('#camera');
const canvas = document.querySelector('#effects-canvas');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#start-camera');
const pauseButton = document.querySelector('#pause-camera');
const restartButton = document.querySelector('#restart-camera');
const effectsButton = document.querySelector('#effects-toggle');
const welcome = document.querySelector('#welcome');
const statusDot = document.querySelector('#status-dot');
const statusLabel = document.querySelector('#status-label');
const engineLabel = document.querySelector('#engine-label');
const trackingLabel = document.querySelector('#tracking-label');
const gestureReadout = document.querySelector('#gesture-readout');
const gestureName = document.querySelector('#gesture-name');
const gestureDetail = document.querySelector('#gesture-detail');
const gestureGuide = document.querySelector('#gesture-guide');
const message = document.querySelector('#message');

const TRACKING_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
const TRACKING_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FRAME_INTERVAL = 1000 / 24;
const FACE_FRAME_INTERVAL = 1000 / 15;
const EYE_SQUINT_HOLD_MS = 140;
const EYE_RELEASE_HOLD_MS = 120;
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

let stream = null;
let landmarker = null;
let faceLandmarker = null;
let running = false;
let paused = false;
let effectsEnabled = true;
let trackerLoading = false;
let faceTrackerLoading = false;
let faceTrackingFailed = false;
let lastVideoTime = -1;
let lastDetectionAt = 0;
let lastFaceDetectionAt = 0;
let eyesSquintedSince = null;
let eyesOpenSince = null;
let eyeLaserArmed = true;
let lastFaceSeenAt = 0;
let statusOverrideUntil = 0;
let animationFrame = 0;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let pixelRatio = 1;
let hands = [];
const effects = [];
const gestureStates = new Map();
const GESTURE_HOLD_MS = 150;
const HAND_LOST_RESET_MS = 450;

function resizeCanvas() {
  screenWidth = window.innerWidth;
  screenHeight = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(screenWidth * pixelRatio);
  canvas.height = Math.round(screenHeight * pixelRatio);
  canvas.style.width = `${screenWidth}px`;
  canvas.style.height = `${screenHeight}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function setStatus(label, isLive = false) {
  statusLabel.textContent = label;
  statusDot.classList.toggle('live', isLive);
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
  message.textContent = '';
}

async function createHandTracker() {
  const { FilesetResolver, HandLandmarker } = await import(/* @vite-ignore */ TRACKING_MODULE);
  const vision = await FilesetResolver.forVisionTasks(TRACKING_WASM);
  const options = {
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
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

async function createFaceTracker() {
  const { FilesetResolver, FaceLandmarker } = await import(/* @vite-ignore */ TRACKING_MODULE);
  const vision = await FilesetResolver.forVisionTasks(TRACKING_WASM);
  const options = {
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
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

function updateTrackingLabel() {
  if (landmarker && faceLandmarker) trackingLabel.textContent = 'HAND + EYE TRACKING READY';
  else if (landmarker) trackingLabel.textContent = faceTrackerLoading ? 'LOADING EYE TRACKING' : (faceTrackingFailed ? 'HAND READY / EYE TRACKING OFF' : 'HAND TRACKING READY');
  else if (faceLandmarker) trackingLabel.textContent = 'EYE TRACKING READY';
}

async function loadFaceTracking() {
  if (faceLandmarker) {
    updateTrackingLabel();
    return;
  }
  if (faceTrackerLoading) return;
  faceTrackerLoading = true;
  updateTrackingLabel();

  try {
    faceLandmarker = await createFaceTracker();
    faceTrackingFailed = false;
    if (!running) return;
    updateTrackingLabel();
    gestureDetail.textContent = 'Spider-Man: index + pinky. Iron Man: open palm. Sudarshan Chakra: index only. Superman: squint both eyes.';
  } catch (error) {
    console.error('TypeFlux could not start face tracking:', error);
    faceTrackingFailed = true;
    if (landmarker) trackingLabel.textContent = 'HAND READY / EYE TRACKING OFF';
    gestureDetail.textContent = 'Hand effects are ready. Eye tracking needs a connection and a restart.';
  } finally {
    faceTrackerLoading = false;
    updateTrackingLabel();
  }
}

async function loadHandTracking() {
  if (landmarker) {
    updateTrackingLabel();
    return;
  }
  if (trackerLoading) return;
  trackerLoading = true;
  updateTrackingLabel();
  gestureName.textContent = 'LOADING GESTURE ENGINE';
  gestureDetail.textContent = 'First launch needs an internet connection';

  try {
    landmarker = await createHandTracker();
    if (!running) return;
    updateTrackingLabel();
    gestureName.textContent = 'SHOW A HAND';
    gestureDetail.textContent = faceTrackingFailed
      ? 'Use Spider-Man, Iron Man, or the index-only Sudarshan Chakra pose. Superman eye tracking is unavailable.'
      : 'Spider-Man: index + pinky. Iron Man: open palm. Sudarshan Chakra: index only. Superman: squint both eyes.';
  } catch (error) {
    console.error('TypeFlux could not start hand tracking:', error);
    trackingLabel.textContent = 'HAND TRACKING UNAVAILABLE';
    gestureName.textContent = 'CAMERA IS READY';
    gestureDetail.textContent = 'Hand tracking could not load. Check your connection and restart.';
    showMessage('The camera is running, but the hand-tracking model could not load. Check your internet connection and choose Restart.');
  } finally {
    trackerLoading = false;
  }
}

async function startCamera() {
  hideMessage();
  startButton.disabled = true;
  startButton.textContent = 'Connecting…';

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not available in this browser. Open TypeFlux on localhost in a current version of Chrome.');
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });

    video.srcObject = stream;
    await video.play();
    running = true;
    paused = false;
    lastVideoTime = -1;
    startButton.textContent = 'Start camera';
    welcome.classList.add('dismissed');
    gestureReadout.hidden = false;
    gestureGuide.hidden = false;
    pauseButton.disabled = false;
    restartButton.disabled = false;
    effectsButton.disabled = false;
    pauseButton.textContent = 'PAUSE';
    setStatus('CAMERA LIVE', true);
    engineLabel.textContent = 'CAMERA INPUT ACTIVE';
    trackingLabel.textContent = 'STARTING HAND + EYE TRACKING';
    gestureName.textContent = 'SHOW A HAND OR SQUINT';
    gestureDetail.textContent = 'Spider-Man: index + pinky. Iron Man: open palm. Sudarshan Chakra: index only. Superman: squint both eyes.';
    eyesSquintedSince = null;
    eyesOpenSince = null;
    eyeLaserArmed = true;
    lastFaceSeenAt = 0;
    animationFrame = requestAnimationFrame(renderLoop);
    loadHandTracking();
    loadFaceTracking();
  } catch (error) {
    startButton.disabled = false;
    startButton.textContent = 'Try again';
    showMessage(error.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow camera access in Chrome settings, then try again.'
      : error.message || 'The camera could not be started.');
  }
}

function stopCamera() {
  running = false;
  paused = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;

  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }

  video.pause();
  video.srcObject = null;
  hands = [];
  effects.length = 0;
  gestureStates.clear();
  eyesSquintedSince = null;
  eyesOpenSince = null;
  eyeLaserArmed = true;
  lastFaceSeenAt = 0;
  statusOverrideUntil = 0;
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  gestureReadout.hidden = true;
  gestureGuide.hidden = true;
  welcome.classList.remove('dismissed');
  startButton.disabled = false;
  startButton.textContent = 'Start camera';
  pauseButton.disabled = true;
  restartButton.disabled = true;
  effectsButton.disabled = true;
  pauseButton.textContent = 'PAUSE';
  setStatus('CAMERA OFF');
  engineLabel.textContent = 'WAITING FOR CAMERA';
  trackingLabel.textContent = 'TRACKING OFF';
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function landmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = Number.isFinite(a.z) && Number.isFinite(b.z) ? a.z - b.z : 0;
  return Math.hypot(dx, dy, dz);
}

function jointAngle(a, b, c) {
  const useDepth = [a, b, c].every((point) => Number.isFinite(point.z));
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

function fingerIsExtended(landmarks, mcpIndex, pipIndex, dipIndex, tipIndex) {
  const pipAngle = jointAngle(landmarks[mcpIndex], landmarks[pipIndex], landmarks[dipIndex]);
  const dipAngle = jointAngle(landmarks[pipIndex], landmarks[dipIndex], landmarks[tipIndex]);
  const tipBeyondJoint = landmarkDistance(landmarks[tipIndex], landmarks[pipIndex])
    > landmarkDistance(landmarks[dipIndex], landmarks[pipIndex]) * 0.72;
  return pipAngle > 135 && dipAngle > 135 && tipBeyondJoint;
}

function readFingers(landmarks) {
  return {
    index: fingerIsExtended(landmarks, 5, 6, 7, 8),
    middle: fingerIsExtended(landmarks, 9, 10, 11, 12),
    ring: fingerIsExtended(landmarks, 13, 14, 15, 16),
    pinky: fingerIsExtended(landmarks, 17, 18, 19, 20),
  };
}

function recognizeGesture(landmarks) {
  const { index, middle, ring, pinky } = readFingers(landmarks);
  const openPalm = index && middle && ring && pinky;

  // Check specific poses before falling back to a tracked hand.
  if (openPalm) return 'IRON MAN BLAST';
  if (index && pinky && !middle && !ring) return 'SPIDER-MAN WEB';
  if (index && !middle && !ring && !pinky) return 'SUDARSHAN CHAKRA';
  return 'HAND TRACKED';
}

function screenPoint(landmark) {
  const videoWidth = video.videoWidth || screenWidth;
  const videoHeight = video.videoHeight || screenHeight;
  const coverScale = Math.max(screenWidth / videoWidth, screenHeight / videoHeight);
  const renderWidth = videoWidth * coverScale;
  const renderHeight = videoHeight * coverScale;
  const cropX = (renderWidth - screenWidth) / 2;
  const cropY = (renderHeight - screenHeight) / 2;
  return {
    x: (1 - landmark.x) * renderWidth - cropX,
    y: landmark.y * renderHeight - cropY,
  };
}

function addEffect(type, x, y, extra = {}) {
  effects.push({ type, x, y, start: performance.now(), duration: 900, ...extra });
  if (effects.length > 36) effects.splice(0, effects.length - 36);
}

function settleGesture(key, detectedGesture, now) {
  let state = gestureStates.get(key);
  if (!state) {
    state = {
      candidate: detectedGesture,
      candidateSince: now,
      active: 'HAND TRACKED',
      missingSince: null,
      armed: true,
    };
    gestureStates.set(key, state);
  }

  state.missingSince = null;
  if (detectedGesture !== state.candidate) {
    state.candidate = detectedGesture;
    state.candidateSince = now;
  }

  if (now - state.candidateSince < GESTURE_HOLD_MS || state.active === state.candidate) {
    return { gesture: state.active, entered: false, armed: state.armed };
  }

  state.active = state.candidate;
  if (state.active === 'HAND TRACKED') {
    state.armed = true;
    return { gesture: state.active, entered: false, armed: true };
  }

  const entered = state.armed;
  state.armed = false;
  return { gesture: state.active, entered, armed: state.armed };
}

function resetLostHands(seenHands, now) {
  for (const [key, state] of gestureStates) {
    if (seenHands.has(key)) {
      state.missingSince = null;
      continue;
    }

    if (state.missingSince === null) state.missingSince = now;
    if (now - state.missingSince < HAND_LOST_RESET_MS) continue;
    if (state.active === 'HAND TRACKED' && state.candidate === 'HAND TRACKED') continue;

    state.candidate = 'HAND TRACKED';
    state.candidateSince = now;
    state.active = 'HAND TRACKED';
    state.armed = true;
  }
}

function fireGesture(gesture, points) {
  const wrist = points[0];
  const palm = [0, 5, 9, 13, 17].reduce((center, index) => ({
    x: center.x + points[index].x / 5,
    y: center.y + points[index].y / 5,
  }), { x: 0, y: 0 });

  if (gesture === 'SPIDER-MAN WEB') {
    // The web strand follows the extended index finger.
    const indexBase = points[5];
    const indexTip = points[8];
    const dx = indexTip.x - indexBase.x;
    const dy = indexTip.y - indexBase.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const origin = {
      x: wrist.x * 0.58 + palm.x * 0.42,
      y: wrist.y * 0.58 + palm.y * 0.42,
    };
    addEffect('web', origin.x, origin.y, {
      vx: dx / length,
      vy: dy / length,
      duration: 820,
      flightRatio: 0.52,
    });
    showPowerStatus('SPIDER-MAN WEB', 'Web fired. Return to a relaxed hand before firing again.');
  } else if (gesture === 'IRON MAN BLAST') {
    // A repulsor blast leaves the palm in the direction the fingers point.
    const middleTip = points[12];
    const dx = middleTip.x - wrist.x;
    const dy = middleTip.y - wrist.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    addEffect('repulsor', palm.x, palm.y, {
      vx: dx / length,
      vy: dy / length,
      duration: 620,
    });
    addEffect('repulsor-flash', palm.x, palm.y, { duration: 260 });
    showPowerStatus('IRON MAN REPULSOR', 'Blast fired. Return to a relaxed hand before firing again.');
  } else if (gesture === 'SUDARSHAN CHAKRA') {
    showPowerStatus('SUDARSHAN CHAKRA', 'Hold the index-only pose to keep the text chakra hovering at your fingertip.');
  }
}

function showPowerStatus(title, detail) {
  gestureName.textContent = title;
  gestureDetail.textContent = detail;
  statusOverrideUntil = performance.now() + 850;
}

function updateHands(result, now) {
  hands = [];
  const seenHands = new Set();
  const landmarksList = result.landmarks || [];

  for (let index = 0; index < landmarksList.length; index += 1) {
    const landmarks = landmarksList[index];
    const points = landmarks.map(screenPoint);
    const handedness = result.handednesses?.[index]?.[0]?.categoryName || `HAND ${index + 1}`;
    const key = String(handedness);
    const detectedGesture = recognizeGesture(landmarks);
    const settled = settleGesture(key, detectedGesture, now);
    seenHands.add(key);
    hands.push({ key, landmarks, points, gesture: settled.gesture });

    if (settled.entered) fireGesture(settled.gesture, points);
  }

  resetLostHands(seenHands, now);

  if (now < statusOverrideUntil) return;
  if (!hands.length) {
    gestureName.textContent = faceLandmarker ? 'SHOW A HAND OR SQUINT' : 'SHOW A HAND';
    gestureDetail.textContent = faceLandmarker
      ? 'Spider-Man: index + pinky. Iron Man: open palm. Sudarshan Chakra: index only. Superman: squint both eyes.'
      : 'Use a hand gesture. Eye tracking is not available yet.';
    return;
  }

  const mainHand = hands[0];
  gestureName.textContent = mainHand.gesture;
  if (hands.length > 1) {
    gestureDetail.textContent = `${hands.length} hands in view`;
  } else if (mainHand.gesture === 'HAND TRACKED') {
    gestureDetail.textContent = 'Use index + pinky for Spider-Man, index only for Sudarshan Chakra, or an open palm for Iron Man';
  } else {
    gestureDetail.textContent = 'Pose locked. Relax your hand to re-arm';
  }
}

function updateFaceTracking(result, now) {
  const face = result.faceLandmarks?.[0];
  const categories = result.faceBlendshapes?.[0]?.categories || [];
  const scores = new Map(categories.map((item) => [item.categoryName, item.score]));

  if (!face || face.length < 478) {
    if (lastFaceSeenAt && now - lastFaceSeenAt > 500) {
      eyesSquintedSince = null;
      eyesOpenSince = null;
      eyeLaserArmed = true;
    }
    return;
  }

  lastFaceSeenAt = now;
  const leftSquint = scores.get('eyeSquintLeft') || 0;
  const rightSquint = scores.get('eyeSquintRight') || 0;
  const leftBlink = scores.get('eyeBlinkLeft') || 0;
  const rightBlink = scores.get('eyeBlinkRight') || 0;
  // Require a deliberate two-eye squeeze, not an ordinary single-frame blink.
  const eyesSqueezed = leftSquint > 0.58 && rightSquint > 0.58;

  if (eyesSqueezed) {
    eyesOpenSince = null;
    if (eyesSquintedSince === null) eyesSquintedSince = now;
    if (eyeLaserArmed && now - eyesSquintedSince >= EYE_SQUINT_HOLD_MS) {
      fireSupermanLaser(face);
      eyeLaserArmed = false;
    }
    return;
  }

  eyesSquintedSince = null;
  if (eyesOpenSince === null) eyesOpenSince = now;
  if (now - eyesOpenSince >= EYE_RELEASE_HOLD_MS) eyeLaserArmed = true;
}

function averageLandmarks(landmarks, indices) {
  const total = indices.reduce((sum, index) => ({
    x: sum.x + landmarks[index].x,
    y: sum.y + landmarks[index].y,
  }), { x: 0, y: 0 });
  return { x: total.x / indices.length, y: total.y / indices.length };
}

function fireSupermanLaser(face) {
  // FaceLandmarker returns iris centers at 468 and 473 for the standard 478-point model.
  const leftEye = screenPoint(face[468] || averageLandmarks(face, [33, 133, 159, 145]));
  const rightEye = screenPoint(face[473] || averageLandmarks(face, [362, 263, 386, 374]));
  const eyeCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const nose = screenPoint(face[1]);
  const eyeDistance = Math.max(1, distance(leftEye, rightEye));
  const yaw = Math.max(-1.2, Math.min(1.2, (nose.x - eyeCenter.x) / (eyeDistance * 0.42)));
  const targetX = Math.max(0, Math.min(screenWidth, eyeCenter.x + yaw * screenWidth * 0.42));
  const targetY = Math.max(0, Math.min(screenHeight, eyeCenter.y + Math.max(130, screenHeight * 0.38)));

  addEffect('laser-eyes', eyeCenter.x, eyeCenter.y, {
    eyes: [leftEye, rightEye],
    targetX,
    targetY,
    duration: 680,
  });
  showPowerStatus('SUPERMAN HEAT VISION', 'Heat vision fired. Open both eyes to re-arm.');
}

function drawHandGuides() {
  for (const hand of hands) {
    const points = hand.points;
    ctx.save();
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = 'rgba(169, 231, 255, 0.35)';
    ctx.shadowColor = 'rgba(97, 210, 255, 0.28)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
    }
    ctx.stroke();

    for (const landmarkIndex of [0, 4, 8, 12, 16, 20]) {
      const point = points[landmarkIndex];
      ctx.beginPath();
      ctx.fillStyle = landmarkIndex === 8 ? '#fff7d6' : '#a8ecff';
      ctx.arc(point.x, point.y, landmarkIndex === 0 ? 3 : 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const labelPoint = points[0];
    ctx.save();
    ctx.font = '9px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(245, 243, 250, .9)';
    ctx.fillText(hand.gesture, Math.min(screenWidth - 150, Math.max(12, labelPoint.x + 12)), Math.max(36, labelPoint.y - 12));
    ctx.restore();
  }
}

function distanceToEdge(x, y, vx, vy) {
  const distances = [];
  if (vx > 0.0001) distances.push((screenWidth - x) / vx);
  else if (vx < -0.0001) distances.push(-x / vx);
  if (vy > 0.0001) distances.push((screenHeight - y) / vy);
  else if (vy < -0.0001) distances.push(-y / vy);

  const validDistances = distances.filter((distance) => distance >= 0);
  return validDistances.length
    ? Math.min(...validDistances)
    : Math.hypot(screenWidth, screenHeight);
}

function drawWeb(effect, progress) {
  const flightRatio = effect.flightRatio || 0.52;
  const flight = Math.min(1, progress / flightRatio);
  const travel = 1 - Math.pow(1 - flight, 3);
  const fade = progress <= flightRatio
    ? 1
    : Math.max(0, 1 - (progress - flightRatio) / (1 - flightRatio));
  const reach = distanceToEdge(effect.x, effect.y, effect.vx, effect.vy);
  const length = reach * travel;
  if (length < 2 || fade <= 0) return;

  const sideX = -effect.vy;
  const sideY = effect.vx;
  const segments = Math.max(4, Math.min(72, Math.ceil(length / 12)));
  const strandPoint = (t) => {
    const sway = Math.sin(t * Math.PI * 5) * 2.1 * Math.sin(t * Math.PI);
    return {
      x: effect.x + effect.vx * length * t + sideX * sway,
      y: effect.y + effect.vy * length * t + sideY * sway,
    };
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft outer glow, then two fine strands for a braided silk look.
  ctx.shadowColor = 'rgba(169, 225, 255, .85)';
  ctx.shadowBlur = 11;
  ctx.strokeStyle = `rgba(147, 211, 255, ${0.45 * fade})`;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  for (let step = 1; step <= segments; step += 1) {
    const point = strandPoint(step / segments);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.shadowBlur = 3;
  for (const offset of [-1.1, 1.1]) {
    ctx.beginPath();
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      const point = strandPoint(t);
      const x = point.x + sideX * offset;
      const y = point.y + sideY * offset;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(245, 251, 255, ${0.9 * fade})`;
    ctx.lineWidth = offset < 0 ? 1.25 : 0.8;
    ctx.stroke();
  }

  // Tiny silk cross-threads keep the strand from reading as a plain laser.
  const threadCount = Math.min(24, Math.floor(length / 27));
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(195, 235, 255, ${0.72 * fade})`;
  ctx.lineWidth = 0.75;
  for (let index = 1; index <= threadCount; index += 1) {
    const t = index / (threadCount + 1);
    const point = strandPoint(t);
    const spread = 2.5 + t * 2.8;
    const tilt = index % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(point.x - sideX * spread, point.y - sideY * spread);
    ctx.lineTo(point.x + sideX * spread + effect.vx * tilt * 2,
      point.y + sideY * spread + effect.vy * tilt * 2);
    ctx.stroke();
  }

  const head = strandPoint(1);
  ctx.shadowColor = 'rgba(190, 238, 255, .95)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * fade})`;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 2.2 + (1 - travel) * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Small flash at the shooter end marks where the strand came from.
  ctx.shadowBlur = 8;
  ctx.fillStyle = `rgba(227, 248, 255, ${0.8 * fade})`;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRepulsor(effect, progress) {
  const reach = 24 + progress * Math.hypot(screenWidth, screenHeight) * 0.8;
  const endX = effect.x + effect.vx * reach;
  const endY = effect.y + effect.vy * reach;
  ctx.save();
  ctx.lineCap = 'round';
  const gradient = ctx.createLinearGradient(effect.x, effect.y, endX, endY);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${(1 - progress) * .98})`);
  gradient.addColorStop(0.16, `rgba(112, 224, 255, ${(1 - progress) * .98})`);
  gradient.addColorStop(1, 'rgba(92, 145, 255, 0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 9 * (1 - progress) + 1.5;
  ctx.shadowColor = 'rgba(98, 210, 255, .98)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawRepulsorFlash(effect, progress) {
  const radius = 8 + progress * 24;
  ctx.save();
  const glow = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius * 1.6);
  glow.addColorStop(0, `rgba(255, 255, 255, ${(1 - progress) * 0.95})`);
  glow.addColorStop(0.28, `rgba(140, 235, 255, ${(1 - progress) * 0.8})`);
  glow.addColorStop(1, 'rgba(86, 155, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, radius * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTextEllipseRing(cx, cy, radiusX, radiusY, pattern, fontSize, color, startAngle = 0) {
  const characters = Array.from(pattern);
  if (!characters.length) return;

  const perimeter = Math.PI * (3 * (radiusX + radiusY)
    - Math.sqrt((3 * radiusX + radiusY) * (radiusX + 3 * radiusY)));
  const glyphCount = Math.max(characters.length, Math.floor(perimeter / (fontSize * 0.66)));

  ctx.save();
  ctx.font = `600 ${fontSize}px "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 205, 48, 0.2)';
  ctx.shadowBlur = 2;

  for (let index = 0; index < glyphCount; index += 1) {
    const angle = startAngle + (index / glyphCount) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radiusX;
    const y = cy + Math.sin(angle) * radiusY;
    const tangentX = -radiusX * Math.sin(angle);
    const tangentY = radiusY * Math.cos(angle);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(tangentY, tangentX));
    ctx.fillText(characters[index % characters.length], 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawTextChakra(indexTip) {
  // The disc stays still relative to the tracked fingertip: no travel, rotation, or fade animation.
  const radiusX = Math.min(112, Math.max(46, screenWidth * 0.092));
  const radiusY = radiusX * 0.29;
  const centerX = indexTip.x;
  const centerY = indexTip.y - radiusY * 0.48;
  const fontSize = Math.max(6.5, radiusX * 0.078);

  drawTextEllipseRing(centerX, centerY, radiusX, radiusY,
    '✦ · ॐ · ✦ · ॐ · ◆ ·', fontSize, '#ffe16a', -Math.PI / 24);
  drawTextEllipseRing(centerX, centerY, radiusX * 0.79, radiusY * 0.72,
    'SUDARSHAN • CHAKRA •', fontSize * 0.82, '#ffd23f', Math.PI / 30);
  drawTextEllipseRing(centerX, centerY, radiusX * 0.55, radiusY * 0.48,
    'ॐ • ✦ • ॐ • ✦ •', fontSize * 0.76, '#fff0a1', -Math.PI / 18);

  // Text glyphs form the twelve outer blades; no vector-drawn disc is used.
  ctx.save();
  ctx.font = `700 ${fontSize * 1.12}px "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffcf38';
  ctx.shadowColor = 'rgba(255, 205, 48, 0.18)';
  ctx.shadowBlur = 2;
  for (let blade = 0; blade < 12; blade += 1) {
    const angle = (blade / 12) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radiusX * 0.72;
    const y = centerY + Math.sin(angle) * radiusY * 0.72;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(radiusY * Math.cos(angle), -radiusX * Math.sin(angle)));
    ctx.fillText(blade % 2 === 0 ? '◆' : '✦', 0, 0);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.font = `700 ${fontSize * 1.05}px "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff1a3';
  ctx.fillText('ॐ', centerX, centerY);
  ctx.restore();
}

function drawLaserEyes(effect, progress) {
  const flight = Math.min(1, progress / 0.32);
  const eased = 1 - Math.pow(1 - flight, 3);
  const fade = progress < 0.72 ? 1 : Math.max(0, 1 - (progress - 0.72) / 0.28);
  const eyes = effect.eyes || [];
  ctx.save();
  ctx.lineCap = 'round';

  for (const eye of eyes) {
    const dx = effect.targetX - eye.x;
    const dy = effect.targetY - eye.y;
    const endX = eye.x + dx * eased;
    const endY = eye.y + dy * eased;

    // Outer crimson glow, saturated beam and a narrow hot core.
    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 25, 42, ${0.52 * fade})`;
    ctx.lineWidth = 13 * fade + 1;
    ctx.shadowColor = 'rgba(255, 20, 30, .95)';
    ctx.shadowBlur = 24;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 55, 42, ${0.95 * fade})`;
    ctx.lineWidth = 5 * fade + 0.8;
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 230, 205, ${0.98 * fade})`;
    ctx.lineWidth = 1.5 * fade + 0.35;
    ctx.shadowBlur = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 4.5 + (1 - progress) * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 66, 44, ${fade})`;
    ctx.shadowColor = 'rgba(255, 28, 32, 1)';
    ctx.shadowBlur = 18;
    ctx.fill();
  }

  if (eased >= 0.98 && fade > 0.1) {
    ctx.beginPath();
    ctx.arc(effect.targetX, effect.targetY, 9 + progress * 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 48, 41, ${0.7 * fade})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 12, 24, .95)';
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.restore();
}

function drawEffects(now) {
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  if (!effectsEnabled) return;

  drawHandGuides();
  for (const hand of hands) {
    if (hand.gesture === 'SUDARSHAN CHAKRA') drawTextChakra(hand.points[8]);
  }
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    const progress = Math.max(0, Math.min(1, (now - effect.start) / effect.duration));
    if (progress >= 1) {
      effects.splice(index, 1);
      continue;
    }

    if (effect.type === 'web') drawWeb(effect, progress);
    else if (effect.type === 'repulsor') drawRepulsor(effect, progress);
    else if (effect.type === 'repulsor-flash') drawRepulsorFlash(effect, progress);
    else if (effect.type === 'laser-eyes') drawLaserEyes(effect, progress);
  }
}

function renderLoop(now) {
  if (!running) return;
  if (!paused) {
    if (landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.currentTime !== lastVideoTime && now - lastDetectionAt >= FRAME_INTERVAL) {
      try {
        const result = landmarker.detectForVideo(video, now);
        updateHands(result, now);
        lastVideoTime = video.currentTime;
        lastDetectionAt = now;
      } catch (error) {
        console.error('Hand tracking frame failed:', error);
        trackingLabel.textContent = 'HAND TRACKING RETRYING';
      }
    }
    if (faceLandmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && now - lastFaceDetectionAt >= FACE_FRAME_INTERVAL) {
      try {
        const faceResult = faceLandmarker.detectForVideo(video, now);
        updateFaceTracking(faceResult, now);
        lastFaceDetectionAt = now;
      } catch (error) {
        console.error('Face tracking frame failed:', error);
        if (landmarker) trackingLabel.textContent = 'EYE TRACKING RETRYING';
      }
    }
    drawEffects(now);
  }
  animationFrame = requestAnimationFrame(renderLoop);
}

startButton.addEventListener('click', startCamera);
pauseButton.addEventListener('click', async () => {
  if (!running) return;
  paused = !paused;
  if (paused) {
    video.pause();
    pauseButton.textContent = 'RESUME';
    engineLabel.textContent = 'CAMERA PAUSED';
  } else {
    await video.play();
    pauseButton.textContent = 'PAUSE';
    engineLabel.textContent = 'CAMERA INPUT ACTIVE';
    lastVideoTime = -1;
  }
});
restartButton.addEventListener('click', async () => {
  stopCamera();
  await startCamera();
});
effectsButton.addEventListener('click', () => {
  effectsEnabled = !effectsEnabled;
  effectsButton.setAttribute('aria-pressed', String(effectsEnabled));
  effectsButton.querySelector('span').textContent = effectsEnabled ? 'ON' : 'OFF';
  if (!effectsEnabled) ctx.clearRect(0, 0, screenWidth, screenHeight);
});
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', stopCamera);

resizeCanvas();
