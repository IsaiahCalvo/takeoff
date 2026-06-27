import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadMeasurementWorkflows() {
  const source = await readFile(new URL('../src/app/measurement-workflows.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'measurement-workflows.js' });
  return sandbox.window.TakeoffMeasurementWorkflows;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('deleteMeasurementResult removes one measurement and clears selection only when needed', async () => {
  const workflows = await loadMeasurementWorkflows();
  const measurements = [{ id: 1 }, { id: 2 }, { id: 3 }];

  assert.deepEqual(plain(workflows.deleteMeasurementResult({
    measurements,
    selectedId: 2,
    deletedId: 2,
  })), {
    measurements: [{ id: 1 }, { id: 3 }],
    selectedId: null,
    deleted: true,
  });
  assert.deepEqual(plain(workflows.deleteMeasurementResult({
    measurements,
    selectedId: 1,
    deletedId: 2,
  })), {
    measurements: [{ id: 1 }, { id: 3 }],
    selectedId: 1,
    deleted: true,
  });
});

test('appendMeasurementResult can select the appended measurement without mutating the original list', async () => {
  const workflows = await loadMeasurementWorkflows();
  const measurements = [{ id: 1 }];
  const result = workflows.appendMeasurementResult({
    measurements,
    measurement: { id: 2 },
    selectedId: 1,
    selectAppended: true,
  });

  assert.deepEqual(plain(result), {
    measurements: [{ id: 1 }, { id: 2 }],
    selectedId: 2,
    appended: true,
  });
  assert.deepEqual(measurements, [{ id: 1 }]);
});

test('recomputeMeasurementLength keeps scaled and unscaled length updates consistent', async () => {
  const workflows = await loadMeasurementWorkflows();
  const measurement = { lengthPx: 0, lengthInches: 0 };

  assert.equal(workflows.recomputeMeasurementLength(measurement, {
    pxPerInch: 4,
    measureLengthPx: () => 20,
  }), true);
  assert.equal(measurement.lengthPx, 20);
  assert.equal(measurement.lengthInches, 5);

  workflows.recomputeMeasurementLength(measurement, {
    pxPerInch: null,
    measureLengthPx: () => 10,
  });
  assert.equal(measurement.lengthPx, 10);
  assert.equal(measurement.lengthInches, null);
});

test('measure start draw mode flips only when Alt or Option starts the run', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'freehand',
    altKey: true,
  }), 'line');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'line',
    altKey: true,
  }), 'freehand');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: true,
  }), 'line');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'freehand',
    shiftKey: true,
    altKey: false,
  }), 'freehand');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'freehand',
    shiftKey: false,
    altKey: false,
  }), 'freehand');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: false,
    altKey: false,
  }), 'line');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'circle-3p',
    altKey: true,
  }), 'circle-3p');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'arc-center',
    altKey: true,
  }), 'arc-center');
});

test('active measure draw mode stays locked after modifier changes mid-run', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    altKey: true,
  }), 'freehand');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'freehand',
    altKey: true,
  }), 'line');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'freehand',
    altKey: false,
    inProgress: { type: 'measure', points: [{ x: 0, y: 0 }] },
  }), 'line');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    altKey: false,
    freehandDraft: { rawPoints: [{ x: 0, y: 0 }] },
  }), 'freehand');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'freehand',
    altKey: true,
    inProgress: { type: 'measure', points: [{ x: 0, y: 0 }] },
  }), 'line');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    altKey: true,
    freehandDraft: { rawPoints: [{ x: 0, y: 0 }] },
  }), 'freehand');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    altKey: true,
    circleArcDraft: { mode: 'arc-3p', points: [{ x: 0, y: 0 }] },
  }), 'arc-3p');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: true,
  }), 'line');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'freehand',
    shiftKey: false,
    altKey: false,
  }), 'freehand');
});

test('circle and arc draw modes normalize without falling back to line', async () => {
  const workflows = await loadMeasurementWorkflows();

  for (const mode of ['circle-radius', 'circle-diameter', 'circle-2p', 'circle-3p', 'arc-3p', 'arc-center']) {
    assert.equal(workflows.resolveMeasureStartDrawMode({ rememberedDrawMode: mode }), mode);
  }
  assert.equal(workflows.resolveMeasureStartDrawMode({ rememberedDrawMode: 'bad-mode' }), 'line');
});

test('circle and arc tool modes remember only variants from their own tool group', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.isCircleDrawMode('circle-radius'), true);
  assert.equal(workflows.isCircleDrawMode('arc-3p'), false);
  assert.equal(workflows.isArcDrawMode('arc-center'), true);
  assert.equal(workflows.isArcDrawMode('circle-diameter'), false);
  assert.equal(workflows.normalizeCircleDrawMode('circle-3p'), 'circle-3p');
  assert.equal(workflows.normalizeCircleDrawMode('arc-center'), 'circle-radius');
  assert.equal(workflows.normalizeArcDrawMode('arc-center'), 'arc-center');
  assert.equal(workflows.normalizeArcDrawMode('circle-radius'), 'arc-3p');
});

test('freehand draft clicks append points without completing the draft', async () => {
  const workflows = await loadMeasurementWorkflows();
  const draft = {
    page: 1,
    rawPoints: [{ x: 10, y: 20 }],
    previewSegments: [],
  };

  const result = workflows.applyFreehandDraftClick({
    draft,
    point: { x: 25, y: 35 },
    distancePx: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  });

  assert.equal(result.draft, draft);
  assert.equal(result.finished, false);
  assert.equal(result.appended, true);
  assert.deepEqual(plain(draft.rawPoints), [{ x: 10, y: 20 }, { x: 25, y: 35 }]);
  assert.deepEqual(plain(draft.anchorPoints), [{ x: 25, y: 35 }]);
});

test('active measure point count includes freehand draft points for Enter completion', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.activeMeasurePointCount({
    freehandDraft: { rawPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] },
  }), 3);
  assert.equal(workflows.activeMeasurePointCount({
    inProgress: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
  }), 2);
  assert.equal(workflows.activeMeasurePointCount({
    circleArcDraft: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }] },
  }), 3);
  assert.equal(workflows.activeMeasurePointCount({}), 0);
});

test('switching to calibration cancels an active measure draft', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.shouldCancelDraftOnModeChange({
    nextMode: 'calibrate',
    inProgress: { type: 'measure', points: [{ x: 0, y: 0 }] },
  }), true);
  assert.equal(workflows.shouldCancelDraftOnModeChange({
    nextMode: 'calibrate',
    freehandDraft: { rawPoints: [{ x: 0, y: 0 }] },
  }), true);
  assert.equal(workflows.shouldCancelDraftOnModeChange({
    nextMode: 'calibrate',
    circleArcDraft: { mode: 'circle-radius', points: [{ x: 0, y: 0 }] },
  }), true);
});
