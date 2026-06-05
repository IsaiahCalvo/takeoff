import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCommands() {
  const [geometry, measurements, runDetails, commands] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/run-details.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurement-commands.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(runDetails, sandbox, { filename: 'run-details.js' });
  vm.runInContext(commands, sandbox, { filename: 'measurement-commands.js' });
  return sandbox.window.TakeoffMeasurementCommands;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function straightSegment(from, to) {
  return {
    type: 'cubic',
    from: { ...from },
    c1: {
      x: from.x + (to.x - from.x) / 3,
      y: from.y + (to.y - from.y) / 3,
    },
    c2: {
      x: from.x + (to.x - from.x) * 2 / 3,
      y: from.y + (to.y - from.y) * 2 / 3,
    },
    to: { ...to },
  };
}

function pathStyleSnapshot(color = '#36d399') {
  return {
    stroke: { color, style: 'solid' },
    anchors: { fill: '#101820', border: color, borderMatchesStroke: true },
  };
}

function linePath(id, points, overrides = {}) {
  return {
    id,
    name: `Line ${id}`,
    page: 1,
    color: '#36d399',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
    pathStyle: pathStyleSnapshot(),
    notes: `note-${id}`,
    drawType: 'line',
    shape: { active: 'line' },
    points: points.map(point => ({ ...point })),
    snapConnections: [],
    ...overrides,
  };
}

function freehandPath(id, from, to, overrides = {}) {
  return {
    id,
    name: `Freehand ${id}`,
    page: 1,
    color: '#36d399',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
    pathStyle: pathStyleSnapshot(),
    details: `detail-${id}`,
    drawType: 'freehand',
    shape: { active: 'freehand' },
    points: [{ ...from }, { ...to }],
    segments: [straightSegment(from, to)],
    snapConnections: [],
    ...overrides,
  };
}

test('saveMeasurementRunDetails normalizes details and replaces only the target measurement', async () => {
  const commands = await loadCommands();
  const untouched = {
    id: 'keep',
    name: 'Keep',
    runDetails: { text: 'existing', photos: [{ id: 'kept-photo' }], videos: [] },
  };
  const target = {
    id: 'target',
    name: 'Target',
    runDetails: { text: 'old', photos: [{ id: 'old-photo' }], videos: [] },
  };
  const measurements = [untouched, target];
  const input = {
    text: 42,
    photos: [
      { id: 'photo-1', metadata: { tags: ['rough-in'] } },
      'invalid',
    ],
    videos: [{ id: 'video-1', metadata: { durationSeconds: 12 } }],
    ignored: 'extra',
  };

  const result = commands.saveMeasurementRunDetails(measurements, 'target', input);
  input.photos[0].metadata.tags.push('mutated');
  input.videos[0].metadata.durationSeconds = 99;

  assert.equal(result.updated, true);
  assert.notEqual(result.measurements, measurements);
  assert.equal(result.measurements[0], untouched);
  assert.notEqual(result.measurements[1], target);
  assert.equal(result.measurement, result.measurements[1]);
  assert.deepEqual(plain(result.measurement.runDetails), {
    text: '42',
    photos: [{ id: 'photo-1', metadata: { tags: ['rough-in'] } }],
    videos: [{ id: 'video-1', metadata: { durationSeconds: 12 } }],
  });
  assert.deepEqual(plain(target.runDetails), {
    text: 'old',
    photos: [{ id: 'old-photo' }],
    videos: [],
  });

  const missing = commands.saveMeasurementRunDetails(measurements, 'missing', { text: 'no-op' });
  assert.equal(missing.updated, false);
  assert.equal(missing.measurements, measurements);
  assert.equal(missing.measurement, null);
});

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
  assert.equal(measurement.pathTemplateId, undefined);
  assert.equal(measurement.pathId, undefined);
  assert.equal(measurement.pathName, undefined);
  assert.equal(measurement.pathStyle, undefined);
});

test('createLineMeasurement snapshots selected path metadata and style', async () => {
  const commands = await loadCommands();
  const activePath = {
    templateId: 'template-security',
    id: 'path-cat6',
    name: 'Cat 6',
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
  };
  const measurement = commands.createLineMeasurement({
    id: 11,
    points: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
    existingMeasurements: [],
    palette: ['lime'],
    page: 2,
    pxPerInch: 2,
    activePath,
  });
  activePath.stroke.color = '#36d399';
  activePath.anchors.border = '#36d399';

  assert.equal(measurement.color, '#ff4d7d');
  assert.equal(measurement.pathTemplateId, 'template-security');
  assert.equal(measurement.pathId, 'path-cat6');
  assert.equal(measurement.pathName, 'Cat 6');
  assert.equal(measurement.pathCategoryId, 'low-voltage');
  assert.equal(measurement.pathCategoryName, 'Low Voltage');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.pathStyle)), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
  assert.notEqual(measurement.pathStyle.stroke, activePath.stroke);
  assert.notEqual(measurement.pathStyle.anchors, activePath.anchors);
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
  assert.equal(measurement.pathTemplateId, undefined);
  assert.equal(measurement.pathId, undefined);
  assert.equal(measurement.pathName, undefined);
  assert.equal(measurement.pathStyle, undefined);
});

test('createFreehandMeasurement snapshots selected path metadata and style', async () => {
  const commands = await loadCommands();
  const activePath = {
    templateId: 'template-power',
    id: 'path-feeder',
    name: 'Feeder',
    stroke: { color: '#36d399', style: 'dotted' },
    anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
    categoryId: 'power',
    categoryName: 'Power',
  };
  const measurement = commands.createFreehandMeasurement({
    id: 21,
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
    activePath,
  });
  activePath.stroke.color = '#ff4d7d';
  activePath.anchors.fill = '#101820';

  assert.equal(measurement.color, '#36d399');
  assert.equal(measurement.pathTemplateId, 'template-power');
  assert.equal(measurement.pathId, 'path-feeder');
  assert.equal(measurement.pathName, 'Feeder');
  assert.equal(measurement.pathCategoryId, 'power');
  assert.equal(measurement.pathCategoryName, 'Power');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.pathStyle)), {
    stroke: { color: '#36d399', style: 'dotted' },
    anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
  });
  assert.notEqual(measurement.pathStyle.stroke, activePath.stroke);
  assert.notEqual(measurement.pathStyle.anchors, activePath.anchors);
});

