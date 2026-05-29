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
    shiftKey: false,
    altKey: false,
  }), 'freehand');
  assert.equal(workflows.resolveMeasureStartDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: false,
    altKey: false,
  }), 'line');
});

test('active measure draw mode stays locked after shift changes mid-run', async () => {
  const workflows = await loadMeasurementWorkflows();

  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'freehand',
    shiftKey: false,
    inProgress: { type: 'measure', points: [{ x: 0, y: 0 }] },
  }), 'line');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: false,
    freehandDraft: { rawPoints: [{ x: 0, y: 0 }] },
  }), 'freehand');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    altKey: true,
  }), 'freehand');
  assert.equal(workflows.resolveActiveMeasureDrawMode({
    rememberedDrawMode: 'line',
    shiftKey: true,
  }), 'line');
});
