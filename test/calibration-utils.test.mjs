import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadUtils() {
  const source = await readFile(new URL('../src/calibration-utils.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'calibration-utils.js' });
  return sandbox.window.TakeoffCalibrationUtils;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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

test('parsePageRange accepts lists, ranges, and clamps to document bounds', async () => {
  const utils = await loadUtils();

  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.parsePageRange('3, 1-2, 8-6, 99, nope', 8))),
    [1, 2, 3, 6, 7, 8],
  );
});

test('parsePageRange rejects empty and invalid selected groups', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.parsePageRange('', 8)), []);
  assert.deepEqual(plain(utils.parsePageRange('page two, 0, 12', 8)), []);
});

test('computePxPerInch converts a calibration line into pixels per inch', async () => {
  const utils = await loadUtils();
  const pxPerInch = utils.computePxPerInch([
    { x: 0, y: 0 },
    { x: 120, y: 0 },
  ], 10, 'ft', (a, b) => Math.hypot(a.x - b.x, a.y - b.y));

  assert.equal(pxPerInch, 1);
});

test('sameScalePdfEligibility rejects image uploads', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: null,
    pdfPages: 1,
    pageScales: { 1: 10 },
  })), {
    eligible: false,
    reason: 'not_pdf',
    missingPages: [],
    mismatchedPages: [],
    canonicalScale: null,
  });
});

test('sameScalePdfEligibility rejects single-page PDFs', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: {},
    pdfPages: 1,
    pageScales: { 1: 10 },
  })), {
    eligible: false,
    reason: 'single_page_pdf',
    missingPages: [],
    mismatchedPages: [],
    canonicalScale: null,
  });
});

test('sameScalePdfEligibility reports missing page calibrations', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: {},
    pdfPages: 4,
    pageScales: { 1: 10, 3: Infinity },
  })), {
    eligible: false,
    reason: 'missing_page_calibration',
    missingPages: [2, 3, 4],
    mismatchedPages: [],
    canonicalScale: null,
  });
});

test('sameScalePdfEligibility accepts multi-page PDFs with matching scales', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: {},
    pdfPages: 3,
    pageScales: { 1: 10, 2: 10, 3: 10 },
  })), {
    eligible: true,
    reason: 'eligible',
    missingPages: [],
    mismatchedPages: [],
    canonicalScale: 10,
  });
});

test('sameScalePdfEligibility reports mismatched page scales', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: {},
    pdfPages: 4,
    pageScales: { 1: 10, 2: 10.02, 3: 9.98, 4: 10 },
  })), {
    eligible: false,
    reason: 'mismatched_page_scale',
    missingPages: [],
    mismatchedPages: [2, 3],
    canonicalScale: 10,
  });
});

test('sameScalePdfEligibility treats tiny floating point scale differences as matching', async () => {
  const utils = await loadUtils();

  assert.deepEqual(plain(utils.sameScalePdfEligibility({
    pdf: {},
    pdfPages: 3,
    pageScales: { 1: 1000, 2: 1000.5, 3: 999.2 },
  })), {
    eligible: true,
    reason: 'eligible',
    missingPages: [],
    mismatchedPages: [],
    canonicalScale: 1000,
  });
});

test('applyScaleToPages updates page scales and recomputes page measurements', async () => {
  const utils = await loadUtils();
  const measurements = [
    { page: 1, lengthPx: 0 },
    { page: 2, lengthPx: 0 },
  ];
  const pageScales = {};

  utils.applyScaleToPages({
    measurements,
    pageScales,
    pages: [1],
    pxPerInch: 2,
    measureLengthPx: () => 24,
  });

  assert.deepEqual(pageScales, { 1: 2 });
  assert.equal(measurements[0].lengthPx, 24);
  assert.equal(measurements[0].lengthInches, 12);
  assert.equal(measurements[1].lengthPx, 0);
});

test('applyScaleToPages keeps copied calibration values independent from later source recalibration', async () => {
  const utils = await loadUtils();
  const sourceScale = 3.333333333;
  const measurements = [
    { page: 1, lengthPx: 0, lengthInches: 9 },
    { page: 2, lengthPx: 0, lengthInches: null },
    { page: 3, lengthPx: 0, lengthInches: null },
  ];
  const pageScales = { 1: sourceScale };
  const lengthPxByPage = { 1: 45, 2: 30, 3: 60 };
  const measureLengthPx = measurement => lengthPxByPage[measurement.page];

  utils.applyScaleToPages({
    measurements,
    pageScales,
    pages: [2, 3],
    pxPerInch: pageScales[1],
    measureLengthPx,
  });

  assert.equal(pageScales[2], sourceScale);
  assert.equal(pageScales[3], sourceScale);
  assert.equal(measurements[1].lengthInches, 30 / sourceScale);
  assert.equal(measurements[2].lengthInches, 60 / sourceScale);

  utils.applyScaleToPages({
    measurements,
    pageScales,
    pages: [1],
    pxPerInch: 5,
    measureLengthPx,
  });

  assert.equal(pageScales[1], 5);
  assert.equal(pageScales[2], sourceScale);
  assert.equal(pageScales[3], sourceScale);
  assert.equal(measurements[0].lengthInches, 9);
  assert.equal(measurements[1].lengthInches, 30 / sourceScale);
  assert.equal(measurements[2].lengthInches, 60 / sourceScale);
});

test('clearPageScale removes scale and marks page measurements unscaled', async () => {
  const utils = await loadUtils();
  const measurements = [
    { page: 1, lengthInches: 12 },
    { page: 2, lengthInches: 24 },
  ];
  const pageScales = { 1: 2, 2: 4 };

  utils.clearPageScale({ measurements, pageScales, page: 1 });

  assert.deepEqual(pageScales, { 2: 4 });
  assert.equal(measurements[0].lengthInches, null);
  assert.equal(measurements[1].lengthInches, 24);
});
