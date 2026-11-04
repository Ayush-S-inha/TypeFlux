const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
};

export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not available in this browser. Open TypeFlux on localhost in a current version of Chrome.');
  }

  const cameraStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  try {
    video.srcObject = cameraStream;
    await video.play();
    return cameraStream;
  } catch (error) {
    for (const track of cameraStream.getTracks()) track.stop();
    video.srcObject = null;
    throw error;
  }
}

export async function setCameraPaused(video, paused) {
  if (paused) video.pause();
  else await video.play();
}

export function closeCamera(video, cameraStream) {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  video.pause();
  video.srcObject = null;
}
