import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadGeometry() {
  const source = await readFile(new URL('../public/app/geometry.js', import.meta.url), 'utf8');
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
