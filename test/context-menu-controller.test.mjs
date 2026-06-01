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
  for (const action of ['convert-to-line', 'convert-to-freehand', 'continue-path']) {
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
  });

  assert.equal(controller.conversionMenuState({
    measurement,
    measurementModel: measurements,
    measurementCommands: { continuationEndpointRole: () => null },
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  }).canContinuePath, false);
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
