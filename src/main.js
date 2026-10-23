import './style.css';

const canvas = document.querySelector('#text-scene');
const context = canvas.getContext('2d', { alpha: false });
const sampleCanvas = document.createElement('canvas');
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
const video = document.querySelector('#camera');
const startButton = document.querySelector('#start-camera');
const pauseButton = document.querySelector('#pause-camera');
const restartButton = document.querySelector('#restart-camera');
const welcome = document.querySelector('#welcome');
const controls = document.querySelector('#controls');
const stateLabel = document.querySelector('#state-label');
const stateDot = document.querySelector('#state-dot');
const renderState = document.querySelector('#render-state');
const renderMode = document.querySelector('#render-mode');
const errorMessage = document.querySelector('#error-message');
const detailControl = document.querySelector('#detail');
const detailValue = document.querySelector('#detail-value');
const contrastControl = document.querySelector('#contrast');
const contrastValue = document.querySelector('#contrast-value');
const invertButton = document.querySelector('#invert');
const colorButton = document.querySelector('#colorize');
const structureControl = document.querySelector('#structure');
const structureValue = document.querySelector('#structure-value');

const glyphs = '  .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
const detailPresets = [
  { cellWidth: 10, cellHeight: 15, fontSize: 12, label: 'LOW' },
  { cellWidth: 7.5, cellHeight: 11.5, fontSize: 10, label: 'MEDIUM' },
  { cellWidth: 5.4, cellHeight: 8.2, fontSize: 7.4, label: 'HIGH' },
];
// Violet through rose, with a warm highlight at the top end.
const colorStops = [
  { at: 0, r: 89, g: 67, b: 157 },
  { at: 0.34, r: 157, g: 75, b: 179 },
  { at: 0.68, r: 231, g: 104, b: 151 },
  { at: 1, r: 255, g: 231, b: 199 },
];
const edgeGlyphs = ['-', '\\', '|', '/'];
const frameInterval = 1000 / 24;
const luminanceHistogram = new Uint32Array(256);
let luminanceData = new Float32Array(0);
let smoothedLuminance = new Float32Array(0);
let edgeStrengths = new Float32Array(0);
let edgeDirections = new Uint8Array(0);

let stream = null;
let running = false;
let paused = false;
let inverted = false;
let colorized = true;
let lastFrame = 0;
let columns = 0;
let rows = 0;
let pixelData = null;
let animationFrame = 0;
let dpr = 1;
let cellWidth = detailPresets[1].cellWidth;
let cellHeight = detailPresets[1].cellHeight;
let fontSize = detailPresets[1].fontSize;
let contrast = Number(contrastControl.value);
let structure = Number(structureControl.value);
let blackPoint = 0;
let whitePoint = 0.86;
let toneRangeInitialized = false;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  columns = Math.max(1, Math.floor(width / cellWidth));
  rows = Math.max(1, Math.floor(height / cellHeight));
  sampleCanvas.width = columns;
  sampleCanvas.height = rows;
  const sampleCount = columns * rows;
  if (luminanceData.length !== sampleCount) {
    luminanceData = new Float32Array(sampleCount);
    smoothedLuminance = new Float32Array(sampleCount);
    edgeStrengths = new Float32Array(sampleCount);
    edgeDirections = new Uint8Array(sampleCount);
  }
  context.textBaseline = 'top';
  context.textAlign = 'center';
  context.font = `${fontSize}px "Courier New", monospace`;
  if (running && !paused) drawFrame(performance.now(), true);
  else drawWaitingState();
}

function drawWaitingState() {
  context.fillStyle = '#050505';
  context.fillRect(0, 0, window.innerWidth, window.innerHeight);
}

function updateDetail() {
  const preset = detailPresets[Number(detailControl.value)];
  cellWidth = preset.cellWidth;
  cellHeight = preset.cellHeight;
  fontSize = preset.fontSize;
  detailValue.value = preset.label;
  detailValue.textContent = preset.label;
  resize();
}

