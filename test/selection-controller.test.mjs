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

test('context menu selection preserves selected group and promotes the clicked measurement', async () => {
  const selectionModule = await loadSelectionController();
  const state = { selectedId: 1, selectedIds: [1, 2] };
  const selection = selectionModule.createSelectionController({ state });

  assert.equal(selection.selectForContextMenu(2), 'preserve');
  assert.deepEqual(plain(state.selectedIds), [1, 2]);
  assert.equal(state.selectedId, 2);

  assert.equal(selection.selectForContextMenu(3), 'single');
  assert.deepEqual(plain(state.selectedIds), [3]);
  assert.equal(state.selectedId, 3);
});

test('deletion skips measurements that cannot be deleted', async () => {
  const selectionModule = await loadSelectionController();
  const state = {
    selectedId: 1,
    selectedIds: [1, 2],
    measurements: [{ id: 1, locked: true }, { id: 2 }],
  };
  const updates = [];
  const selection = selectionModule.createSelectionController({
    state,
    setMeasurements(measurements, selectionState) {
      updates.push({ measurements, selectionState });
      state.measurements = measurements;
      state.selectedId = selectionState.selectedId;
      state.selectedIds = selectionState.selectedIds;
    },
    canDeleteMeasurement: measurement => measurement.locked !== true,
  });

  assert.equal(selection.deleteSelectedMeasurements(), true);
  assert.deepEqual(plain(state.measurements), [{ id: 1, locked: true }]);
  assert.deepEqual(plain(state.selectedIds), [1]);
  assert.equal(state.selectedId, 1);
  assert.equal(updates.length, 1);
});

test('single deletion refuses measurements that cannot be deleted', async () => {
  const selectionModule = await loadSelectionController();
  const state = {
    selectedId: 1,
    selectedIds: [1],
    measurements: [{ id: 1, locked: true }],
  };
  const selection = selectionModule.createSelectionController({
    state,
    setMeasurements() {
      throw new Error('locked measurement should not be removed');
    },
    canDeleteMeasurement: measurement => measurement.locked !== true,
  });

  assert.equal(selection.deleteMeasurement(1, () => {
    throw new Error('deleteMeasurementResult should not run for locked measurement');
  }), false);
  assert.deepEqual(plain(state.measurements), [{ id: 1, locked: true }]);
  assert.deepEqual(plain(state.selectedIds), [1]);
  assert.equal(state.selectedId, 1);
});
