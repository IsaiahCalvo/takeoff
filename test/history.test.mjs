import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadHistory() {
  const source = await readFile(new URL('../src/app/history.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'history.js' });
  return sandbox.window.TakeoffHistory;
}

function baseState() {
  return {
    measurements: [{
      id: 1,
      page: 1,
      points: [{ x: 0, y: 0 }],
      shape: {
        active: 'line',
        previousFreehand: {
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        },
      },
    }],
    pageScales: { 1: 2 },
    pxPerInch: 2,
    selectedId: 1,
    copiedMeasurement: {
      id: 1,
      points: [{ x: 0, y: 0 }],
      shape: {
        active: 'freehand',
        previousLine: {
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        },
      },
    },
    rotateModeId: 1,
    undoStack: [],
    redoStack: [{ label: 'stale' }],
    historyLimit: 2,
    inProgress: { points: [] },
    freehandDraft: { rawPoints: [] },
    dragVertex: { measurementId: 1 },
    dragMeasurement: { measurementId: 1 },
    dragLabel: { measurementId: 1 },
    rotationDrag: { measurementId: 1 },
    rotationInputVisible: true,
    pendingPaste: { cursorImg: { x: 1, y: 1 } },
    contextTarget: { kind: 'path-hit' },
  };
}

test('createHistorySnapshot clones editable state', async () => {
  const history = await loadHistory();
  const state = baseState();
  const snapshot = history.createHistorySnapshot(state);

  state.measurements[0].points[0].x = 99;
  state.measurements[0].shape.previousFreehand.points[0].x = 77;
  state.pageScales[1] = 10;
  state.copiedMeasurement.points[0].x = 42;
  state.copiedMeasurement.shape.previousLine.points[0].x = 66;

  assert.equal(snapshot.measurements[0].points[0].x, 0);
  assert.equal(snapshot.measurements[0].shape.previousFreehand.points[0].x, 0);
  assert.equal(snapshot.pageScales[1], 2);
  assert.equal(snapshot.copiedMeasurement.points[0].x, 0);
  assert.equal(snapshot.copiedMeasurement.shape.previousLine.points[0].x, 0);
});

test('recordHistory stores changed snapshots and clears redo stack', async () => {
  const history = await loadHistory();
  const state = baseState();
  const before = history.createHistorySnapshot(state);
  state.measurements.push({ id: 2, page: 1, points: [{ x: 1, y: 1 }] });

  assert.equal(history.recordHistory(state, before, 'run add'), true);
  assert.equal(state.undoStack.length, 1);
  assert.equal(state.undoStack[0].label, 'run add');
  assert.equal(state.redoStack.length, 0);
});

test('recordHistory ignores unchanged snapshots and enforces history limit', async () => {
  const history = await loadHistory();
  const state = baseState();

  let before = history.createHistorySnapshot(state);
  assert.equal(history.recordHistory(state, before, 'no-op'), false);

  for (let id = 2; id <= 4; id++) {
    before = history.createHistorySnapshot(state);
    state.measurements.push({ id, page: 1, points: [{ x: id, y: id }] });
    assert.equal(history.recordHistory(state, before, `add ${id}`), true);
  }

  assert.equal(state.undoStack.length, 2);
  assert.equal(state.undoStack[0].label, 'add 3');
  assert.equal(state.undoStack[1].label, 'add 4');
});

test('applyHistorySnapshot restores history-owned state and clears transient interaction state', async () => {
  const history = await loadHistory();
  const state = baseState();
  const snapshot = {
    measurements: [{
      id: 9,
      page: 2,
      points: [{ x: 2, y: 2 }],
      shape: {
        active: 'freehand',
        previousLine: {
          points: [{ x: 1, y: 1 }, { x: 3, y: 3 }],
        },
      },
    }],
    pageScales: { 2: 5 },
    selectedId: 9,
    copiedMeasurement: null,
    rotateModeId: null,
  };

  history.applyHistorySnapshot(state, snapshot, 2);
  snapshot.measurements[0].shape.previousLine.points[0].x = 99;

  assert.equal(state.measurements[0].id, 9);
  assert.equal(state.measurements[0].shape.previousLine.points[0].x, 1);
  assert.equal(state.pxPerInch, 5);
  assert.equal(state.selectedId, 9);
  assert.equal(state.inProgress, null);
  assert.equal(state.freehandDraft, null);
  assert.equal(state.rotationInputVisible, false);
  assert.equal(state.contextTarget, null);
});

test('applyHistorySnapshot derives the live scale from the current page', async () => {
  const history = await loadHistory();
  const state = baseState();
  const snapshot = {
    measurements: [],
    pageScales: { 1: 2 },
    pxPerInch: 2,
  };

  history.applyHistorySnapshot(state, snapshot, 2);

  assert.equal(state.pxPerInch, null);

  history.applyHistorySnapshot(state, snapshot, 1);

  assert.equal(state.pxPerInch, 2);
});

test('clearHistory removes undo and redo entries', async () => {
  const history = await loadHistory();
  const state = baseState();
  state.undoStack.push({ label: 'edit' });

  history.clearHistory(state);

  assert.equal(state.undoStack.length, 0);
  assert.equal(state.redoStack.length, 0);
});
