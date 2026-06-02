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

test('resizeMeasurementToLength halves a two-anchor Line and keeps the start anchor fixed', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 40,
    drawType: 'line',
    shape: { active: 'line' },
    points: [{ x: 10, y: 20 }, { x: 34, y: 20 }],
    lengthPx: 24,
    lengthInches: 24,
    labelT: 0.5,
  };

  assert.equal(commands.resizeMeasurementToLength(measurement, { targetLengthInches: 12, pxPerInch: 1 }), true);

  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 10, y: 20 },
    { x: 22, y: 20 },
  ]);
  assert.equal(measurement.lengthPx, 12);
  assert.equal(measurement.lengthInches, 12);
});

test('resizeMeasurementToLength scales a multi-segment Line uniformly', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 41,
    drawType: 'line',
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
        segments: [{
          type: 'cubic',
          from: { x: 0, y: 0 },
          c1: { x: 20, y: 0 },
          c2: { x: 40, y: 0 },
          to: { x: 60, y: 0 },
        }],
      },
    },
    points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }],
    lengthPx: 70,
    lengthInches: 70,
    labelT: 0.5,
  };

  assert.equal(commands.resizeMeasurementToLength(measurement, { targetLengthInches: 35, pxPerInch: 1 }), true);

  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 20 },
  ]);
  assert.equal(measurement.lengthPx, 35);
  assert.equal(measurement.lengthInches, 35);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousFreehand.segments[0].c1)), { x: 10, y: 0 });
});

test('resizeMeasurementToLength scales Freehand curve anchors and controls uniformly', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 42,
    drawType: 'freehand',
    shape: { active: 'freehand' },
    points: [{ x: 5, y: 5 }, { x: 45, y: 5 }],
    segments: [{
      type: 'cubic',
      from: { x: 5, y: 5 },
      c1: { x: 15, y: -15 },
      c2: { x: 35, y: 25 },
      to: { x: 45, y: 5 },
    }],
    labelT: 0.5,
  };
  const originalLength = commands.finalizeMeasurementGeometry(measurement, { pxPerInch: 1 }) && measurement.lengthInches;

  assert.equal(commands.resizeMeasurementToLength(measurement, { targetLengthInches: originalLength / 2, pxPerInch: 1 }), true);

  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0])), {
    type: 'cubic',
    from: { x: 5, y: 5 },
    c1: { x: 10, y: -5 },
    c2: { x: 20, y: 15 },
    to: { x: 25, y: 5 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 5, y: 5 },
    { x: 25, y: 5 },
  ]);
  assert.ok(Math.abs(measurement.lengthInches - originalLength / 2) < 0.0001);
});

test('resizeMeasurementToLength rejects invalid target lengths without changing geometry', async () => {
  const commands = await loadCommands();
  for (const targetLengthInches of ['', 0, -1, Number.NaN]) {
    const measurement = {
      id: 43,
      drawType: 'line',
      shape: { active: 'line' },
      points: [{ x: 0, y: 0 }, { x: 24, y: 0 }],
      lengthPx: 24,
      lengthInches: 24,
    };

    assert.equal(commands.resizeMeasurementToLength(measurement, { targetLengthInches, pxPerInch: 1 }), false);
    assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
    ]);
    assert.equal(measurement.lengthPx, 24);
    assert.equal(measurement.lengthInches, 24);
  }
});

test('convertFreehandMeasurementToLine preserves ordered freehand anchors and source metadata', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 30,
    drawType: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 4, y: 14 },
      c2: { x: 12, y: 14 },
      to: { x: 20, y: 0 },
    }],
    shape: { active: 'freehand' },
    lengthPx: 30,
    lengthInches: 15,
    labelT: 0.25,
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);

  assert.equal(measurement.drawType, 'line');
  assert.equal(measurement.shape.active, 'line');
  assert.equal(measurement.segments, null);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ]);
  assert.equal(measurement.lengthPx, Math.hypot(10, 5) + Math.hypot(10, -5));
  assert.equal(measurement.lengthInches, measurement.lengthPx / 2);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousFreehand.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousFreehand.segments[0].c1)), { x: 4, y: 14 });
});

