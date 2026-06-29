import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCircleArcTool() {
  const [geometry, source] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/circle-arc-tool.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(source, sandbox, { filename: 'circle-arc-tool.js' });
  return sandbox.window.TakeoffCircleArcTool;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('draft prompt model names circle and arc modes with the next required point', async () => {
  const tool = await loadCircleArcTool();

  assert.deepEqual(plain(tool.promptModel({ mode: 'circle-radius' })), {
    title: 'Circle · Radius',
    step: 'Pick center point',
    metricText: '',
  });
  assert.deepEqual(plain(tool.promptModel({ mode: 'circle-radius', draft: { mode: 'circle-radius', points: [{ x: 0, y: 0 }] }, metricText: 'R 10 ft | D 20 ft' })), {
    title: 'Circle · Radius',
    step: 'Pick radius point',
    metricText: 'R 10 ft | D 20 ft',
  });
  assert.deepEqual(plain(tool.promptModel({ mode: 'circle-3p', draft: { mode: 'circle-3p', points: [{}, {}] } })), {
    title: 'Circle · 3-point',
    step: 'Pick third point on circle',
    metricText: '',
  });
  assert.deepEqual(plain(tool.promptModel({ mode: 'arc-center', draft: { mode: 'arc-center', points: [{}, {}] }, metricText: 'Angle 90.0 deg | 1.571 rad' })), {
    title: 'Arc · Center',
    step: 'Pick end point',
    metricText: 'Angle 90.0 deg | 1.571 rad',
  });
  assert.equal(tool.promptModel({ mode: 'line' }), null);
});

test('circle geometry keeps the source tool dimension and handle point', async () => {
  const tool = await loadCircleArcTool();

  assert.deepEqual(plain(tool.geometryFromPoints('circle-radius', [
    { x: 10, y: 10 },
    { x: 10, y: 18 },
  ])), {
    kind: 'circle',
    circle: { center: { x: 10, y: 10 }, radius: 8 },
    circleDimension: 'radius',
    handlePoint: { x: 10, y: 18 },
  });

  assert.deepEqual(plain(tool.geometryFromPoints('circle-diameter', [
    { x: 10, y: 10 },
    { x: 10, y: 26 },
  ])), {
    kind: 'circle',
    circle: { center: { x: 10, y: 10 }, radius: 8 },
    circleDimension: 'diameter',
    handlePoint: { x: 10, y: 26 },
  });
});
