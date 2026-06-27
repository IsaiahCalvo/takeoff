import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadMeasurements() {
  const geometrySource = await readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8');
  const measurementSource = await readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8');
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

test('measurement shape helpers prefer explicit metadata and infer legacy shape', async () => {
  const measurements = await loadMeasurements();
  const curveMeasurement = {
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 10, y: 0 },
      c2: { x: 10, y: 10 },
      to: { x: 20, y: 10 },
    }],
  };

  assert.equal(measurements.measurementShapeKind({ shape: { active: 'freehand' }, points: [] }), 'freehand');
  assert.equal(measurements.measurementShapeKind({ shape: { active: 'line' }, segments: curveMeasurement.segments }), 'line');
  assert.equal(measurements.measurementShapeKind({ drawType: 'freehand', points: [] }), 'freehand');
  assert.equal(measurements.measurementShapeKind({ drawType: 'line', points: [] }), 'line');
  assert.equal(measurements.measurementShapeKind(curveMeasurement), 'freehand');
  assert.equal(measurements.measurementShapeKind({ points: [] }), 'line');
  assert.equal(measurements.isFreehandMeasurement(curveMeasurement), true);
  assert.equal(measurements.isLineMeasurement({ points: [] }), true);
});

test('circle measurements expose semantic length, display points, bounds, and projection', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    shape: { active: 'circle' },
    circle: {
      center: { x: 10, y: 20 },
      radius: 5,
    },
  };

  assert.equal(measurements.measurementShapeKind(measurement), 'circle');
  assert.equal(measurements.isCircleMeasurement(measurement), true);
  assert.equal(measurements.measurementLengthPx(measurement), 10 * Math.PI);
  const points = measurements.measurementDisplayPoints(measurement);
  assert.ok(points.length >= 33);
  assert.deepEqual(JSON.parse(JSON.stringify(points[0])), { x: 15, y: 20 });
  assert.deepEqual(JSON.parse(JSON.stringify(measurements.measurementBounds(measurement))), {
    x: 5,
    y: 15,
    width: 10,
    height: 10,
    cx: 10,
    cy: 20,
  });

  const hit = measurements.projectPointToCircleMeasurement({ x: 10, y: 27 }, measurement);
  assert.equal(hit.type, 'circle');
  assert.deepEqual(JSON.parse(JSON.stringify(hit.point)), { x: 10, y: 25 });
  assert.equal(hit.distance, 2);
});

test('arc measurements expose semantic length, angle, display points, bounds, and projection', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    shape: { active: 'arc' },
    arc: {
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      sweep: Math.PI / 2,
    },
  };

  assert.equal(measurements.measurementShapeKind(measurement), 'arc');
  assert.equal(measurements.isArcMeasurement(measurement), true);
  assert.equal(measurements.measurementLengthPx(measurement), 5 * Math.PI);
  assert.deepEqual(JSON.parse(JSON.stringify(measurements.arcMeasurementMetrics(measurement))), {
    radiusPx: 10,
    lengthPx: 5 * Math.PI,
    angleRadians: Math.PI / 2,
    angleDegrees: 90,
  });
  const points = measurements.measurementDisplayPoints(measurement);
  assert.deepEqual(JSON.parse(JSON.stringify(points[0])), { x: 10, y: 0 });
  assert.ok(Math.abs(points[points.length - 1].x) < 0.000001);
  assert.ok(Math.abs(points[points.length - 1].y - 10) < 0.000001);
  const bounds = measurements.measurementBounds(measurement);
  assert.ok(Math.abs(bounds.x) < 0.000001);
  assert.ok(Math.abs(bounds.y) < 0.000001);
  assert.ok(Math.abs(bounds.width - 10) < 0.000001);
  assert.ok(Math.abs(bounds.height - 10) < 0.000001);

  const hit = measurements.projectPointToArcMeasurement({ x: 7, y: 7 }, measurement);
  assert.equal(hit.type, 'arc');
  assert.ok(hit.distance < 0.2);
  assert.ok(hit.localT > 0.49 && hit.localT < 0.51);
});

test('closed measurement helpers require a snapped terminal endpoint and compute area', async () => {
  const measurements = await loadMeasurements();
  const closed = {
    id: 'room-1',
    shape: { active: 'line' },
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ],
    snapConnections: [{ endpoint: 'end', targetId: 'room-1', targetEndpoint: 'start' }],
  };
  const unsnapped = { ...closed, id: 'room-2', snapConnections: [] };

  assert.equal(measurements.isClosedMeasurement(closed), true);
  assert.equal(measurements.measurementAreaPx(closed), 200);
  assert.deepEqual(JSON.parse(JSON.stringify(measurements.measurementAreaCenter(closed))), { x: 10, y: 5 });
  assert.equal(measurements.isClosedMeasurement(unsnapped), false);
  assert.equal(measurements.measurementAreaPx(unsnapped), null);
});

