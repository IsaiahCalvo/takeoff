import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadMarqueePointerController() {
  const source = await readFile(new URL('../src/app/marquee-pointer-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'marquee-pointer-controller.js' });
  return sandbox.window.TakeoffMarqueePointerController;
}

function createEvent() {
  let prevented = false;
  return {
    button: 0,
    clientX: 42,
    clientY: 24,
    isPrimary: true,
    pointerId: 7,
    shiftKey: false,
    altKey: false,
    target: null,
    preventDefault: () => { prevented = true; },
    get prevented() { return prevented; },
  };
}

test('pointer marquee ignores transform resize handles so resize can start', async () => {
  const module = await loadMarqueePointerController();
  const state = {
    baseW: 100,
    mode: 'selection',
    rotateModeId: 1,
    rotationHandleHitbox: { x: 0, y: 0, width: 0, height: 0 },
    zoom: 1,
  };
  const calls = [];
  const controller = module.createPointerMarqueeController({
    state,
    screenToImage: (x, y) => ({ x, y }),
    lengthLabelNavigationTarget: () => null,
    isPointInBox: () => false,
    findNearestVertex: () => null,
    findLabelHit: () => null,
    findNearestMeasurement: () => null,
    findTransformResizeHandleHit: () => ({ measurementId: 1, handle: 'se' }),
    clearActiveFitMode: () => calls.push('clearActiveFitMode'),
    endRotateMode: () => calls.push('endRotateMode'),
    marqueeSelection: {
      start: () => calls.push('startMarquee'),
    },
  });
  const event = createEvent();

  assert.equal(controller.pointerDown(event), false);
  assert.deepEqual(calls, []);
  assert.equal(event.prevented, false);
});

test('pointer marquee still starts on empty selection canvas', async () => {
  const module = await loadMarqueePointerController();
  const state = {
    baseW: 100,
    mode: 'selection',
    rotateModeId: 1,
    rotationHandleHitbox: { x: 0, y: 0, width: 0, height: 0 },
    zoom: 1,
    marqueeSelection: null,
  };
  const calls = [];
  const controller = module.createPointerMarqueeController({
    state,
    screenToImage: (x, y) => ({ x, y }),
    lengthLabelNavigationTarget: () => null,
    isPointInBox: () => false,
    findNearestVertex: () => null,
    findLabelHit: () => null,
    findNearestMeasurement: () => null,
    findTransformResizeHandleHit: () => null,
    clearActiveFitMode: () => calls.push('clearActiveFitMode'),
    endRotateMode: () => calls.push('endRotateMode'),
    marqueeSelection: {
      start: ({ point, pointerId }) => calls.push(['startMarquee', point, pointerId]),
    },
  });
  const event = createEvent();

  assert.equal(controller.pointerDown(event), true);
  assert.deepEqual(calls, [
    'clearActiveFitMode',
    'endRotateMode',
    ['startMarquee', { x: 42, y: 24 }, 7],
  ]);
  assert.equal(event.prevented, true);
});
