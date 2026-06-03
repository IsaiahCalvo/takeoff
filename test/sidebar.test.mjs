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

test('buildSidebarModel keeps This Page and Categories tabs for single-page documents', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements: measurements.filter(measurement => measurement.page === 1),
    currentPage: 1,
    sidebarTab: 'categories',
    pageScales: { 1: 10 },
    collapsedPageGroups: {},
    pageCount: 1,
    unit: 'ft',
  });

  assert.equal(model.effectiveSidebarTab, 'categories');
  assert.equal(model.showScopeTabs, true);
  assert.deepEqual(plain(model.availableScopeTabs), ['page', 'categories']);
  assert.equal(model.totalHeadingText, 'Categories Total');
  assert.equal(model.pathGroups.length, 1);
  assert.equal(model.categorySections.length, 1);
});

test('buildSidebarModel groups all measurements by page for all pages', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'all',
    pageScales: { 1: 10 },
    collapsedPageGroups: { 2: true },
    pageCount: 2,
    unit: 'ft',
  });

  assert.equal(model.totalLenText, '15.00');
  assert.equal(model.runCountText, '3 runs · 1 unscaled excluded');
  assert.equal(model.effectiveSidebarTab, 'all');
  assert.equal(model.showScopeTabs, true);
  assert.equal(model.totalHeadingText, 'Grand Total');
  assert.deepEqual(plain(model.pageSections.map(section => ({
    page: section.page,
    title: section.title,
    ids: section.measurements.map(measurement => measurement.id),
    runCountText: section.runCountText,
    unscaledText: section.unscaledText,
    hiddenText: section.hiddenText,
    totalText: section.totalText,
    totalUnitText: section.totalUnitText,
    collapsed: section.collapsed,
  }))), [{
    page: 1,
    title: 'Page 1',
    ids: [1, 2],
    runCountText: '2 runs',
    unscaledText: '1 unscaled excluded',
    hiddenText: '',
    totalText: '10.00',
    totalUnitText: 'ft',
    collapsed: false,
  }, {
    page: 2,
    title: 'Page 2',
    ids: [3],
    runCountText: '1 run',
    unscaledText: '',
    hiddenText: '',
    totalText: '5.00',
    totalUnitText: 'ft',
    collapsed: true,
  }]);
});

test('buildSidebarModel renders template Path names and uncategorized sections without nested Path groups', async () => {
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
        id: 'uncategorized-path-a',
        page: 1,
        lengthInches: 48,
        pathTemplateId: 'default',
        pathId: 'path',
        pathName: 'Branch Feeder',
        pathStyle: {
          stroke: { color: '#ff5500', style: 'dashed' },
          anchors: { fill: '#101820', border: '#f7f7f7' },
        },
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
  assert.deepEqual(plain(model.categoryVisibilityControls), {
    totalCount: 3,
    hiddenCount: 0,
    visibleCount: 3,
    canShowAll: false,
    canHideAll: true,
  });
  assert.deepEqual(plain(model.categorySections.map(section => ({
    key: section.key,
    name: section.name,
    summaryText: section.summaryText,
    color: section.color,
    pathStyle: section.pathStyle,
    pathGroups: section.pathGroups,
    groups: section.pathGroups.map(group => group.displayName),
  }))), [
    {
      key: 'category:low-voltage',
      name: 'Low Voltage',
      summaryText: '2 paths · 2 runs',
      color: '#7d8a91',
      pathStyle: null,
      pathGroups: [],
      groups: [],
    },
    {
      key: 'category-path:path%3Adefault%3Apath',
      name: 'Branch Feeder',
      summaryText: '1 path · 1 run',
      color: '#ff5500',
      pathStyle: {
        stroke: { color: '#ff5500', style: 'dashed' },
        anchors: { fill: '#101820', border: '#f7f7f7' },
      },
      pathGroups: [],
      groups: [],
    },
    {
      key: 'category-path:legacy%3Apath',
      name: 'Uncategorized',
      summaryText: '1 path · 1 run',
      color: '#7d8a91',
      pathStyle: null,
      pathGroups: [],
      groups: [],
    },
  ]);
});