test('new Line and Freehand runs use the draft Path captured before selection changes', async () => {
  const commands = await loadCommands();
  const pathA = {
    templateId: 'template-rough-in',
    id: 'path-a',
    name: 'Path A',
    geometry: 'line',
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  };
  const pathB = {
    templateId: 'template-rough-in',
    id: 'path-b',
    name: 'Path B',
    geometry: 'freehand',
    stroke: { color: '#36d399', style: 'dotted' },
    anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
  };
  const lineDraft = { activePath: pathA };
  const freehandDraft = { activePath: pathB };
  const currentSelectionAfterLineStart = pathB;
  const currentSelectionAfterFreehandStart = pathA;

  const line = commands.createLineMeasurement({
    id: 22,
    points: [{ x: 0, y: 0 }, { x: 30, y: 40 }],
    existingMeasurements: [],
    palette: ['cyan'],
    page: 1,
    pxPerInch: 10,
    activePath: lineDraft.activePath,
  });
  const freehand = commands.createFreehandMeasurement({
    id: 23,
    rawPoints: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 20 },
      { x: 60, y: 20 },
    ],
    existingMeasurements: [line],
    palette: ['cyan'],
    page: 1,
    pxPerInch: 10,
    activePath: freehandDraft.activePath,
  });

  assert.equal(currentSelectionAfterLineStart.id, 'path-b');
  assert.equal(currentSelectionAfterFreehandStart.id, 'path-a');
  assert.equal(lineDraft.activePath.geometry, 'line');
  assert.equal(line.drawType, 'line');
  assert.equal(line.color, '#ff4d7d');
  assert.equal(line.pathTemplateId, 'template-rough-in');
  assert.equal(line.pathId, 'path-a');
  assert.equal(line.pathName, 'Path A');
  assert.deepEqual(plain(line.pathStyle), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
  assert.equal(freehandDraft.activePath.geometry, 'freehand');
  assert.equal(freehand.drawType, 'freehand');
  assert.equal(freehand.color, '#36d399');
  assert.equal(freehand.pathTemplateId, 'template-rough-in');
  assert.equal(freehand.pathId, 'path-b');
  assert.equal(freehand.pathName, 'Path B');
  assert.deepEqual(plain(freehand.pathStyle), {
    stroke: { color: '#36d399', style: 'dotted' },
    anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
  });
});

test('new Line and Freehand runs accept chronological names and panel order from state', async () => {
  const commands = await loadCommands();
  const line = commands.createLineMeasurement({
    id: 24,
    points: [{ x: 0, y: 0 }, { x: 30, y: 40 }],
    existingMeasurements: [{ id: 1, name: 'Run 1' }],
    palette: ['cyan'],
    page: 1,
    pxPerInch: 10,
    name: 'Run 4',
    panelOrder: 4,
  });
  const freehand = commands.createFreehandMeasurement({
    id: 25,
    rawPoints: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 20 },
      { x: 60, y: 20 },
    ],
    existingMeasurements: [line],
    palette: ['cyan'],
    page: 1,
    pxPerInch: 10,
    name: 'Run 5',
    panelOrder: 5,
  });

  assert.equal(line.name, 'Run 4');
  assert.equal(line.panelOrder, 4);
  assert.equal(freehand.name, 'Run 5');
  assert.equal(freehand.panelOrder, 5);
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

