import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const [pathAggregation, source] = await Promise.all([
    readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/export-utils.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {}, Blob, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(pathAggregation, sandbox, { filename: 'path-aggregation.js' });
  vm.runInContext(source, sandbox, { filename: 'export-utils.js' });
  return sandbox.window.TakeoffExportUtils;
}

async function loadConversionExportModules() {
  const [geometry, measurements, commands, pathAggregation, exportUtils] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurement-commands.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/export-utils.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {}, Blob, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(commands, sandbox, { filename: 'measurement-commands.js' });
  vm.runInContext(pathAggregation, sandbox, { filename: 'path-aggregation.js' });
  vm.runInContext(exportUtils, sandbox, { filename: 'export-utils.js' });
  return {
    commands: sandbox.window.TakeoffMeasurementCommands,
    utils: sandbox.window.TakeoffExportUtils,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const measurements = [
  { page: 1, name: 'Main corridor', type: 'line', lengthInches: 508.2 },
  { page: 1, name: 'Lobby return', type: 'freehand', lengthInches: 217.2 },
  { page: 2, name: 'Future camera path', type: 'line', lengthInches: null },
];

test('buildExportRows creates Excel-ready rows with scaled flags', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows(measurements, { unit: 'ft' });

  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), {
    page: 1,
    name: 'Main corridor',
    type: 'line',
    length: 42.35,
    unit: 'ft',
    scaled: 'Y',
    path: 'Legacy measurements',
    category: 'Legacy measurements',
    groupRunCount: 2,
    groupTotal: 60.45,
    groupUnit: 'ft',
    visible: 'Y',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows[2])), {
    page: 2,
    name: 'Future camera path',
    type: 'line',
    length: null,
    unit: 'ft',
    scaled: 'N',
    path: 'Legacy measurements',
    category: 'Legacy measurements',
    groupRunCount: 1,
    groupTotal: 0,
    groupUnit: 'ft',
    visible: 'Y',
  });
});

test('buildExportRows reads app measurement shape and draw mode metadata', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows([
    { page: 1, name: 'Legacy freehand', drawType: 'freehand', lengthInches: 24 },
    { page: 1, name: 'Converted line', shape: { active: 'line' }, drawType: 'freehand', lengthInches: 36 },
  ], { unit: 'ft' });

  assert.equal(rows[0].type, 'freehand');
  assert.equal(rows[1].type, 'line');
});

test('export rows and totals use the active converted geometry', async () => {
  const { commands, utils } = await loadConversionExportModules();
  const measurement = {
    page: 1,
    name: 'Converted path',
    drawType: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 0 }],
    segments: [{
      type: 'cubic',
      from: { x: 0, y: 0 },
      c1: { x: 4, y: 18 },
      c2: { x: 16, y: 18 },
      to: { x: 20, y: 0 },
    }],
    shape: { active: 'freehand' },
    lengthPx: 30,
    lengthInches: 15,
  };

  assert.equal(commands.convertFreehandMeasurementToLine(measurement, { pxPerInch: 2 }), true);
  const lineRows = utils.buildExportRows([measurement], { unit: 'in' });

  assert.equal(lineRows[0].type, 'line');
  assert.equal(lineRows[0].length, 12.81);
  assert.match(utils.generateSummary(lineRows), /Page total: 12\.81 in/);

  assert.equal(commands.convertLineMeasurementToFreehand(measurement, { pxPerInch: 2 }), true);
  const freehandRows = utils.buildExportRows([measurement], { unit: 'in' });

  assert.equal(freehandRows[0].type, 'freehand');
  assert.ok(freehandRows[0].length > lineRows[0].length);
  assert.match(utils.generateSummary(freehandRows), new RegExp(`Page total: ${freehandRows[0].length.toFixed(2)} in`));
});

