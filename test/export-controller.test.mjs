import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadExportController() {
  const source = await readFile(new URL('../src/app/export-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'export-controller.js' });
  return sandbox.window.TakeoffExportController;
}

test('excelStatusMessage reports unscaled measurements when present', async () => {
  const exports = await loadExportController();

  assert.equal(exports.excelStatusMessage([]), 'Excel export downloaded.');
  assert.equal(exports.excelStatusMessage([{ scaled: 'Y' }]), 'Excel export downloaded.');
  assert.equal(exports.excelStatusMessage([{ scaled: 'N' }]), 'Excel export downloaded. 1 unscaled run marked N.');
  assert.equal(exports.excelStatusMessage([{ scaled: 'N' }, { scaled: 'N' }]), 'Excel export downloaded. 2 unscaled runs marked N.');
});

test('download filenames use the export base and format suffix', async () => {
  const exports = await loadExportController();

  assert.equal(exports.exportFilename('drawing-a', 'xlsx'), 'drawing-a-measurements.xlsx');
  assert.equal(exports.exportFilename('drawing-a', 'csv'), 'drawing-a-measurements.csv');
});
