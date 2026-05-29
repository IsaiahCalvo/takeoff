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

test('setDisclosureOpen syncs menu class and button aria state', async () => {
  const exports = await loadExportController();
  const classes = new Set();
  const attrs = {};
  const wrap = {
    classList: {
      toggle(name, value) {
        if (value) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const button = {
    setAttribute(name, value) { attrs[name] = value; },
  };

  exports.setDisclosureOpen({ wrap, button, open: true });
  assert.equal(classes.has('open'), true);
  assert.equal(attrs['aria-expanded'], 'true');

  exports.setDisclosureOpen({ wrap, button, open: false });
  assert.equal(classes.has('open'), false);
  assert.equal(attrs['aria-expanded'], 'false');
});

test('applyExportAvailability disables every export action and closes aria when empty', async () => {
  const exports = await loadExportController();
  const attrs = {};
  const exportButton = {
    disabled: false,
    setAttribute(name, value) { attrs[name] = value; },
  };
  const actionButtons = [{ disabled: false }, { disabled: false }, { disabled: false }];

  exports.applyExportAvailability({
    exportButton,
    actionButtons,
    disabled: true,
    isOpen: true,
  });

  assert.equal(exportButton.disabled, true);
  assert.equal(attrs['aria-expanded'], 'false');
  assert.deepEqual(actionButtons.map(button => button.disabled), [true, true, true]);
});
