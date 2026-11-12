import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeCamera,
  openCamera,
  setCameraPaused,
} from '../src/camera-runtime.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

async function withNavigator(navigatorStub, run) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigatorStub,
  });
  try {
    await run();
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
}

function createCameraStream() {
  const stoppedTracks = [];
  const tracks = [
    { stop: () => stoppedTracks.push('video') },
    { stop: () => stoppedTracks.push('audio') },
  ];
  return {
    stream: { getTracks: () => tracks },
    stoppedTracks,
  };
}

test('openCamera requests a user-facing video stream and starts playback', async () => {
  const { stream } = createCameraStream();
  let constraints;
  const video = {
    srcObject: null,
    played: false,
    async play() { this.played = true; },
  };

  await withNavigator({
    mediaDevices: {
      async getUserMedia(requested) {
        constraints = requested;
        return stream;
      },
    },
  }, async () => {
    assert.equal(await openCamera(video), stream);
  });

  assert.equal(video.srcObject, stream);
  assert.equal(video.played, true);
  assert.equal(constraints.audio, false);
  assert.equal(constraints.video.facingMode, 'user');
  assert.deepEqual(constraints.video.width, { ideal: 1280 });
  assert.deepEqual(constraints.video.height, { ideal: 720 });
});

test('openCamera reports unavailable browser camera access', async () => {
  const video = { srcObject: null };
  await withNavigator({}, async () => {
    await assert.rejects(openCamera(video), /Camera access is not available/);
  });
  assert.equal(video.srcObject, null);
});

test('openCamera stops every track when video playback rejects', async () => {
  const { stream, stoppedTracks } = createCameraStream();
  const playbackError = new Error('Playback rejected');
  const video = {
    srcObject: null,
    async play() { throw playbackError; },
  };

  await withNavigator({
    mediaDevices: { async getUserMedia() { return stream; } },
  }, async () => {
    await assert.rejects(openCamera(video), playbackError);
  });

  assert.deepEqual(stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, null);
});

test('setCameraPaused pauses and resumes the video element', async () => {
  const calls = [];
  const video = {
    pause() { calls.push('pause'); },
    async play() { calls.push('play'); },
  };

  await setCameraPaused(video, true);
  await setCameraPaused(video, false);
  assert.deepEqual(calls, ['pause', 'play']);
});

test('closeCamera stops tracks and clears the video source', () => {
  const { stream, stoppedTracks } = createCameraStream();
  const calls = [];
  const video = {
    srcObject: stream,
    pause() { calls.push('pause'); },
  };

  closeCamera(video, stream);
  assert.deepEqual(stoppedTracks, ['video', 'audio']);
  assert.deepEqual(calls, ['pause']);
  assert.equal(video.srcObject, null);
});
