import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebar() {
  const [calibration, pathAggregation, sidebar] = await Promise.all([
    readFile(new URL('../src/calibration-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(calibration, sandbox, { filename: 'calibration-utils.js' });
  vm.runInContext(pathAggregation, sandbox, { filename: 'path-aggregation.js' });
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
    measurements: [...measurements, { id: 4, lengthInches: 12 }],
    currentPage: 1,
    sidebarTab: 'page',
    pageScales: { 1: 10 },
    unit: 'ft',
  });

  assert.deepEqual(plain(model.measurementsForTab.map(m => m.id)), [1, 2, 4]);
  assert.equal(model.totalLenText, '11.00');
  assert.equal(model.runCountText, '3 runs · 1 unscaled excluded');
  assert.equal(model.totalUnitText, 'ft');
  assert.deepEqual(plain(model.pathGroups.map(group => ({
    displayName: group.displayName,
    runCountText: group.runCountText,
    unscaledText: group.unscaledText,
    totalText: group.totalText,
    pageCoverageText: group.pageCoverageText,
    ids: group.measurements.map(measurement => measurement.id),
  }))), [{
    displayName: 'Legacy measurements',
    runCountText: '3 runs',
    unscaledText: '1 unscaled excluded',
    totalText: '11.00',
    pageCoverageText: 'P 1',
    ids: [1, 2, 4],
  }]);
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
  assert.deepEqual(plain(model.measurementsForTab.map(measurement => measurement.id)), [1, 2]);
  assert.equal(model.pathGroups.length, 1);
  assert.deepEqual(plain(model.categorySections), []);
});

test('buildSidebarModel groups all measurements by Path for all pages', async () => {
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
  assert.deepEqual(plain(model.pathGroups.map(group => ({
    displayName: group.displayName,
    ids: group.measurements.map(measurement => measurement.id),
    runCountText: group.runCountText,
    unscaledText: group.unscaledText,
    totalText: group.totalText,
    pageCoverageText: group.pageCoverageText,
  }))), [{
    displayName: 'Legacy measurements',
    ids: [1, 2, 3],
    runCountText: '3 runs',
    unscaledText: '1 unscaled excluded',
    totalText: '15.00',
    pageCoverageText: 'P 1-2',
  }]);
});

test('buildSidebarModel renders category sections from Path groups', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements: [
      {
        id: 'cat6-a',
        page: 1,
        lengthInches: 120,
        pathTemplateId: 'low-voltage',
        pathId: 'cat6',
        pathName: 'Cat 6',
        pathCategoryId: 'low-voltage',
        pathCategoryName: 'Low Voltage',
      },
      {
        id: 'fiber-a',
        page: 2,
        lengthInches: 60,
        pathTemplateId: 'low-voltage',
        pathId: 'fiber',
        pathName: 'Fiber',
        category: { id: 'low-voltage', name: 'Low Voltage' },
      },
      {
        id: 'legacy-a',
        page: 2,
        lengthInches: null,
      },
    ],
    currentPage: 1,
    sidebarTab: 'categories',
    pageCount: 2,
    unit: 'ft',
  });

  assert.equal(model.effectiveSidebarTab, 'categories');
  assert.equal(model.totalHeadingText, 'Categories Total');
  assert.deepEqual(plain(model.categorySections.map(section => ({
    name: section.name,
    summaryText: section.summaryText,
    groups: section.pathGroups.map(group => group.displayName),
  }))), [
    {
      name: 'Low Voltage',
      summaryText: '2 paths · 2 runs',
      groups: ['Cat 6', 'Fiber'],
    },
    {
      name: 'Legacy measurements',
      summaryText: '1 path · 1 run',
      groups: ['Legacy measurements'],
    },
  ]);
});

test('buildSidebarModel uses visible category totals while retaining hidden category counts', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements: [
      {
        id: 'cat6-a',
        page: 1,
        lengthInches: 120,
        pathTemplateId: 'low-voltage',
        pathId: 'cat6',
        pathName: 'Cat 6',
        pathCategoryId: 'low-voltage',
        pathCategoryName: 'Low Voltage',
      },
      {
        id: 'feeder-a',
        page: 1,
        lengthInches: 60,
        pathTemplateId: 'power',
        pathId: 'feeder',
        pathName: 'Feeder',
        pathCategoryId: 'power',
        pathCategoryName: 'Power',
      },
    ],
    currentPage: 1,
    sidebarTab: 'categories',
    pageCount: 2,
    unit: 'ft',
    pathCategoryVisibility: { 'category:low-voltage': false },
  });

  assert.equal(model.totalLenText, '5.00');
  assert.deepEqual(plain(model.categoryVisibilityControls), {
    totalCount: 2,
    hiddenCount: 1,
    visibleCount: 1,
    canShowAll: true,
    canHideAll: true,
  });
  assert.deepEqual(plain(model.categorySections.map(section => ({
    key: section.key,
    name: section.name,
    categoryVisible: section.categoryVisible,
    isVisible: section.isVisible,
    runCount: section.runCount,
    hiddenRunCount: section.hiddenRunCount,
    hiddenText: section.hiddenText,
    totalText: section.totalText,
    pathGroupTotals: section.pathGroups.map(group => group.totalText),
  }))), [
    {
      key: 'category:low-voltage',
      name: 'Low Voltage',
      categoryVisible: false,
      isVisible: false,
      runCount: 1,
      hiddenRunCount: 1,
      hiddenText: '1 hidden',
      totalText: '0.00',
      pathGroupTotals: ['0.00'],
    },
    {
      key: 'category:power',
      name: 'Power',
      categoryVisible: true,
      isVisible: true,
      runCount: 1,
      hiddenRunCount: 0,
      hiddenText: '',
      totalText: '5.00',
      pathGroupTotals: ['5.00'],
    },
  ]);
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