test('resizeMeasurementToLength scales mixed Line and Freehand source geometry and supports maintained unmerge', async () => {
  const commands = await loadCommands();
  const line = linePath(44, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 45, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(45, { x: 10, y: 0 }, { x: 20, y: 0 });
  const merged = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 44,
    sourceEndpoint: 'end',
    targetId: 45,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 }).measurement;

  assert.equal(commands.resizeMeasurementToLength(merged, { targetLengthInches: 5, pxPerInch: 2 }), true);

  assert.equal(merged.drawType, 'path');
  assert.equal(merged.shape.active, 'path');
  assert.deepEqual(plain(merged.points), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(merged.mergeMemory.sources[0].current.points), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.deepEqual(plain(merged.mergeMemory.sources[1].current.points), [{ x: 5, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(merged.mergeMemory.sources[1].current.segments[0].from), { x: 5, y: 0 });
  assert.deepEqual(plain(merged.mergeMemory.sources[1].current.segments[0].to), { x: 10, y: 0 });
  assert.deepEqual(plain(merged.mergeMemory.sources[0].original.points), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.equal(merged.lengthPx, 10);
  assert.equal(merged.lengthInches, 5);
  assert.equal(merged.mergeMemory.sources[0].boundary.lengthPx, 5);
  assert.ok(Math.abs(merged.mergeMemory.sources[1].boundary.lengthPx - 5) < 0.0001);

  const state = commands.unmergePathState(merged);
  assert.equal(state.canMaintainEdits, true);
  const maintained = commands.unmergePaths([merged], merged.id, { mode: 'maintain-edits', pxPerInch: 2 });
  assert.equal(maintained.unmerged, true);
  assert.deepEqual(plain(maintained.measurements[0].points), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.deepEqual(plain(maintained.measurements[1].points), [{ x: 5, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(maintained.measurements[1].segments[0].to), { x: 10, y: 0 });

  const original = commands.unmergePaths([merged], merged.id, { mode: 'original', pxPerInch: 2 });
  assert.equal(original.unmerged, true);
  assert.deepEqual(plain(original.measurements[0].points), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(original.measurements[1].points), [{ x: 10, y: 0 }, { x: 20, y: 0 }]);
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

test('resizeMeasurementToLength rejects invalid mixed resize requests without changing merge memory', async () => {
  const commands = await loadCommands();
  const line = linePath(46, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 47, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(47, { x: 10, y: 0 }, { x: 20, y: 0 });
  const merged = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 46,
    sourceEndpoint: 'end',
    targetId: 47,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 }).measurement;
  const before = plain(merged);

  assert.equal(commands.resizeMeasurementToLength(merged, { targetLengthInches: 0, pxPerInch: 2 }), false);
  assert.deepEqual(plain(merged), before);
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
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
    pathStyle: {
      stroke: { color: '#ff4d7d', style: 'dashed' },
      anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
    },
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
  assert.equal(measurement.pathTemplateId, 'template-security');
  assert.equal(measurement.pathId, 'path-cat6');
  assert.equal(measurement.pathName, 'Cat 6');
  assert.equal(measurement.pathCategoryId, 'low-voltage');
  assert.equal(measurement.pathCategoryName, 'Low Voltage');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.pathStyle)), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
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
    pathTemplateId: 'template-power',
    pathId: 'path-feeder',
    pathName: 'Feeder',
    pathCategoryId: 'power',
    pathCategoryName: 'Power',
    pathStyle: {
      stroke: { color: '#36d399', style: 'dotted' },
      anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
    },
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
  assert.equal(measurement.pathTemplateId, 'template-power');
  assert.equal(measurement.pathId, 'path-feeder');
  assert.equal(measurement.pathName, 'Feeder');
  assert.equal(measurement.pathCategoryId, 'power');
  assert.equal(measurement.pathCategoryName, 'Power');
  assert.deepEqual(JSON.parse(JSON.stringify(measurement.pathStyle)), {
    stroke: { color: '#36d399', style: 'dotted' },
    anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
  });
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

test('copy and paste preserve normalized run details without sharing attachment objects', async () => {
  const commands = await loadCommands();
  const source = linePath(75, [{ x: 0, y: 0 }, { x: 20, y: 0 }], {
    runDetails: {
      text: 'Install above ceiling',
      photos: [{ id: 'photo-1', metadata: { tags: ['ceiling'] } }],
      videos: [{ id: 'video-1', metadata: { durationSeconds: 8 } }],
    },
  });

  const clipboard = commands.cloneMeasurementForClipboard(source, { 1: 2 });
  source.runDetails.photos[0].metadata.tags.push('mutated-source');
  const pasted = commands.createPastedMeasurement({
    source: clipboard,
    id: 76,
    existingMeasurements: [],
    palette: [],
    pasteAt: { x: 100, y: 100 },
    currentPage: 2,
    pxPerInch: 2,
  });
  clipboard.runDetails.photos[0].metadata.tags.push('mutated-clipboard');
  clipboard.runDetails.videos[0].metadata.durationSeconds = 99;

  assert.deepEqual(plain(clipboard.runDetails), {
    text: 'Install above ceiling',
    photos: [{ id: 'photo-1', metadata: { tags: ['ceiling', 'mutated-clipboard'] } }],
    videos: [{ id: 'video-1', metadata: { durationSeconds: 99 } }],
  });
  assert.deepEqual(plain(pasted.runDetails), {
    text: 'Install above ceiling',
    photos: [{ id: 'photo-1', metadata: { tags: ['ceiling'] } }],
    videos: [{ id: 'video-1', metadata: { durationSeconds: 8 } }],
  });
  assert.notEqual(clipboard.runDetails, source.runDetails);
  assert.notEqual(pasted.runDetails, clipboard.runDetails);
  assert.notEqual(pasted.runDetails.photos[0], clipboard.runDetails.photos[0]);
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

test('createDuplicateMeasurement offsets a selected run on its source page and preserves paste metadata', async () => {
  const commands = await loadCommands();
  const source = {
    id: 4,
    name: 'Panel feed',
    page: 3,
    color: '#ff4d7d',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
    pathStyle: {
      stroke: { color: '#ff4d7d', style: 'dashed' },
      anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
    },
    drawType: 'line',
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
        segments: [straightSegment({ x: 10, y: 20 }, { x: 30, y: 20 })],
      },
    },
    points: [{ x: 10, y: 20 }, { x: 30, y: 20 }],
    segments: null,
    labelT: 0.25,
    lengthPx: 20,
    lengthInches: 10,
    runDetails: {
      text: 'Install above ceiling',
      photos: [{ id: 'photo-1', metadata: { tags: ['ceiling'] } }],
      videos: [{ id: 'video-1', metadata: { durationSeconds: 8 } }],
    },
  };

  const duplicate = commands.createDuplicateMeasurement({
    source,
    id: 44,
    existingMeasurements: [source],
    palette: ['#36d399'],
    pageScales: { 3: 2, 4: 9 },
    pageSize: { width: 200, height: 120 },
    offset: { x: 18, y: 18 },
  });

  assert.equal(duplicate.id, 44);
  assert.equal(duplicate.name, 'Panel feed copy');
  assert.equal(duplicate.page, 3);
  assert.equal(duplicate.sourcePage, 3);
  assert.equal(duplicate.sourceScale, 2);
  assert.equal(duplicate.sourceLengthInches, 10);
  assert.equal(duplicate.sourceLengthPx, 20);
  assert.equal(duplicate.lengthPx, 20);
  assert.equal(duplicate.lengthInches, 10);
  assert.deepEqual(plain(duplicate.points), [{ x: 28, y: 38 }, { x: 48, y: 38 }]);
  assert.deepEqual(plain(duplicate.shape.previousFreehand.points), [{ x: 28, y: 38 }, { x: 48, y: 38 }]);
  assert.ok(Math.abs(duplicate.shape.previousFreehand.segments[0].c1.x - 34.666666666666664) < 0.000001);
  assert.equal(duplicate.shape.previousFreehand.segments[0].c1.y, 38);
  assert.equal(duplicate.color, '#ff4d7d');
  assert.equal(duplicate.pathTemplateId, 'template-security');
  assert.equal(duplicate.pathId, 'path-cat6');
  assert.equal(duplicate.pathName, 'Cat 6');
  assert.equal(duplicate.pathCategoryId, 'low-voltage');
  assert.equal(duplicate.pathCategoryName, 'Low Voltage');
  assert.deepEqual(plain(duplicate.pathStyle), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
  assert.deepEqual(plain(duplicate.runDetails), {
    text: 'Install above ceiling',
    photos: [{ id: 'photo-1', metadata: { tags: ['ceiling'] } }],
    videos: [{ id: 'video-1', metadata: { durationSeconds: 8 } }],
  });
  assert.notEqual(duplicate.pathStyle, source.pathStyle);
  assert.notEqual(duplicate.runDetails, source.runDetails);
  assert.notEqual(duplicate.shape.previousFreehand, source.shape.previousFreehand);
});

test('createDuplicateMeasurement offsets mixed merge memory inside source page bounds', async () => {
  const commands = await loadCommands();
  const line = linePath(150, [{ x: 180, y: 180 }, { x: 190, y: 190 }], {
    page: 2,
    snapConnections: [{ endpoint: 'end', targetId: 151, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(151, { x: 190, y: 190 }, { x: 198, y: 198 }, { page: 2 });
  const merged = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 150,
    sourceEndpoint: 'end',
    targetId: 151,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 }).measurement;

  const duplicate = commands.createDuplicateMeasurement({
    source: merged,
    id: 152,
    existingMeasurements: [merged],
    palette: [],
    pageScales: { 2: 2 },
    pageSize: { width: 200, height: 200 },
    offset: { x: 18, y: 18 },
  });

  assert.equal(duplicate.page, 2);
  assert.equal(duplicate.shape.active, 'path');
  assert.deepEqual(plain(duplicate.points), [{ x: 162, y: 162 }, { x: 180, y: 180 }]);
  assert.deepEqual(plain(duplicate.mergeMemory.sources[0].current.points), [{ x: 162, y: 162 }, { x: 172, y: 172 }]);
  assert.deepEqual(plain(duplicate.mergeMemory.sources[1].current.segments[0].from), { x: 172, y: 172 });
  assert.deepEqual(plain(duplicate.mergeMemory.sources[1].current.segments[0].to), { x: 180, y: 180 });
  assert.notEqual(duplicate.mergeMemory, merged.mergeMemory);
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
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
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
  assert.equal(pasted.pathCategoryId, 'low-voltage');
  assert.equal(pasted.pathCategoryName, 'Low Voltage');
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.pathStyle)), {
    stroke: { color: '#ff4d7d', style: 'dashed' },
    anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
  });
  assert.notEqual(pasted.pathStyle, clipboard.pathStyle);
});

test('copy/paste and Line/Freehand conversion preserve Path metadata after settings changes', async () => {
  const commands = await loadCommands();
  const measurement = {
    id: 91,
    name: 'Run 1',
    page: 1,
    drawType: 'line',
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    segments: null,
    lengthPx: 20,
    lengthInches: 10,
    labelT: 0.5,
    color: '#ff9b3c',
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6 Revised',
    pathCategoryId: 'low-voltage',
    pathCategoryName: 'Low Voltage',
    pathStyle: {
      stroke: { color: '#ff9b3c', style: 'dotted' },
      anchors: { fill: '#101820', border: '#f7fbfc', borderMatchesStroke: false },
    },
  };

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);
  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);
  const clipboard = commands.cloneMeasurementForClipboard(measurement, { 1: 2 });
  const pasted = commands.createPastedMeasurement({
    source: clipboard,
    id: 92,
    existingMeasurements: [],
    palette: ['#b6ff3c'],
    pasteAt: { x: 100, y: 100 },
    currentPage: 2,
    pxPerInch: 2,
  });

  assert.equal(pasted.pathTemplateId, 'template-security');
  assert.equal(pasted.pathId, 'path-cat6');
  assert.equal(pasted.pathName, 'Cat 6 Revised');
  assert.equal(pasted.pathCategoryId, 'low-voltage');
  assert.equal(pasted.pathCategoryName, 'Low Voltage');
  assert.deepEqual(JSON.parse(JSON.stringify(pasted.pathStyle)), {
    stroke: { color: '#ff9b3c', style: 'dotted' },
    anchors: { fill: '#101820', border: '#f7fbfc', borderMatchesStroke: false },
  });
});

test('Line and Freehand conversion preserve saved run details', async () => {
  const commands = await loadCommands();
  const measurement = freehandPath(95, { x: 0, y: 0 }, { x: 20, y: 0 }, {
    runDetails: {
      text: 'Freehand route details',
      photos: [{ id: 'photo-freehand' }],
      videos: [{ id: 'video-freehand' }],
    },
  });

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);
  assert.equal(measurement.shape.active, 'line');
  assert.deepEqual(plain(measurement.runDetails), {
    text: 'Freehand route details',
    photos: [{ id: 'photo-freehand' }],
    videos: [{ id: 'video-freehand' }],
  });

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);
  assert.equal(measurement.shape.active, 'freehand');
  assert.deepEqual(plain(measurement.runDetails), {
    text: 'Freehand route details',
    photos: [{ id: 'photo-freehand' }],
    videos: [{ id: 'video-freehand' }],
  });
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
  const mixed = {
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
          segments: [straightSegment({ x: 10, y: 0 }, { x: 20, y: 0 })],
        },
      }],
    },
  };
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
  assert.equal(commands.continuationEndpointRole(mixed, { kind: 'anchor-hit', vertexIndex: 0 }), null);
  assert.equal(commands.continuationEndpointRole(mixed, { kind: 'anchor-hit', vertexIndex: 1 }), null);
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

test('mergeSnappedEndpointPaths orders Line geometry for every terminal connection', async () => {
  const commands = await loadCommands();
  const cases = [
    {
      sourceEndpoint: 'end',
      targetEndpoint: 'start',
      a: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      b: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
    },
    {
      sourceEndpoint: 'end',
      targetEndpoint: 'end',
      a: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      b: [{ x: 20, y: 0 }, { x: 10, y: 0 }],
    },
    {
      sourceEndpoint: 'start',
      targetEndpoint: 'end',
      a: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
      b: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    },
    {
      sourceEndpoint: 'start',
      targetEndpoint: 'start',
      a: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
      b: [{ x: 10, y: 0 }, { x: 0, y: 0 }],
    },
  ];

  for (const item of cases) {
    const a = { id: `a-${item.sourceEndpoint}-${item.targetEndpoint}`, page: 1, shape: { active: 'line' }, points: item.a, snapConnections: [] };
    const b = { id: `b-${item.sourceEndpoint}-${item.targetEndpoint}`, page: 1, shape: { active: 'line' }, points: item.b };
    commands.setEndpointSnapConnection(a, item.sourceEndpoint, {
      measurementId: b.id,
      endpoint: item.targetEndpoint,
    });

    const result = commands.mergeSnappedEndpointPaths([a, b], {
      sourceId: a.id,
      sourceEndpoint: item.sourceEndpoint,
      targetId: b.id,
      targetEndpoint: item.targetEndpoint,
    }, { pxPerInch: 2 });

    assert.equal(result.merged, true, `${item.sourceEndpoint}-${item.targetEndpoint} should merge`);
    assert.equal(result.measurements.length, 1);
    assert.equal(result.measurement.id, a.id);
    assert.deepEqual(JSON.parse(JSON.stringify(result.measurement.points)), [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    assert.equal(result.measurement.lengthPx, 20);
    assert.equal(result.measurement.lengthInches, 10);
    assert.deepEqual(JSON.parse(JSON.stringify(result.measurement.snapConnections)), []);
  }
});

test('mergeSnappedEndpointPaths merges compatible Freehand endpoint paths', async () => {
  const commands = await loadCommands();
  const a = {
    id: 1,
    page: 1,
    drawType: 'freehand',
    shape: { active: 'freehand' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 3, y: 0 },
      c2: { x: 7, y: 0 },
      to: { x: 10, y: 0 },
    }],
    snapConnections: [{ endpoint: 'end', targetId: 2, targetEndpoint: 'start' }],
  };
  const b = {
    id: 2,
    page: 1,
    drawType: 'freehand',
    shape: { active: 'freehand' },
    points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 10, y: 0 },
      c1: { x: 13, y: 0 },
      c2: { x: 17, y: 0 },
      to: { x: 20, y: 0 },
    }],
  };

  const result = commands.mergeSnappedEndpointPaths([a, b], {
    sourceId: 1,
    sourceEndpoint: 'end',
    targetId: 2,
    targetEndpoint: 'start',
  }, { pxPerInch: 5 });

  assert.equal(result.merged, true);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurement.segments.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.measurement.points)), [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  assert.ok(Math.abs(result.measurement.lengthPx - 20) < 0.0001);
  assert.ok(Math.abs(result.measurement.lengthInches - 4) < 0.0001);
});

