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
  for (const action of ['convert-to-line', 'convert-to-freehand', 'continue-path', 'merge-paths', 'unmerge-paths', 'toggle-path-visibility', 'toggle-category-visibility']) {
    buttons.set(action, { hidden: false, disabled: false, textContent: '' });
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
    canUnmergePaths: false,
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
    canUnmergePaths: false,
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
  assert.equal(menu.buttons.get('unmerge-paths').hidden, true);
  assert.equal(menu.buttons.get('unmerge-paths').disabled, true);
});

test('applyVisibilityMenuState labels path and category visibility actions for the target measurement', async () => {
  const { controller } = await loadController();
  const menu = createContextMenu();
  const measurement = {
    id: 'cat6-a',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
  };
  const state = { pathCategoryVisibility: {} };
  const stateStore = {
    isMeasurementPathVisible(target) {
      return target.pathHidden !== true;
    },
    pathCategoryVisibilityKeyForMeasurement() {
      return 'category:low-voltage';
    },
    isPathCategoryVisible(stateArg, key) {
      return stateArg === state && key === 'category:low-voltage' && state.pathCategoryVisibility[key] !== false;
    },
  };

  let result = controller.applyVisibilityMenuState({ contextMenu: menu, measurement, state, stateStore });

  assert.deepEqual(plain(result), {
    canTogglePath: true,
    canToggleCategory: true,
    pathVisible: true,
    categoryVisible: true,
    categoryKey: 'category:low-voltage',
  });
  assert.equal(menu.buttons.get('toggle-path-visibility').hidden, false);
  assert.equal(menu.buttons.get('toggle-path-visibility').disabled, false);
  assert.equal(menu.buttons.get('toggle-path-visibility').textContent, 'Hide path');
  assert.equal(menu.buttons.get('toggle-category-visibility').hidden, false);
  assert.equal(menu.buttons.get('toggle-category-visibility').disabled, false);
  assert.equal(menu.buttons.get('toggle-category-visibility').textContent, 'Hide category');

  measurement.pathHidden = true;
  state.pathCategoryVisibility['category:low-voltage'] = false;
  result = controller.applyVisibilityMenuState({ contextMenu: menu, measurement, state, stateStore });

  assert.equal(result.pathVisible, false);
  assert.equal(result.categoryVisible, false);
  assert.equal(menu.buttons.get('toggle-path-visibility').textContent, 'Show path');
  assert.equal(menu.buttons.get('toggle-category-visibility').textContent, 'Show category');
});

test('applyVisibilityMenuState hides visibility actions when no measurement is targeted', async () => {
  const { controller } = await loadController();
  const menu = createContextMenu();

  const result = controller.applyVisibilityMenuState({ contextMenu: menu, measurement: null });

  assert.deepEqual(plain(result), {
    canTogglePath: false,
    canToggleCategory: false,
    pathVisible: true,
    categoryVisible: true,
    categoryKey: null,
  });
  assert.equal(menu.buttons.get('toggle-path-visibility').hidden, true);
  assert.equal(menu.buttons.get('toggle-path-visibility').disabled, true);
  assert.equal(menu.buttons.get('toggle-category-visibility').hidden, true);
  assert.equal(menu.buttons.get('toggle-category-visibility').disabled, true);
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
    canUnmergePaths: false,
  });

  assert.equal(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: { continuationEndpointRole: () => null },
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  }).canContinuePath, false);
});

test('conversionMenuState hides Continue Path for mixed paths', async () => {
  const { controller, measurements } = await loadController();
  const measurement = {
    shape: { active: 'path' },
    drawType: 'path',
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    mergeMemory: {
      sources: [{
        kind: 'line',
        current: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      }, {
        kind: 'freehand',
        current: {
          points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
          segments: [{ from: { x: 10, y: 0 }, c1: { x: 13, y: 0 }, c2: { x: 17, y: 0 }, to: { x: 20, y: 0 } }],
        },
      }],
    },
  };
  const menu = createContextMenu();
  const state = controller.applyConversionMenuState({
    contextMenu: menu,
    measurement,
    measurementModel: measurements,
    measurementCommands: { continuationEndpointRole: () => 'end' },
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  });

  assert.equal(state.canContinuePath, false);
  assert.equal(menu.buttons.get('continue-path').hidden, true);
  assert.equal(menu.buttons.get('continue-path').disabled, true);
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
    canUnmergePaths: false,
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

test('conversionMenuState exposes Unmerge Paths only for measurements with merge memory', async () => {
  const { controller, measurements } = await loadController();
  const merged = {
    id: 40,
    shape: { active: 'path' },
    drawType: 'path',
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
  };

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement: merged,
    measurementModel: measurements,
    measurementCommands: {
      unmergePathState(target) {
        return { canUnmergePaths: target === merged, canMaintainEdits: true, maintainEditsReason: '' };
      },
    },
  })), {
    canConvertToLine: false,
    canConvertToFreehand: false,
    canContinuePath: false,
    canMergePaths: false,
    canUnmergePaths: true,
  });

  assert.equal(controller.conversionMenuState({
    measurement: merged,
    measurementModel: measurements,
    measurementCommands: {
      unmergePathState: () => ({ canUnmergePaths: false }),
    },
  }).canUnmergePaths, false);
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
