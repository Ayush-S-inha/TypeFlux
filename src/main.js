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
const errorMessage = document.querySelector('#error-message');
const detailControl = document.querySelector('#detail');
const detailValue = document.querySelector('#detail-value');
const contrastControl = document.querySelector('#contrast');
const contrastValue = document.querySelector('#contrast-value');
const invertButton = document.querySelector('#invert');

const glyphs = '  .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
const detailPresets = [
  { cellWidth: 10, cellHeight: 15, fontSize: 12, label: 'LOW' },
  { cellWidth: 7.5, cellHeight: 11.5, fontSize: 10, label: 'MEDIUM' },
  { cellWidth: 5.4, cellHeight: 8.2, fontSize: 7.4, label: 'HIGH' },
];
const frameInterval = 1000 / 24;

let stream = null;
let running = false;
let paused = false;
let inverted = false;
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

function drawFrame(timestamp, force = false) {
  if (!running || paused) return;
  if (!force && timestamp - lastFrame < frameInterval) return;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !sampleCamera()) return;
  lastFrame = timestamp;

  const width = window.innerWidth;
  const height = window.innerHeight;
  context.fillStyle = '#030303';
  context.fillRect(0, 0, width, height);
  context.font = `${fontSize}px "Courier New", monospace`;
  context.textBaseline = 'top';
  context.textAlign = 'center';

  const left = (width - columns * cellWidth) / 2;
  const top = (height - rows * cellHeight) / 2;
  let pixel = 0;
  const maxGlyph = glyphs.length - 1;

  for (let row = 0; row < rows; row += 1) {
    const y = top + row * cellHeight;
    for (let column = 0; column < columns; column += 1) {
      const red = pixelData[pixel];
      const green = pixelData[pixel + 1];
      const blue = pixelData[pixel + 2];
      pixel += 4;

      let luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      luminance = Math.max(0, Math.min(1, (luminance - 0.5) * contrast + 0.5));
      luminance = Math.pow(luminance, 0.88);
      const mapped = inverted ? 1 - luminance : luminance;
      const glyphIndex = Math.min(maxGlyph, Math.max(0, Math.round(mapped * maxGlyph)));
      const glyph = glyphs[glyphIndex];
      if (glyph === ' ') continue;

      const brightness = Math.round(92 + luminance * 163);
      const alpha = Math.min(1, 0.2 + Math.pow(luminance, 0.7) * 0.8);
      context.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${alpha})`;
      context.fillText(glyph, left + column * cellWidth + cellWidth * 0.5, y);
    }
  }
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
      throw new Error('Camera access is unavailable. Open RIFT on localhost in a current browser.');
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
invertButton.addEventListener('click', () => {
  inverted = !inverted;
  invertButton.setAttribute('aria-pressed', String(inverted));
  invertButton.querySelector('span').textContent = inverted ? 'ON' : 'OFF';
});
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', stopCamera);

resize();
drawWaitingState();
