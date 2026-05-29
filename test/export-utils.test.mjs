import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const source = await readFile(new URL('../public/export-utils.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, Blob, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'export-utils.js' });
  return sandbox.window.TakeoffExportUtils;
}

const measurements = [
  { page: 1, name: 'Main corridor', category: 'Cat6', notes: 'North wing', type: 'line', lengthInches: 508.2 },
  { page: 1, name: 'Lobby return', category: 'Fiber', notes: '', type: 'freehand', lengthInches: 217.2 },
  { page: 2, name: 'Future camera path', category: '', notes: 'Needs scale', type: 'line', lengthInches: null },
];

test('buildExportRows creates Excel-ready rows with scaled flags', async () => {
  const utils = await loadUtils();
  const rows = utils.buildExportRows(measurements, { unit: 'ft' });

  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), {
    page: 1,
    name: 'Main corridor',
    category: 'Cat6',
    notes: 'North wing',
    type: 'line',
    length: 42.35,
    unit: 'ft',
    scaled: 'Y',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rows[2])), {
    page: 2,
    name: 'Future camera path',
    category: '',
    notes: 'Needs scale',
    type: 'line',
    length: null,
    unit: 'ft',
    scaled: 'N',
  });
});

test('generateCsv emits compact title-cased columns and blank unscaled length', async () => {
  const utils = await loadUtils();
  const csv = utils.generateCsv(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.equal(csv, [
    'Page,Name,Category,Notes,Type,Length,Unit,Scaled',
    '1,Main corridor,Cat6,North wing,line,42.35,ft,Y',
    '1,Lobby return,Fiber,,freehand,18.10,ft,Y',
    '2,Future camera path,,Needs scale,line,,ft,N',
  ].join('\r\n'));
});

test('generateSummary groups by page and excludes unscaled measurements from totals', async () => {
  const utils = await loadUtils();
  const summary = utils.generateSummary(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.match(summary, /Page 1\n- Main corridor \[Cat6\]: 42\.35 ft - North wing\n- Lobby return \[Fiber\]: 18\.10 ft\nPage total: 60\.45 ft/);
  assert.match(summary, /Page 2\n- Future camera path: Unscaled - Needs scale\nPage total: 0\.00 ft/);
  assert.match(summary, /Grand total: 60\.45 ft\nUnscaled measurements: 1/);
});

test('generateXlsxPackage includes Excel table and conditional formatting metadata', async () => {
  const utils = await loadUtils();
  const xlsx = utils.generateXlsxPackage(utils.buildExportRows(measurements, { unit: 'ft' }));

  assert.ok(ArrayBuffer.isView(xlsx));
  const text = new TextDecoder().decode(xlsx);
  assert.match(text, /TableStyleMedium2/);
  assert.match(text, /conditionalFormatting sqref="H2:H1000"/);
  assert.match(text, /<cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"Y"<\/formula><\/cfRule>/);
  assert.match(text, /<cfRule type="cellIs" dxfId="1" priority="2" operator="equal"><formula>"N"<\/formula><\/cfRule>/);
  assert.match(text, /<dxf><fill><patternFill patternType="solid"><bgColor rgb="FFCEEED0"\/><\/patternFill><\/fill><\/dxf>/);
  assert.match(text, /<dxf><fill><patternFill patternType="solid"><bgColor rgb="FFF6C9CE"\/><\/patternFill><\/fill><\/dxf>/);
  assert.match(text, /<tableParts count="1">/);
  assert.match(text, /<fonts count="1">/);
  assert.match(text, /<fills count="2">/);
  assert.doesNotMatch(text, /FF4472C4/);
  assert.match(text, /<c r="H2" t="inlineStr" s="1"><is><t>Y<\/t><\/is><\/c>/);
  assert.match(text, /<c r="H4" t="inlineStr" s="1"><is><t>N<\/t><\/is><\/c>/);
});
