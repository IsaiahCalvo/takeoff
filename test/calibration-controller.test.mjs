import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCalibrationController() {
  const source = await readFile(new URL('../src/app/calibration-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'calibration-controller.js' });
  return sandbox.window.TakeoffCalibrationController;
}

test('resetScaleConfirmMessage names the page and affected measurement count', async () => {
  const calibration = await loadCalibrationController();

  assert.equal(
    calibration.resetScaleConfirmMessage({ page: 3, affectedCount: 1 }),
    'Reset calibration for page 3? 1 run on this page will be marked unscaled and excluded from totals. You can undo this.'
  );
  assert.equal(
    calibration.resetScaleConfirmMessage({ page: 3, affectedCount: 2 }),
    'Reset calibration for page 3? 2 runs on this page will be marked unscaled and excluded from totals. You can undo this.'
  );
});

test('countPageMeasurements counts only measurements on the target page', async () => {
  const calibration = await loadCalibrationController();

  assert.equal(calibration.countPageMeasurements([
    { page: 1 },
    { page: 2 },
    { page: 2 },
  ], 2), 2);
});
