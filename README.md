# TypeFlux

TypeFlux is a browser-based camera experience that turns hand poses and facial movements into live visual effects. MediaPipe tracks the hands and face, and the app draws each effect over the camera feed.

## Effects and gestures

| Effect | Trigger |
| --- | --- |
| Spider-Man web | Extend the index and pinky fingers |
| Iron Man repulsor | Show an open palm |
| Flash lightning | Close your fist |
| Green Lantern ring | Turn the back of your hand toward the camera |
| Sudarshan Chakra | Point with the index finger and fold the other fingers |
| Superman heat vision | Squeeze both eyes briefly |

The web and repulsor fire once per held pose. Return to a relaxed hand before firing again. The Green Lantern ring follows the middle finger. The Sudarshan Chakra stays above the index fingertip and rotates in place; it does not launch as a projectile. Flash lightning follows the fist and forearm. Superman's beams follow the gaze direction.

## Run locally

Use Node.js 20.19 or later, or Node.js 22.12 or later.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and allow camera access. Do not open `index.html` directly; the app uses Vite's module server.

Create and preview a production build with:

```bash
npm run build
npm run preview
```

Run the automated tests with:

```bash
npm test
```

## Source layout

```text
TypeFlux/
  index.html
  package.json
  package-lock.json
  src/
    camera-runtime.js
    config.js
    face-tracking.js
    flash-lightning.js
    gesture-recognition.js
    gesture-state.js
    hand-artifacts.js
    hand-effects.js
    landmark-geometry.js
    main.js
    style.css
    tracker-resources.js
    tracking-runtime.js
  tests/
```

`src/main.js` coordinates the camera, tracking loops, gesture state and effect rendering. Camera acquisition and stream cleanup live in `camera-runtime.js`. Hand and face model setup live in `tracking-runtime.js` and `face-tracking.js`. Gesture classification, gesture settling and landmark projection are separate modules. Canvas rendering for the individual powers stays in the effect modules.

## Camera and privacy

Camera frames are processed in the browser. TypeFlux has no application backend and does not upload the camera feed. The MediaPipe JavaScript bundle, WASM files and model files load from external servers, so an internet connection is needed when those assets are not cached.

The app requests video only; microphone access is disabled. Camera permission, lighting, hand position and face visibility affect tracking. Keep your hand inside the frame and keep both eyes visible when using Superman heat vision.

The camera controls can pause, resume, restart or disable the visual effects. If the browser or operating system ends the camera track, TypeFlux returns to the start screen and asks you to reconnect.

## Testing notes

Automated tests cover camera stream cleanup, face and hand gesture state, landmark geometry, canvas effects, tracker disposal and interface structure. A passing test suite or production build does not verify real webcam tracking. Test each gesture in the browser after changing its thresholds, geometry or rendering.
