import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [html, css, main] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('src/style.css', root), 'utf8'),
  readFile(new URL('src/main.js', root), 'utf8'),
]);

const ruleBlocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

const rulesFor = (selector) => ruleBlocks.find(([, selectors]) =>
  selectors.split(',').some((entry) => entry.trim() === selector),
)?.[2] || '';

const zIndexFor = (selector) => {
  const entry = ruleBlocks.find(([, selectors, declarations]) =>
    selectors.split(',').some((entry) => entry.trim() === selector)
      && /z-index:\s*\d+/.test(declarations),
  );
  return Number(entry?.[2].match(/z-index:\s*(\d+)/)?.[1]);
};

test('every main.js element selector exists in index.html', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const selectors = [...main.matchAll(/document\.querySelector\(['"]#([^'"]+)['"]\)/g)];

  assert.ok(selectors.length > 0);
  for (const [, id] of selectors) assert.ok(ids.has(id), `Missing #${id}`);
});

test('the guide lists all six active effects and their triggers', () => {
  const guide = html.match(/<aside class="gesture-guide"[\s\S]*?<\/aside>/)?.[0] || '';

  for (const label of [
    'SPIDER-MAN', 'INDEX + PINKY',
    'IRON MAN', 'OPEN PALM',
    'FLASH', 'CLOSED FIST',
    'GREEN LANTERN', 'BACK OF HAND',
    'SUDARSHAN CHAKRA', 'INDEX ONLY',
    'SUPERMAN', 'TWO-EYE SQUEEZE',
  ]) assert.ok(guide.includes(label), `Missing guide label: ${label}`);
});

test('camera, effect canvas, status and controls expose accessible labels', () => {
  assert.match(html, /<video[^>]+aria-label="Live camera preview"/);
  assert.match(html, /<canvas[^>]+aria-hidden="true"/);
  assert.match(html, /class="camera-status" aria-live="polite"/);
  assert.match(html, /id="message" role="status"/);
  assert.match(html, /id="effects-toggle"[^>]+aria-label="Toggle visual effects"/);
  assert.match(html, /<footer class="bottom-bar" aria-label="Camera controls"/);
});

test('effect canvas stays above the shade and controls stay above the canvas', () => {
  const canvasLayer = zIndexFor('#effects-canvas');
  const shadeLayer = zIndexFor('.screen-shade');

  assert.ok(Number.isFinite(canvasLayer));
  assert.ok(canvasLayer > shadeLayer);
  for (const selector of ['.topbar', '.bottom-bar', '.gesture-readout', '.gesture-guide']) {
    assert.ok(zIndexFor(selector) > canvasLayer, `${selector} must sit above the canvas`);
  }
});

test('mobile layout handles safe areas and narrow viewports', () => {
  assert.match(css, /height:\s*100svh/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-(?:top|right|bottom|left)\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*380px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rulesFor('.actions button'), /min-height:\s*36px/);
  assert.match(rulesFor('.primary-button'), /min-height:\s*44px/);
});

test('short landscape screens have a separate layout', () => {
  assert.match(css, /@media \(max-height:\s*560px\) and \(orientation:\s*landscape\)/);
  assert.match(css, /\.welcome\s*\{[^}]*max-height:\s*calc\(100% - 112px\)/s);
  assert.match(css, /\.power-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
});

test('hidden interface regions remain hidden until main.js reveals them', () => {
  assert.match(css, /\.gesture-readout\[hidden\],\s*\.gesture-guide\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(html, /id="welcome"/);
  assert.match(html, /id="gesture-readout"[^>]+hidden/);
  assert.match(html, /id="gesture-guide"[^>]+hidden/);
});

test('reduced-motion preferences limit interface transitions and animations', () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition-duration:\s*\.01ms\s*!important/);
  assert.match(css, /animation-duration:\s*\.01ms\s*!important/);
});
