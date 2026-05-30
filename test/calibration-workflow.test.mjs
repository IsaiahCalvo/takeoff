import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCalibrationWorkflow() {
  const source = await readFile(new URL('../src/app/calibration-workflow.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'calibration-workflow.js' });
  return sandbox.window.TakeoffCalibrationWorkflow;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('initialModalState resets calibration modal values for the active unit', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.deepEqual(plain(workflow.initialModalState('m')), {
    value: '',
    unit: 'm',
    scope: 'this',
    range: '',
  });
});

test('labels the compact apply scope combo options', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.equal(workflow.scopeLabel('this'), 'Apply to the current page');
  assert.equal(workflow.scopeLabel('all'), 'Apply to all pages');
  assert.equal(workflow.scopeLabel('custom'), 'Apply to a selected group of pages');
  assert.equal(workflow.scopeLabel('unknown'), 'Apply to the current page');
});

test('sanitizes and validates positive calibration values', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.equal(workflow.sanitizeCalibrationValueInput('12a.3.4ft'), '12.34');
  assert.equal(workflow.sanitizeCalibrationValueInput('000'), '');
  assert.equal(workflow.isPositiveCalibrationValue('0'), false);
  assert.equal(workflow.isPositiveCalibrationValue('0.25'), true);
  assert.equal(workflow.isPositiveCalibrationValue('abc'), false);
});

test('sanitizes selected page ranges to numbers, commas, spaces, and dashes', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.equal(workflow.sanitizePageRangeInput('1, page 3 - 5; 7'), '1,  3 - 5 7');
});

test('resolves target pages for this page, all pages, and custom ranges', async () => {
  const workflow = await loadCalibrationWorkflow();
  const parsePageRange = (text, totalPages) => text === '2-3' && totalPages === 4 ? [2, 3] : [];

  assert.deepEqual(plain(workflow.resolveTargetPages({
    scope: 'this',
    currentPage: 2,
    totalPages: 4,
    rangeText: '',
    parsePageRange,
  })), { pages: [2], error: null });
  assert.deepEqual(plain(workflow.resolveTargetPages({
    scope: 'all',
    currentPage: 2,
    totalPages: 4,
    rangeText: '',
    parsePageRange,
  })), { pages: [1, 2, 3, 4], error: null });
  assert.deepEqual(plain(workflow.resolveTargetPages({
    scope: 'custom',
    currentPage: 2,
    totalPages: 4,
    rangeText: '2-3',
    parsePageRange,
  })), { pages: [2, 3], error: null });
  assert.deepEqual(plain(workflow.resolveTargetPages({
    scope: 'custom',
    currentPage: 2,
    totalPages: 4,
    rangeText: 'bad',
    parsePageRange,
  })), { pages: [], error: 'empty-custom-range' });
});

test('resolves selected page groups through the supplied range parser', async () => {
  const workflow = await loadCalibrationWorkflow();
  const calls = [];
  const parsePageRange = (text, totalPages) => {
    calls.push({ text, totalPages });
    return text === '1, 3-4' && totalPages === 5 ? [1, 3, 4] : [];
  };

  assert.deepEqual(plain(workflow.resolveTargetPages({
    scope: 'custom',
    currentPage: 2,
    totalPages: 5,
    rangeText: '1, 3-4',
    parsePageRange,
  })), { pages: [1, 3, 4], error: null });
  assert.deepEqual(calls, [{ text: '1, 3-4', totalPages: 5 }]);
});

test('omits copied calibration sources when only the current page is calibrated', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.deepEqual(plain(workflow.calibrationSourceOptions({
    pageScales: { 1: 5, 2: 0, 3: Infinity },
    currentPage: 1,
    unit: 'ft',
    unitToInch: unit => unit === 'ft' ? 12 : 1,
  })), [{
    value: 'new',
    page: null,
    pxPerInch: null,
    label: 'New calibration',
    helper: '',
  }]);
});

test('builds copied calibration source options from other calibrated pages', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.deepEqual(plain(workflow.calibrationSourceOptions({
    pageScales: { 1: 2, 2: 4, 4: 0, 5: Infinity, 3: 3 },
    currentPage: 2,
    unit: 'ft',
    unitToInch: unit => unit === 'ft' ? 12 : 1,
  })), [
    {
      value: 'new',
      page: null,
      pxPerInch: null,
      label: 'New calibration',
      helper: '',
    },
    {
      value: 'page:1',
      page: 1,
      pxPerInch: 2,
      label: 'Page 1 (1 ft = 24.00 px)',
      helper: "Uses Page 1's scale: 1 ft = 24.00 px.",
    },
    {
      value: 'page:3',
      page: 3,
      pxPerInch: 3,
      label: 'Page 3 (1 ft = 36.00 px)',
      helper: "Uses Page 3's scale: 1 ft = 36.00 px.",
    },
  ]);
});