test('generateCsv emits compact title-cased columns and blank unscaled length', async () => {
  const utils = await loadUtils();
  const csv = utils.generateCsv(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.equal(csv, [
    'Page,Name,Type,Length,Unit,Scaled,Path,Category,Group Run Count,Group Total,Group Unit,Visible',
    '1,Main corridor,line,42.35,ft,Y,Legacy measurements,Legacy measurements,2,60.45,ft,Y',
    '1,Lobby return,freehand,18.10,ft,Y,Legacy measurements,Legacy measurements,2,60.45,ft,Y',
    '2,Future camera path,line,,ft,N,Legacy measurements,Legacy measurements,1,0.00,ft,Y',
  ].join('\r\n'));
});

test('generateSummary groups by page and grouped Path/category breakdowns', async () => {
  const utils = await loadUtils();
  const summary = utils.generateSummary(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.match(summary, /Page 1\nPath: Legacy measurements \| Category: Legacy measurements \| Runs: 2 \| Total: 60\.45 ft\n- Main corridor: 42\.35 ft\n- Lobby return: 18\.10 ft\nPage total: 60\.45 ft/);
  assert.match(summary, /Page 2\nPath: Legacy measurements \| Category: Legacy measurements \| Runs: 1 \| Total: 0\.00 ft\n- Future camera path: Unscaled\nPage total: 0\.00 ft/);
  assert.match(summary, /Grand total: 60\.45 ft\nUnscaled measurements: 1/);
});

test('buildExportRows includes Path/category group breakdowns while retaining hidden measurements', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows([
    {
      id: 'cat6-a',
      page: 1,
      name: 'Cat 6 page 1 A',
      lengthInches: 120,
      pathTemplateId: 'template-security',
      pathId: 'path-cat6',
      pathName: 'Cat 6',
      pathCategoryId: 'low-voltage',
      pathCategoryName: 'Low Voltage',
    },
    {
      id: 'cat6-b',
      page: 1,
      name: 'Cat 6 page 1 B',
      lengthInches: 60,
      pathTemplateId: 'template-security',
      pathId: 'path-cat6',
      pathName: 'Cat 6',
      pathCategoryId: 'low-voltage',
      pathCategoryName: 'Low Voltage',
    },
    {
      id: 'cat6-c',
      page: 2,
      name: 'Cat 6 page 2',
      lengthInches: 36,
      pathTemplateId: 'template-security',
      pathId: 'path-cat6',
      pathName: 'Cat 6',
      pathCategoryId: 'low-voltage',
      pathCategoryName: 'Low Voltage',
    },
    {
      id: 'feeder-a',
      page: 1,
      name: 'Feeder page 1',
      lengthInches: 24,
      pathTemplateId: 'template-power',
      pathId: 'path-feeder',
      pathName: 'Feeder',
      pathCategoryId: 'power',
      pathCategoryName: 'Power',
    },
    {
      id: 'legacy-a',
      page: 1,
      name: 'Legacy no scale',
      lengthInches: null,
    },
  ], {
    unit: 'ft',
    pathCategoryVisibility: { 'category:low-voltage': false },
  });

  assert.equal(rows.length, 5);
  assert.equal(rows.filter(row => row.category === 'Low Voltage').reduce((sum, row) => sum + row.groupTotal, 0), 33);
  assert.deepEqual(plain(rows.map(row => ({
    page: row.page,
    name: row.name,
    path: row.path,
    category: row.category,
    length: row.length,
    scaled: row.scaled,
    groupRunCount: row.groupRunCount,
    groupTotal: row.groupTotal,
    groupUnit: row.groupUnit,
    visible: row.visible,
  }))), [
    {
      page: 1,
      name: 'Cat 6 page 1 A',
      path: 'Cat 6',
      category: 'Low Voltage',
      length: 10,
      scaled: 'Y',
      groupRunCount: 2,
      groupTotal: 15,
      groupUnit: 'ft',
      visible: 'N',
    },
    {
      page: 1,
      name: 'Cat 6 page 1 B',
      path: 'Cat 6',
      category: 'Low Voltage',
      length: 5,
      scaled: 'Y',
      groupRunCount: 2,
      groupTotal: 15,
      groupUnit: 'ft',
      visible: 'N',
    },
    {
      page: 1,
      name: 'Feeder page 1',
      path: 'Feeder',
      category: 'Power',
      length: 2,
      scaled: 'Y',
      groupRunCount: 1,
      groupTotal: 2,
      groupUnit: 'ft',
      visible: 'Y',
    },
    {
      page: 1,
      name: 'Legacy no scale',
      path: 'Legacy measurements',
      category: 'Legacy measurements',
      length: null,
      scaled: 'N',
      groupRunCount: 1,
      groupTotal: 0,
      groupUnit: 'ft',
      visible: 'Y',
    },
    {
      page: 2,
      name: 'Cat 6 page 2',
      path: 'Cat 6',
      category: 'Low Voltage',
      length: 3,
      scaled: 'Y',
      groupRunCount: 1,
      groupTotal: 3,
      groupUnit: 'ft',
      visible: 'N',
    },
  ]);
});

test('buildExportRows computes grouped mixed-unit totals in the selected export unit', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows([
    {
      id: 'metric-a',
      page: 1,
      name: 'Metric A',
      lengthInches: 39.3700787,
      pathTemplateId: 'template-metric',
      pathId: 'path-metric',
      pathName: 'Metric Path',
      pathCategoryName: 'Metric',
    },
    {
      id: 'metric-b',
      page: 1,
      name: 'Metric B',
      lengthInches: 39.3700787,
      pathTemplateId: 'template-metric',
      pathId: 'path-metric',
      pathName: 'Metric Path',
      pathCategoryName: 'Metric',
    },
  ], { unit: 'm' });

  assert.deepEqual(plain(rows.map(row => ({
    length: row.length,
    unit: row.unit,
    groupRunCount: row.groupRunCount,
    groupTotal: row.groupTotal,
    groupUnit: row.groupUnit,
  }))), [
    { length: 1, unit: 'm', groupRunCount: 2, groupTotal: 2, groupUnit: 'm' },
    { length: 1, unit: 'm', groupRunCount: 2, groupTotal: 2, groupUnit: 'm' },
  ]);
});

