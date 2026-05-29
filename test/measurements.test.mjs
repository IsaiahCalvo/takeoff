import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadMeasurements() {
  const geometrySource = await readFile(new URL('../public/app/geometry.js', import.meta.url), 'utf8');
  const measurementSource = await readFile(new URL('../public/app/measurements.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometrySource, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurementSource, sandbox, { filename: 'measurements.js' });
  return sandbox.window.TakeoffMeasurements;
}

test('measurementLengthPx handles line measurements', async () => {
  const measurements = await loadMeasurements();

  assert.equal(measurements.measurementLengthPx({
    drawType: 'line',
    points: [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 6, y: 8 },
    ],
  }), 10);
});

test('curve measurements expose display points and anchors', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 10, y: 0 },
      c2: { x: 10, y: 10 },
      to: { x: 20, y: 10 },
    }],
  };

  assert.equal(measurements.isCurveMeasurement(measurement), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurements.anchorsFromSegments(measurement.segments))), [
    { x: 0, y: 0 },
    { x: 20, y: 10 },
  ]);
  assert.equal(measurements.measurementDisplayPoints(measurement).length, 19);
});

test('buildFreehandSegments filters redundant points and creates cubic segments', async () => {
  const measurements = await loadMeasurements();
  const segments = measurements.buildFreehandSegments([
    { x: 0, y: 0 },
    { x: 0.1, y: 0.1 },
    { x: 10, y: 0 },
    { x: 20, y: 10 },
  ], 8);

  assert.ok(segments.length >= 1);
  assert.equal(segments[0].type, 'cubic');
});

test('projectPointToLineMeasurement reports nearest line segment hit', async () => {
  const measurements = await loadMeasurements();
  const hit = measurements.projectPointToLineMeasurement({ x: 5, y: 2 }, {
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  });

  assert.equal(hit.type, 'line');
  assert.equal(hit.segmentIndex, 0);
  assert.equal(hit.localT, 0.5);
  assert.equal(hit.distance, 2);
});