test('convertFreehandMeasurementToLine derives ordered anchors for legacy freehand geometry', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 31,
    drawType: 'freehand',
    segments: [{
      type: 'cubic',
      from: { x: 2, y: 1 },
      c1: { x: 5, y: 8 },
      c2: { x: 8, y: 8 },
      to: { x: 12, y: 1 },
    }, {
      type: 'cubic',
      from: { x: 12, y: 1 },
      c1: { x: 16, y: -6 },
      c2: { x: 20, y: -6 },
      to: { x: 24, y: 1 },
    }],
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 4 }), true);

  assert.equal(measurement.drawType, 'line');
  assert.equal(measurement.shape.active, 'line');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 2, y: 1 },
    { x: 12, y: 1 },
    { x: 24, y: 1 },
  ]);
  assert.equal(measurement.lengthPx, 22);
  assert.equal(measurement.lengthInches, 5.5);
  assert.equal(measurement.shape.previousFreehand.segments.length, 2);
});

test('convertFreehandMeasurementToLine avoids dense legacy freehand point clouds when curve anchors exist', async () => {
  const commands = await loadCommands();
  const densePoints = Array.from({ length: 30 }, (_, index) => ({ x: index, y: index % 2 }));
  const measurement = {
    id: 32,
    drawType: 'freehand',
    points: densePoints,
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 5, y: 8 },
      c2: { x: 10, y: 8 },
      to: { x: 15, y: 0 },
    }, {
      type: 'cubic',
      from: { x: 15, y: 0 },
      c1: { x: 20, y: -8 },
      c2: { x: 25, y: -8 },
      to: { x: 29, y: 0 },
    }],
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 1 }), true);

  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 29, y: 0 },
  ]);
  assert.equal(measurement.shape.previousFreehand.points.length, 30);
});

test('convertLineMeasurementToFreehand restores saved freehand geometry and preserves current line metadata', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 33,
    drawType: 'line',
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    segments: null,
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 0 }],
        segments: [{
          type: 'cubic',
          from: { x: 0, y: 0 },
          c1: { x: 4, y: 16 },
          c2: { x: 12, y: 16 },
          to: { x: 20, y: 0 },
        }],
        labelT: 0.3,
      },
    },
    lengthPx: 20,
    lengthInches: 10,
    labelT: 0.5,
  };

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);

  assert.equal(measurement.drawType, 'freehand');
  assert.equal(measurement.shape.active, 'freehand');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0].c1)), { x: 4, y: 16 });
  assert.ok(measurement.lengthPx > 20);
  assert.equal(measurement.lengthInches, measurement.lengthPx / 2);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousLine.points)), [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.equal(measurement.shape.previousLine.lengthPx, 20);

  measurement.shape.previousLine.points[0].x = 99;
  assert.equal(measurement.shape.previousFreehand.points[0].x, 0);
});

test('convertLineMeasurementToFreehand generates conservative freehand segments from pure line anchors', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 34,
    drawType: 'line',
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }],
    shape: { active: 'line' },
  };

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);

  assert.equal(measurement.drawType, 'freehand');
  assert.equal(measurement.shape.active, 'freehand');
  assert.equal(measurement.segments.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0].from)), { x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[1].to)), { x: 10, y: 8 });
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
  ]);
  assert.equal(measurement.lengthPx, 18);
  assert.equal(measurement.lengthInches, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousLine.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
  ]);
});