test('mergeSnappedEndpointPaths merges Line and Freehand terminal paths without converting portions', async () => {
  const commands = await loadCommands();
  const lineRunDetails = {
    text: 'Line source details',
    photos: [{ id: 'line-photo', metadata: { tags: ['line'] } }],
    videos: [],
  };
  const freehandRunDetails = {
    text: 'Freehand source details',
    photos: [],
    videos: [{ id: 'freehand-video', metadata: { durationSeconds: 5 } }],
  };
  const line = linePath(100, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    name: 'Line original',
    runDetails: lineRunDetails,
    snapConnections: [{ endpoint: 'end', targetId: 101, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(101, { x: 10, y: 0 }, { x: 20, y: 0 }, {
    name: 'Freehand original',
    runDetails: freehandRunDetails,
  });

  const result = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 100,
    sourceEndpoint: 'end',
    targetId: 101,
    targetEndpoint: 'start',
  }, { pxPerInch: 5 });

  assert.equal(result.merged, true);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurement.drawType, 'path');
  assert.equal(result.measurement.shape.active, 'path');
  assert.deepEqual(plain(result.measurement.points), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  assert.equal(result.measurement.lengthPx, 20);
  assert.equal(result.measurement.lengthInches, 4);
  assert.equal(result.measurement.mergeMemory.sources.length, 2);
  assert.equal(result.measurement.mergeMemory.sources[0].kind, 'line');
  assert.equal(result.measurement.mergeMemory.sources[1].kind, 'freehand');
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[0].current.points), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[1].current.segments[0].from), { x: 10, y: 0 });
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[1].current.segments[0].to), { x: 20, y: 0 });
  assert.equal(result.measurement.mergeMemory.sources[0].original.name, 'Line original');
  assert.equal(result.measurement.mergeMemory.sources[1].original.name, 'Freehand original');
  assert.equal(result.measurement.mergeMemory.sources[0].original.notes, 'note-100');
  assert.equal(result.measurement.mergeMemory.sources[1].original.details, 'detail-101');
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[0].original.runDetails), lineRunDetails);
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[1].original.runDetails), freehandRunDetails);
  assert.notEqual(result.measurement.mergeMemory.sources[0].original.runDetails, lineRunDetails);
  assert.notEqual(result.measurement.mergeMemory.sources[1].original.runDetails, freehandRunDetails);
  assert.deepEqual(plain(result.measurement.snapConnections), []);
});