test('closed measurement helpers reject self-intersecting areas', async () => {
  const measurements = await loadMeasurements();
  const crossed = {
    id: 'crossed-room',
    shape: { active: 'line' },
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 10 },
      { x: 8, y: 0 },
      { x: 0, y: 6 },
      { x: 8, y: 6 },
      { x: 0, y: 0 },
    ],
    snapConnections: [{ endpoint: 'end', targetId: 'crossed-room', targetEndpoint: 'start' }],
  };

  assert.equal(measurements.isClosedMeasurement(crossed), false);
  assert.equal(measurements.measurementAreaPx(crossed), null);
  assert.equal(measurements.measurementAreaCenter(crossed), null);
});

test('closed curve area uses enough precision for circle-like freehand paths', async () => {
  const measurements = await loadMeasurements();
  const radius = 100;
  const control = 0.5522847498307936 * radius;
  const measurement = {
    id: 'round-room',
    shape: { active: 'freehand' },
    segments: [
      { type: 'cubic', from: { x: radius, y: 0 }, c1: { x: radius, y: control }, c2: { x: control, y: radius }, to: { x: 0, y: radius } },
      { type: 'cubic', from: { x: 0, y: radius }, c1: { x: -control, y: radius }, c2: { x: -radius, y: control }, to: { x: -radius, y: 0 } },
      { type: 'cubic', from: { x: -radius, y: 0 }, c1: { x: -radius, y: -control }, c2: { x: -control, y: -radius }, to: { x: 0, y: -radius } },
      { type: 'cubic', from: { x: 0, y: -radius }, c1: { x: control, y: -radius }, c2: { x: radius, y: -control }, to: { x: radius, y: 0 } },
    ],
    snapConnections: [{ endpoint: 'end', targetId: 'round-room', targetEndpoint: 'start' }],
  };

  assert.ok(Math.abs(measurements.measurementAreaPx(measurement) - Math.PI * radius * radius) < 15);
  const center = measurements.measurementAreaCenter(measurement);
  assert.ok(Math.abs(center.x) < 0.000001);
  assert.ok(Math.abs(center.y) < 0.000001);
});

test('active line metadata ignores stale freehand segments for geometry', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 100, y: 0 },
      c2: { x: 100, y: 100 },
      to: { x: 200, y: 100 },
    }],
  };

  assert.equal(measurements.isCurveMeasurement(measurement), false);
  assert.equal(measurements.measurementLengthPx(measurement), 5);
  assert.deepEqual(JSON.parse(JSON.stringify(measurements.measurementDisplayPoints(measurement))), measurement.points);
});

test('active freehand metadata uses curve geometry when segments exist', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    shape: { active: 'freehand' },
    points: [{ x: 0, y: 0 }, { x: 20, y: 10 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 10, y: 0 },
      c2: { x: 10, y: 10 },
      to: { x: 20, y: 10 },
    }],
  };

  assert.equal(measurements.isCurveMeasurement(measurement), true);
  assert.equal(measurements.measurementDisplayPoints(measurement).length, 19);
});

test('mixed path measurements measure and display each original geometry type', async () => {
  const measurements = await loadMeasurements();
  const measurement = {
    drawType: 'path',
    shape: { active: 'path' },
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    mergeMemory: {
      sources: [{
        portionId: 'line-a',
        kind: 'line',
        current: {
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        },
      }, {
        portionId: 'freehand-b',
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

  assert.equal(measurements.measurementShapeKind(measurement), 'path');
  assert.equal(measurements.isMixedMeasurement(measurement), true);
  assert.equal(measurements.measurementLengthPx(measurement), 20);
  const displayPoints = measurements.measurementDisplayPoints(measurement);
  assert.deepEqual(JSON.parse(JSON.stringify([displayPoints[0], displayPoints[displayPoints.length - 1]])), [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.ok(displayPoints.length > 3);
});

test('cloneShapeMetadata deep-copies reversible geometry metadata', async () => {
  const measurements = await loadMeasurements();
  const shape = {
    active: 'line',
    previousFreehand: {
      points: [{ x: 1, y: 2 }],
      segments: [{
        type: 'cubic',
        from: { x: 0, y: 0 },
        c1: { x: 4, y: 0 },
        c2: { x: 6, y: 10 },
        to: { x: 10, y: 10 },
      }],
    },
  };

  const cloned = measurements.cloneShapeMetadata(shape);
  shape.previousFreehand.points[0].x = 99;
  shape.previousFreehand.segments[0].c1.x = 99;

  assert.equal(cloned.active, 'line');
  assert.equal(cloned.previousFreehand.points[0].x, 1);
  assert.equal(cloned.previousFreehand.segments[0].c1.x, 4);
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
