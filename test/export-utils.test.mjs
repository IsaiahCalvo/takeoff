import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const source = await readFile(new URL('../src/export-utils.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, Blob, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'export-utils.js' });
  return sandbox.window.TakeoffExportUtils;
}

async function loadConversionExportModules() {
  const [geometry, measurements, commands, exportUtils] = await Promise.all([
    readFile(new URL('../src/app/geometry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurements.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/measurement-commands.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/export-utils.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {}, Blob, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(geometry, sandbox, { filename: 'geometry.js' });
  vm.runInContext(measurements, sandbox, { filename: 'measurements.js' });
  vm.runInContext(commands, sandbox, { filename: 'measurement-commands.js' });
  vm.runInContext(exportUtils, sandbox, { filename: 'export-utils.js' });
  return {
    commands: sandbox.window.TakeoffMeasurementCommands,
    utils: sandbox.window.TakeoffExportUtils,
  };
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
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows[2])), {
    page: 2,
    name: 'Future camera path',
    type: 'line',
    length: null,
    unit: 'ft',
    scaled: 'N',
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
    'Page,Name,Type,Length,Unit,Scaled',
    '1,Main corridor,line,42.35,ft,Y',
    '1,Lobby return,freehand,18.10,ft,Y',
    '2,Future camera path,line,,ft,N',
  ].join('\r\n'));
});

test('generateSummary groups by page and excludes unscaled measurements from totals', async () => {
  const utils = await loadUtils();
  const summary = utils.generateSummary(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.match(summary, /Page 1\n- Main corridor: 42\.35 ft\n- Lobby return: 18\.10 ft\nPage total: 60\.45 ft/);
  assert.match(summary, /Page 2\n- Future camera path: Unscaled\nPage total: 0\.00 ft/);
  assert.match(summary, /Grand total: 60\.45 ft\nUnscaled measurements: 1/);
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
  assert.match(text, /<fonts count="1">/);
  assert.match(text, /<fills count="2">/);
  assert.doesNotMatch(text, /FF4472C4/);
  assert.match(text, /<c r="F2" t="inlineStr" s="1"><is><t>Y<\/t><\/is><\/c>/);
  assert.match(text, /<c r="F4" t="inlineStr" s="1"><is><t>N<\/t><\/is><\/c>/);
});
