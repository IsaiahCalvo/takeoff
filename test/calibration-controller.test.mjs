import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCalibrationController() {
  const source = await readFile(new URL('../src/app/calibration-controller.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, setTimeout: fn => fn() };
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

function createSelect() {
  return {
    value: '',
    textContent: 'stale',
    children: [],
    listeners: {},
    ownerDocument: {
      createElement(tagName) {
        return {
          tagName,
          value: '',
          textContent: '',
          dataset: {},
        };
      },
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createElement(extra = {}) {
  const { classList } = createClassList();
  const element = {
    value: '',
    textContent: '',
    disabled: false,
    hidden: false,
    className: '',
    type: '',
    children: [],
    attributes: {},
    dataset: {},
    listeners: {},
    classList,
    ownerDocument: {
      createElement(tagName) {
        return createElement({ tagName });
      },
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    focus() {
      this.focused = true;
    },
    click() {
      if (this.listeners.click) this.listeners.click({ target: this });
    },
    contains(target) {
      return target === this;
    },
    ...extra,
  };
  return element;
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

test('applyCalibrationSourceState hides compact mode and configures copied calibration mode', async () => {
  const calibration = await loadCalibrationController();
  const sourceField = { hidden: false };
  const sourceInput = createElement();
  const sourceCombo = createElement();
  const sourceDisplay = createElement();
  const sourceOptionsEl = createElement();
  const sourceTitle = createElement();
  const sourceScale = createElement();
  const sourceCount = createElement();
  const sourceHelper = { hidden: false, textContent: 'stale' };
  const valueInput = { value: '', disabled: false };
  const unitSelect = { disabled: false };
  const okButton = { disabled: false, textContent: '' };

  calibration.applyCalibrationSourceState({
    sourceField,
    sourceInput,
    sourceCombo,
    sourceDisplay,
    sourceOptionsEl,
    sourceTitle,
    sourceScale,
    sourceCount,
    sourceHelper,
    valueInput,
    unitSelect,
    okButton,
    options: [{ value: 'new', label: 'New calibration', page: null, helper: '' }],
    selectedValue: 'new',
    isPositiveCalibrationValue: value => Number(value) > 0,
  });

  assert.equal(sourceField.hidden, true);
  assert.equal(valueInput.disabled, false);
  assert.equal(unitSelect.disabled, false);
  assert.equal(okButton.textContent, 'Set Scale');
  assert.equal(okButton.disabled, true);
  assert.equal(sourceInput.value, 'new');
  assert.equal(sourceTitle.textContent, 'New calibration');
  assert.equal(sourceScale.hidden, true);
  assert.equal(sourceCount.hidden, true);
  assert.equal(sourceHelper.hidden, true);

  calibration.applyCalibrationSourceState({
    sourceField,
    sourceInput,
    sourceCombo,
    sourceDisplay,
    sourceOptionsEl,
    sourceTitle,
    sourceScale,
    sourceCount,
    sourceHelper,
    valueInput,
    unitSelect,
    okButton,
    options: [
      { value: 'new', label: 'New calibration', page: null, helper: '' },
      {
        value: 'scale:2',
        label: 'Page 1 (1 ft = 24.00 px)',
        pageLabel: 'Page 1',
        scaleLabel: '1 ft = 24.00 px',
        pageCountLabel: '1 page',
        page: 1,
        pages: [1],
        helper: 'Uses the scale from this page.',
      },
    ],
    selectedValue: 'scale:2',
    isPositiveCalibrationValue: value => Number(value) > 0,
  });

  assert.equal(sourceField.hidden, false);
  assert.equal(sourceOptionsEl.children.length, 2);
  assert.equal(sourceOptionsEl.children[1].dataset.sourceValue, 'scale:2');
  assert.equal(sourceInput.value, 'scale:2');
  assert.equal(sourceTitle.textContent, 'Page 1');
  assert.equal(sourceScale.textContent, '1 ft = 24.00 px');
  assert.equal(sourceScale.hidden, false);
  assert.equal(sourceCount.textContent, '1 page');
  assert.equal(sourceCount.hidden, false);
  assert.equal(valueInput.disabled, true);
  assert.equal(unitSelect.disabled, true);
  assert.equal(okButton.textContent, 'Match Scale');
  assert.equal(okButton.disabled, false);
  assert.equal(sourceHelper.hidden, false);
  assert.equal(sourceHelper.textContent, 'Uses the scale from this page.');
});

test('createCalibrationModal copies selected source scale to target pages and records history', async () => {
  const calibration = await loadCalibrationController();
  const options = ['this', 'all', 'custom'].map(createScopeOption);
  const elements = {
    calibModal: createElement(),
    calibValue: createElement(),
    calibOk: createElement(),
    calibUnit: createElement({ value: 'ft' }),
    calibSourceField: createElement({ hidden: true }),
    calibSource: createElement({ value: 'new' }),
    calibSourceCombo: createElement(),
    calibSourceDisplay: createElement(),
    calibSourceOptions: createElement(),
    calibSourceTitle: createElement(),
    calibSourceScale: createElement(),
    calibSourceCount: createElement(),
    calibSourceHelper: createElement({ hidden: true }),
    calibScope: createElement({ value: 'this' }),
    calibScopeCombo: createElement(),
    calibScopeDisplay: createElement(),
    calibScopeOptions: createElement({
      querySelectorAll() {
        return options;
      },
    }),
    calibScopeMenu: createElement(),
    calibRange: createElement(),
    calibCancel: createElement(),
  };
  const state = {
    pageScales: { 1: 2, 3: 4 },
    measurements: [
      { page: 2, lengthPx: 0, lengthInches: null },
      { page: 3, lengthPx: 0, lengthInches: null },
      { page: 1, lengthPx: 0, lengthInches: 30 },
    ],
    unit: 'ft',
    pxPerInch: null,
    inProgress: null,
  };
  const histories = [];
  const statuses = [];
  const workflow = {
    initialModalState: unit => ({ value: '', unit, scope: 'this', range: '' }),
    calibrationSourceOptions: () => [
      { value: 'new', page: null, pxPerInch: null, label: 'New calibration', helper: '' },
      {
        value: 'scale:2',
        page: 1,
        pages: [1],
        pxPerInch: 2,
        label: 'Page 1 (1 ft = 24.00 px)',
        pageLabel: 'Page 1',
        scaleLabel: '1 ft = 24.00 px',
        pageCountLabel: '1 page',
        helper: 'Uses the scale from this page.',
      },
      {
        value: 'scale:4',
        page: 3,
        pages: [3],
        pxPerInch: 4,
        label: 'Page 3 (1 ft = 48.00 px)',
        pageLabel: 'Page 3',
        scaleLabel: '1 ft = 48.00 px',
        pageCountLabel: '1 page',
        helper: 'Uses the scale from this page.',
      },
    ],
    scopeLabel: scope => `scope:${scope}`,
    isPositiveCalibrationValue: value => Number(value) > 0,
    sanitizeCalibrationValueInput: value => value,
    sanitizePageRangeInput: value => value,
    calibrationValueNumber: value => Number(value),
    resolveTargetPages: () => ({ pages: [2, 3], error: null }),
  };
  const modal = calibration.createCalibrationModal({
    root: createElement(),
    getElement: id => elements[id],
    state,
    workflow,
    unitToInch: () => 12,
    currentPage: () => 2,
    totalPages: () => 3,
    parsePageRange: () => [],
    computePxPerInch: () => {
      throw new Error('copied calibration should not compute a new scale');
    },
    distancePx: () => 0,
    applyScaleToPages({ measurements, pageScales, pages, pxPerInch, measureLengthPx }) {
      for (const page of pages) {
        pageScales[page] = pxPerInch;
        for (const measurement of measurements) {
          if (measurement.page !== page) continue;
          measurement.lengthPx = measureLengthPx(measurement);
          measurement.lengthInches = measurement.lengthPx / pxPerInch;
        }
      }
    },
    measureLengthPx: measurement => measurement.page === 3 ? 36 : 24,
    createHistorySnapshot: () => ({ pageScales: { ...state.pageScales } }),
    recordHistory: (snapshot, label) => histories.push({ snapshot, label }),
    updateScaleLabel() {},
    updatePageLabel() {},
    setMode(mode) {
      state.mode = mode;
    },
    renderList() {},
    redraw() {},
    showStatus(message) {
      statuses.push(message);
    },
    alertUser() {},
    focusLater() {},
  });

  modal.open({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  elements.calibSourceOptions.listeners.click({ target: elements.calibSourceOptions.children[1] });

  assert.equal(elements.calibValue.disabled, true);
  assert.equal(elements.calibUnit.disabled, true);
  assert.equal(elements.calibOk.textContent, 'Match Scale');

  elements.calibValue.value = '10';
  elements.calibSourceOptions.listeners.click({ target: elements.calibSourceOptions.children[0] });
  assert.equal(elements.calibValue.disabled, false);
  assert.equal(elements.calibUnit.disabled, false);
  assert.equal(elements.calibOk.disabled, false);

  elements.calibSourceOptions.listeners.click({ target: elements.calibSourceOptions.children[1] });
  elements.calibOk.click();

  assert.equal(state.pageScales[2], 2);
  assert.equal(state.pageScales[3], 2);
  assert.equal(state.measurements[0].lengthInches, 12);
  assert.equal(state.measurements[1].lengthInches, 18);
  assert.equal(state.measurements[2].lengthInches, 30);
  assert.equal(state.pxPerInch, 2);
  assert.equal(state.inProgress, null);
  assert.equal(state.mode, 'measure');
  assert.deepEqual(histories, [{
    snapshot: { pageScales: { 1: 2, 3: 4 } },
    label: 'scale match',
  }]);
  assert.deepEqual(statuses, ['Scale matched on 2 pages from Page 1.']);
});
