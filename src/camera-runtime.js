const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
};

let activeCameraStream = null;
let cameraRequestId = 0;
const stoppedStreams = new WeakSet();

function stopTracks(stream) {
  if (!stream?.getTracks || stoppedStreams.has(stream)) return;
  stoppedStreams.add(stream);
  for (const track of stream.getTracks()) track.stop();
}

function createCancelledRequestError() {
  const error = new Error('Camera request was cancelled.');
  error.name = 'AbortError';
  return error;
}

export async function openCamera(video) {
  const requestId = ++cameraRequestId;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not available in this browser. Open TypeFlux on localhost in a current version of Chrome.');
  }

  const cameraStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  if (requestId !== cameraRequestId) {
    stopTracks(cameraStream);
    throw createCancelledRequestError();
  }

  try {
    if (activeCameraStream && activeCameraStream !== cameraStream) {
      stopTracks(activeCameraStream);
      activeCameraStream = null;
    }
    video.srcObject = cameraStream;
    await video.play();
    if (requestId !== cameraRequestId) throw createCancelledRequestError();
    activeCameraStream = cameraStream;
    return cameraStream;
  } catch (error) {
    stopTracks(cameraStream);
    if (video.srcObject === cameraStream) video.srcObject = null;
    if (activeCameraStream === cameraStream) activeCameraStream = null;
    throw error;
  }
}

export async function setCameraPaused(video, paused) {
  if (paused) {
    closeCamera(video, activeCameraStream);
    return null;
  }
  return openCamera(video);
}

export function closeCamera(video, cameraStream) {
  cameraRequestId += 1;
  const streams = new Set(
    [cameraStream, activeCameraStream, video.srcObject]
      .filter((stream) => stream && typeof stream.getTracks === 'function'),
  );
  for (const stream of streams) stopTracks(stream);
  if (video.srcObject && streams.has(video.srcObject)) video.srcObject = null;
  video.pause();
  activeCameraStream = null;
}
