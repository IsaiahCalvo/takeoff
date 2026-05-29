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

function createClassList() {
  const classes = new Set();
  return {
    classes,
    classList: {
      toggle(name, value) {
        const enabled = typeof value === 'boolean' ? value : !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

function createScopeOption(scope) {
  const { classes, classList } = createClassList();
  return {
    dataset: { scope },
    classList,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    classes,
  };
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
  const modalClasses = new Set();
  const modal = {
    classList: {
      toggle(name, value) {
        if (value) modalClasses.add(name);
        else modalClasses.delete(name);
      },
    },
  };
  const valueInput = { value: 'stale' };
  const okButton = { disabled: false };
  const unitSelect = { value: '' };
  const scopeInput = { value: '' };
  const comboClass = createClassList();
  const scopeCombo = { classList: comboClass.classList, dataset: {} };
  const scopeDisplay = { textContent: '' };
  const menuButton = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const options = ['this', 'all', 'custom'].map(createScopeOption);
  const scopeOptions = {
    querySelectorAll() {
      return options;
    },
  };
  const rangeInput = {
    value: '2-3',
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };

  calibration.applyModalState({
    modal,
    valueInput,
    okButton,
    unitSelect,
    scopeInput,
    scopeCombo,
    scopeDisplay,
    scopeOptions,
    menuButton,
    rangeInput,
    modalState: { value: '', unit: 'feet', scope: 'this', range: '' },
    isPositiveCalibrationValue: value => Number(value) > 0,
    labelForScope: scope => `label:${scope}`,
  });

  assert.equal(modalClasses.has('show'), true);
  assert.equal(valueInput.value, '');
  assert.equal(okButton.disabled, true);
  assert.equal(unitSelect.value, 'feet');
  assert.equal(scopeInput.value, 'this');
  assert.equal(scopeCombo.dataset.scope, 'this');
  assert.equal(comboClass.classes.has('custom'), false);
  assert.equal(scopeDisplay.textContent, 'label:this');
  assert.equal(menuButton.attributes['aria-expanded'], 'false');
  assert.equal(rangeInput.value, '');
  assert.equal(rangeInput.disabled, true);
  assert.equal(rangeInput.attributes['aria-hidden'], 'true');
  assert.equal(options[0].attributes['aria-checked'], 'true');
  assert.equal(options[2].classes.has('active'), false);
});

test('applyScopeComboState turns the same control into a focused custom page range input', async () => {
  const calibration = await loadCalibrationController();
  const scopeInput = { value: '' };
  const comboClass = createClassList();
  const scopeCombo = { classList: comboClass.classList, dataset: {} };
  const scopeDisplay = { textContent: '' };
  const menuButton = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const options = ['this', 'all', 'custom'].map(createScopeOption);
  const scopeOptions = {
    querySelectorAll() {
      return options;
    },
  };
  const rangeInput = {
    disabled: true,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const focused = [];

  calibration.applyScopeComboState({
    scope: 'custom',
    scopeInput,
    scopeCombo,
    scopeDisplay,
    scopeOptions,
    menuButton,
    rangeInput,
    labelForScope: scope => `label:${scope}`,
    focusLater: input => focused.push(input),
  });

  assert.equal(scopeInput.value, 'custom');
  assert.equal(scopeCombo.dataset.scope, 'custom');
  assert.equal(comboClass.classes.has('custom'), true);
  assert.equal(scopeDisplay.textContent, 'label:custom');
  assert.equal(rangeInput.disabled, false);
  assert.equal(rangeInput.attributes['aria-hidden'], 'false');
  assert.equal(options[2].attributes['aria-checked'], 'true');
  assert.equal(options[2].classes.has('active'), true);
  assert.equal(menuButton.attributes['aria-expanded'], 'false');
  assert.deepEqual(focused, [rangeInput]);
});
