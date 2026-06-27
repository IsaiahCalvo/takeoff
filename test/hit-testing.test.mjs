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

test('mixed paths expose terminal snap anchors without vertex edit handles', async () => {
  const hitTesting = await loadHitTesting();
  const mixed = {
    id: 10,
    drawType: 'path',
    shape: { active: 'path' },
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    mergeMemory: {
      sources: [{
        kind: 'line',
        current: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      }, {
        kind: 'freehand',
        current: {
          points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
          segments: [{
            type: 'cubic',
            from: { x: 10, y: 0 },
            c1: { x: 13, y: 0 },
            c2: { x: 17, y: 0 },
            to: { x: 20, y: 0 },
          }],
        },
      }],
    },
  };

  assert.equal(hitTesting.findNearestVertex([mixed], { x: 0, y: 0 }, 6), null);
  const snap = hitTesting.findSnapTarget([mixed], { x: 1, y: 1 }, {
    anchorTolerance: 6,
    centerlineTolerance: 0,
  });
  assert.equal(snap.kind, 'anchor');
  assert.equal(snap.endpoint, 'start');
  assert.equal(snap.measurementId, 10);

  const pathHit = hitTesting.findNearestPathPoint([mixed], { x: 5, y: 2 }, 6);
  assert.equal(pathHit.measurementId, 10);
  assert.equal(pathHit.type, 'mixed');

  const centerlineSnap = hitTesting.findSnapTarget([mixed], { x: 15, y: 2 }, {
    anchorTolerance: 0,
    centerlineTolerance: 6,
  });
  assert.equal(centerlineSnap.kind, 'centerline');
  assert.equal(centerlineSnap.measurementId, 10);
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

test('findSnapTarget prioritizes path anchors over closer centerline hits', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findSnapTarget([
    { id: 1, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
    { id: 2, points: [{ x: 0, y: 1 }, { x: 40, y: 1 }] },
  ], { x: 11, y: 0 }, {
    anchorTolerance: 12,
    centerlineTolerance: 8,
  });

  assert.equal(hit.kind, 'anchor');
  assert.equal(hit.measurementId, 1);
  assert.equal(hit.endpoint, 'start');
  assert.deepEqual(JSON.parse(JSON.stringify(hit.point)), { x: 0, y: 0 });
});

test('findSnapTarget snaps to Line centerlines within tolerance', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findSnapTarget([
    { id: 3, shape: { active: 'line' }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  ], { x: 42, y: 7 }, {
    anchorTolerance: 5,
    centerlineTolerance: 8,
  });

  assert.equal(hit.kind, 'centerline');
  assert.equal(hit.measurementId, 3);
  assert.equal(hit.type, 'line');
  assert.equal(Math.round(hit.point.x), 42);
  assert.equal(Math.round(hit.point.y), 0);
});

test('findSnapTarget and path hits support semantic circles', async () => {
  const hitTesting = await loadHitTesting();
  const circle = {
    id: 'circle-1',
    shape: { active: 'circle' },
    circle: {
      center: { x: 10, y: 20 },
      radius: 5,
    },
  };

  const anchor = hitTesting.findSnapTarget([circle], { x: 11, y: 19 }, {
    anchorTolerance: 3,
    centerlineTolerance: 0,
  });
  assert.equal(anchor.kind, 'anchor');
  assert.equal(anchor.anchorKind, 'circle-center');
  assert.equal(anchor.measurementId, 'circle-1');
  assert.deepEqual(JSON.parse(JSON.stringify(anchor.point)), { x: 10, y: 20 });
  assert.deepEqual(JSON.parse(JSON.stringify(hitTesting.findNearestVertex([circle], { x: 15, y: 20 }, 2))), {
    measurementId: 'circle-1',
    kind: 'line-anchor',
    vertexIndex: 1,
  });

  const pathHit = hitTesting.findNearestPathPoint([circle], { x: 10, y: 27 }, 3);
  assert.equal(pathHit.measurementId, 'circle-1');
  assert.equal(pathHit.type, 'circle');
  assert.deepEqual(JSON.parse(JSON.stringify(pathHit.point)), { x: 10, y: 25 });
  assert.equal(pathHit.distance, 2);
});

test('findSnapTarget and path hits support semantic arcs', async () => {
  const hitTesting = await loadHitTesting();
  const arc = {
    id: 'arc-1',
    shape: { active: 'arc' },
    arc: {
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      sweep: Math.PI / 2,
    },
  };

  const endpoint = hitTesting.findSnapTarget([arc], { x: 1, y: 10 }, {
    anchorTolerance: 3,
    centerlineTolerance: 0,
  });
  assert.equal(endpoint.kind, 'anchor');
  assert.equal(endpoint.anchorKind, 'arc-end');
  assert.equal(endpoint.endpoint, 'end');
  assert.deepEqual(JSON.parse(JSON.stringify(hitTesting.findNearestVertex([arc], { x: 10, y: 0 }, 2))), {
    measurementId: 'arc-1',
    kind: 'line-anchor',
    vertexIndex: 0,
  });

  const pathHit = hitTesting.findNearestPathPoint([arc], { x: 7, y: 7 }, 3);
  assert.equal(pathHit.measurementId, 'arc-1');
  assert.equal(pathHit.type, 'arc');
  assert.ok(pathHit.distance < 0.2);
  assert.ok(pathHit.localT > 0.49 && pathHit.localT < 0.51);
});

test('findSnapTarget snaps to Freehand sampled centerlines within tolerance', async () => {
  const hitTesting = await loadHitTesting();
  const hit = hitTesting.findSnapTarget([
    {
      id: 4,
      shape: { active: 'freehand' },
      points: [{ x: 0, y: 20 }, { x: 60, y: 20 }],
      segments: [{
        type: 'cubic',
        from: { x: 0, y: 20 },
        c1: { x: 20, y: 20 },
        c2: { x: 40, y: 20 },
        to: { x: 60, y: 20 },
      }],
    },
  ], { x: 30, y: 26 }, {
    anchorTolerance: 5,
    centerlineTolerance: 8,
  });

  assert.equal(hit.kind, 'centerline');
  assert.equal(hit.measurementId, 4);
  assert.equal(hit.type, 'curve');
  assert.ok(Math.abs(hit.point.x - 30) < 0.6);
  assert.ok(Math.abs(hit.point.y - 20) < 0.6);
});

test('findSnapTarget respects tolerance, hidden targets, and self exclusion', async () => {
  const hitTesting = await loadHitTesting();

  assert.equal(hitTesting.findSnapTarget([
    { id: 5, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
  ], { x: 13, y: 13 }, {
    anchorTolerance: 12,
    centerlineTolerance: 0,
  }), null);

  assert.equal(hitTesting.findSnapTarget([
    { id: 6, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
    { id: 7, hidden: true, points: [{ x: 1, y: 0 }, { x: 20, y: 0 }] },
  ], { x: 1, y: 0 }, {
    anchorTolerance: 12,
    centerlineTolerance: 8,
    excludeMeasurementIds: [6],
  }), null);
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

test('marquee direction maps drag direction to window and crossing modes', async () => {
  const hitTesting = await loadHitTesting();

  assert.equal(hitTesting.getMarqueeDirection({ startX: 10, endX: 60 }), 'window');
  assert.equal(hitTesting.getMarqueeDirection({ startX: 60, endX: 10 }), 'crossing');
});

test('window marquee selects only measurements fully contained by the marquee', async () => {
  const hitTesting = await loadHitTesting();
  const measurements = [
    { id: 1, points: [{ x: 20, y: 20 }, { x: 40, y: 20 }] },
    { id: 2, points: [{ x: 20, y: 20 }, { x: 80, y: 20 }] },
  ];

  const hits = hitTesting.findMarqueeMeasurements(
    measurements,
    hitTesting.getMarqueeRect({ startX: 10, startY: 10, endX: 50, endY: 50 }),
    'window',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(hits)), [1]);
});

test('crossing marquee requires actual measurement geometry intersection, not bounding box overlap', async () => {
  const hitTesting = await loadHitTesting();
  const hollowBoxMeasurement = {
    id: 1,
    points: [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ],
  };

  const hits = hitTesting.findMarqueeMeasurements(
    [hollowBoxMeasurement],
    hitTesting.getMarqueeRect({ startX: 70, startY: 70, endX: 30, endY: 30 }),
    'crossing',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(hits)), []);
});

test('crossing marquee selects measurements whose displayed path crosses the marquee', async () => {
  const hitTesting = await loadHitTesting();
  const measurements = [
    { id: 1, points: [{ x: 10, y: 10 }, { x: 90, y: 90 }] },
    { id: 2, points: [{ x: 10, y: 10 }, { x: 90, y: 10 }] },
  ];

  const hits = hitTesting.findMarqueeMeasurements(
    measurements,
    hitTesting.getMarqueeRect({ startX: 70, startY: 70, endX: 30, endY: 30 }),
    'crossing',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(hits)), [1]);
});
