import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadController() {
  const [measurements, controller] = await Promise.all([
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/context-menu-controller.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(controller, sandbox, { filename: 'context-menu-controller.js' });
  return {
    measurements: sandbox.window.TakeoffMeasurements,
    controller: sandbox.window.TakeoffContextMenuController,
  };
}

function createContextMenu() {
  const buttons = new Map();
  for (const action of ['convert-to-line', 'convert-to-freehand', 'continue-path', 'merge-paths']) {
    buttons.set(action, { hidden: false, disabled: false });
  }
  return {
    buttons,
    querySelector(selector) {
      const action = selector.match(/\[data-action="([^"]+)"\]/)?.[1];
      return buttons.get(action) || null;
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('conversionMenuState exposes only Convert to Line for Freehand measurements', async () => {
  const { controller, measurements } = await loadController();

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement: { shape: { active: 'freehand' }, segments: [{ from: { x: 0, y: 0 }, c1: { x: 1, y: 0 }, c2: { x: 2, y: 0 }, to: { x: 3, y: 0 } }] },
    measurementModel: measurements,
  })), {
    canConvertToLine: true,
    canConvertToFreehand: false,
    canContinuePath: false,
    canMergePaths: false,
  });
});

test('conversionMenuState exposes only Convert to Freehand for active Line measurements', async () => {
  const { controller, measurements } = await loadController();

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement: { shape: { active: 'line' }, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], segments: [{ stale: true }] },
    measurementModel: measurements,
  })), {
    canConvertToLine: false,
    canConvertToFreehand: true,
    canContinuePath: false,
    canMergePaths: false,
  });
});

test('applyConversionMenuState hides conversion actions when no measurement is targeted', async () => {
  const { controller, measurements } = await loadController();
  const menu = createContextMenu();

  controller.applyConversionMenuState({ contextMenu: menu, measurement: null, measurementModel: measurements });

  assert.equal(menu.buttons.get('convert-to-line').hidden, true);
  assert.equal(menu.buttons.get('convert-to-line').disabled, true);
  assert.equal(menu.buttons.get('convert-to-freehand').hidden, true);
  assert.equal(menu.buttons.get('convert-to-freehand').disabled, true);
  assert.equal(menu.buttons.get('continue-path').hidden, true);
  assert.equal(menu.buttons.get('continue-path').disabled, true);
  assert.equal(menu.buttons.get('merge-paths').hidden, true);
  assert.equal(menu.buttons.get('merge-paths').disabled, true);
});

test('conversionMenuState exposes Continue Path only for terminal anchors', async () => {
  const { controller, measurements } = await loadController();
  const measurement = {
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
  };

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: {
      continuationEndpointRole(targetMeasurement, target) {
        return targetMeasurement === measurement && target.vertexIndex === 2 ? 'end' : null;
      },
    },
    target: { kind: 'anchor-hit', vertexIndex: 2 },
  })), {
    canConvertToLine: false,
    canConvertToFreehand: true,
    canContinuePath: true,
    canMergePaths: false,
  });

  assert.equal(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: { continuationEndpointRole: () => null },
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  }).canContinuePath, false);
});

test('conversionMenuState exposes Merge Paths only for eligible snapped endpoints', async () => {
  const { controller, measurements } = await loadController();
  const measurement = {
    id: 20,
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  };
  const target = { kind: 'anchor-hit', vertexIndex: 1 };

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: {
      continuationEndpointRole: () => 'end',
      mergeConnectionForTarget({ measurement: targetMeasurement, target: targetHit }) {
        return targetMeasurement === measurement && targetHit === target
          ? { sourceId: 20, sourceEndpoint: 'end', targetId: 21, targetEndpoint: 'start' }
          : null;
      },
    },
    target,
    measurements: [measurement],
  })), {
    canConvertToLine: false,
    canConvertToFreehand: true,
    canContinuePath: true,
    canMergePaths: true,
  });

  assert.equal(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: {
      continuationEndpointRole: () => 'end',
      mergeConnectionForTarget: () => null,
    },
    target,
    measurements: [measurement],
  }).canMergePaths, false);
});

test('convertSelectedMeasurement records history, keeps selection, and refreshes UI hooks', async () => {
  const { controller } = await loadController();
  const calls = [];
  const measurement = { id: 7, page: 2, shape: { active: 'freehand' } };
  const state = { selectedId: 7, rotateModeId: 7, measurements: [measurement] };

  assert.equal(controller.convertSelectedMeasurement({
    nextShape: 'line',
    state,
    measurementCommands: {
      convertFreehandMeasurementToLine(target, options) {
        calls.push(['convert', target.id, options.pxPerInch]);
        target.shape.active = 'line';
        return true;
      },
    },
    scaleForPage: page => page * 10,
    createHistorySnapshot: () => ({ before: true }),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.equal(state.selectedId, 7);
  assert.deepEqual(calls, [
    ['convert', 7, 20],
    ['end-rotate'],
    ['render-list'],
    ['redraw'],
    ['history', true, 'run conversion'],
    ['status', 'Converted to Line'],
  ]);
});

test('convertSelectedMeasurement refreshes UI hooks and selection for Line to Freehand', async () => {
  const { controller } = await loadController();
  const calls = [];
  const measurement = { id: 8, page: 3, shape: { active: 'line' } };
  const state = { selectedId: 8, rotateModeId: null, measurements: [measurement] };

  assert.equal(controller.convertSelectedMeasurement({
    nextShape: 'freehand',
    state,
    measurementCommands: {
      convertLineMeasurementToFreehand(target, options) {
        calls.push(['convert', target.id, options.pxPerInch]);
        target.shape.active = 'freehand';
        return true;
      },
    },
    scaleForPage: page => page * 5,
    createHistorySnapshot: () => ({ before: true }),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.equal(state.selectedId, 8);
  assert.deepEqual(calls, [
    ['convert', 8, 15],
    ['render-list'],
    ['redraw'],
    ['history', true, 'run conversion'],
    ['status', 'Converted to Freehand'],
  ]);
});

test('mergeSnappedPaths records history, replaces measurements, and refreshes UI hooks', async () => {
  const { controller } = await loadController();
  const calls = [];
  const measurement = { id: 30, page: 2, shape: { active: 'line' } };
  const target = { kind: 'anchor-hit', vertexIndex: 1 };
  const state = { selectedId: 30, contextTarget: target, measurements: [measurement, { id: 31 }] };

  assert.equal(controller.mergeSnappedPaths({
    state,
    target,
    measurementCommands: {
      mergeConnectionForTarget({ measurement: targetMeasurement, target: targetHit }) {
        calls.push(['connection', targetMeasurement.id, targetHit.vertexIndex]);
        return { sourceId: 30, sourceEndpoint: 'end', targetId: 31, targetEndpoint: 'start' };
      },
      mergeSnappedEndpointPaths(measurements, connection, options) {
        calls.push(['merge', measurements.length, connection.targetId, options.pxPerInch]);
        return {
          merged: true,
          measurement: { id: 30 },
          measurements: [{ id: 30 }],
        };
      },
    },
    scaleForPage: page => page * 10,
    createHistorySnapshot: () => ({ before: true }),
    setMeasurements: (measurements, selectedId) => calls.push(['set', measurements.length, selectedId]),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.deepEqual(calls, [
    ['connection', 30, 1],
    ['merge', 2, 31, 20],
    ['set', 1, 30],
    ['end-rotate'],
    ['render-list'],
    ['redraw'],
    ['history', true, 'path merge'],
    ['status', 'Merge Paths'],
  ]);
});
