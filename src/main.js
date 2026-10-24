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
const FRAME_INTERVAL = 1000 / 24;
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

let stream = null;
let landmarker = null;
let running = false;
let paused = false;
let effectsEnabled = true;
let trackerLoading = false;
let lastVideoTime = -1;
let lastDetectionAt = 0;
let animationFrame = 0;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let pixelRatio = 1;
let hands = [];
const effects = [];
const handHistory = new Map();
const lastGestures = new Map();
const lastActionAt = new Map();

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

async function loadHandTracking() {
  if (landmarker) {
    trackingLabel.textContent = 'TRACKING READY';
    return;
  }
  if (trackerLoading) return;
  trackerLoading = true;
  trackingLabel.textContent = 'LOADING TRACKING';
  gestureName.textContent = 'LOADING GESTURE ENGINE';
  gestureDetail.textContent = 'First launch needs an internet connection';

  try {
    landmarker = await createHandTracker();
    if (!running) return;
    trackingLabel.textContent = 'TRACKING READY';
    gestureName.textContent = 'SHOW A HAND';
    gestureDetail.textContent = 'Try a web-shooting pose, open palm, fist, or peace sign';
  } catch (error) {
    console.error('TypeFlux could not start hand tracking:', error);
    trackingLabel.textContent = 'TRACKING UNAVAILABLE';
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
    trackingLabel.textContent = 'STARTING TRACKING';
    gestureName.textContent = 'SHOW A HAND';
    gestureDetail.textContent = 'Keep your hand inside the camera frame';
    animationFrame = requestAnimationFrame(renderLoop);
    loadHandTracking();
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
  handHistory.clear();
  lastGestures.clear();
  lastActionAt.clear();
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

function fingerIsUp(landmarks, tipIndex, pipIndex) {
  const wrist = landmarks[0];
  const tipDistance = distance(landmarks[tipIndex], wrist);
  const jointDistance = distance(landmarks[pipIndex], wrist);
  return tipDistance > jointDistance * 1.12;
}

function thumbIsOut(landmarks) {
  const base = landmarks[2];
  const tipDistance = distance(landmarks[4], base);
  const jointDistance = distance(landmarks[3], base);
  return tipDistance > jointDistance * 1.2;
}

function readFingers(landmarks) {
  return {
    thumb: thumbIsOut(landmarks),
    index: fingerIsUp(landmarks, 8, 6),
    middle: fingerIsUp(landmarks, 12, 10),
    ring: fingerIsUp(landmarks, 16, 14),
    pinky: fingerIsUp(landmarks, 20, 18),
  };
}

function isWaving(key, wristX, now) {
  const history = handHistory.get(key) || [];
  history.push({ x: wristX, time: now });
  while (history.length && now - history[0].time > 900) history.shift();
  handHistory.set(key, history);
  if (history.length < 7) return false;

  const xs = history.map((point) => point.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (span < 0.13) return false;

  let lastDirection = 0;
  let turns = 0;
  for (let index = 1; index < history.length; index += 1) {
    const movement = history[index].x - history[index - 1].x;
    if (Math.abs(movement) < 0.012) continue;
    const direction = Math.sign(movement);
    if (lastDirection && direction !== lastDirection) turns += 1;
    lastDirection = direction;
  }
  return turns >= 2;
}

function recognizeGesture(landmarks, key, now, screenPoints) {
  const fingers = readFingers(landmarks);
  const { index, middle, ring, pinky, thumb } = fingers;
  const openPalm = index && middle && ring && pinky;

  if (openPalm && isWaving(key, screenPoints[0].x / screenWidth, now)) return 'WAVE';
  if (index && pinky && !middle && !ring) return 'WEB SHOOTER';
  if (openPalm) return 'OPEN PALM';
  if (index && middle && !ring && !pinky) return 'PEACE SIGN';
  if (thumb && !index && !middle && !ring && !pinky && landmarks[4].y < landmarks[3].y) return 'THUMBS UP';
  if (index && !middle && !ring && !pinky) return 'REPULSOR AIM';
  if (!index && !middle && !ring && !pinky) return 'FIST';
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

function fireGesture(gesture, landmarks, points, key, now) {
  if (gesture === 'HAND TRACKED') return;

  const previous = lastGestures.get(key);
  const lastTime = lastActionAt.get(key) || 0;
  const repeatDelay = gesture === 'WEB SHOOTER' ? 720 : gesture === 'REPULSOR AIM' ? 650 : 850;
  const entered = previous !== gesture;
  if (now - lastTime < 260) return;
  if (!entered && now - lastTime < repeatDelay) return;
  lastGestures.set(key, gesture);
  lastActionAt.set(key, now);

  const wrist = points[0];
  const palm = points[9];
  const indexTip = points[8];
  const middleTip = points[12];

  if (gesture === 'WEB SHOOTER') {
    const dx = indexTip.x - wrist.x;
    const dy = indexTip.y - wrist.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    addEffect('web', palm.x, palm.y, { vx: dx / length, vy: dy / length, duration: 530 });
  } else if (gesture === 'OPEN PALM') {
    addEffect('pulse', palm.x, palm.y, { duration: 860 });
  } else if (gesture === 'FIST') {
    addEffect('impact', palm.x, palm.y, { duration: 580 });
  } else if (gesture === 'PEACE SIGN') {
    addEffect('twin-rays', (indexTip.x + middleTip.x) / 2, (indexTip.y + middleTip.y) / 2, {
      points: [indexTip, middleTip], wrist, duration: 620,
    });
  } else if (gesture === 'WAVE') {
    addEffect('wave', palm.x, palm.y, { duration: 780 });
  } else if (gesture === 'THUMBS UP') {
    addEffect('power-up', points[4].x, points[4].y, { duration: 1000 });
  } else if (gesture === 'REPULSOR AIM') {
    const dx = indexTip.x - points[6].x;
    const dy = indexTip.y - points[6].y;
    const length = Math.max(1, Math.hypot(dx, dy));
    addEffect('repulsor', indexTip.x, indexTip.y, { vx: dx / length, vy: dy / length, duration: 500 });
  }

}

function updateHands(result, now) {
  hands = [];
  const landmarksList = result.landmarks || [];
  for (let index = 0; index < landmarksList.length; index += 1) {
    const landmarks = landmarksList[index];
    const points = landmarks.map(screenPoint);
    const handedness = result.handednesses?.[index]?.[0]?.categoryName || `HAND ${index + 1}`;
    const key = String(handedness);
    const gesture = recognizeGesture(landmarks, key, now, points);
    hands.push({ key, landmarks, points, gesture });
    fireGesture(gesture, landmarks, points, key, now);
  }

  if (!hands.length) {
    gestureName.textContent = landmarker ? 'SHOW A HAND' : 'LOADING GESTURE ENGINE';
    gestureDetail.textContent = landmarker ? 'Move your hand into the camera frame' : 'Preparing hand tracking';
    return;
  }

  const mainHand = hands[0];
  gestureName.textContent = mainHand.gesture;
  gestureDetail.textContent = hands.length > 1 ? `${hands.length} hands in view` : 'Gesture tracking active';
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

function drawWeb(effect, progress) {
  const distanceOut = Math.max(screenWidth, screenHeight) * 0.95 * progress;
  const endX = effect.x + effect.vx * distanceOut;
  const endY = effect.y + effect.vy * distanceOut;
  const sideX = -effect.vy;
  const sideY = effect.vx;
  const segments = Math.max(8, Math.floor(distanceOut / 20));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(190, 238, 255, .9)';
  ctx.shadowBlur = 13;
  ctx.strokeStyle = 'rgba(245, 250, 255, .94)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  for (let step = 1; step <= segments; step += 1) {
    const t = step / segments;
    const bend = Math.sin(t * Math.PI * 7) * Math.min(12, 3 + distanceOut * 0.012) * t;
    ctx.lineTo(effect.x + effect.vx * distanceOut * t + sideX * bend,
      effect.y + effect.vy * distanceOut * t + sideY * bend);
  }
  ctx.stroke();
  ctx.shadowBlur = 4;
  ctx.strokeStyle = 'rgba(158, 232, 255, .85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPulse(effect, progress) {
  const radius = 24 + progress * Math.min(screenWidth, screenHeight) * 0.24;
  ctx.save();
  for (let ring = 0; ring < 3; ring += 1) {
    const ringProgress = (progress + ring * 0.12) % 1;
    const ringRadius = 18 + ringProgress * Math.min(screenWidth, screenHeight) * 0.22;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${ring === 1 ? '185, 151, 255' : '160, 236, 255'}, ${(1 - ringProgress) * 0.72})`;
    ctx.lineWidth = 2 - ring * 0.35;
    ctx.shadowColor = 'rgba(148, 221, 255, .85)';
    ctx.shadowBlur = 15;
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(effect.x, effect.y, 2, effect.x, effect.y, radius * 0.9);
  glow.addColorStop(0, 'rgba(240, 251, 255, .6)');
  glow.addColorStop(1, 'rgba(152, 196, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawImpact(effect, progress) {
  const reach = 26 + progress * 145;
  const count = 16;
  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.rotate(progress * 0.7);
  ctx.lineCap = 'round';
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const inner = reach * 0.35;
    const outer = reach * (0.72 + (index % 3) * 0.14);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.strokeStyle = index % 2 ? `rgba(255, 123, 183, ${(1 - progress) * .85})` : `rgba(255, 234, 194, ${(1 - progress) * .95})`;
    ctx.lineWidth = index % 3 === 0 ? 2.8 : 1.4;
    ctx.shadowColor = 'rgba(255, 121, 177, .75)';
    ctx.shadowBlur = 9;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTwinRays(effect, progress) {
  const reach = 70 + progress * 260;
  const points = effect.points || [];
  const wrist = effect.wrist || { x: effect.x, y: effect.y + 20 };
  ctx.save();
  ctx.lineCap = 'round';
  points.forEach((point, index) => {
    const dx = point.x - wrist.x;
    const dy = point.y - wrist.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const endX = point.x + (dx / length) * reach;
    const endY = point.y + (dy / length) * reach;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = index === 0 ? `rgba(173, 231, 255, ${(1 - progress) * .9})` : `rgba(205, 168, 255, ${(1 - progress) * .9})`;
    ctx.lineWidth = 5 * (1 - progress) + 1;
    ctx.shadowColor = 'rgba(167, 220, 255, .9)';
    ctx.shadowBlur = 15;
    ctx.stroke();
  });
  ctx.restore();
}

function drawWave(effect, progress) {
  ctx.save();
  for (let arc = 0; arc < 3; arc += 1) {
    const radius = 18 + ((progress + arc * .17) % 1) * 90;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, -Math.PI * 0.85, Math.PI * 0.85);
    ctx.strokeStyle = `rgba(255, 218, 155, ${(1 - progress) * .78})`;
    ctx.lineWidth = 2.2 - arc * .4;
    ctx.shadowColor = 'rgba(255, 185, 110, .85)';
    ctx.shadowBlur = 12;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPowerUp(effect, progress) {
  const radius = 24 + Math.sin(progress * Math.PI * 5) * 8 + progress * 48;
  ctx.save();
  const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius * 1.5);
  gradient.addColorStop(0, `rgba(255, 246, 205, ${(1 - progress) * .78})`);
  gradient.addColorStop(1, 'rgba(255, 190, 102, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 225, 157, ${(1 - progress) * .9})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRepulsor(effect, progress) {
  const reach = 90 + progress * 380;
  const endX = effect.x + effect.vx * reach;
  const endY = effect.y + effect.vy * reach;
  ctx.save();
  ctx.lineCap = 'round';
  const gradient = ctx.createLinearGradient(effect.x, effect.y, endX, endY);
  gradient.addColorStop(0, `rgba(190, 244, 255, ${(1 - progress) * .95})`);
  gradient.addColorStop(1, 'rgba(170, 156, 255, 0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 7 * (1 - progress) + 1;
  ctx.shadowColor = 'rgba(135, 223, 255, .9)';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(effect.x, effect.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawEffects(now) {
  ctx.clearRect(0, 0, screenWidth, screenHeight);
  if (!effectsEnabled) return;

  drawHandGuides();
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    const progress = Math.max(0, Math.min(1, (now - effect.start) / effect.duration));
    if (progress >= 1) {
      effects.splice(index, 1);
      continue;
    }

    if (effect.type === 'web') drawWeb(effect, progress);
    else if (effect.type === 'pulse') drawPulse(effect, progress);
    else if (effect.type === 'impact') drawImpact(effect, progress);
    else if (effect.type === 'twin-rays') drawTwinRays(effect, progress);
    else if (effect.type === 'wave') drawWave(effect, progress);
    else if (effect.type === 'power-up') drawPowerUp(effect, progress);
    else if (effect.type === 'repulsor') drawRepulsor(effect, progress);
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
        trackingLabel.textContent = 'TRACKING RETRYING';
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
