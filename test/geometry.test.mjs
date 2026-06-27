import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadGeometry() {
  const source = await readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'geometry.js' });
  return sandbox.window.TakeoffGeometry;
}

test('polylineLengthPx sums segment distances', async () => {
  const geometry = await loadGeometry();

  assert.equal(geometry.distancePx({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(geometry.polylineLengthPx([
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 6, y: 8 },
  ]), 10);
});

test('cubicLengthPx stays precise on high-curvature curves', async () => {
  const geometry = await loadGeometry();
  const segment = {
    type: 'cubic',
    from: { x: 0, y: 0 },
    c1: { x: 490.47495085903137, y: -300.8243040280174 },
    c2: { x: -1917.2229942563356, y: 1575.9027249359683 },
    to: { x: 100, y: 0 },
  };
  const referenceLength = (() => {
    let length = 0;
    let previous = geometry.cubicPoint(segment, 0);
    for (let step = 1; step <= 20000; step += 1) {
      const point = geometry.cubicPoint(segment, step / 20000);
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return length;
  })();

  assert.ok(Math.abs(geometry.cubicLengthPx(segment) - referenceLength) < 0.05);
});

test('projectPointToSegment returns projected point, local t, and distance', async () => {
  const geometry = await loadGeometry();

  assert.deepEqual(JSON.parse(JSON.stringify(geometry.projectPointToSegment(
    { x: 5, y: 3 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ))), {
    point: { x: 5, y: 0 },
    t: 0.5,
    distance: 3,
  });
});

test('rotation helpers normalize and rotate points around a center', async () => {
  const geometry = await loadGeometry();

  assert.equal(geometry.normalizeDegrees(-15), 345);
  assert.equal(geometry.snapDegrees15(22), 15);
  const rotated = geometry.rotatePoint({ x: 2, y: 1 }, { x: 1, y: 1 }, 90);
  assert.ok(Math.abs(rotated.x - 1) < 0.000001);
  assert.ok(Math.abs(rotated.y - 2) < 0.000001);
});

test('splitCubicSegment keeps both halves connected', async () => {
  const geometry = await loadGeometry();
  const [left, right] = geometry.splitCubicSegment({
    type: 'cubic',
    from: { x: 0, y: 0 },
    c1: { x: 10, y: 0 },
    c2: { x: 10, y: 10 },
    to: { x: 20, y: 10 },
  }, 0.5);

  assert.deepEqual(JSON.parse(JSON.stringify(left.to)), JSON.parse(JSON.stringify(right.from)));
  assert.deepEqual(JSON.parse(JSON.stringify(left.from)), { x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(right.to)), { x: 20, y: 10 });
});

test('circle helpers build circles from center-radius, diameter, and three points', async () => {
  const geometry = await loadGeometry();

  assert.deepEqual(JSON.parse(JSON.stringify(geometry.circleFromCenterRadius(
    { x: 10, y: 10 },
    { x: 13, y: 14 },
  ))), {
    center: { x: 10, y: 10 },
    radius: 5,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(geometry.circleFromDiameterPoints(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ))), {
    center: { x: 5, y: 0 },
    radius: 5,
  });

  const circle = geometry.circleFromThreePoints(
    { x: 5, y: 0 },
    { x: 0, y: 5 },
    { x: -5, y: 0 },
  );
  assert.ok(Math.abs(circle.center.x) < 0.000001);
  assert.ok(Math.abs(circle.center.y) < 0.000001);
  assert.ok(Math.abs(circle.radius - 5) < 0.000001);
  assert.equal(geometry.circleFromThreePoints(
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
  ), null);
});

test('arc helpers store sweep, length, samples, and projection unambiguously', async () => {
  const geometry = await loadGeometry();
  const centerArc = geometry.arcFromCenterStartEnd(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  );

  assert.equal(centerArc.radius, 10);
  assert.ok(Math.abs(centerArc.startAngle) < 0.000001);
  assert.ok(Math.abs(centerArc.sweep - Math.PI / 2) < 0.000001);
  assert.ok(Math.abs(geometry.arcLengthPx(centerArc) - (Math.PI * 5)) < 0.000001);
  assert.ok(Math.abs(geometry.arcAngleDegrees(centerArc) - 90) < 0.000001);

  const throughArc = geometry.arcFromThreePoints(
    { x: 10, y: 0 },
    { x: 0, y: 10 },
    { x: -10, y: 0 },
  );
  assert.ok(Math.abs(throughArc.radius - 10) < 0.000001);
  assert.ok(Math.abs(throughArc.sweep - Math.PI) < 0.000001);
  const samples = geometry.sampleArcPoints(throughArc, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(samples[0])), { x: 10, y: 0 });
  assert.ok(Math.abs(samples[2].x) < 0.000001);
  assert.ok(Math.abs(samples[2].y - 10) < 0.000001);

  const hit = geometry.projectPointToArc({ x: 7, y: 7 }, throughArc);
  assert.ok(hit.distance < 0.2);
  assert.ok(hit.localT > 0.2 && hit.localT < 0.3);
  assert.equal(geometry.arcFromThreePoints(
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
  ), null);
});
