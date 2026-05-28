import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const source = await readFile(new URL('../public/calibration-utils.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'calibration-utils.js' });
  return sandbox.window.TakeoffCalibrationUtils;
}

test('summarizeMeasurements excludes unscaled runs from totals', async () => {
  const utils = await loadUtils();
  const summary = utils.summarizeMeasurements([
    { page: 1, lengthInches: 120 },
    { page: 1, lengthInches: null },
    { page: 2, lengthInches: 60 },
  ], 1);

  assert.equal(summary.page.totalInches, 120);
  assert.equal(summary.page.scaledCount, 1);
  assert.equal(summary.page.unscaledCount, 1);
  assert.equal(summary.all.totalInches, 180);
  assert.equal(summary.all.unscaledCount, 1);
});

test('summarizeMeasurements reports unavailable totals when a page only has unscaled runs', async () => {
  const utils = await loadUtils();
  const summary = utils.summarizeMeasurements([
    { page: 1, lengthInches: null },
  ], 1);

  assert.equal(summary.page.hasScaledLengths, false);
  assert.equal(summary.page.hasUnscaledLengths, true);
  assert.equal(summary.page.totalDisplayAvailable, false);
});

test('formatScaleStatus makes current page calibration obvious', async () => {
  const utils = await loadUtils();

  assert.deepEqual(JSON.parse(JSON.stringify(utils.formatScaleStatus(null, 'ft'))), {
    kind: 'missing',
    text: 'No page scale',
    title: 'Measurements on this page will be marked unscaled until you calibrate.',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(utils.formatScaleStatus(35.345, 'ft'))), {
    kind: 'ready',
    text: 'Page scale: 1 ft = 424.14 px',
    title: 'Current page is calibrated.',
  });
});