test('mergeSnappedEndpointPaths records ordering and reversal for mixed start connections', async () => {
  const commands = await loadCommands();
  const line = linePath(110, [{ x: 10, y: 0 }, { x: 20, y: 0 }], {
    snapConnections: [{ endpoint: 'start', targetId: 111, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(111, { x: 10, y: 0 }, { x: 0, y: 0 });

  const result = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 110,
    sourceEndpoint: 'start',
    targetId: 111,
    targetEndpoint: 'start',
  }, { pxPerInch: 5 });

  assert.equal(result.merged, true);
  assert.deepEqual(plain(result.measurement.mergeMemory.sources.map(source => source.original.id)), [111, 110]);
  assert.equal(result.measurement.mergeMemory.sources[0].reversed, true);
  assert.equal(result.measurement.mergeMemory.sources[1].reversed, false);
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[0].current.segments[0].from), { x: 0, y: 0 });
  assert.deepEqual(plain(result.measurement.mergeMemory.sources[0].current.segments[0].to), { x: 10, y: 0 });
  assert.deepEqual(plain(result.measurement.points), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
});

test('mergeSnappedEndpointPaths flattens repeated merge memory into one ordered source list', async () => {
  const commands = await loadCommands();
  const line = linePath(120, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 121, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(121, { x: 10, y: 0 }, { x: 20, y: 0 });
  const first = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 120,
    sourceEndpoint: 'end',
    targetId: 121,
    targetEndpoint: 'start',
  }, { pxPerInch: 5, mergeName: 'Merged Path 1' });
  const extra = linePath(122, [{ x: 20, y: 0 }, { x: 30, y: 0 }]);
  first.measurement.snapConnections = [{ endpoint: 'end', targetId: 122, targetEndpoint: 'start' }];

  const second = commands.mergeSnappedEndpointPaths([...first.measurements, extra], {
    sourceId: 120,
    sourceEndpoint: 'end',
    targetId: 122,
    targetEndpoint: 'start',
  }, { pxPerInch: 5, mergeName: 'Merged Path 2' });

  assert.equal(second.merged, true);
  assert.equal(second.measurement.name, 'Merged Path 2');
  assert.deepEqual(plain(second.measurement.mergeMemory.sources.map(source => source.original.id)), [120, 121, 122]);
  assert.equal(second.measurement.mergeMemory.sources.filter(source => source.original.mergeMemory).length, 0);
  assert.equal(second.measurement.mergeMemory.sources.length, 3);
  assert.deepEqual(plain(second.measurement.points), [{ x: 0, y: 0 }, { x: 30, y: 0 }]);

  const unmerged = commands.unmergePaths(second.measurements, second.measurement.id, { mode: 'original', pxPerInch: 5 });
  assert.deepEqual(plain(unmerged.measurements.map(measurement => measurement.name)), ['Line 120', 'Freehand 121', 'Line 122']);
});