test('buildSidebarModel labels id-only categories with the category id', async () => {
  const sidebar = await loadSidebar();
  const model = sidebar.buildSidebarModel({
    measurements: [
      {
        id: 'security-a',
        page: 1,
        lengthInches: 72,
        pathTemplateId: 'systems',
        pathId: 'security-path',
        pathName: 'Security Path',
        pathCategoryId: 'security',
      },
    ],
    currentPage: 1,
    sidebarTab: 'categories',
    pageCount: 2,
    unit: 'ft',
  });

  assert.deepEqual(plain(model.categorySections.map(section => ({
    key: section.key,
    name: section.name,
    summaryText: section.summaryText,
  }))), [
    {
      key: 'category:security',
      name: 'security',
      summaryText: '1 path · 1 run',
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
  assert.equal(model.totalHeadingText, 'Visible Total');
  assert.equal(model.showEntireTotal, true);
  assert.equal(model.entireTotalText, 'Total: 15.00 ft');
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
    pathGroupCount: section.pathGroups.length,
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
      pathGroupCount: 0,
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
      pathGroupCount: 0,
    },
  ]);
});

test('buildSidebarModel page sections use visible totals and hidden counts', async () => {
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
        page: 2,
        lengthInches: 60,
        pathTemplateId: 'power',
        pathId: 'feeder',
        pathName: 'Feeder',
        pathCategoryId: 'power',
        pathCategoryName: 'Power',
      },
    ],
    currentPage: 1,
    sidebarTab: 'all',
    pageCount: 2,
    unit: 'ft',
    pathCategoryVisibility: { 'category:low-voltage': false },
  });

  assert.equal(model.totalLenText, '5.00');
  assert.equal(model.showEntireTotal, true);
  assert.deepEqual(plain(model.pageSections.map(section => ({
    page: section.page,
    title: section.title,
    runCountText: section.runCountText,
    hiddenText: section.hiddenText,
    totalText: section.totalText,
    ids: section.measurements.map(measurement => measurement.id),
  }))), [
    {
      page: 1,
      title: 'Page 1',
      runCountText: '1 run',
      hiddenText: '1 hidden',
      totalText: '0.00',
      ids: ['cat6-a'],
    },
    {
      page: 2,
      title: 'Page 2',
      runCountText: '1 run',
      hiddenText: '',
      totalText: '5.00',
      ids: ['feeder-a'],
    },
  ]);
});

test('buildSidebarModel marks hidden This Page rows without category visibility controls', async () => {
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
        pathHidden: true,
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
    sidebarTab: 'page',
    pageCount: 2,
    unit: 'ft',
    pathCategoryVisibility: { 'category:low-voltage': false },
  });

  assert.deepEqual(plain(model.measurementRowsForTab.map(row => ({
    id: row.measurement.id,
    pathCategorySubtitle: row.pathCategorySubtitle,
    pathVisibilityHidden: row.pathVisibilityHidden,
  }))), [
    {
      id: 'cat6-a',
      pathCategorySubtitle: 'Low Voltage',
      pathVisibilityHidden: true,
    },
    {
      id: 'feeder-a',
      pathCategorySubtitle: 'Power',
      pathVisibilityHidden: false,
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

  assert.equal(sidebar.shouldSelectMeasurementFromSidebarClick({
    tagName: 'BUTTON',
    hasAttribute() { return false; },
    classList: { contains: className => className === 'run-details-action' },
  }), false);

  assert.equal(sidebar.shouldSelectMeasurementFromSidebarClick({
    tagName: 'BUTTON',
    hasAttribute() { return false; },
    classList: { contains: () => false },
    closest(selector) { return selector === '[data-path-category-key]' ? this : null; },
  }), false);
});

test('escapeHtml encodes text inserted into sidebar HTML', async () => {
  const sidebar = await loadSidebar();

  assert.equal(sidebar.escapeHtml(`A&B <Run> "1"`), 'A&amp;B &lt;Run&gt; &quot;1&quot;');
});
