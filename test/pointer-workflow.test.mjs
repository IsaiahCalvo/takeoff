import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPointerWorkflow() {
  const geometrySource = await readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8');
  const measurementsSource = await readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/app/pointer-workflow.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometrySource, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurementsSource, sandbox, { filename: 'measurements.js' });
  vm.runInContext(source, sandbox, { filename: 'pointer-workflow.js' });
  return sandbox.window.TakeoffPointerWorkflow;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildContextMenuHit prefers labels, then anchors, then paths', async () => {
  const workflow = await loadPointerWorkflow();

  assert.deepEqual(plain(workflow.buildContextMenuHit({
    labelHit: { measurementId: 1 },
    anchorHit: { measurementId: 2 },
    pathHit: { measurementId: 3 },
  })), {
    hitId: 1,
    target: { measurementId: 2, kind: 'anchor-hit' },
  });

  assert.deepEqual(plain(workflow.buildContextMenuHit({
    labelHit: null,
    anchorHit: null,
    pathHit: { measurementId: 3, segmentIndex: 0 },
  })), {
    hitId: 3,
    target: { kind: 'path-hit', measurementId: 3, segmentIndex: 0 },
  });
});

test('appendPointToDraft snaps only when shift is held', async () => {
  const workflow = await loadPointerWorkflow();
  const inProgress = { type: 'measure', points: [{ x: 0, y: 0 }] };
  const point = { x: 8, y: 3 };
  const snapPoint = () => ({ x: 8, y: 0 });

  assert.deepEqual(plain(workflow.appendPointToDraft({ inProgress, point, shiftKey: false, snapPoint })), {
    type: 'measure',
    points: [{ x: 0, y: 0 }, { x: 8, y: 3 }],
  });

  assert.deepEqual(plain(workflow.appendPointToDraft({ inProgress, point, shiftKey: true, snapPoint })), {
    type: 'measure',
    points: [{ x: 0, y: 0 }, { x: 8, y: 0 }],
  });
});

test('resolveSnapPoint preserves placement when Snap to paths is off', async () => {
  const workflow = await loadPointerWorkflow();
  let called = false;
  const point = { x: 8, y: 3 };

  assert.deepEqual(plain(workflow.resolveSnapPoint({
    enabled: false,
    point,
    findSnapTarget: () => {
      called = true;
      return { point: { x: 8, y: 0 } };
    },
  })), {
    point: { x: 8, y: 3 },
    snap: null,
  });
  assert.equal(called, false);
});

test('resolveSnapPoint uses snapped path target when Snap to paths is on', async () => {
  const workflow = await loadPointerWorkflow();

  assert.deepEqual(plain(workflow.resolveSnapPoint({
    enabled: true,
    point: { x: 8, y: 3 },
    findSnapTarget: () => ({ kind: 'centerline', point: { x: 8, y: 0 }, measurementId: 4 }),
  })), {
    point: { x: 8, y: 0 },
    snap: { kind: 'centerline', point: { x: 8, y: 0 }, measurementId: 4 },
  });
});

test('createRotationDrag clones editable geometry and captures rotation start state', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 9,
    rotationAngle: 725,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }],
  };
  const frame = { x: -2, y: -2, width: 14, height: 4, cx: 5, cy: 0, angle: 5 };
  const drag = workflow.createRotationDrag({
    measurement,
    frame,
    pointer: { x: 5, y: 10 },
    historyBefore: { before: true },
  });

  assert.equal(drag.measurementId, 9);
  assert.equal(drag.startPointerAngle, 90);
  assert.equal(drag.originalAngle, 5);
  assert.deepEqual(plain(drag.originalFrame), frame);
  measurement.points[0].x = 99;
  measurement.segments[0].from.x = 99;
  assert.equal(drag.originalPoints[0].x, 0);
  assert.equal(drag.originalSegments[0].from.x, 0);
});

