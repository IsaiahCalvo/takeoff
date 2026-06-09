import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadCalibrationWorkflow() {
  const [decimalSource, source] = await Promise.all([
    readFile(new URL('../src/app/decimal-input.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/calibration-workflow.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(decimalSource, sandbox, { filename: 'decimal-input.js' });
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
  assert.equal(workflow.sanitizeCalibrationValueInput('00'), '0.0');
  assert.equal(workflow.sanitizeCalibrationValueInput('000'), '0.00');
  assert.equal(workflow.sanitizeCalibrationValueInput('05'), '0.5');
  assert.equal(workflow.sanitizeCalibrationValueInput('000.05'), '0.0005');
  assert.equal(workflow.isPositiveCalibrationValue('0'), false);
  assert.equal(workflow.isPositiveCalibrationValue('0.00'), false);
  assert.equal(workflow.isPositiveCalibrationValue('0.25'), true);
  assert.equal(workflow.isPositiveCalibrationValue('0.5'), true);
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

  assert.equal(workflow.pageRangeText([1, 2, 3, 5, 8, 9]), '1-3,5,8-9');
  assert.equal(workflow.pageRangeLabel([1, 3]), 'Pages 1,3');

  assert.deepEqual(plain(workflow.calibrationSourceOptions({
    pageScales: { 1: 5, 2: 0, 3: Infinity },
    currentPage: 1,
    unit: 'ft',
    unitToInch: unit => unit === 'ft' ? 12 : 1,
  })), [{
    value: 'new',
    page: null,
    pages: [],
    pxPerInch: null,
    label: 'New calibration',
    pageLabel: 'New calibration',
    scaleLabel: '',
    pageCountLabel: '',
    helper: '',
  }]);
});

test('groups copied calibration source options by unique calibration scale', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.deepEqual(plain(workflow.calibrationSourceOptions({
    pageScales: { 1: 2, 2: 2, 3: 3, 4: 0, 5: Infinity, 6: 2, 8: 3, 9: 3 },
    currentPage: 4,
    unit: 'ft',
    unitToInch: unit => unit === 'ft' ? 12 : 1,
  })), [
    {
      value: 'new',
      page: null,
      pages: [],
      pxPerInch: null,
      label: 'New calibration',
      pageLabel: 'New calibration',
      scaleLabel: '',
      pageCountLabel: '',
      helper: '',
    },
    {
      value: 'scale:2',
      page: 1,
      pages: [1, 2, 6],
      pxPerInch: 2,
      label: 'Pages 1-2,6 (Saved scale)',
      pageLabel: 'Pages 1-2,6',
      scaleLabel: 'Saved scale',
      pageCountLabel: '3 pages',
      helper: 'Uses the scale from these pages.',
    },
    {
      value: 'scale:3',
      page: 3,
      pages: [3, 8, 9],
      pxPerInch: 3,
      label: 'Pages 3,8-9 (Saved scale)',
      pageLabel: 'Pages 3,8-9',
      scaleLabel: 'Saved scale',
      pageCountLabel: '3 pages',
      helper: 'Uses the scale from these pages.',
    },
  ]);
});

test('labels copied calibration sources with the original reference distance when available', async () => {
  const workflow = await loadCalibrationWorkflow();

  assert.deepEqual(plain(workflow.calibrationSourceOptions({
    pageScales: { 1: 1, 2: 1 },
    pageScaleReferences: {
      1: { value: 10, unit: 'yd', distancePx: 360 },
      2: { value: 10, unit: 'yd', distancePx: 360 },
    },
    currentPage: 3,
    unit: 'ft',
    unitToInch: unit => unit === 'yd' ? 36 : 12,
  }))[1], {
    value: 'scale:1',
    page: 1,
    pages: [1, 2],
    pxPerInch: 1,
    label: 'Pages 1-2 (10 yd = 360.00 px)',
    pageLabel: 'Pages 1-2',
    scaleLabel: '10 yd = 360.00 px',
    pageCountLabel: '2 pages',
    helper: 'Uses the scale from these pages.',
    reference: { value: 10, unit: 'yd', distancePx: 360 },
  });
});

test('groups copied calibration sources with the same tolerance used for continuous scroll', async () => {
  const workflow = await loadCalibrationWorkflow();
  const options = workflow.calibrationSourceOptions({
    pageScales: { 1: 1000, 2: 1000.5, 3: 999.2 },
    currentPage: 4,
    unit: 'ft',
    unitToInch: unit => unit === 'ft' ? 12 : 1,
  });

  assert.equal(options.length, 2);
  assert.deepEqual(plain(options[1].pages), [1, 2, 3]);
  assert.equal(options[1].pageLabel, 'Pages 1-3');
  assert.equal(options[1].pageCountLabel, '3 pages');
});
