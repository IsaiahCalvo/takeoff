import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadViewer() {
  const source = await readFile(new URL('../public/app/viewer.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'viewer.js' });
  return sandbox.window.TakeoffViewer;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('computeFitViewTransform centers a page fit with padding', async () => {
  const viewer = await loadViewer();
  const transform = viewer.computeFitViewTransform({
    stageWidth: 1000,
    stageHeight: 800,
    baseWidth: 500,
    baseHeight: 400,
    fitMode: 'page',
  });

  assert.deepEqual(plain(transform), {
    zoom: 1.92,
    panX: 20,
    panY: 16,
  });
});

test('computeFitViewTransform supports width and height fits', async () => {
  const viewer = await loadViewer();

  assert.deepEqual(plain(viewer.computeFitViewTransform({
    stageWidth: 1000,
    stageHeight: 800,
    baseWidth: 500,
    baseHeight: 400,
    fitMode: 'width',
  })), {
    zoom: 1.936,
    panX: 16,
    panY: 12.800000000000011,
  });

  assert.deepEqual(plain(viewer.computeFitViewTransform({
    stageWidth: 1000,
    stageHeight: 800,
    baseWidth: 500,
    baseHeight: 400,
    fitMode: 'height',
  })), {
    zoom: 1.92,
    panX: 20,
    panY: 16,
  });
});

test('zoomAtPoint keeps the image point under the cursor', async () => {
  const viewer = await loadViewer();
  const next = viewer.zoomAtPoint({
    zoom: 1,
    panX: 0,
    panY: 0,
    stageRect: { left: 10, top: 20 },
    point: { clientX: 110, clientY: 220 },
    factor: 2,
    baseWidth: 1000,
    baseHeight: 1000,
  });

  assert.deepEqual(plain(next), {
    zoom: 2,
    panX: -100,
    panY: -200,
    cursorImg: { x: 100, y: 200 },
  });
});

test('zoomAtPoint clamps zoom and cursor image point', async () => {
  const viewer = await loadViewer();
  const next = viewer.zoomAtPoint({
    zoom: 19,
    panX: 0,
    panY: 0,
    stageRect: { left: 0, top: 0 },
    point: { clientX: 200, clientY: -50 },
    factor: 2,
    baseWidth: 100,
    baseHeight: 100,
  });

  assert.equal(next.zoom, 20);
  assert.deepEqual(plain(next.cursorImg), { x: 10.526315789473685, y: 0 });
});
