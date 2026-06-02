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

async function loadHistoryWithCommands() {
  const [geometry, measurements, commands, history] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurement-commands.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/history.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(commands, sandbox, { filename: 'measurement-commands.js' });
  vm.runInContext(history, sandbox, { filename: 'history.js' });
  return {
    commands: sandbox.window.TakeoffMeasurementCommands,
    history: sandbox.window.TakeoffHistory,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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

test('conversion history snapshots restore selected measurement through undo and redo', async () => {
  const { commands, history } = await loadHistoryWithCommands();
  const state = {
    measurements: [{
      id: 5,
      page: 1,
      drawType: 'freehand',
      points: [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 0 }],
      segments: [{
        type: 'cubic',
        from: { x: 0, y: 0 },
        c1: { x: 4, y: 18 },
        c2: { x: 16, y: 18 },
        to: { x: 20, y: 0 },
      }],
      shape: { active: 'freehand' },
      lengthPx: 30,
      lengthInches: 15,
    }],
    pageScales: { 1: 2 },
    pxPerInch: 2,
    selectedId: 5,
    copiedMeasurement: null,
    rotateModeId: null,
    undoStack: [],
    redoStack: [],
    historyLimit: 20,
  };

  const before = history.createHistorySnapshot(state);
  assert.equal(commands.convertFreehandMeasurementToLine(state.measurements[0], { pxPerInch: 2 }), true);
  assert.equal(history.recordHistory(state, before, 'run conversion'), true);

  const entry = state.undoStack.pop();
  state.redoStack.push(entry);
  history.applyHistorySnapshot(state, entry.before, 1);
  assert.equal(state.selectedId, 5);
  assert.equal(state.measurements[0].shape.active, 'freehand');
  assert.equal(state.measurements[0].segments.length, 1);

  state.undoStack.push(state.redoStack.pop());
  history.applyHistorySnapshot(state, entry.after, 1);
  assert.equal(state.selectedId, 5);
  assert.equal(state.measurements[0].shape.active, 'line');
  assert.equal(state.measurements[0].segments, null);
  assert.deepEqual(plain(state.measurements[0].shape.previousFreehand.points), [
    { x: 0, y: 0 },
    { x: 10, y: 8 },
    { x: 20, y: 0 },
  ]);
});

test('merge history snapshots restore both paths through undo and redo', async () => {
  const { commands, history } = await loadHistoryWithCommands();
  const state = {
    measurements: [{
      id: 6,
      page: 1,
      drawType: 'line',
      shape: { active: 'line' },
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      snapConnections: [{ endpoint: 'end', targetId: 7, targetEndpoint: 'start' }],
    }, {
      id: 7,
      page: 1,
      drawType: 'line',
      shape: { active: 'line' },
      points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
    }],
    pageScales: { 1: 2 },
    pxPerInch: 2,
    selectedId: 6,
    copiedMeasurement: null,
    rotateModeId: null,
    undoStack: [],
    redoStack: [],
    historyLimit: 20,
  };

  const before = history.createHistorySnapshot(state);
  const result = commands.mergeSnappedEndpointPaths(state.measurements, {
    sourceId: 6,
    sourceEndpoint: 'end',
    targetId: 7,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 });
  state.measurements = result.measurements;
  state.selectedId = result.measurement.id;
  assert.equal(history.recordHistory(state, before, 'path merge'), true);

  const entry = state.undoStack.pop();
  state.redoStack.push(entry);
  history.applyHistorySnapshot(state, entry.before, 1);
  assert.deepEqual(plain(state.measurements.map(measurement => measurement.id)), [6, 7]);

  state.undoStack.push(state.redoStack.pop());
  history.applyHistorySnapshot(state, entry.after, 1);
  assert.deepEqual(plain(state.measurements.map(measurement => measurement.id)), [6]);
  assert.deepEqual(plain(state.measurements[0].points), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
});

test('clearHistory removes undo and redo entries', async () => {
  const history = await loadHistory();
  const state = baseState();
  state.undoStack.push({ label: 'edit' });

  history.clearHistory(state);

  assert.equal(state.undoStack.length, 0);
  assert.equal(state.redoStack.length, 0);
});