test('createMeasurementDrag and applyMeasurementDrag translate points, segments, and rotation frame', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 7,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }],
    shape: {
      active: 'freehand',
      previousLine: {
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      },
    },
    rotationFrame: { x: -1, y: -1, width: 12, height: 2, cx: 5, cy: 0 },
  };
  const drag = workflow.createMeasurementDrag({
    measurement,
    pointer: { x: 1, y: 1 },
    historyBefore: { before: true },
    bounds: { x: 0, y: 0, width: 10, height: 1 },
  });
  measurement.points[0].x = 99;
  measurement.segments[0].from.x = 99;

  const result = workflow.applyMeasurementDrag({
    measurement,
    drag,
    cursor: { x: 6, y: 4 },
    constrainDelta: () => ({ dx: 4, dy: 2 }),
  });

  assert.deepEqual(plain(result), { dx: 4, dy: 2 });
  assert.deepEqual(plain(measurement.points), [{ x: 4, y: 2 }, { x: 14, y: 2 }]);
  assert.equal(measurement.segments[0].from.x, 4);
  assert.equal(measurement.segments[0].to.y, 2);
  assert.deepEqual(plain(measurement.shape.previousLine.points), [{ x: 4, y: 2 }, { x: 14, y: 2 }]);
  assert.deepEqual(plain(measurement.rotationFrame), { x: 3, y: 1, width: 12, height: 2, cx: 9, cy: 2 });
});

test('applyMeasurementDrag can use a snapped whole-path delta', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 7,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    rotationFrame: { x: 0, y: 0, width: 10, height: 1, cx: 5, cy: 0.5 },
  };
  const drag = workflow.createMeasurementDrag({
    measurement,
    pointer: { x: 0, y: 0 },
    historyBefore: null,
    bounds: { x: 0, y: 0, width: 10, height: 1 },
  });

  const result = workflow.applyMeasurementDrag({
    measurement,
    drag,
    cursor: { x: 4, y: 4 },
    constrainDelta: () => ({ dx: 4, dy: 4 }),
    snapDelta: ({ dx, dy }) => ({
      dx: dx + 1,
      dy: dy - 2,
      snap: { kind: 'anchor', measurementId: 12, point: { x: 5, y: 2 } },
    }),
  });

  assert.deepEqual(plain(result), {
    dx: 5,
    dy: 2,
    snap: { kind: 'anchor', measurementId: 12, point: { x: 5, y: 2 } },
  });
  assert.deepEqual(plain(measurement.points), [{ x: 5, y: 2 }, { x: 15, y: 2 }]);
  assert.deepEqual(plain(measurement.rotationFrame), { x: 5, y: 2, width: 10, height: 1, cx: 10, cy: 2.5 });
});

