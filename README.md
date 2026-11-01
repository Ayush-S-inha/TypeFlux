# TypeFlux

TypeFlux is a browser-based camera project that reacts to hand gestures and facial movements. It uses MediaPipe to track the user's hands and face, then draws visual effects over the live camera feed.

The project currently includes Spider-Man, Iron Man, Superman, Green Lantern and Sudarshan Chakra.

## Getting started

Install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Vite and allow camera access.

To create and preview a production build:

```bash
npm run build
npm run preview
```

Do not open `index.html` directly in the browser. Run the project through Vite.

## Using TypeFlux

Start the camera to activate hand and face tracking. The available effects respond to these gestures:

| Character | Gesture |
| --- | --- |
| Spider-Man | Extend your index and pinky fingers |
| Iron Man | Show an open palm |
| Superman | Squeeze both eyes briefly |
| Green Lantern | Turn the back of your hand toward the camera |
| Sudarshan Chakra | Point with your index finger while folding the other fingers |

The Spider-Man web shoots from the hand. Iron Man fires an energy blast from the palm. Superman emits two heat-vision beams from the eyes.

The Green Lantern ring appears on the middle finger. Sudarshan Chakra stays above the index fingertip and rotates as you move your hand.

Use the controls at the bottom of the screen to pause the camera, restart tracking or switch the effects off.

## Working with the source

The project files are arranged as follows:

```text
TypeFlux/
  index.html
  package.json
  package-lock.json
  src/
    main.js
    style.css
```

`index.html` contains the camera view and interface. Most of the application logic lives in `src/main.js`, including tracking, gesture recognition and effect rendering. Visual styling belongs in `src/style.css`.

Keep changes close to the feature being worked on. A new gesture should not break an existing one, and changes to camera coordinates must account for the mirrored video.

## Camera and tracking

TypeFlux uses MediaPipe Hand Landmarker and Face Landmarker. Their models and browser assets load from external servers, so an internet connection is required when the assets are not cached.

The camera feed stays in the browser. No application backend is required.

Camera permission, lighting, hand position and face visibility affect tracking. Keep your hand inside the camera frame and avoid covering your fingers. For Superman, keep your face visible and both eyes unobstructed.

## Development notes

Test each effect separately after changing its code. Check that gestures trigger when expected, stop when released and can trigger again after returning to a neutral pose.

A successful build does not confirm that a gesture works correctly on a webcam. Check the actual browser behavior before treating a change as finished.