function sampleCamera() {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return false;

  sampleContext.fillStyle = '#000';
  sampleContext.fillRect(0, 0, columns, rows);

  const targetAspect = (columns * cellWidth) / Math.max(1, rows * cellHeight);
  const sourceAspect = videoWidth / videoHeight;
  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (sourceAspect > targetAspect) {
    sw = videoHeight * targetAspect;
    sx = (videoWidth - sw) / 2;
  } else {
    sh = videoWidth / targetAspect;
    sy = (videoHeight - sh) / 2;
  }

  sampleContext.save();
  sampleContext.translate(columns, 0);
  sampleContext.scale(-1, 1);
  sampleContext.drawImage(video, sx, sy, sw, sh, 0, 0, columns, rows);
  sampleContext.restore();
  pixelData = sampleContext.getImageData(0, 0, columns, rows).data;
  return true;
}

function percentileFromHistogram(percentile, sampleCount) {
  const threshold = sampleCount * percentile;
  let cumulative = 0;
  for (let index = 0; index < luminanceHistogram.length; index += 1) {
    cumulative += luminanceHistogram[index];
    if (cumulative >= threshold) return index / 255;
  }
  return 1;
}

function updateToneRange() {
  luminanceHistogram.fill(0);
  const pixelCount = pixelData.length / 4;

  for (let pixel = 0; pixel < pixelData.length; pixel += 4) {
    const luminance = (pixelData[pixel] * 0.2126
      + pixelData[pixel + 1] * 0.7152
      + pixelData[pixel + 2] * 0.0722) / 255;
    luminanceHistogram[Math.round(luminance * 255)] += 1;
  }

  // Percentile bounds ignore isolated bright and dark pixels.
  // Keep flat frames from turning tiny differences into visible noise.
  const targetBlack = Math.max(0, percentileFromHistogram(0.055, pixelCount) - 0.006);
  const targetWhite = Math.min(1, percentileFromHistogram(0.985, pixelCount) + 0.006);

  if (!toneRangeInitialized) {
    blackPoint = targetBlack;
    whitePoint = targetWhite;
    toneRangeInitialized = true;
    return;
  }

  blackPoint += (targetBlack - blackPoint) * 0.14;
  whitePoint += (targetWhite - whitePoint) * 0.14;

  if (whitePoint - blackPoint < 0.12) whitePoint = Math.min(1, blackPoint + 0.12);
}

// Smooth the sampled tones, then measure nearby edges and their direction.
function prepareStructureMap(toneRange) {
  for (let index = 0; index < luminanceData.length; index += 1) {
    const pixel = index * 4;
    const luminance = (pixelData[pixel] * 0.2126
      + pixelData[pixel + 1] * 0.7152
      + pixelData[pixel + 2] * 0.0722) / 255;
    luminanceData[index] = clamp((luminance - blackPoint - 0.01) / toneRange);
  }

  // A quick cross blur takes the edge off isolated pixel noise.
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const center = luminanceData[index];
      const left = luminanceData[row * columns + Math.max(0, column - 1)];
      const right = luminanceData[row * columns + Math.min(columns - 1, column + 1)];
      const top = luminanceData[Math.max(0, row - 1) * columns + column];
      const bottom = luminanceData[Math.min(rows - 1, row + 1) * columns + column];
      smoothedLuminance[index] = (center * 4 + left + right + top + bottom) / 8;
    }
  }

  // Sobel gradients give each cell an edge strength and direction.
  for (let row = 0; row < rows; row += 1) {
    const topRow = Math.max(0, row - 1) * columns;
    const middleRow = row * columns;
    const bottomRow = Math.min(rows - 1, row + 1) * columns;

    for (let column = 0; column < columns; column += 1) {
      const left = Math.max(0, column - 1);
      const right = Math.min(columns - 1, column + 1);
      const topLeft = smoothedLuminance[topRow + left];
      const top = smoothedLuminance[topRow + column];
      const topRight = smoothedLuminance[topRow + right];
      const middleLeft = smoothedLuminance[middleRow + left];
      const middleRight = smoothedLuminance[middleRow + right];
      const bottomLeft = smoothedLuminance[bottomRow + left];
      const bottom = smoothedLuminance[bottomRow + column];
      const bottomRight = smoothedLuminance[bottomRow + right];
      const gradientX = -topLeft + topRight
        - 2 * middleLeft + 2 * middleRight
        - bottomLeft + bottomRight;
      const gradientY = -topLeft - 2 * top - topRight
        + bottomLeft + 2 * bottom + bottomRight;
      const index = middleRow + column;
      edgeStrengths[index] = clamp(Math.hypot(gradientX, gradientY) / 4);

      const tangent = Math.atan2(gradientY, gradientX) + Math.PI / 2;
      const direction = Math.round(tangent / (Math.PI / 4));
      edgeDirections[index] = ((direction % 4) + 4) % 4;
    }
  }
}

