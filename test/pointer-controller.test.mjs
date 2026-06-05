import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPointerController() {
  const source = await readFile(new URL('../src/app/pointer-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pointer-controller.js' });
  return sandbox.window.TakeoffPointerController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('suppresses point placement for non-primary clicks, double clicks, and zoom cooldown', async () => {
  const pointer = await loadPointerController();

  assert.equal(pointer.shouldSuppressPointPlacement({ button: 1, detail: 1, now: 100, suppressPointUntil: 0 }), true);
  assert.equal(pointer.shouldSuppressPointPlacement({ button: 0, detail: 2, now: 100, suppressPointUntil: 0 }), true);
  assert.equal(pointer.shouldSuppressPointPlacement({ button: 0, detail: 1, now: 100, suppressPointUntil: 120 }), true);
  assert.equal(pointer.shouldSuppressPointPlacement({ button: 0, detail: 1, now: 121, suppressPointUntil: 120 }), false);
});

test('describes panning start and cursor-derived pan updates', async () => {
  const pointer = await loadPointerController();

  assert.equal(pointer.shouldStartPan({ button: 1, mode: 'measure' }), true);
  assert.equal(pointer.shouldStartPan({ button: 0, mode: 'pan' }), true);
  assert.equal(pointer.shouldStartPan({ button: 0, mode: 'measure' }), false);

  const panStart = pointer.createPanStart({ clientX: 250, clientY: 190, panX: 40, panY: -15 });
  assert.deepEqual(plain(panStart), { x: 210, y: 205 });
  assert.deepEqual(plain(pointer.nextPanFromPointer({ clientX: 280, clientY: 220, panStart })), { panX: 70, panY: 15 });
});

test('detects active drags and finishes them when the pointer button is gone', async () => {
  const pointer = await loadPointerController();

  assert.equal(pointer.hasActivePointerDrag({}), false);
  assert.equal(pointer.hasActivePointerDrag({ dragVertex: { measurementId: 1 } }), true);
  assert.equal(pointer.hasActivePointerDrag({ isPanning: true }), true);
  assert.equal(pointer.shouldFinishPointerDragOnMove({ dragLabel: { measurementId: 1 } }, 1), false);
  assert.equal(pointer.shouldFinishPointerDragOnMove({ dragLabel: { measurementId: 1 } }, 0), true);
});

test('identifies UI controls inside the stage so clicks do not place points', async () => {
  const pointer = await loadPointerController();
  const button = { tagName: 'BUTTON', parentElement: null };
  const iconPath = { tagName: 'path', parentElement: button };
  const drawCanvas = { tagName: 'CANVAS', parentElement: null };

  assert.equal(pointer.shouldIgnoreStagePointerTarget?.(button), true);
  assert.equal(pointer.shouldIgnoreStagePointerTarget?.(iconPath), true);
  assert.equal(pointer.shouldIgnoreStagePointerTarget?.(drawCanvas), false);
  assert.equal(pointer.shouldIgnoreStagePointerTarget?.(null), false);
});