test('freehand to line to freehand restores prior freehand geometry and active lengths', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 35,
    drawType: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 12 },
      c2: { x: 7, y: 12 },
      to: { x: 10, y: 8 },
    }, {
      type: 'cubic',
      from: { x: 10, y: 8 },
      c1: { x: 13, y: 12 },
      c2: { x: 17, y: 12 },
      to: { x: 20, y: 0 },
    }],
    shape: { active: 'freehand' },
    lengthPx: 30,
    lengthInches: 15,
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);
  assert.equal(measurement.drawType, 'line');
  assert.equal(measurement.shape.active, 'line');
  assert.equal(measurement.segments, null);
  assert.equal(measurement.lengthPx, Math.hypot(10, 8) + Math.hypot(10, -8));
  assert.equal(measurement.lengthInches, measurement.lengthPx / 2);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.shape.previousFreehand.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 8 },
    { x: 20, y: 0 },
  ]);

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);
  assert.equal(measurement.drawType, 'freehand');
  assert.equal(measurement.shape.active, 'freehand');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 8 },
    { x: 20, y: 0 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0].c1)), { x: 3, y: 12 });
  assert.ok(measurement.lengthPx > measurement.shape.previousLine.lengthPx);
  assert.equal(measurement.lengthInches, measurement.lengthPx / 2);
});

test('converted line to freehand clipboard keeps active freehand and reversible metadata', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 36,
    page: 1,
    drawType: 'line',
    points: [{ x: 0, y: 0 }, { x: 12, y: 0 }],
    shape: { active: 'line' },
  };

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 3 }), true);
  const clipboard = commands.cloneMeasurementForClipboard(measurement, { 1: 3 });

  assert.equal(clipboard.shape.active, 'freehand');
  assert.equal(clipboard.segments.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(clipboard.shape.previousLine.points)), [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
  ]);
  measurement.shape.previousLine.points[0].x = 99;
  measurement.segments[0].c1.x = 99;
  assert.equal(clipboard.shape.previousLine.points[0].x, 0);
  assert.equal(clipboard.segments[0].c1.x, 4);
});

test('converted freehand to line clipboard and paste keep reversible freehand metadata', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 37,
    page: 1,
    name: 'Original path',
    drawType: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 4, y: 16 },
      c2: { x: 16, y: 16 },
      to: { x: 20, y: 0 },
    }],
    shape: { active: 'freehand' },
    lengthPx: 30,
    lengthInches: 15,
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);
  const clipboard = commands.cloneMeasurementForClipboard(measurement, { 1: 2 });
  measurement.shape.previousFreehand.points[0].x = 99;
  measurement.shape.previousFreehand.segments[0].c1.x = 99;

  assert.equal(clipboard.shape.active, 'line');
  assert.equal(clipboard.segments, null);
  assert.equal(clipboard.shape.previousFreehand.points[0].x, 0);
  assert.equal(clipboard.shape.previousFreehand.segments[0].c1.x, 4);

  const pasted = commands.createPastedMeasurement({
    source: clipboard,
    id: 38,
    existingMeasurements: [],
    palette: ['lime'],
    pasteAt: { x: 100, y: 100 },
    currentPage: 1,
    pxPerInch: 2,
    mode: 'visual-size',
  });

  assert.equal(pasted.shape.active, 'line');
  assert.equal(pasted.segments, null);
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.points)), [{ x: 90, y: 100 }, { x: 110, y: 100 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.shape.previousFreehand.points)), [{ x: 90, y: 100 }, { x: 110, y: 100 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.shape.previousFreehand.segments[0].c1)), { x: 94, y: 116 });
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
        segments: [{
          type: 'cubic',
          from: { x: 0, y: 0 },
          c1: { x: 3, y: 0 },
          c2: { x: 7, y: 0 },
          to: { x: 10, y: 0 },
        }],
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
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.shape.previousFreehand.points)), [{ x: 90, y: 100 }, { x: 110, y: 100 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.shape.previousFreehand.segments[0].c1)), { x: 96, y: 100 });
  assert.notEqual(pasted.shape.previousFreehand, source.shape.previousFreehand);
});

