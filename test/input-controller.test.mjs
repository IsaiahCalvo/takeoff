import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadInputController() {
  const source = await readFile(new URL('../public/app/input-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'input-controller.js' });
  return sandbox.window.TakeoffInputController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('isTextEntryTarget ignores editable form fields but allows read-only inputs', async () => {
  const input = await loadInputController();

  assert.equal(input.isTextEntryTarget({ tagName: 'INPUT', readOnly: false, disabled: false }), true);
  assert.equal(input.isTextEntryTarget({ tagName: 'INPUT', readOnly: true, disabled: false }), false);
  assert.equal(input.isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(input.isTextEntryTarget({ tagName: 'SELECT' }), true);
  assert.equal(input.isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('describeKeyDown maps command shortcuts before single-key modes', async () => {
  const input = await loadInputController();
  const state = { mode: 'measure', inProgressPointCount: 2, selectedId: 9, spaceHeld: false };

  assert.deepEqual(plain(input.describeKeyDown({ key: 'z', metaKey: true, shiftKey: false }, state)), { action: 'undo', preventDefault: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'Z', ctrlKey: true, shiftKey: true }, state)), { action: 'redo', preventDefault: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'y', ctrlKey: true }, state)), { action: 'redo', preventDefault: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'c', metaKey: true }, state)), { action: 'copy', preventDefault: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'x', ctrlKey: true }, state)), { action: 'cut', preventDefault: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'v', metaKey: true }, state)), { action: 'paste', preventDefault: true });
});

test('describeKeyDown maps modal keys from current input state', async () => {
  const input = await loadInputController();

  assert.deepEqual(plain(input.describeKeyDown({ key: ' ' }, { mode: 'measure', spaceHeld: false })), {
    action: 'space-pan-start',
    preventDefault: true,
    previousMode: 'measure',
  });
  assert.deepEqual(plain(input.describeKeyDown({ key: ' ' }, { mode: 'pan', spaceHeld: true })), {
    action: 'space-pan-repeat',
    preventDefault: true,
  });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'Shift' }, { mode: 'selection', selectedId: 2 })), { action: 'shift-down', redraw: true });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'Escape' }, {})), { action: 'escape' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'Enter' }, { mode: 'measure', inProgressPointCount: 2 })), { action: 'finish-measurement' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'Delete' }, { mode: 'selection', selectedId: 2 })), {
    action: 'delete-selection',
    preventDefault: true,
  });
});

test('describeKeyDown maps mode hotkeys and skips text targets', async () => {
  const input = await loadInputController();

  assert.equal(input.describeKeyDown({ key: 'm' }, { target: { tagName: 'INPUT', readOnly: false } }), null);
  assert.deepEqual(plain(input.describeKeyDown({ key: 'v' }, {})), { action: 'set-mode', mode: 'selection' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'C' }, {})), { action: 'set-mode', mode: 'calibrate' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'm' }, {})), { action: 'set-mode', mode: 'measure' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'p' }, {})), { action: 'set-mode', mode: 'pan' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'e' }, {})), { action: 'set-mode', mode: 'erase' });
  assert.deepEqual(plain(input.describeKeyDown({ key: 'f' }, {})), { action: 'fit-view' });
});

test('describeKeyUp maps space and shift release actions', async () => {
  const input = await loadInputController();

  assert.deepEqual(plain(input.describeKeyUp({ key: ' ' }, { mode: 'pan', prevMode: 'measure', isPanning: true })), {
    action: 'space-up',
    restoreMode: 'measure',
    stopPanning: true,
  });
  assert.deepEqual(plain(input.describeKeyUp({ key: 'Shift' }, { mode: 'selection', selectedId: 2 })), {
    action: 'shift-up',
    redraw: true,
  });
  assert.equal(input.describeKeyUp({ key: 'a' }, {}), null);
});