test('mergeSnappedEndpointPaths names merged paths and unmerge restores original row order', async () => {
  const commands = await loadCommands();
  const first = linePath(300, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    name: 'Run 1',
    panelOrder: 1,
    snapConnections: [{ endpoint: 'end', targetId: 302, targetEndpoint: 'start' }],
  });
  const middle = linePath(301, [{ x: 100, y: 0 }, { x: 110, y: 0 }], {
    name: 'Run 2',
    panelOrder: 2,
  });
  const third = linePath(302, [{ x: 10, y: 0 }, { x: 20, y: 0 }], {
    name: 'Run 3',
    panelOrder: 3,
  });

  const merged = commands.mergeSnappedEndpointPaths([first, middle, third], {
    sourceId: 300,
    sourceEndpoint: 'end',
    targetId: 302,
    targetEndpoint: 'start',
  }, { pxPerInch: 2, mergeName: 'Merged Path 1' });

  assert.equal(merged.merged, true);
  assert.equal(merged.measurement.name, 'Merged Path 1');
  assert.equal(merged.measurement.panelOrder, 1);
  assert.deepEqual(plain(merged.measurements.map(measurement => measurement.name)), ['Merged Path 1', 'Run 2']);
  assert.deepEqual(plain(merged.measurement.mergeMemory.sources.map(source => ({
    id: source.original.id,
    panelOrder: source.panelOrder,
  }))), [
    { id: 300, panelOrder: 1 },
    { id: 302, panelOrder: 3 },
  ]);

  const unmerged = commands.unmergePaths(merged.measurements, merged.measurement.id, {
    mode: 'original',
    pxPerInch: 2,
  });

  assert.equal(unmerged.unmerged, true);
  assert.deepEqual(plain(unmerged.measurements.map(measurement => measurement.name)), ['Run 1', 'Run 2', 'Run 3']);
});

test('mergeSnappedEndpointPaths keeps chain endpoint snaps so merged paths can merge again', async () => {
  const commands = await loadCommands();
  const first = linePath(320, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 321, targetEndpoint: 'start' }],
  });
  const second = linePath(321, [{ x: 10, y: 0 }, { x: 20, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 322, targetEndpoint: 'start' }],
  });
  const third = linePath(322, [{ x: 20, y: 0 }, { x: 30, y: 0 }]);

  const merged = commands.mergeSnappedEndpointPaths([first, second, third], {
    sourceId: 320,
    sourceEndpoint: 'end',
    targetId: 321,
    targetEndpoint: 'start',
  }, { pxPerInch: 5, mergeName: 'Merged Path 1' });

  assert.equal(merged.merged, true);
  assert.deepEqual(plain(commands.mergeConnectionForSelectedMeasurements({
    measurements: merged.measurements,
    selectedIds: [320, 322],
    measurement: merged.measurement,
  })), {
    sourceId: 320,
    sourceEndpoint: 'end',
    targetId: 322,
    targetEndpoint: 'start',
  });
});