test('createPastedMeasurement preserves copied path color and style snapshot', async () => {
  const commands = await loadCommands();
  const source = {
    id: 1,
    name: 'Red path',
    page: 1,
    color: '#ff4d7d',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathStyle: {
      stroke: { color: '#ff4d7d', style: 'dashed' },
      anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
    },
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    segments: null,
    labelT: 0.5,
    sourcePage: 1,
    sourceScale: 2,
    sourceLengthInches: 10,
    sourceLengthPx: 20,
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
        segments: [{
          type: 'cubic',
          from: { x: 0, y: 0 },
          c1: { x: 5, y: 0 },
          c2: { x: 15, y: 0 },
          to: { x: 20, y: 0 },
        }],
      },
    },
  };

  const clipboard = commands.cloneMeasurementForClipboard(source, { 1: 2 });
  source.pathStyle.stroke.color = '#36d399';
  source.pathStyle.anchors.border = '#36d399';

  const pasted = commands.createPastedMeasurement({
    source: clipboard,
    id: 12,
    existingMeasurements: [{ color: '#ff4d7d' }],
    palette: ['#ff4d7d', '#36d399'],
    pasteAt: { x: 100, y: 100 },
    currentPage: 1,
    pxPerInch: 2,
  });

  assert.equal(pasted.color, '#ff4d7d');
  assert.equal(pasted.pathTemplateId, 'template-security');
  assert.equal(pasted.pathId, 'path-cat6');
  assert.equal(pasted.pathName, 'Cat 6');
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.pathStyle)), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
  assert.notEqual(pasted.pathStyle, clipboard.pathStyle);
});

test('createPastedMeasurement centers freehand paste by visual curve bounds', async () => {
  const commands = await loadCommands();
  const source = {
    id: 2,
    name: 'Curve',
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 0, y: 120 },
      c2: { x: 10, y: 120 },
      to: { x: 10, y: 0 },
    }],
    shape: { active: 'freehand' },
    sourcePage: 1,
    sourceScale: 1,
    sourceLengthInches: 10,
  };

  const pasted = commands.createPastedMeasurement({
    source,
    id: 12,
    existingMeasurements: [],
    palette: ['lime'],
    pasteAt: { x: 100, y: 100 },
    currentPage: 1,
    pxPerInch: 1,
    mode: 'visual-size',
  });

  assert.notEqual(pasted.points[0].y, 100);
  assert.ok(pasted.points[0].y < 60);
  assert.ok(pasted.segments[0].c1.y > 100);
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

test('freehand anchor and control edits update curve geometry anchors', async () => {
  const commands = await loadCommands();
  const measurement = {
    shape: { active: 'freehand' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }, {
      type: 'cubic',
      from: { x: 10, y: 0 },
      c1: { x: 13, y: 0 },
      c2: { x: 17, y: 0 },
      to: { x: 20, y: 0 },
    }],
  };

  assert.equal(commands.applyVertexDrag(measurement, {
    kind: 'curve-control',
    segmentIndex: 0,
    control: 'c1',
  }, { x: 2, y: 6 }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0].c1)), { x: 2, y: 6 });

  assert.equal(commands.applyVertexDrag(measurement, {
    kind: 'curve-anchor',
    segmentIndex: 0,
    anchor: 'to',
  }, { x: 12, y: 4 }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[0].to)), { x: 12, y: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.segments[1].from)), { x: 12, y: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 12, y: 4 },
    { x: 20, y: 0 },
  ]);
});

