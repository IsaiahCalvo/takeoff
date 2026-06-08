import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadAverageFixtureSandbox() {
  const [calibration, pathAggregation, sidebar, fixture] = await Promise.all([
    readFile(new URL('../src/calibration-utils.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/average-qa-fixture.js', import.meta.url), 'utf8'),
  ]);
  const sandbox = {
    URLSearchParams,
    window: {
      location: { search: '' },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(calibration, sandbox, { filename: 'calibration-utils.js' });
  vm.runInContext(pathAggregation, sandbox, { filename: 'path-aggregation.js' });
  vm.runInContext(sidebar, sandbox, { filename: 'sidebar.js' });
  vm.runInContext(fixture, sandbox, { filename: 'average-qa-fixture.js' });
  return sandbox.window;
}

test('average QA fixture only activates for averages QA routes', async () => {
  const takeoff = await loadAverageFixtureSandbox();
  const fixture = takeoff.TakeoffAverageQaFixture;

  assert.equal(fixture.shouldUseAverageQaFixture('?qa=averages-1780943898831'), true);
  assert.equal(fixture.shouldUseAverageQaFixture('?qa=other'), false);
  assert.equal(fixture.shouldUseAverageQaFixture(''), false);
});

test('average QA fixture produces page, document, and category averages', async () => {
  const takeoff = await loadAverageFixtureSandbox();
  const measurements = takeoff.TakeoffAverageQaFixture.createAverageQaMeasurements();
  const sidebar = takeoff.TakeoffSidebar;

  assert.equal(measurements.length, 12);
  assert.equal(measurements.reduce((sum, measurement) => sum + measurement.lengthInches / 12, 0).toFixed(2), '154.22');

  const pageModel = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'page',
    pageCount: 3,
    unit: 'ft',
    pathCategoryVisibility: {},
    collapsedPageGroups: {},
  });
  assert.equal(pageModel.totalLenText, '18.09');
  assert.equal(pageModel.runCountText, '3 runs');
  assert.equal(pageModel.averageText, 'Avg/run 6.03 ft');

  const allModel = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'all',
    pageCount: 3,
    unit: 'ft',
    pathCategoryVisibility: {},
    collapsedPageGroups: {},
  });
  assert.equal(allModel.totalLenText, '154.22');
  assert.equal(allModel.runCountText, '12 runs');
  assert.equal(allModel.averageText, 'Avg/page 51.41 ft');
  assert.deepEqual(plain(allModel.pageSections.map(section => section.averageText)), [
    'Avg/run 6.03 ft',
    'Avg/run 15.40 ft',
    'Avg/run 14.78 ft',
  ]);

  const categoryModel = sidebar.buildSidebarModel({
    measurements,
    currentPage: 1,
    sidebarTab: 'categories',
    pageCount: 3,
    unit: 'ft',
    pathCategoryVisibility: {},
    collapsedPageGroups: {},
  });
  assert.equal(categoryModel.averageText, 'Avg/run 12.85 ft');
  assert.equal(categoryModel.categorySections.length, 1);
  assert.equal(categoryModel.categorySections[0].summaryText, '12 runs');
  assert.equal(categoryModel.categorySections[0].averageText, 'Avg/run 12.85 ft');
  assert.equal(categoryModel.categorySections[0].totalText, '154.22');
});