test('copy and paste preserve mixed merge memory and move portion boundaries', async () => {
  const commands = await loadCommands();
  const line = linePath(130, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    runDetails: { text: 'Line detail', photos: [{ id: 'line-photo' }], videos: [] },
    snapConnections: [{ endpoint: 'end', targetId: 131, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(131, { x: 10, y: 0 }, { x: 20, y: 0 }, {
    runDetails: { text: 'Freehand detail', photos: [], videos: [{ id: 'freehand-video' }] },
  });
  const merged = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 130,
    sourceEndpoint: 'end',
    targetId: 131,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 }).measurement;

  const clipboard = commands.cloneMeasurementForClipboard(merged, { 1: 2 });
  merged.mergeMemory.sources[0].current.points[0].x = 99;
  const pasted = commands.createPastedMeasurement({
    source: clipboard,
    id: 132,
    existingMeasurements: [],
    palette: [],
    pasteAt: { x: 100, y: 100 },
    currentPage: 2,
    pxPerInch: 2,
  });

  assert.equal(pasted.drawType, 'path');
  assert.equal(pasted.shape.active, 'path');
  assert.equal(pasted.mergeMemory.sources.length, 2);
  assert.notEqual(pasted.mergeMemory, clipboard.mergeMemory);
  assert.deepEqual(plain(pasted.points), [{ x: 90, y: 100 }, { x: 110, y: 100 }]);
  assert.deepEqual(plain(pasted.mergeMemory.sources[0].current.points), [{ x: 90, y: 100 }, { x: 100, y: 100 }]);
  assert.deepEqual(plain(pasted.mergeMemory.sources[1].current.segments[0].from), { x: 100, y: 100 });
  assert.deepEqual(plain(pasted.mergeMemory.sources[1].current.segments[0].to), { x: 110, y: 100 });
  assert.deepEqual(plain(pasted.mergeMemory.sources[0].original.runDetails), {
    text: 'Line detail',
    photos: [{ id: 'line-photo' }],
    videos: [],
  });
  assert.deepEqual(plain(pasted.mergeMemory.sources[1].original.runDetails), {
    text: 'Freehand detail',
    photos: [],
    videos: [{ id: 'freehand-video' }],
  });
});

test('unmergePaths can restore originals or maintain safely mapped mixed edits', async () => {
  const commands = await loadCommands();
  const line = linePath(140, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    name: 'Original Line',
    runDetails: { text: 'Original line details', photos: [{ id: 'line-photo' }], videos: [] },
    snapConnections: [{ endpoint: 'end', targetId: 141, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(141, { x: 10, y: 0 }, { x: 20, y: 0 }, {
    name: 'Original Freehand',
    runDetails: { text: 'Original freehand details', photos: [], videos: [{ id: 'freehand-video' }] },
  });
  const result = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 140,
    sourceEndpoint: 'end',
    targetId: 141,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 });
  const merged = result.measurement;
  merged.points = [{ x: 5, y: 5 }, { x: 25, y: 5 }];
  merged.mergeMemory.sources[0].current.points = [{ x: 5, y: 5 }, { x: 15, y: 5 }];
  merged.mergeMemory.sources[1].current.points = [{ x: 15, y: 5 }, { x: 25, y: 5 }];
  merged.mergeMemory.sources[1].current.segments = [straightSegment({ x: 15, y: 5 }, { x: 25, y: 5 })];
  commands.finalizeMeasurementGeometry(merged, { pxPerInch: 2 });

  const original = commands.unmergePaths([merged], merged.id, { mode: 'original', pxPerInch: 2 });
  assert.equal(original.unmerged, true);
  assert.deepEqual(plain(original.measurements.map(measurement => measurement.name)), ['Original Line', 'Original Freehand']);
  assert.deepEqual(plain(original.measurements[0].points), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(plain(original.measurements[1].points), [{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  assert.deepEqual(plain(original.measurements.map(measurement => measurement.runDetails)), [
    { text: 'Original line details', photos: [{ id: 'line-photo' }], videos: [] },
    { text: 'Original freehand details', photos: [], videos: [{ id: 'freehand-video' }] },
  ]);

  const maintainState = commands.unmergePathState(merged);
  assert.equal(maintainState.canMaintainEdits, true);
  const maintained = commands.unmergePaths([merged], merged.id, { mode: 'maintain-edits', pxPerInch: 2 });
  assert.equal(maintained.unmerged, true);
  assert.deepEqual(plain(maintained.measurements.map(measurement => measurement.name)), ['Original Line', 'Original Freehand']);
  assert.deepEqual(plain(maintained.measurements[0].points), [{ x: 5, y: 5 }, { x: 15, y: 5 }]);
  assert.deepEqual(plain(maintained.measurements[1].segments[0].to), { x: 25, y: 5 });
  assert.deepEqual(plain(maintained.measurements.map(measurement => measurement.runDetails)), [
    { text: 'Original line details', photos: [{ id: 'line-photo' }], videos: [] },
    { text: 'Original freehand details', photos: [], videos: [{ id: 'freehand-video' }] },
  ]);
});

test('unmergePaths maintains edits made to merged line geometry without updated source memory', async () => {
  const commands = await loadCommands();
  const first = linePath(240, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    name: 'First',
    snapConnections: [{ endpoint: 'end', targetId: 241, targetEndpoint: 'start' }],
  });
  const second = linePath(241, [{ x: 10, y: 0 }, { x: 20, y: 0 }], {
    name: 'Second',
  });
  const third = linePath(242, [{ x: 20, y: 0 }, { x: 35, y: 0 }], {
    name: 'Third',
  });
  const firstMerge = commands.mergeSnappedEndpointPaths([first, second], {
    sourceId: 240,
    sourceEndpoint: 'end',
    targetId: 241,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 });
  firstMerge.measurement.snapConnections = [{ endpoint: 'end', targetId: 242, targetEndpoint: 'start' }];
  const secondMerge = commands.mergeSnappedEndpointPaths([firstMerge.measurement, third], {
    sourceId: 240,
    sourceEndpoint: 'end',
    targetId: 242,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 });
  const merged = secondMerge.measurement;

  assert.equal(commands.unmergePathState(merged).hasMaintainedEdits, false);

  merged.points = [{ x: 0, y: 0 }, { x: 12, y: 3 }, { x: 23, y: -2 }, { x: 38, y: 1 }];
  commands.finalizeMeasurementGeometry(merged, { pxPerInch: 2 });

  const state = commands.unmergePathState(merged);
  assert.equal(state.canUnmergePaths, true);
  assert.equal(state.canMaintainEdits, true);
  assert.equal(state.hasMaintainedEdits, true);

  const maintained = commands.unmergePaths([merged], merged.id, { mode: 'maintain-edits', pxPerInch: 2 });
  assert.equal(maintained.unmerged, true);
  assert.deepEqual(plain(maintained.measurements.map(measurement => measurement.name)), ['First', 'Second', 'Third']);
  assert.deepEqual(plain(maintained.measurements[0].points), [{ x: 0, y: 0 }, { x: 12, y: 3 }]);
  assert.deepEqual(plain(maintained.measurements[1].points), [{ x: 12, y: 3 }, { x: 23, y: -2 }]);
  assert.deepEqual(plain(maintained.measurements[2].points), [{ x: 23, y: -2 }, { x: 38, y: 1 }]);
});

test('unmergePaths maintains legacy line-only merged paths stored as generic path geometry', async () => {
  const commands = await loadCommands();
  const first = linePath(260, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    name: 'First',
    snapConnections: [{ endpoint: 'end', targetId: 261, targetEndpoint: 'start' }],
  });
  const second = linePath(261, [{ x: 10, y: 0 }, { x: 20, y: 0 }], {
    name: 'Second',
  });
  const result = commands.mergeSnappedEndpointPaths([first, second], {
    sourceId: 260,
    sourceEndpoint: 'end',
    targetId: 261,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 });
  const merged = result.measurement;
  merged.drawType = 'path';
  merged.shape.active = 'path';

  const unchanged = commands.unmergePathState(merged);
  assert.equal(unchanged.canUnmergePaths, true);
  assert.equal(unchanged.canMaintainEdits, true);
  assert.equal(unchanged.hasMaintainedEdits, false);

  merged.mergeMemory.sources[0].current.points = [{ x: 0, y: 0 }, { x: 12, y: 3 }];
  merged.mergeMemory.sources[1].current.points = [{ x: 12, y: 3 }, { x: 20, y: 0 }];
  merged.points = [{ x: 0, y: 0 }, { x: 12, y: 3 }, { x: 20, y: 0 }];
  commands.finalizeMeasurementGeometry(merged, { pxPerInch: 2 });

  const state = commands.unmergePathState(merged);
  assert.equal(state.canUnmergePaths, true);
  assert.equal(state.canMaintainEdits, true);
  assert.equal(state.hasMaintainedEdits, true);

  const maintained = commands.unmergePaths([merged], merged.id, { mode: 'maintain-edits', pxPerInch: 2 });
  assert.equal(maintained.unmerged, true);
  assert.deepEqual(plain(maintained.measurements.map(measurement => measurement.name)), ['First', 'Second']);
  assert.deepEqual(plain(maintained.measurements[0].points), [{ x: 0, y: 0 }, { x: 12, y: 3 }]);
  assert.deepEqual(plain(maintained.measurements[1].points), [{ x: 12, y: 3 }, { x: 20, y: 0 }]);
});

test('unmergePathState disables maintain edits when portion boundaries are unsafe', async () => {
  const commands = await loadCommands();
  const line = linePath(150, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 151, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(151, { x: 10, y: 0 }, { x: 20, y: 0 });
  const merged = commands.mergeSnappedEndpointPaths([line, freehand], {
    sourceId: 150,
    sourceEndpoint: 'end',
    targetId: 151,
    targetEndpoint: 'start',
  }, { pxPerInch: 2 }).measurement;
  merged.points = [{ x: 0, y: 0 }, { x: 22, y: 0 }];

  const state = commands.unmergePathState(merged);
  assert.equal(state.canUnmergePaths, true);
  assert.equal(state.canMaintainEdits, false);
  assert.equal(state.maintainEditsReason, 'Current path edits cannot be mapped to the original paths.');
  const result = commands.unmergePaths([merged], merged.id, { mode: 'maintain-edits', pxPerInch: 2 });
  assert.equal(result.unmerged, false);
  assert.equal(result.reason, 'Current path edits cannot be mapped to the original paths.');
});

test('mergeConnectionForTarget requires snapped terminal endpoints and compatible path styling', async () => {
  const commands = await loadCommands();
  const target = { kind: 'anchor-hit', vertexIndex: 1 };
  const compatibleA = {
    id: 10,
    page: 1,
    pathTemplateId: 'template-a',
    pathId: 'path-a',
    shape: { active: 'line' },
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  };
  const compatibleB = {
    id: 11,
    page: 1,
    pathTemplateId: 'template-a',
    pathId: 'path-a',
    shape: { active: 'line' },
    points: [{ x: 10, y: 0 }, { x: 20, y: 0 }],
  };
  const stale = {
    ...compatibleA,
    id: 12,
    points: [{ x: 0, y: 0 }, { x: 9, y: 0 }],
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  };
  const mismatchedStyle = {
    ...compatibleA,
    id: 13,
    pathId: 'path-b',
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  };

  assert.deepEqual(JSON.parse(JSON.stringify(commands.mergeConnectionForTarget({
    measurements: [compatibleA, compatibleB],
    measurement: compatibleA,
    target,
  }))), {
    sourceId: 10,
    sourceEndpoint: 'end',
    targetId: 11,
    targetEndpoint: 'start',
  });
  assert.equal(commands.mergeConnectionForTarget({
    measurements: [stale, compatibleB],
    measurement: stale,
    target,
  }), null);
  assert.equal(commands.mergeConnectionForTarget({
    measurements: [mismatchedStyle, compatibleB],
    measurement: mismatchedStyle,
    target,
  }), null);
});

test('mergeConnectionForSelectedMeasurements finds a snapped terminal endpoint pair in the selection', async () => {
  const commands = await loadCommands();
  const compatibleA = linePath(10, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  });
  const compatibleB = linePath(11, [{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  const unselected = linePath(12, [{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  const stale = linePath(13, [{ x: 0, y: 0 }, { x: 9, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 11, targetEndpoint: 'start' }],
  });

  assert.deepEqual(plain(commands.mergeConnectionForSelectedMeasurements({
    measurements: [compatibleA, compatibleB],
    selectedIds: [10, 11],
    measurement: compatibleB,
  })), {
    sourceId: 10,
    sourceEndpoint: 'end',
    targetId: 11,
    targetEndpoint: 'start',
  });

  assert.equal(commands.mergeConnectionForSelectedMeasurements({
    measurements: [compatibleA, unselected],
    selectedIds: [10],
    measurement: compatibleA,
  }), null);
  assert.equal(commands.mergeConnectionForSelectedMeasurements({
    measurements: [stale, compatibleB],
    selectedIds: [13, 11],
    measurement: stale,
  }), null);
});

test('mergeConnectionForTarget allows mixed terminal endpoints and rejects nonterminal or endpoint-to-segment snaps', async () => {
  const commands = await loadCommands();
  const line = linePath(160, [{ x: 0, y: 0 }, { x: 10, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 161, targetEndpoint: 'start' }],
  });
  const freehand = freehandPath(161, { x: 10, y: 0 }, { x: 20, y: 0 });
  const styledDifferently = freehandPath(162, { x: 10, y: 0 }, { x: 20, y: 0 }, {
    pathStyle: pathStyleSnapshot('#ff4d7d'),
  });
  const nonterminalLine = linePath(163, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], {
    snapConnections: [{ endpoint: 'end', targetId: 161, targetEndpoint: 'start' }],
  });

  assert.deepEqual(plain(commands.mergeConnectionForTarget({
    measurements: [line, freehand],
    measurement: line,
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  })), {
    sourceId: 160,
    sourceEndpoint: 'end',
    targetId: 161,
    targetEndpoint: 'start',
  });
  assert.equal(commands.mergeConnectionForTarget({
    measurements: [line, styledDifferently],
    measurement: { ...line, snapConnections: [{ endpoint: 'end', targetId: 162, targetEndpoint: 'start' }] },
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  }), null);
  assert.equal(commands.mergeConnectionForTarget({
    measurements: [nonterminalLine, freehand],
    measurement: nonterminalLine,
    target: { kind: 'anchor-hit', vertexIndex: 1 },
  }), null);
  assert.equal(commands.mergeConnectionForTarget({
    measurements: [line, freehand],
    measurement: line,
    target: { kind: 'path-hit', segmentIndex: 0 },
  }), null);
});
