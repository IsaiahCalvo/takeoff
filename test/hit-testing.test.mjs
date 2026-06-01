import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadHitTesting() {
  const [geometry, measurements, hitTesting] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/hit-testing.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(hitTesting, sandbox, { filename: 'hit-testing.js' });
  return sandbox.window.TakeoffHitTesting;
}

test('findNearestVertex detects line anchors within tolerance', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findNearestVertex([
    { id: 7, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  ], { x: 3, y: 4 }, 6);

  assert.deepEqual(JSON.parse(JSON.stringify(hit)), {
    measurementId: 7,
    kind: 'line-anchor',
    vertexIndex: 0,
  });
});

test('curve controls are only returned when requested', async () => {
  const hitTesting = await loadHitTesting();
  const measurement = {
    id: 8,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 20, y: 20 },
      c2: { x: 80, y: 20 },
      to: { x: 100, y: 0 },
    }],
  };

  assert.equal(hitTesting.findNearestVertex([measurement], { x: 20, y: 20 }, 4), null);
  assert.equal(hitTesting.findNearestVertex([measurement], { x: 20, y: 20 }, 4, { includeCurveControls: true }).control, 'c1');
});

test('curve vertex hit testing chooses the nearest visible handle, not the first in path order', async () => {
  const hitTesting = await loadHitTesting();
  const measurement = {
    id: 88,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 6, y: 0 },
      c2: { x: 80, y: 20 },
      to: { x: 100, y: 0 },
    }],
  };

  assert.deepEqual(JSON.parse(JSON.stringify(hitTesting.findNearestVertex(
    [measurement],
    { x: 5, y: 0 },
    10,
    { includeCurveControls: true },
  ))), {
    measurementId: 88,
    kind: 'curve-control',
    segmentIndex: 0,
    control: 'c1',
    point: { x: 6, y: 0 },
  });
});

test('curve control can be selected when it overlaps an anchor, while nearby anchor clicks still select the anchor', async () => {
  const hitTesting = await loadHitTesting();
  const overlappedMeasurement = {
    id: 89,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 0, y: 0 },
      c2: { x: 80, y: 20 },
      to: { x: 100, y: 0 },
    }],
  };
  const nearMeasurement = {
    id: 90,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 4, y: 0 },
      c2: { x: 80, y: 20 },
      to: { x: 100, y: 0 },
    }],
  };

  const overlappedHit = hitTesting.findNearestVertex(
    [overlappedMeasurement],
    { x: 0, y: 0 },
    10,
    { includeCurveControls: true },
  );
  const anchorHit = hitTesting.findNearestVertex(
    [nearMeasurement],
    { x: 1, y: 0 },
    10,
    { includeCurveControls: true },
  );

  assert.equal(overlappedHit.kind, 'curve-control');
  assert.equal(overlappedHit.control, 'c1');
  assert.equal(anchorHit.kind, 'curve-anchor');
  assert.equal(anchorHit.anchor, 'from');
});

test('findNearestPathPoint returns the nearest measurement path hit', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findNearestPathPoint([
    { id: 9, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  ], { x: 50, y: 3 }, 5);

  assert.equal(hit.measurementId, 9);
  assert.equal(hit.segmentIndex, 0);
  assert.equal(Math.round(hit.point.x), 50);
});

test('active line metadata makes stale curve data non-interactive', async () => {
  const hitTesting = await loadHitTesting();
  const measurement = {
    id: 10,
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 0, y: 100 },
      c2: { x: 100, y: 100 },
      to: { x: 100, y: 0 },
    }],
  };

  assert.equal(hitTesting.findNearestVertex([measurement], { x: 0, y: 100 }, 5, { includeCurveControls: true }), null);
  assert.equal(hitTesting.findNearestPathPoint([measurement], { x: 50, y: 75 }, 10), null);
  assert.equal(hitTesting.findNearestPathPoint([measurement], { x: 50, y: 3 }, 5).type, 'line');
});

test('findLabelHit checks latest hitbox first', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findLabelHit([
    { measurementId: 1, x: 0, y: 0, width: 30, height: 30 },
    { measurementId: 2, x: 10, y: 10, width: 30, height: 30 },
  ], { x: 15, y: 15 }, 0);

  assert.equal(hit.measurementId, 2);
});