function colorForTone(tone, alpha) {
  let lower = colorStops[0];
  let upper = colorStops[colorStops.length - 1];

  for (let index = 0; index < colorStops.length - 1; index += 1) {
    if (tone >= colorStops[index].at && tone <= colorStops[index + 1].at) {
      lower = colorStops[index];
      upper = colorStops[index + 1];
      break;
    }
  }

  const amount = clamp((tone - lower.at) / Math.max(0.001, upper.at - lower.at));
  const red = Math.round(lower.r + (upper.r - lower.r) * amount);
  const green = Math.round(lower.g + (upper.g - lower.g) * amount);
  const blue = Math.round(lower.b + (upper.b - lower.b) * amount);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawFrame(timestamp, force = false) {
  if (!running || paused) return;
  if (!force && timestamp - lastFrame < frameInterval) return;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !sampleCamera()) return;
  lastFrame = timestamp;
  updateToneRange();
  const toneRange = Math.max(0.22, whitePoint - blackPoint);
  prepareStructureMap(toneRange);

  const width = window.innerWidth;
  const height = window.innerHeight;
  context.fillStyle = '#030303';
  context.fillRect(0, 0, width, height);
  context.font = `${fontSize}px "Courier New", monospace`;
  context.textBaseline = 'top';
  context.textAlign = 'center';

  const left = (width - columns * cellWidth) / 2;
  const top = (height - rows * cellHeight) / 2;
  const maxGlyph = glyphs.length - 1;
  const edgeThreshold = 0.22 - structure * 0.15;
  const edgeGain = 2.5 + structure * 4;

  for (let row = 0; row < rows; row += 1) {
    const y = top + row * cellHeight;
    for (let column = 0; column < columns; column += 1) {
      const gridIndex = row * columns + column;
      const baseTone = clamp(
        luminanceData[gridIndex] * 0.72 + smoothedLuminance[gridIndex] * 0.28,
      );
      const shapedTone = Math.pow(baseTone, 0.92);
      const contrastTone = clamp((shapedTone - 0.42) * contrast + 0.42);
      const displayTone = inverted ? 1 - contrastTone : contrastTone;
      const edgeStrength = structure === 0
        ? 0
        : clamp((edgeStrengths[gridIndex] - edgeThreshold) * edgeGain);
      const isContour = structure > 0 && edgeStrength > 0.42;

      // Keep strong edges, but skip nearly black background noise.
      if (!inverted && baseTone < 0.035 && !isContour) continue;

      const glyphIndex = Math.min(maxGlyph, Math.max(0, Math.round(displayTone * maxGlyph)));
      const glyph = isContour
        ? edgeGlyphs[edgeDirections[gridIndex]]
        : glyphs[glyphIndex];
      if (glyph === ' ') continue;

      const tonalAlpha = Math.min(
        0.72,
        0.09 + Math.pow(displayTone, 0.92) * 0.58,
      );
      const alpha = isContour ? clamp(0.22 + edgeStrength * 0.38, 0.22, 0.65) : tonalAlpha;
      if (colorized) {
        context.fillStyle = colorForTone(displayTone, alpha);
      } else {
        const brightness = Math.round(178 + displayTone * 72);
        context.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${alpha})`;
      }
      context.fillText(glyph, left + column * cellWidth + cellWidth * 0.5, y);
    }
  }
}

function updateRenderMode() {
  colorButton.setAttribute('aria-pressed', String(colorized));
  colorButton.querySelector('span').textContent = colorized ? 'ON' : 'OFF';
  renderMode.textContent = colorized ? 'COLOR MODE' : 'MONOCHROME MODE';
}

function renderLoop(timestamp) {
  if (!running) return;
  if (!paused) drawFrame(timestamp);
  animationFrame = requestAnimationFrame(renderLoop);
}

async function startCamera() {
  errorMessage.hidden = true;
  startButton.disabled = true;
  startButton.textContent = 'Connecting…';

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is unavailable. Open TypeFlux on localhost in a current browser.');
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
    toneRangeInitialized = false;
    welcome.classList.add('dismissed');
    controls.hidden = false;
    stateLabel.textContent = 'LIVE / TEXT FIELD';
    stateDot.classList.add('live');
    renderState.textContent = 'CAMERA INPUT ACTIVE';
    pauseButton.disabled = false;
    restartButton.disabled = false;
    pauseButton.textContent = 'HOLD FRAME';
    startButton.textContent = 'Enter the scene';
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(renderLoop);
  } catch (error) {
    startButton.disabled = false;
    startButton.textContent = 'Try again';
    errorMessage.textContent = error.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow camera access in Chrome settings, then try again.'
      : error.message || 'The camera could not be started.';
    errorMessage.hidden = false;
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
  video.srcObject = null;
  stateLabel.textContent = 'CAMERA NOT CONNECTED';
  stateDot.classList.remove('live');
  renderState.textContent = 'AWAITING CAMERA INPUT';
  pauseButton.disabled = true;
  restartButton.disabled = true;
  pauseButton.textContent = 'HOLD FRAME';
  controls.hidden = true;
  welcome.classList.remove('dismissed');
  startButton.disabled = false;
  startButton.textContent = 'Enter the scene';
  toneRangeInitialized = false;
  drawWaitingState();
}

startButton.addEventListener('click', startCamera);
pauseButton.addEventListener('click', () => {
  if (!running) return;
  paused = !paused;
  pauseButton.textContent = paused ? 'RESUME' : 'HOLD FRAME';
  renderState.textContent = paused ? 'FRAME HELD' : 'CAMERA INPUT ACTIVE';
});
restartButton.addEventListener('click', () => {
  stopCamera();
  startCamera();
});
detailControl.addEventListener('input', updateDetail);
contrastControl.addEventListener('input', () => {
  contrast = Number(contrastControl.value);
  contrastValue.value = `${contrast.toFixed(1)}×`;
  contrastValue.textContent = `${contrast.toFixed(1)}×`;
});
structureControl.addEventListener('input', () => {
  structure = Number(structureControl.value);
  const percentage = `${Math.round(structure * 100)}%`;
  structureValue.value = percentage;
  structureValue.textContent = percentage;
});
invertButton.addEventListener('click', () => {
  inverted = !inverted;
  invertButton.setAttribute('aria-pressed', String(inverted));
  invertButton.querySelector('span').textContent = inverted ? 'ON' : 'OFF';
});
colorButton.addEventListener('click', () => {
  colorized = !colorized;
  updateRenderMode();
});
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', stopCamera);

updateRenderMode();
resize();
drawWaitingState();
