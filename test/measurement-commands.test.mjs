import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCommands() {
  const [geometry, measurements, commands] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurement-commands.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(commands, sandbox, { filename: 'measurement-commands.js' });
  return sandbox.window.TakeoffMeasurementCommands;
}

test('createLineMeasurement builds a scaled run and clones points', async () => {
  const commands = await loadCommands();
  const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
  const measurement = commands.createLineMeasurement({
    id: 10,
    points,
    existingMeasurements: [],
    palette: ['lime'],
    page: 2,
    pxPerInch: 2,
  });
  points[0].x = 99;

  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [{ x: 0, y: 0 }, { x: 3, y: 4 }]);
  assert.equal(measurement.name, 'Run 1');
  assert.equal(measurement.color, 'lime');
  assert.equal(measurement.drawType, 'line');
  assert.equal(measurement.shape.active, 'line');
  assert.equal(measurement.lengthPx, 5);
  assert.equal(measurement.lengthInches, 2.5);
  assert.equal(measurement.page, 2);
});

test('createFreehandMeasurement builds explicit freehand shape metadata', async () => {
  const commands = await loadCommands();
  const measurement = commands.createFreehandMeasurement({
    id: 20,
    rawPoints: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 20 },
      { x: 60, y: 20 },
    ],
    existingMeasurements: [],
    palette: ['cyan'],
    page: 1,
    pxPerInch: 10,
  });

  assert.equal(measurement.drawType, 'freehand');
  assert.equal(measurement.shape.active, 'freehand');
  assert.ok(measurement.segments.length > 0);
});

test('cloneMeasurementForClipboard deep-copies geometry and stores source scale metadata', async () => {
  const commands = await loadCommands();
  const selected = {
    id: 2,
    page: 3,
    name: 'Main run',
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 3 },
      c2: { x: 7, y: 3 },
      to: { x: 10, y: 0 },
    }],
    shape: {
      active: 'freehand',
      previousLine: {
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      },
    },
    lengthInches: 12,
    lengthPx: 120,
  };

  const clipboard = commands.cloneMeasurementForClipboard(selected, { 3: 10 });
  selected.points[0].x = 99;
  selected.segments[0].c1.x = 99;
  selected.shape.previousLine.points[0].x = 99;

  assert.equal(clipboard.sourcePage, 3);
  assert.equal(clipboard.sourceScale, 10);
  assert.equal(clipboard.sourceLengthInches, 12);
  assert.equal(clipboard.sourceLengthPx, 120);
  assert.equal(clipboard.points[0].x, 0);
  assert.equal(clipboard.segments[0].c1.x, 3);
  assert.equal(clipboard.shape.active, 'freehand');
  assert.equal(clipboard.shape.previousLine.points[0].x, 0);
});

test('createPastedMeasurement can preserve real length across page scales', async () => {
  const commands = await loadCommands();
  const source = {
    id: 1,
    name: 'Run',
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: null,
    labelT: 0.5,
    sourcePage: 1,
    sourceScale: 1,
    sourceLengthInches: 10,
    sourceLengthPx: 10,
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      },
    },
  };

  const pasted = commands.createPastedMeasurement({
    source,
    id: 11,
    existingMeasurements: [{ color: 'lime' }],
    palette: ['lime', 'blue'],
    pasteAt: { x: 100, y: 100 },
    currentPage: 2,
    pxPerInch: 2,
    mode: 'real-length',
  });

  assert.equal(pasted.id, 11);
  assert.equal(pasted.name, 'Run copy');
  assert.equal(pasted.color, 'blue');
  assert.equal(pasted.page, 2);
  assert.equal(pasted.lengthPx, 20);
  assert.equal(pasted.lengthInches, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.points)), [{ x: 90, y: 100 }, { x: 110, y: 100 }]);
  assert.equal(pasted.shape.active, 'line');
  assert.equal(pasted.shape.previousFreehand.points[0].x, 0);
  assert.notEqual(pasted.shape.previousFreehand, source.shape.previousFreehand);
});

test('shouldAskPasteMode asks only when scale differs across pages', async () => {
  const commands = await loadCommands();
  const source = { sourcePage: 1, sourceScale: 1, sourceLengthInches: 10 };

  assert.equal(commands.shouldAskPasteMode(source, { currentPage: 2, pxPerInch: 2 }), true);
  assert.equal(commands.shouldAskPasteMode(source, { currentPage: 1, pxPerInch: 2 }), false);
  assert.equal(commands.shouldAskPasteMode(source, { currentPage: 2, pxPerInch: 1 }), false);
});

test('deleteMeasurementById removes only the requested run', async () => {
  const commands = await loadCommands();

  assert.deepEqual(commands.deleteMeasurementById([
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ], 2), [{ id: 1 }, { id: 3 }]);
});

test('applyVertexDrag moves line anchors directly', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };

  commands.applyVertexDrag(measurement, { kind: 'line-anchor', vertexIndex: 1 }, { x: 20, y: 5 });

  assert.deepEqual(measurement.points, [{ x: 0, y: 0 }, { x: 20, y: 5 }]);
});

test('addAnchorToMeasurement inserts line anchors at the path hit', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };

  assert.equal(commands.addAnchorToMeasurement(measurement, {
    kind: 'path-hit',
    segmentIndex: 0,
    point: { x: 5, y: 0 },
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
});

test('removeAnchorFromMeasurement refuses to remove the last line segment', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };

  assert.equal(commands.canRemoveAnchorFromMeasurement(measurement), false);
  assert.equal(commands.removeAnchorFromMeasurement(measurement, { kind: 'anchor-hit', vertexIndex: 1 }), false);
  assert.deepEqual(measurement.points, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
});

test('removeAnchorFromMeasurement removes extra line anchors', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }] };

  assert.equal(commands.canRemoveAnchorFromMeasurement(measurement), true);
  assert.equal(commands.removeAnchorFromMeasurement(measurement, { kind: 'anchor-hit', vertexIndex: 1 }), true);
  assert.deepEqual(measurement.points, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
});

test('finalizeMeasurementGeometry recomputes length and scale', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 6, y: 8 }] };

  commands.finalizeMeasurementGeometry(measurement, { pxPerInch: 2 });

  assert.equal(measurement.lengthPx, 10);
  assert.equal(measurement.lengthInches, 5);
  assert.equal(measurement.labelT, 0.5);
});