test('generateSummary keeps same-named distinct Paths grouped separately', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows([
    {
      id: 'conduit-a',
      page: 1,
      name: 'Conduit A',
      lengthInches: 120,
      pathTemplateId: 'template-power',
      pathId: 'path-a',
      pathName: 'Conduit',
      pathCategoryName: 'Power',
    },
    {
      id: 'conduit-b',
      page: 1,
      name: 'Conduit B',
      lengthInches: 60,
      pathTemplateId: 'template-power',
      pathId: 'path-b',
      pathName: 'Conduit',
      pathCategoryName: 'Power',
    },
  ], { unit: 'ft' });

  assert.deepEqual(plain(rows.map(row => ({
    name: row.name,
    path: row.path,
    category: row.category,
    groupRunCount: row.groupRunCount,
    groupTotal: row.groupTotal,
  }))), [
    { name: 'Conduit A', path: 'Conduit', category: 'Power', groupRunCount: 1, groupTotal: 10 },
    { name: 'Conduit B', path: 'Conduit', category: 'Power', groupRunCount: 1, groupTotal: 5 },
  ]);

  const summary = utils.generateSummary(rows);
  assert.match(summary, /Path: Conduit \| Category: Power \| Runs: 1 \| Total: 10\.00 ft\n- Conduit A: 10\.00 ft/);
  assert.match(summary, /Path: Conduit \| Category: Power \| Runs: 1 \| Total: 5\.00 ft\n- Conduit B: 5\.00 ft/);
});

test('generateXlsxPackage includes Excel table and conditional formatting metadata', async () => {
  const utils = await loadUtils();
  const xlsx = utils.generateXlsxPackage(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.ok(ArrayBuffer.isView(xlsx));
  const text = new TextDecoder().decode(xlsx);
  assert.match(text, /TableStyleMedium2/);
  assert.match(text, /conditionalFormatting sqref="F2:F1000"/);
  assert.match(text, /<cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"Y"<\/formula><\/cfRule>/);
  assert.match(text, /<cfRule type="cellIs" dxfId="1" priority="2" operator="equal"><formula>"N"<\/formula><\/cfRule>/);
  assert.match(text, /<dxf><fill><patternFill patternType="solid"><bgColor rgb="FFCEEED0"\/><\/patternFill><\/fill><\/dxf>/);
  assert.match(text, /<dxf><fill><patternFill patternType="solid"><bgColor rgb="FFF6C9CE"\/><\/patternFill><\/fill><\/dxf>/);
  assert.match(text, /<tableParts count="1">/);
  assert.match(text, /<dimension ref="A1:L4"\/>/);
  assert.match(text, /<tableColumns count="12">/);
  assert.match(text, /<tableColumn id="7" name="Path"\/>/);
  assert.match(text, /<tableColumn id="12" name="Visible"\/>/);
  assert.match(text, /<fonts count="1">/);
  assert.match(text, /<fills count="2">/);
  assert.doesNotMatch(text, /FF4472C4/);
  assert.match(text, /<c r="F2" t="inlineStr" s="1"><is><t>Y<\/t><\/is><\/c>/);
  assert.match(text, /<c r="F4" t="inlineStr" s="1"><is><t>N<\/t><\/is><\/c>/);
});
