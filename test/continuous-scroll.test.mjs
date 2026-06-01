import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadContinuousScroll() {
  const source = await readFile(new URL('../src/app/continuous-scroll.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'continuous-scroll.js' });
  return sandbox.window.TakeoffContinuousScroll;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('controlModel hides continuous scroll outside multi-page PDFs', async () => {
  const continuous = await loadContinuousScroll();

  assert.deepEqual(plain(continuous.controlModel({
    state: { pdf: null, pdfPages: 1, continuousScrollMode: false },
    eligibility: { eligible: false, reason: 'not_pdf' },
  })), {
    visible: false,
    enabled: false,
    active: false,
    title: 'Continuous scroll needs a multi-page PDF.',
    ariaLabel: 'Continuous scroll needs a multi-page PDF.',
    ariaPressed: 'false',
  });

  assert.equal(continuous.controlModel({
    state: { pdf: {}, pdfPages: 1, continuousScrollMode: false },
    eligibility: { eligible: false, reason: 'single_page_pdf' },
  }).visible, false);
});

test('controlModel disables multi-page PDFs with helper-derived reasons', async () => {
  const continuous = await loadContinuousScroll();

  assert.deepEqual(plain(continuous.controlModel({
    state: { pdf: {}, pdfPages: 4, continuousScrollMode: false },
    eligibility: { eligible: false, reason: 'missing_page_calibration', missingPages: [2, 4] },
  })), {
    visible: true,
    enabled: false,
    active: false,
    title: 'Calibrate pages 2 and 4 to use continuous scroll.',
    ariaLabel: 'Calibrate pages 2 and 4 to use continuous scroll.',
    ariaPressed: 'false',
  });

  assert.equal(continuous.controlModel({
    state: { pdf: {}, pdfPages: 4, continuousScrollMode: true },
    eligibility: { eligible: false, reason: 'mismatched_page_scale', mismatchedPages: [3] },
  }).title, 'Match calibration on page 3 to use continuous scroll.');
});

test('controlModel enables and reflects requested continuous scroll mode', async () => {
  const continuous = await loadContinuousScroll();

  assert.deepEqual(plain(continuous.controlModel({
    state: { pdf: {}, pdfPages: 3, continuousScrollMode: false },
    eligibility: { eligible: true, reason: 'eligible' },
  })), {
    visible: true,
    enabled: true,
    active: false,
    title: 'Use continuous scroll',
    ariaLabel: 'Use continuous scroll',
    ariaPressed: 'false',
  });

  assert.deepEqual(plain(continuous.controlModel({
    state: { pdf: {}, pdfPages: 3, continuousScrollMode: true },
    eligibility: { eligible: true, reason: 'eligible' },
  })), {
    visible: true,
    enabled: true,
    active: true,
    title: 'Return to single-page view',
    ariaLabel: 'Return to single-page view',
    ariaPressed: 'true',
  });
});

test('controlModel labels grouped continuous availability from the current page group', async () => {
  const continuous = await loadContinuousScroll();

  assert.deepEqual(plain(continuous.controlModel({
    state: { pdf: {}, pdfPages: 8, continuousScrollMode: false },
    eligibility: { eligible: true, reason: 'eligible', pages: [5, 6, 7, 8], wholeDocument: false },
  })), {
    visible: true,
    enabled: true,
    active: false,
    title: 'Use continuous scroll for pages 5-8',
    ariaLabel: 'Use continuous scroll for pages 5-8',
    ariaPressed: 'false',
  });

  assert.equal(continuous.controlModel({
    state: { pdf: {}, pdfPages: 8, continuousScrollMode: false },
    eligibility: { eligible: false, reason: 'single_page_scale_group', mismatchedPages: [4] },
  }).title, 'Continuous scroll needs adjacent pages with the same scale.');
});

test('exitReason explains why active continuous scroll was turned off', async () => {
  const continuous = await loadContinuousScroll();

  assert.equal(
    continuous.exitReason({ reason: 'missing_page_calibration', missingPages: [3] }),
    'Continuous scroll turned off because page 3 has no scale.',
  );
  assert.equal(
    continuous.exitReason({ reason: 'mismatched_page_scale', mismatchedPages: [2] }),
    'Continuous scroll turned off because page scales no longer match.',
  );
});

test('applyEligibilityExit clears continuous state and keeps the nearest PDF page', async () => {
  const continuous = await loadContinuousScroll();
  const state = {
    pdf: {},
    pdfPages: 4,
    pdfPage: 1,
    continuousScrollMode: true,
    continuousPageLayout: { pages: [{ page: 1 }] },
  };

  const result = continuous.applyEligibilityExit({
    state,
    eligibility: { eligible: false, reason: 'missing_page_calibration', missingPages: [3] },
    page: 3,
  });

  assert.deepEqual(plain(result), {
    exited: true,
    page: 3,
    reason: 'Continuous scroll turned off because page 3 has no scale.',
  });
  assert.equal(state.continuousScrollMode, false);
  assert.equal(state.continuousPageLayout, null);
  assert.equal(state.pdfPage, 3);
});
