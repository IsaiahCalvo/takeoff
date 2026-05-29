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

test('applyModalState opens the calibration modal with workflow defaults', async () => {
  const calibration = await loadCalibrationController();
  const classes = new Set();
  const modal = {
    classList: {
      toggle(name, value) {
        if (value) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const valueInput = { value: 'stale' };
  const okButton = { disabled: false };
  const unitSelect = { value: '' };
  const scopeSelect = { value: '' };
  const rangeInput = { value: '2-3' };
  const rangeField = { style: { display: 'grid' } };

  calibration.applyModalState({
    modal,
    valueInput,
    okButton,
    unitSelect,
    scopeSelect,
    rangeInput,
    rangeField,
    modalState: { value: '', unit: 'feet', scope: 'page', range: '', rangeDisplay: 'none' },
    isPositiveCalibrationValue: value => Number(value) > 0,
  });

  assert.equal(classes.has('show'), true);
  assert.equal(valueInput.value, '');
  assert.equal(okButton.disabled, true);
  assert.equal(unitSelect.value, 'feet');
  assert.equal(scopeSelect.value, 'page');
  assert.equal(rangeInput.value, '');
  assert.equal(rangeField.style.display, 'none');
});

test('applyScopeRangeState reveals and focuses custom page range input', async () => {
  const calibration = await loadCalibrationController();
  const rangeField = { style: { display: 'none' } };
  const rangeInput = {};
  const focused = [];

  calibration.applyScopeRangeState({
    scope: 'custom',
    rangeField,
    rangeInput,
    rangeDisplayForScope: scope => scope === 'custom' ? 'grid' : 'none',
    focusLater: input => focused.push(input),
  });

  assert.equal(rangeField.style.display, 'grid');
  assert.deepEqual(focused, [rangeInput]);
});
