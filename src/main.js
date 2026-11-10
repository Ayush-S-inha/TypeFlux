import './style.css';
import {
  FACE_FRAME_INTERVAL,
  FRAME_INTERVAL,
  HAND_CONNECTIONS,
} from './config.js';
import { createHandTracker } from './tracking-runtime.js';
import { createFaceTracker, createFaceTrackingState } from './face-tracking.js';
import { closeCamera, openCamera, setCameraPaused } from './camera-runtime.js';
import {
  isBackOfHandFacingCamera,
  isClosedFist,
  mapLandmarkToScreen,
} from './landmark-geometry.js';
import { classifyPowerGesture } from './gesture-recognition.js';
import { drawFlashLightning } from './flash-lightning.js';
import { drawGreenLanternRing, drawSudarshanChakra } from './hand-artifacts.js';
import { createGestureStateStore } from './gesture-state.js';
import {
  createIronManRepulsorEffects,
  createSpiderManWebEffect,
  distanceToEdge,
  drawIronManRepulsor,
  drawIronManRepulsorFlash,
  drawSpiderManWeb,
} from './hand-effects.js';

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

let cameraStream = null;
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
const faceTrackingState = createFaceTrackingState();
let statusOverrideUntil = 0;
let animationFrame = 0;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let pixelRatio = 1;
let hands = [];
const effects = [];
const chakraRadiusByHand = new Map();
const gestureStateStore = createGestureStateStore();

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
    gestureDetail.textContent = 'Spider-Man: index + pinky. Iron Man: open palm. Flash: close fist. Sudarshan Chakra: index only. Superman: squint both eyes.';
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
      ? 'Close a fist for Flash lightning, or use Spider-Man, Iron Man, and Sudarshan Chakra. Superman eye tracking is unavailable.'
      : 'Spider-Man: index + pinky. Iron Man: open palm. Flash: close fist. Sudarshan Chakra: index only. Superman: squint both eyes.';
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
  startButton.textContent = 'Connecting...';

  try {
    cameraStream = await openCamera(video);
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
    gestureDetail.textContent = 'Spider-Man: index + pinky. Iron Man: open palm. Flash: close fist. Sudarshan Chakra: index only. Superman: squint both eyes.';
    faceTrackingState.reset();
    lastFaceDetectionAt = 0;
    lastDetectionAt = 0;
    faceTrackingFailed = false;
    animationFrame = requestAnimationFrame(renderLoop);
    loadHandTracking();
    loadFaceTracking();
  } catch (error) {
    cameraStream = null;
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

  closeCamera(video, cameraStream);
  cameraStream = null;
  hands = [];
  effects.length = 0;
  gestureStateStore.clear();
  chakraRadiusByHand.clear();
  faceTrackingState.reset();
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

function screenPoint(landmark) {
  return mapLandmarkToScreen(
    landmark,
    video.videoWidth || screenWidth,
    video.videoHeight || screenHeight,
    screenWidth,
    screenHeight,
  );
}

function addEffect(effect) {
  effects.push({ start: performance.now(), duration: 900, ...effect });
  if (effects.length > 36) effects.splice(0, effects.length - 36);
}

function fireGesture(gesture, points) {
  if (gesture === 'SPIDER-MAN WEB') {
    const web = createSpiderManWebEffect(points);
    if (web) addEffect(web);
    showPowerStatus('SPIDER-MAN WEB', 'Web fired. Return to a relaxed hand before firing again.');
  } else if (gesture === 'IRON MAN BLAST') {
    for (const effect of createIronManRepulsorEffects(points)) addEffect(effect);
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

function updateHands(handDetection, now) {
  hands = [];
  const seenHands = new Set();
  const landmarksList = handDetection.landmarks || [];

  for (let index = 0; index < landmarksList.length; index += 1) {
    const landmarks = landmarksList[index];
    const videoWidth = video.videoWidth || screenWidth;
    const videoHeight = video.videoHeight || screenHeight;
    const points = landmarks.map(screenPoint);
    const handedness = handDetection.handednesses?.[index]?.[0]?.categoryName || `HAND ${index + 1}`;
    const key = String(handedness);
    const powerGesture = classifyPowerGesture(
      landmarks,
      handDetection.worldLandmarks?.[index],
      gestureStateStore.getFingerStates(key),
      videoWidth,
      videoHeight,
    );
    const detectedGesture = isClosedFist(
      landmarks,
      handDetection.worldLandmarks?.[index],
      videoWidth,
      videoHeight,
    ) ? 'FLASH LIGHTNING' : powerGesture.gesture;
    const settled = gestureStateStore.settle(key, detectedGesture, powerGesture.fingers, now);
    seenHands.add(key);
    hands.push({
      key,
      landmarks,
      points,
      gesture: settled.gesture,
      backOfHand: isBackOfHandFacingCamera(
        landmarks,
        handedness,
        videoWidth,
        videoHeight,
      ),
    });

    if (settled.entered) fireGesture(settled.gesture, points);
  }

  gestureStateStore.expireUnseen(seenHands, now);

  if (now < statusOverrideUntil) return;
  if (!hands.length) {
    gestureName.textContent = faceLandmarker ? 'SHOW A HAND OR SQUINT' : 'SHOW A HAND';
    gestureDetail.textContent = faceLandmarker
      ? 'Spider-Man: index + pinky. Iron Man: open palm. Flash: close fist. Sudarshan Chakra: index only. Superman: squint both eyes.'
      : 'Use a hand gesture. Eye tracking is not available yet.';
    return;
  }

  const mainHand = hands[0];
  gestureName.textContent = mainHand.gesture;
  if (hands.length > 1) {
    gestureDetail.textContent = `${hands.length} hands in view`;
  } else if (mainHand.gesture === 'HAND TRACKED') {
    gestureDetail.textContent = 'Close your fist for Flash lightning, or use the Spider-Man, Iron Man, and Sudarshan Chakra poses';
  } else if (mainHand.gesture === 'FLASH LIGHTNING') {
    gestureDetail.textContent = 'Lightning arcs around your fist and forearm while you hold it closed.';
  } else {
    gestureDetail.textContent = 'Pose locked. Relax your hand to re-arm';
  }
}

function updateFaceTracking(faceDetection, now) {
  const faceState = faceTrackingState.update(faceDetection, now, screenPoint);
  if (faceState?.laserFired) {
    fireSupermanLaser(faceState.face, faceState.eyes, faceState.direction);
  }
}

function averageLandmarks(landmarks, indices) {
  const total = indices.reduce((sum, index) => ({
    x: sum.x + landmarks[index].x,
    y: sum.y + landmarks[index].y,
  }), { x: 0, y: 0 });
  return { x: total.x / indices.length, y: total.y / indices.length };
}

function fireSupermanLaser(face, eyePoints, direction) {
  const eyes = eyePoints || [
    screenPoint(averageLandmarks(face, [33, 133, 159, 145])),
    screenPoint(averageLandmarks(face, [362, 263, 386, 374])),
  ];
  const eyeCenter = {
    x: (eyes[0].x + eyes[1].x) / 2,
    y: (eyes[0].y + eyes[1].y) / 2,
  };

  addEffect({
    type: 'laser-eyes',
    x: eyeCenter.x,
    y: eyeCenter.y,
    eyes,
    vx: direction.vx,
    vy: direction.vy,
    duration: 850,
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



function drawLaserEyes(effect, progress) {
  const launch = Math.min(1, progress / 0.18);
  const eased = 1 - Math.pow(1 - launch, 3);
  const fade = progress < 0.76 ? 1 : Math.max(0, 1 - (progress - 0.76) / 0.24);
  const vx = effect.vx ?? 0;
  const vy = effect.vy ?? 1;
  ctx.save();
  ctx.lineCap = 'round';

  for (const eye of effect.eyes) {
    const reach = distanceToEdge(eye.x, eye.y, vx, vy, screenWidth, screenHeight);
    const endX = eye.x + vx * reach * eased;
    const endY = eye.y + vy * reach * eased;

    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 18, 28, ${0.72 * fade})`;
    ctx.lineWidth = 16 * fade + 1.5;
    ctx.shadowColor = 'rgba(255, 20, 30, 1)';
    ctx.shadowBlur = 30;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 54, 38, ${0.98 * fade})`;
    ctx.lineWidth = 6 * fade + 0.8;
    ctx.shadowBlur = 13;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 238, 218, ${0.98 * fade})`;
    ctx.lineWidth = 2 * fade + 0.35;
    ctx.shadowBlur = 7;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 4.5 + (1 - progress) * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 78, 48, ${fade})`;
    ctx.shadowColor = 'rgba(255, 28, 32, 1)';
    ctx.shadowBlur = 20;
    ctx.fill();
  }
  ctx.restore();
}

function drawEffects(now) {
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  if (!effectsEnabled) return;

  drawHandGuides();
  for (const hand of hands) {
    if (hand.backOfHand && hand.gesture !== 'FLASH LIGHTNING') drawGreenLanternRing(ctx, hand.points);
    if (hand.gesture === 'FLASH LIGHTNING') drawFlashLightning(ctx, hand.points, now, hand.key);
    if (hand.gesture === 'SUDARSHAN CHAKRA') {
      chakraRadiusByHand.set(hand.key, drawSudarshanChakra(
        ctx, hand.points[8], hand.points, hand.landmarks, chakraRadiusByHand.get(hand.key), now,
      ));
    }
  }
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    const progress = Math.max(0, Math.min(1, (now - effect.start) / effect.duration));
    if (progress >= 1) {
      effects.splice(index, 1);
      continue;
    }

    if (effect.type === 'web') {
      const reach = distanceToEdge(effect.x, effect.y, effect.vx, effect.vy, screenWidth, screenHeight);
      drawSpiderManWeb(ctx, effect, progress, reach);
    }
    else if (effect.type === 'repulsor') drawIronManRepulsor(ctx, effect, progress, screenWidth, screenHeight);
    else if (effect.type === 'repulsor-flash') drawIronManRepulsorFlash(ctx, effect, progress);
    else if (effect.type === 'laser-eyes') drawLaserEyes(effect, progress);
  }
}

function renderLoop(now) {
  if (!running) return;
  if (!paused) {
    if (landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.currentTime !== lastVideoTime && now - lastDetectionAt >= FRAME_INTERVAL) {
      try {
        const handDetection = landmarker.detectForVideo(video, now);
        updateHands(handDetection, now);
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
  const nextPaused = !paused;
  try {
    await setCameraPaused(video, nextPaused);
  } catch (error) {
    showMessage(error.message || 'Camera playback could not resume.');
    return;
  }
  paused = nextPaused;
  if (paused) {
    pauseButton.textContent = 'RESUME';
    engineLabel.textContent = 'CAMERA PAUSED';
  } else {
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
