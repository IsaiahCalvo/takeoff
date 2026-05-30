import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadContinuousMeasurements() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ['../src/app/continuous-renderer.js', '../src/app/continuous-measurements.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox.window;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('measurementsForView renders all pages as stacked display copies without changing storage', async () => {
  const { TakeoffContinuousRenderer: renderer, TakeoffContinuousMeasurements: adapter } = await loadContinuousMeasurements();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });
  const state = { continuousScrollMode: true, continuousPageLayout: layout, pdfPage: 1, baseW: 100, baseH: 120 };
  const measurements = [
    { id: 1, page: 1, points: [{ x: 1, y: 2 }] },
    { id: 2, page: 2, points: [{ x: 3, y: 4 }] },
  ];

  const view = adapter.measurementsForView({
    state,
    measurements,
    pageMeasurements: () => measurements.slice(0, 1),
  });

  assert.deepEqual(plain(view.map(item => ({ id: item.id, points: item.points }))), [
    { id: 1, points: [{ x: 1, y: 2 }] },
    { id: 2, points: [{ x: 13, y: 64 }] },
  ]);
  assert.deepEqual(plain(measurements[1].points), [{ x: 3, y: 4 }]);
});

test('adapter localizes stack pointers to measurement page coordinates', async () => {
  const { TakeoffContinuousRenderer: renderer, TakeoffContinuousMeasurements: adapter } = await loadContinuousMeasurements();
  const layout = renderer.buildContinuousPageLayout([
    { page: 1, cssWidth: 100, cssHeight: 50 },
    { page: 2, cssWidth: 80, cssHeight: 60 },
  ], { pageGap: 10 });
  const state = { continuousScrollMode: true, continuousPageLayout: layout, pdfPage: 1, baseW: 100, baseH: 120 };

  assert.deepEqual(plain(adapter.localPointForMeasurement(state, { page: 2 }, { x: 25, y: 80 })), { x: 15, y: 20 });
  assert.deepEqual(plain(adapter.stackPointsForPage(state, 2, [{ x: 15, y: 20 }])), [{ x: 25, y: 80 }]);
  assert.deepEqual(adapter.pageForStackPoint(state, { x: 5, y: 55 }, 1), 1);
});