test('continuation endpoint role is available only for terminal anchors', async () => {
  const commands = await loadCommands();
  const line = { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }] };
  const curve = {
    shape: { active: 'freehand' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }, {
      type: 'cubic',
      from: { x: 10, y: 0 },
      c1: { x: 13, y: 0 },
      c2: { x: 17, y: 0 },
      to: { x: 20, y: 0 },
    }],
  };

  assert.equal(commands.continuationEndpointRole(line, { kind: 'anchor-hit', vertexIndex: 0 }), 'start');
  assert.equal(commands.continuationEndpointRole(line, { kind: 'anchor-hit', vertexIndex: 2 }), 'end');
  assert.equal(commands.continuationEndpointRole(line, { kind: 'anchor-hit', vertexIndex: 1 }), null);
  assert.equal(commands.continuationEndpointRole(curve, { kind: 'anchor-hit', segmentIndex: 0, anchor: 'from' }), 'start');
  assert.equal(commands.continuationEndpointRole(curve, { kind: 'anchor-hit', segmentIndex: 1, anchor: 'to' }), 'end');
  assert.equal(commands.continuationEndpointRole(curve, { kind: 'anchor-hit', segmentIndex: 0, anchor: 'to' }), null);
});

test('continueLineMeasurement appends or prepends draft points without changing the run id', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 91,
    page: 1,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    shape: { active: 'line' },
  };

  assert.equal(commands.continueLineMeasurement(measurement, {
    endpoint: 'end',
    points: [{ x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }],
    pxPerInch: 5,
  }), true);
  assert.equal(measurement.id, 91);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 5 },
  ]);
  assert.equal(measurement.lengthPx, 20);
  assert.equal(measurement.lengthInches, 4);

  assert.equal(commands.continueLineMeasurement(measurement, {
    endpoint: 'start',
    points: [{ x: 0, y: 0 }, { x: -5, y: 0 }, { x: -5, y: -5 }],
    pxPerInch: 5,
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: -5, y: -5 },
    { x: -5, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 5 },
  ]);
  assert.equal(measurement.lengthPx, 30);
  assert.equal(measurement.lengthInches, 6);
});

test('continueLineMeasurement refuses drafts with no new geometry', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], shape: { active: 'line' } };

  assert.equal(commands.continueLineMeasurement(measurement, {
    endpoint: 'end',
    points: [{ x: 10, y: 0 }],
  }), false);
  assert.deepEqual(measurement.points, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
});

test('continueFreehandMeasurement appends and prepends curve segments', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 92,
    page: 1,
    shape: { active: 'freehand' },
    drawType: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }],
  };
  const endSegments = [{
    type: 'cubic',
    from: { x: 10, y: 0 },
    c1: { x: 13, y: 0 },
    c2: { x: 17, y: 0 },
    to: { x: 20, y: 0 },
  }];
  const startSegments = [{
    type: 'cubic',
    from: { x: 0, y: 0 },
    c1: { x: -3, y: 0 },
    c2: { x: -7, y: 0 },
    to: { x: -10, y: 0 },
  }];

  assert.equal(commands.continueFreehandMeasurement(measurement, {
    endpoint: 'end',
    segments: endSegments,
    pxPerInch: 10,
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);

  assert.equal(commands.continueFreehandMeasurement(measurement, {
    endpoint: 'start',
    segments: startSegments,
    pxPerInch: 10,
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.points)), [
    { x: -10, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.ok(Math.abs(measurement.lengthPx - 30) < 0.0001);
  assert.ok(Math.abs(measurement.lengthInches - 3) < 0.0001);
});

test('finalizeMeasurementGeometry recomputes length and scale', async () => {
  const commands = await loadCommands();
  const measurement = { points: [{ x: 0, y: 0 }, { x: 6, y: 8 }] };

  commands.finalizeMeasurementGeometry(measurement, { pxPerInch: 2 });

  assert.equal(measurement.lengthPx, 10);
  assert.equal(measurement.lengthInches, 5);
  assert.equal(measurement.labelT, 0.5);
});

test('updateMeasurementLabelFromPoint stores path position and dragged offset', async () => {
  const commands = await loadCommands();
  const measurement = {
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    labelT: 0.5,
  };

  assert.equal(commands.updateMeasurementLabelFromPoint(measurement, { x: 25, y: -30 }), true);

  assert.equal(measurement.labelT, 0.25);
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.labelOffset)), { x: 0, y: -30 });
});
