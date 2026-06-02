import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathAggregation() {
  const source = await readFile(new URL('../src/app/path-aggregation.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'path-aggregation.js' });
  return sandbox.window.TakeoffPathAggregation;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathMeasurement(overrides = {}) {
  return {
    id: 'run-1',
    name: 'Run 1',
    page: 1,
    color: '#36d399',
    drawType: 'line',
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    lengthPx: 120,
    lengthInches: 120,
    pathTemplateId: 'template-security',
    pathId: 'path-cat6',
    pathName: 'Cat 6',
    pathStyle: {
      stroke: { color: '#36d399', style: 'dashed' },
      anchors: { fill: '#ffffff', border: '#36d399', borderMatchesStroke: true },
    },
    ...overrides,
  };
}

test('groups the same Path identity across pages with run totals and coverage', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'run-1', page: 1, lengthInches: 120 }),
    pathMeasurement({ id: 'run-2', page: 2, name: 'Second run', lengthInches: 24 }),
  ], { units: ['in', 'ft'] });

  assert.equal(result.groupCount, 1);
  assert.equal(result.runCount, 2);
  assert.deepEqual(plain(result.pages), [1, 2]);
  assert.deepEqual(plain(result.pageCoverage), {
    pages: [1, 2],
    ranges: [{ start: 1, end: 2, label: '1-2' }],
    label: '1-2',
  });
  assert.deepEqual(plain(result.totalsByUnit), { in: 144, ft: 12 });

  const [group] = result.groups;
  assert.equal(group.id, 'path:template-security:path-cat6');
  assert.equal(group.key, 'path:template-security:path-cat6');
  assert.equal(group.kind, 'path');
  assert.equal(group.pathTemplateId, 'template-security');
  assert.equal(group.pathId, 'path-cat6');
  assert.equal(group.displayName, 'Cat 6');
  assert.equal(group.color, '#36d399');
  assert.deepEqual(plain(group.totalsByUnit), { in: 144, ft: 12 });
  assert.equal(group.runCount, 2);
  assert.equal(group.scaledRunCount, 2);
  assert.equal(group.unscaledRunCount, 0);
  assert.deepEqual(plain(group.pages), [1, 2]);
  assert.deepEqual(plain(group.pageCoverage.ranges), [{ start: 1, end: 2, label: '1-2' }]);
  assert.deepEqual(plain(group.runs.map(run => run.measurementId)), ['run-1', 'run-2']);
  assert.deepEqual(plain(group.runs[1].totalsByUnit), { in: 24, ft: 2 });
});

test('keeps different Path identities in separate groups', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'cat6-1', pathId: 'path-cat6', pathName: 'Cat 6', lengthInches: 12 }),
    pathMeasurement({ id: 'fiber-1', pathId: 'path-fiber', pathName: 'Fiber', lengthInches: 36 }),
    pathMeasurement({
      id: 'power-1',
      pathTemplateId: 'template-power',
      pathId: 'path-feeder',
      pathName: 'Feeder',
      lengthInches: 60,
    }),
  ], { units: ['ft'] });

  assert.deepEqual(plain(result.groups.map(group => group.key)), [
    'path:template-security:path-cat6',
    'path:template-security:path-fiber',
    'path:template-power:path-feeder',
  ]);
  assert.deepEqual(plain(result.groups.map(group => group.displayName)), ['Cat 6', 'Fiber', 'Feeder']);
  assert.deepEqual(plain(result.groups.map(group => group.totalsByUnit.ft)), [1, 3, 5]);
});

test('places measurements without full Path metadata into a stable legacy fallback group', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    { id: 'legacy-1', name: 'Legacy A', page: 1, color: '#aaa', lengthInches: 12 },
    { id: 'legacy-2', name: 'Legacy B', page: 3, color: '#bbb', lengthInches: null, pathTemplateId: 'template-only' },
  ], { units: ['ft'] });

  assert.equal(result.groupCount, 1);
  const [group] = result.groups;
  assert.equal(group.id, aggregation.LEGACY_PATH_GROUP_ID);
  assert.equal(group.key, aggregation.LEGACY_PATH_GROUP_ID);
  assert.equal(group.kind, 'legacy');
  assert.equal(group.isLegacy, true);
  assert.equal(group.pathTemplateId, null);
  assert.equal(group.pathId, null);
  assert.equal(group.displayName, 'Legacy measurements');
  assert.equal(group.runCount, 2);
  assert.equal(group.scaledRunCount, 1);
  assert.equal(group.unscaledRunCount, 1);
  assert.deepEqual(plain(group.totalsByUnit), { ft: 1 });
  assert.deepEqual(plain(group.runs.map(run => run.groupKey)), [
    aggregation.LEGACY_PATH_GROUP_ID,
    aggregation.LEGACY_PATH_GROUP_ID,
  ]);
});

test('computes mixed unit totals from scaled measurement lengths', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'run-1', lengthInches: 36 }),
    pathMeasurement({ id: 'run-2', lengthInches: 39.3700787 }),
    pathMeasurement({ id: 'unscaled', lengthInches: null }),
  ], { units: ['ft', 'yd', 'm', 'cm'] });

  const [group] = result.groups;
  assert.equal(group.scaledRunCount, 2);
  assert.equal(group.unscaledRunCount, 1);
  assert.equal(Number(group.totalsByUnit.ft.toFixed(6)), 6.28084);
  assert.equal(Number(group.totalsByUnit.yd.toFixed(6)), 2.093613);
  assert.equal(Number(group.totalsByUnit.m.toFixed(4)), 1.9144);
  assert.equal(Number(group.totalsByUnit.cm.toFixed(2)), 191.44);
  assert.deepEqual(plain(group.runs[2].totalsByUnit), {});
});

