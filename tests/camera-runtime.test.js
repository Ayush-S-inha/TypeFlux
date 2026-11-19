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
    pause() {},
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
  closeCamera(video, stream);
});

test('openCamera reports unavailable browser camera access', async () => {
  const video = { srcObject: null, pause() {} };
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
    pause() {},
  };

  await withNavigator({
    mediaDevices: { async getUserMedia() { return stream; } },
  }, async () => {
    await assert.rejects(openCamera(video), playbackError);
  });

  assert.deepEqual(stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, null);
});

test('pausing stops camera tracks and clears the live video source', async () => {
  const { stream, stoppedTracks } = createCameraStream();
  const calls = [];
  const video = {
    srcObject: null,
    async play() { calls.push('play'); },
    pause() { calls.push('pause'); },
  };

  await withNavigator({
    mediaDevices: { async getUserMedia() { return stream; } },
  }, async () => {
    await openCamera(video);
    assert.equal(await setCameraPaused(video, true), null);
  });

  assert.deepEqual(stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, null);
  assert.deepEqual(calls, ['play', 'pause']);
});

test('resuming requests a fresh camera stream', async () => {
  const first = createCameraStream();
  const second = createCameraStream();
  const streams = [first.stream, second.stream];
  let requestCount = 0;
  const video = {
    srcObject: null,
    async play() {},
    pause() {},
  };

  await withNavigator({
    mediaDevices: {
      async getUserMedia() {
        const stream = streams[requestCount];
        requestCount += 1;
        return stream;
      },
    },
  }, async () => {
    await openCamera(video);
    await setCameraPaused(video, true);
    const resumedStream = await setCameraPaused(video, false);
    assert.equal(resumedStream, second.stream);
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(first.stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, second.stream);
});

test('closeCamera stops both the supplied stream and the active stream', async () => {
  const first = createCameraStream();
  const second = createCameraStream();
  const video = {
    srcObject: null,
    async play() {},
    pause() {},
  };

  await withNavigator({
    mediaDevices: {
      async getUserMedia() { return second.stream; },
    },
  }, async () => {
    await openCamera(video);
    closeCamera(video, first.stream);
  });

  assert.deepEqual(first.stoppedTracks, ['video', 'audio']);
  assert.deepEqual(second.stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, null);
});


test('closeCamera cancels a pending camera request and stops its late stream', async () => {
  const { stream, stoppedTracks } = createCameraStream();
  let resolveStream;
  const video = {
    srcObject: null,
    async play() {},
    pause() {},
  };

  await withNavigator({
    mediaDevices: {
      getUserMedia() {
        return new Promise((resolve) => { resolveStream = resolve; });
      },
    },
  }, async () => {
    const pendingRequest = openCamera(video);
    closeCamera(video, null);
    resolveStream(stream);
    await assert.rejects(pendingRequest, (error) => error.name === 'AbortError');
  });

  assert.deepEqual(stoppedTracks, ['video', 'audio']);
  assert.equal(video.srcObject, null);
});
