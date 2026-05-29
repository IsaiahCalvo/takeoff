import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebar() {
  const [calibration, sidebar] = await Promise.all([
    readFile(new URL('../public/calibration-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/sidebar.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(calibration, sandbox, { filename: 'calibration-utils.js' });
  vm.runInContext(sidebar, sandbox, { filename: 'sidebar.js' });
  return sandbox.window.TakeoffSidebar;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const measurements = [
  { id: 1, page: 1, lengthInches: 120 },
  { id: 2, page: 1, lengthInches: null },
  { id: 3, page: 2, lengthInches: 60 },
];

test('buildSidebarModel summarizes the current page tab', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'page',
    pageScales: { 1: 10 },
    unit: 'ft',
  });

  assert.deepEqual(plain(model.measurementsForTab.map(m => m.id)), [1, 2]);
  assert.equal(model.totalLenText, '10.00');
  assert.equal(model.runCountText, '2 runs · 1 unscaled excluded');
  assert.equal(model.totalUnitText, 'ft');
});

test('buildSidebarModel simplifies single-page documents without scope tabs', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements: measurements.filter(measurement => measurement.page === 1),
    currentPage: 1,
    sidebarTab: 'all',
    pageScales: { 1: 10 },
    collapsedPageGroups: {},
    pageCount: 1,
    unit: 'ft',
  });

  assert.equal(model.effectiveSidebarTab, 'page');
  assert.equal(model.showScopeTabs, false);
  assert.equal(model.totalHeadingText, 'Total');
  assert.deepEqual(plain(model.pageGroups), []);
  assert.deepEqual(plain(model.measurementsForTab.map(measurement => measurement.id)), [1, 2]);
});

test('buildSidebarModel groups all measurements by page with page totals', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'all',
    pageScales: { 1: 10 },
    collapsedPageGroups: {},
    pageCount: 2,
    unit: 'ft',
  });

  assert.equal(model.totalLenText, '15.00');
  assert.equal(model.runCountText, '3 runs · 1 unscaled excluded');
  assert.equal(model.effectiveSidebarTab, 'all');
  assert.equal(model.showScopeTabs, true);
  assert.equal(model.totalHeadingText, 'Grand Total');
  assert.deepEqual(plain(model.pageGroups.map(group => ({
    page: group.page,
    ids: group.measurements.map(measurement => measurement.id),
    collapsed: group.collapsed,
    hasScale: group.hasScale,
    pageTotalText: group.pageTotalText,
    excludedText: group.excludedText,
  }))), [
    {
      page: 1,
      ids: [1, 2],
      collapsed: true,
      hasScale: true,
      pageTotalText: '10.00 ft',
      excludedText: ' · 1 unscaled excluded',
    },
    {
      page: 2,
      ids: [3],
      collapsed: true,
      hasScale: false,
      pageTotalText: '5.00 ft',
      excludedText: '',
    },
  ]);
});

test('buildSidebarModel marks collapsed all-page groups without dropping totals', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'all',
    pageScales: { 1: 10 },
    collapsedPageGroups: { 1: false },
    pageCount: 2,
    unit: 'ft',
  });

  assert.equal(model.pageGroups[0].page, 1);
  assert.equal(model.pageGroups[0].collapsed, false);
  assert.equal(model.pageGroups[0].measurementCount, 2);
  assert.equal(model.pageGroups[0].pageTotalText, '10.00 ft');
  assert.equal(model.pageGroups[1].collapsed, true);
});

test('shouldSelectMeasurementFromSidebarClick allows readonly title clicks to select rows', async () => {
  const sidebar = await loadSidebar();

  assert.equal(sidebar.shouldSelectMeasurementFromSidebarClick({
    tagName: 'INPUT',
    hasAttribute(name) { return name === 'readonly'; },
    classList: { contains: () => false },
  }), true);

  assert.equal(sidebar.shouldSelectMeasurementFromSidebarClick({
    tagName: 'INPUT',
    hasAttribute() { return false; },
    classList: { contains: () => false },
  }), false);

  assert.equal(sidebar.shouldSelectMeasurementFromSidebarClick({
    tagName: 'BUTTON',
    hasAttribute() { return false; },
    classList: { contains: className => className === 'del' },
  }), false);
});

test('escapeHtml encodes text inserted into sidebar HTML', async () => {
  const sidebar = await loadSidebar();

  assert.equal(sidebar.escapeHtml(`A&B <Run> "1"`), 'A&amp;B &lt;Run&gt; &quot;1&quot;');
});