test('passes through measurement visibility flags without owning visibility state', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'visible-run', visible: true, hidden: false, categoryHidden: false }),
    pathMeasurement({ id: 'hidden-run', visible: false, hidden: true, categoryHidden: true }),
  ]);

  const [group] = result.groups;
  assert.equal(group.visibleRunCount, 1);
  assert.equal(group.hiddenRunCount, 1);
  assert.equal(group.hasHiddenRuns, true);
  assert.deepEqual(plain(group.runs.map(run => ({
    measurementId: run.measurementId,
    visible: run.visible,
    hidden: run.hidden,
    categoryHidden: run.categoryHidden,
    visibility: run.visibility,
  }))), [
    {
      measurementId: 'visible-run',
      visible: true,
      hidden: false,
      categoryHidden: false,
      visibility: { visible: true, hidden: false, categoryHidden: false },
    },
    {
      measurementId: 'hidden-run',
      visible: false,
      hidden: true,
      categoryHidden: true,
      visibility: { visible: false, hidden: true, categoryHidden: true },
    },
  ]);
});

test('passes category metadata through runs and path groups', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({
      id: 'cat6-a',
      pathCategoryId: 'low-voltage',
      pathCategoryName: 'Low Voltage',
    }),
    pathMeasurement({
      id: 'cat6-b',
      category: { id: 'low-voltage', name: 'Low Voltage' },
    }),
    pathMeasurement({
      id: 'cat6-c',
      category: 'Security',
    }),
  ]);

  const [group] = result.groups;
  assert.equal(group.categoryId, 'low-voltage');
  assert.equal(group.categoryName, 'Low Voltage');
  assert.equal(group.categoryKey, 'category:low-voltage');
  assert.equal(group.hasMixedCategories, true);
  assert.deepEqual(plain(group.categories), [
    { key: 'category:low-voltage', id: 'low-voltage', name: 'Low Voltage' },
    { key: 'category-name:Security', id: null, name: 'Security' },
  ]);
  assert.deepEqual(plain(group.runs.map(run => ({
    measurementId: run.measurementId,
    categoryId: run.categoryId,
    categoryName: run.categoryName,
    categoryKey: run.categoryKey,
  }))), [
    {
      measurementId: 'cat6-a',
      categoryId: 'low-voltage',
      categoryName: 'Low Voltage',
      categoryKey: 'category:low-voltage',
    },
    {
      measurementId: 'cat6-b',
      categoryId: 'low-voltage',
      categoryName: 'Low Voltage',
      categoryKey: 'category:low-voltage',
    },
    {
      measurementId: 'cat6-c',
      categoryId: null,
      categoryName: 'Security',
      categoryKey: 'category-name:Security',
    },
  ]);
});

test('builds sorted page coverage ranges from numeric pages', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'run-5', page: 5 }),
    pathMeasurement({ id: 'run-1', page: 1 }),
    pathMeasurement({ id: 'run-2', page: 2 }),
    pathMeasurement({ id: 'run-4', page: 4 }),
    pathMeasurement({ id: 'run-7', page: 7 }),
  ]);

  const [group] = result.groups;
  assert.deepEqual(plain(group.pages), [1, 2, 4, 5, 7]);
  assert.deepEqual(plain(group.pageCoverage), {
    pages: [1, 2, 4, 5, 7],
    ranges: [
      { start: 1, end: 2, label: '1-2' },
      { start: 4, end: 5, label: '4-5' },
      { start: 7, end: 7, label: '7' },
    ],
    label: '1-2, 4-5, 7',
  });
});

test('normalizes invalid measurement pages to the app page fallback', async () => {
  const aggregation = await loadPathAggregation();

  const result = aggregation.buildPathRunGroups([
    pathMeasurement({ id: 'run-zero', page: 0 }),
    pathMeasurement({ id: 'run-negative', page: -2 }),
    pathMeasurement({ id: 'run-fraction', page: 2.5 }),
    pathMeasurement({ id: 'run-valid', page: 3 }),
  ], { pages: [0, 1, 2.5, 3] });

  const [group] = result.groups;
  assert.deepEqual(plain(result.pages), [1, 3]);
  assert.deepEqual(plain(group.runs.map(run => [run.measurementId, run.page])), [
    ['run-zero', 1],
    ['run-negative', 1],
    ['run-fraction', 1],
    ['run-valid', 3],
  ]);
});

test('does not mutate measurement input objects or reuse mutable Path style snapshots', async () => {
  const aggregation = await loadPathAggregation();
  const measurements = [
    pathMeasurement({ id: 'run-1' }),
    pathMeasurement({ id: 'run-2', lengthInches: 24 }),
  ];
  const before = plain(measurements);

  const result = aggregation.buildPathRunGroups(measurements);
  result.groups[0].pathStyle.stroke.color = '#ff0000';
  result.groups[0].runs[0].pathStyle.stroke.color = '#0000ff';

  assert.deepEqual(plain(measurements), before);
  assert.notEqual(result.groups[0].pathStyle, measurements[0].pathStyle);
  assert.notEqual(result.groups[0].runs[0].pathStyle, measurements[0].pathStyle);
});
