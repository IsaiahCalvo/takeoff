import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSelectionController() {
  const source = await readFile(new URL('../src/app/selection-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'selection-controller.js' });
  return sandbox.window.TakeoffSelectionController;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('modifier path clicks toggle or remove measurements from multi-selection', async () => {
  const selectionModule = await loadSelectionController();
  const state = { selectedId: 1, selectedIds: [1] };
  const selection = selectionModule.createSelectionController({ state });

  assert.equal(selection.selectFromClick(2, { shiftKey: true }), 'add');
  assert.deepEqual(plain(state.selectedIds), [1, 2]);
  assert.equal(state.selectedId, 1);

  assert.equal(selection.selectFromClick(2, { shiftKey: true }), 'remove');
  assert.deepEqual(plain(state.selectedIds), [1]);
  assert.equal(state.selectedId, 1);

  assert.equal(selection.selectFromClick(1, { altKey: true }), 'remove');
  assert.deepEqual(plain(state.selectedIds), []);
  assert.equal(state.selectedId, null);
});

test('plain click on an already-selected measurement preserves the selected group', async () => {
  const selectionModule = await loadSelectionController();
  const state = { selectedId: 1, selectedIds: [1, 2] };
  const selection = selectionModule.createSelectionController({ state });

  assert.equal(selection.selectFromClick(2, {}), 'preserve');
  assert.deepEqual(plain(state.selectedIds), [1, 2]);
  assert.equal(state.selectedId, 1);
});
