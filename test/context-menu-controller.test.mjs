import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadController() {
  const [geometry, measurements, controller] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/context-menu-controller.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(controller, sandbox, { filename: 'context-menu-controller.js' });
  return {
    measurements: sandbox.window.TakeoffMeasurements,
    controller: sandbox.window.TakeoffContextMenuController,
  };
}

function createContextMenu() {
  const buttons = new Map();
  for (const action of ['convert-to-line', 'convert-to-freehand', 'continue-path', 'merge-paths', 'unmerge-paths', 'toggle-path-visibility', 'toggle-category-visibility', 'toggle-area']) {
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

function createPositionedContextMenu({ width, height }) {
  return {
    style: {},
    getBoundingClientRect() {
      return { width, height };
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('positionContextMenu clamps the rendered menu inside the viewport', async () => {
  const { controller } = await loadController();
  const menu = createPositionedContextMenu({ width: 160, height: 320 });

  const position = controller.positionContextMenu({
    contextMenu: menu,
    clientX: 490,
    clientY: 390,
    viewportWidth: 500,
    viewportHeight: 400,
  });

  assert.deepEqual(plain(position), { left: 332, top: 72, width: 160, height: 320 });
  assert.equal(menu.style.left, '332px');
  assert.equal(menu.style.top, '72px');
});

test('positionContextMenu keeps oversized menus anchored in the visible viewport', async () => {
  const { controller } = await loadController();
  const menu = createPositionedContextMenu({ width: 700, height: 600 });

  const position = controller.positionContextMenu({
    contextMenu: menu,
    clientX: 490,
    clientY: 390,
    viewportWidth: 500,
    viewportHeight: 400,
  });

  assert.deepEqual(plain(position), { left: 8, top: 8, width: 700, height: 600 });
  assert.equal(menu.style.left, '8px');
  assert.equal(menu.style.top, '8px');
});

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

test('applyAreaMenuState shows Area only for closed snapped measurements', async () => {
  const { controller, measurements } = await loadController();
  const menu = createContextMenu();
  const closed = {
    id: 'area-path',
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 0 },
    ],
    snapConnections: [{ endpoint: 'end', targetId: 'area-path', targetEndpoint: 'start' }],
  };

  let state = controller.applyAreaMenuState({ contextMenu: menu, measurement: closed, measurementModel: measurements });

  assert.deepEqual(plain(state), { canToggleArea: true, areaVisible: false });
  assert.equal(menu.buttons.get('toggle-area').hidden, false);
  assert.equal(menu.buttons.get('toggle-area').disabled, false);
  assert.equal(menu.buttons.get('toggle-area').textContent, 'Area');

  closed.area = { enabled: true };
  state = controller.applyAreaMenuState({ contextMenu: menu, measurement: closed, measurementModel: measurements });
  assert.deepEqual(plain(state), { canToggleArea: true, areaVisible: true });
  assert.equal(menu.buttons.get('toggle-area').textContent, 'Hide Area');

  state = controller.applyAreaMenuState({ contextMenu: menu, measurement: { id: 'open', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, measurementModel: measurements });
  assert.deepEqual(plain(state), { canToggleArea: false, areaVisible: false });
  assert.equal(menu.buttons.get('toggle-area').hidden, true);
  assert.equal(menu.buttons.get('toggle-area').disabled, true);
});

test('toggleSelectedArea records history and refreshes the UI', async () => {
  const { controller, measurements } = await loadController();
  const calls = [];
  const measurement = {
    id: 11,
    name: 'Room outline',
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 0 },
    ],
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  };
  const state = { selectedId: 11, measurements: [measurement] };

  assert.equal(controller.toggleSelectedArea({
    state,
    measurementModel: measurements,
    createHistorySnapshot: () => ({ before: true }),
    renderList: () => calls.push('render-list'),
    redraw: () => calls.push('redraw'),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.deepEqual(plain(measurement.area), { enabled: true });
  assert.deepEqual(calls, [
    'render-list',
    'redraw',
    ['history', true, 'area show'],
    ['status', 'Area shown for Room outline'],
  ]);
});

test('finishLineContinuation preserves a self-closing continuation snap', async () => {
  const { controller } = await loadController();
  const measurement = { id: 'room', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
  const calls = [];
  const state = {
    measurements: [measurement],
    inProgress: {
      continuation: { measurementId: 'room', endpoint: 'end' },
      selfClosedEndpoint: { endpoint: 'end', targetEndpoint: 'start' },
    },
  };

  assert.equal(controller.finishLineContinuation({
    state,
    points: [{ x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 0 }],
    page: 1,
    historyBefore: { before: true },
    measurementCommands: {
      continueLineMeasurement(target, opts) {
        assert.equal(target, measurement);
        assert.equal(opts.endpoint, 'end');
        return true;
      },
      setEndpointSnapConnection(target, endpoint, snap) {
        calls.push(['snap', target.id, endpoint, snap]);
      },
      clearEndpointSnapConnection() {
        calls.push(['clear']);
      },
    },
    scaleForPage: () => 5,
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    renderList: () => calls.push('render-list'),
    redraw: () => calls.push('redraw'),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.equal(state.inProgress, null);
  assert.equal(state.selectedId, 'room');
  assert.deepEqual(plain(calls), [
    ['snap', 'room', 'end', { targetId: 'room', targetEndpoint: 'start' }],
    ['history', true, 'path continuation'],
    ['status', 'Path continued'],
    'render-list',
    'redraw',
  ]);
});

test('finishLineContinuation infers a self-closing snap from closed continuation geometry', async () => {
  const { controller } = await loadController();
  const measurement = {
    id: 'room',
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ],
  };
  const calls = [];
  const state = {
    measurements: [measurement],
    inProgress: {
      continuation: { measurementId: 'room', endpoint: 'end' },
    },
  };

  assert.equal(controller.finishLineContinuation({
    state,
    points: [{ x: 20, y: 20 }, { x: 0, y: 0 }],
    page: 1,
    historyBefore: { before: true },
    measurementCommands: {
      continueLineMeasurement() {
        measurement.points = [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 0 },
        ];
        return true;
      },
      endpointPoint(target, endpoint) {
        return endpoint === 'start' ? target.points[0] : target.points[target.points.length - 1];
      },
      setEndpointSnapConnection(target, endpoint, snap) {
        calls.push(['snap', target.id, endpoint, snap]);
      },
      clearEndpointSnapConnection() {
        calls.push(['clear']);
      },
    },
    scaleForPage: () => 5,
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    renderList: () => calls.push('render-list'),
    redraw: () => calls.push('redraw'),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.deepEqual(plain(calls), [
    ['snap', 'room', 'end', { targetId: 'room', targetEndpoint: 'start' }],
    ['history', true, 'path continuation'],
    ['status', 'Path continued'],
    'render-list',
    'redraw',
  ]);
});

test('finishFreehandContinuation preserves a self-closing continuation snap', async () => {
  const { controller } = await loadController();
  const target = { id: 'curve-room', shape: { active: 'freehand' } };
  const draft = {
    continuation: { measurementId: 'curve-room', endpoint: 'start' },
    selfClosedEndpoint: { endpoint: 'start', targetEndpoint: 'end' },
  };
  const calls = [];
  const state = { measurements: [target] };
  const measurement = {
    segments: [{ from: { x: 0, y: 0 }, c1: { x: 0, y: 5 }, c2: { x: 5, y: 10 }, to: { x: 10, y: 10 } }],
  };

  assert.equal(controller.finishFreehandContinuation({
    state,
    draft,
    measurement,
    page: 1,
    historyBefore: { before: true },
    measurementCommands: {
      continueFreehandMeasurement(targetMeasurement, opts) {
        assert.equal(targetMeasurement, target);
        assert.equal(opts.endpoint, 'start');
        assert.equal(opts.segments, measurement.segments);
        return true;
      },
      setEndpointSnapConnection(targetMeasurement, endpoint, snap) {
        calls.push(['snap', targetMeasurement.id, endpoint, snap]);
      },
      clearEndpointSnapConnection() {
        calls.push(['clear']);
      },
    },
    scaleForPage: () => 5,
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    renderList: () => calls.push('render-list'),
    redraw: () => calls.push('redraw'),
    showStatus: text => calls.push(['status', text]),
  }), true);

  assert.equal(state.selectedId, 'curve-room');
  assert.deepEqual(plain(calls), [
    ['snap', 'curve-room', 'start', { targetId: 'curve-room', targetEndpoint: 'end' }],
    ['history', true, 'path continuation'],
    'render-list',
    'redraw',
    ['status', 'Path continued'],
  ]);
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

test('conversionMenuState keeps Merge Paths hidden while the feature is parked', async () => {
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
    canMergePaths: false,
    canUnmergePaths: false,
  });

  assert.equal(controller.mergePathsFeatureEnabled(), false);
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

test('conversionMenuState keeps selected snapped path pairs hidden while the feature is parked', async () => {
  const { controller, measurements } = await loadController();
  const measurement = {
    id: 20,
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  };
  const target = { kind: 'path-hit', measurementId: 20 };

  assert.deepEqual(plain(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: {
      mergeConnectionForSelectedMeasurements({ selectedIds, measurement: targetMeasurement }) {
        assert.deepEqual(plain(selectedIds), [20, 21]);
        assert.equal(targetMeasurement, measurement);
        return { sourceId: 20, sourceEndpoint: 'end', targetId: 21, targetEndpoint: 'start' };
      },
    },
    target,
    measurements: [measurement, { id: 21 }],
    selectedIds: [20, 21],
  })), {
    canConvertToLine: false,
    canConvertToFreehand: true,
    canContinuePath: false,
    canMergePaths: false,
    canUnmergePaths: false,
  });
});

test('conversionMenuState keeps Unmerge Paths hidden while the feature is parked', async () => {
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
    canUnmergePaths: false,
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

test('mergeSnappedPaths no-ops while the feature is parked', async () => {
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
        calls.push(['merge', measurements.length, connection.targetId, options.pxPerInch, options.mergeName]);
        return {
          merged: true,
          measurement: { id: 30 },
          measurements: [{ id: 30 }],
        };
      },
    },
    scaleForPage: page => page * 10,
    nextMergedPathName: () => {
      calls.push(['name']);
      return 'Merged Path 1';
    },
    createHistorySnapshot: () => ({ before: true }),
    setMeasurements: (measurements, selectedId) => calls.push(['set', measurements.length, selectedId]),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), false);

  assert.deepEqual(calls, []);
});

test('mergeSnappedPaths no-ops for selected snapped pairs while the feature is parked', async () => {
  const { controller } = await loadController();
  const calls = [];
  const measurement = { id: 30, page: 2, shape: { active: 'line' } };
  const target = { kind: 'path-hit', measurementId: 30 };
  const state = { selectedId: 30, selectedIds: [30, 31], contextTarget: target, measurements: [measurement, { id: 31 }] };

  assert.equal(controller.mergeSnappedPaths({
    state,
    target,
    measurementCommands: {
      mergeConnectionForSelectedMeasurements({ selectedIds, measurement: targetMeasurement }) {
        calls.push(['selected-connection', selectedIds.join(','), targetMeasurement.id]);
        return { sourceId: 30, sourceEndpoint: 'end', targetId: 31, targetEndpoint: 'start' };
      },
      mergeSnappedEndpointPaths(measurements, connection, options) {
        calls.push(['merge', measurements.length, connection.targetId, options.pxPerInch, options.mergeName]);
        return {
          merged: true,
          measurement: { id: 30 },
          measurements: [{ id: 30 }],
        };
      },
    },
    scaleForPage: page => page * 10,
    nextMergedPathName: () => {
      calls.push(['name']);
      return 'Merged Path 1';
    },
    createHistorySnapshot: () => ({ before: true }),
    setMeasurements: (measurements, selectedId) => calls.push(['set', measurements.length, selectedId]),
    endRotateMode: () => calls.push(['end-rotate']),
    renderList: () => calls.push(['render-list']),
    redraw: () => calls.push(['redraw']),
    recordHistory: (before, label) => calls.push(['history', before.before, label]),
    showStatus: text => calls.push(['status', text]),
  }), false);

  assert.equal(state.selectedId, 30);
  assert.deepEqual(plain(state.selectedIds), [30, 31]);
  assert.deepEqual(calls, []);
});