test('applyMeasurementDrag moves mixed path merge memory with visible endpoints', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 8,
    drawType: 'path',
    shape: { active: 'path' },
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    mergeMemory: {
      sources: [{
        portionId: 'line-a',
        kind: 'line',
        current: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
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
  const drag = workflow.createMeasurementDrag({
    measurement,
    pointer: { x: 0, y: 0 },
    historyBefore: null,
    bounds: { x: 0, y: 0, width: 20, height: 1 },
  });
  measurement.mergeMemory.sources[0].current.points[0].x = 99;

  workflow.applyMeasurementDrag({
    measurement,
    drag,
    cursor: { x: 4, y: 6 },
    constrainDelta: () => ({ dx: 4, dy: 6 }),
  });

  assert.deepEqual(plain(measurement.points), [{ x: 4, y: 6 }, { x: 24, y: 6 }]);
  assert.deepEqual(plain(measurement.mergeMemory.sources[0].current.points), [{ x: 4, y: 6 }, { x: 14, y: 6 }]);
  assert.deepEqual(plain(measurement.mergeMemory.sources[1].current.segments[0].from), { x: 14, y: 6 });
  assert.deepEqual(plain(measurement.mergeMemory.sources[1].current.segments[0].to), { x: 24, y: 6 });
});

test('applyMeasurementGroupDrag moves every selected measurement by one shared delta', async () => {
  const workflow = await loadPointerWorkflow();
  const first = {
    id: 1,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    rotationFrame: { x: 0, y: 0, width: 10, height: 1, cx: 5, cy: 0.5 },
  };
  const second = {
    id: 2,
    points: [{ x: 30, y: 20 }, { x: 40, y: 20 }],
    rotationFrame: { x: 30, y: 20, width: 10, height: 1, cx: 35, cy: 20.5 },
  };
  const drag = workflow.createMeasurementGroupDrag({
    measurements: [first, second],
    pointer: { x: 4, y: 5 },
    historyBefore: { before: true },
    bounds: { x: 0, y: 0, width: 40, height: 21 },
  });

  const result = workflow.applyMeasurementGroupDrag({
    measurements: [first, second],
    drag,
    cursor: { x: 14, y: 2 },
    constrainDelta: () => ({ dx: 8, dy: -2 }),
  });

  assert.deepEqual(plain(result), { dx: 8, dy: -2, movedIds: [1, 2] });
  assert.deepEqual(plain(first.points), [{ x: 8, y: -2 }, { x: 18, y: -2 }]);
  assert.deepEqual(plain(second.points), [{ x: 38, y: 18 }, { x: 48, y: 18 }]);
  assert.deepEqual(plain(first.rotationFrame), { x: 8, y: -2, width: 10, height: 1, cx: 13, cy: -1.5 });
  assert.deepEqual(plain(second.rotationFrame), { x: 38, y: 18, width: 10, height: 1, cx: 43, cy: 18.5 });
});

test('applyRotationDrag rotates geometry, snaps when shifted, and rebuilds the frame', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 11,
    rotationAngle: 0,
    points: [{ x: 2, y: 0 }, { x: 0, y: 2 }],
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 2, y: 0 }, { x: 0, y: 2 }],
      },
    },
  };
  const frame = { x: -2, y: -2, width: 4, height: 4, cx: 0, cy: 0, angle: 0 };
  const drag = workflow.createRotationDrag({
    measurement,
    frame,
    pointer: { x: 1, y: 0 },
    historyBefore: null,
  });

  const result = workflow.applyRotationDrag({
    measurement,
    drag,
    cursor: { x: Math.cos(13 * Math.PI / 180), y: Math.sin(13 * Math.PI / 180) },
    shiftKey: true,
    constrainGeometry: (points, segments) => ({ points, segments }),
    createRotationFrame: () => ({ x: -3, y: -3, width: 6, height: 6, cx: 0, cy: 0, angle: 0 }),
  });

  assert.equal(result.nextAngle, 15);
  assert.equal(measurement.rotationAngle, 15);
  assert.equal(measurement.rotationFrame.angle, 15);
  assert.ok(Math.abs(measurement.points[0].x - 1.9319) < 0.0001);
  assert.ok(Math.abs(measurement.points[0].y - 0.5176) < 0.0001);
  assert.ok(Math.abs(measurement.points[1].x - -0.5176) < 0.0001);
  assert.ok(Math.abs(measurement.points[1].y - 1.9319) < 0.0001);
  assert.ok(Math.abs(measurement.shape.previousFreehand.points[0].x - 1.9319) < 0.0001);
  assert.ok(Math.abs(measurement.shape.previousFreehand.points[1].y - 1.9319) < 0.0001);
});

test('applyMeasurementRotation rotates from current angle to a requested angle', async () => {
  const workflow = await loadPointerWorkflow();
  const measurement = {
    id: 12,
    rotationAngle: 350,
    points: [{ x: 1, y: 0 }],
  };

  const result = workflow.applyMeasurementRotation({
    measurement,
    center: { x: 0, y: 0 },
    nextAngle: 10,
    constrainGeometry: (points, segments) => ({ points, segments }),
    createRotationFrame: () => ({ x: -1, y: -1, width: 2, height: 2, cx: 0, cy: 0 }),
  });

  assert.equal(result.nextAngle, 10);
  assert.equal(result.rotateDelta, -340);
  assert.equal(measurement.rotationAngle, 10);
  assert.equal(measurement.rotationFrame.angle, 10);
  assert.ok(Math.abs(measurement.points[0].x - 0.9397) < 0.0001);
  assert.ok(Math.abs(measurement.points[0].y - 0.3420) < 0.0001);
});
