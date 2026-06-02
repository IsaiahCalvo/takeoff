import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebarView() {
  const source = await readFile(new URL('../src/app/sidebar-view.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sidebar-view.js' });
  return sandbox.window.TakeoffSidebarView;
}

test('measurementItemClass composes selected and unscaled classes consistently', async () => {
  const view = await loadSidebarView();

  assert.equal(view.measurementItemClass({ selected: false, isUnscaled: false }), 'meas-item');
  assert.equal(view.measurementItemClass({ selected: true, isUnscaled: false }), 'meas-item selected');
  assert.equal(view.measurementItemClass({ selected: true, isUnscaled: true }), 'meas-item selected unscaled');
});

test('buildMeasurementItemMarkup escapes names and keeps row controls in one template', async () => {
  const view = await loadSidebarView();
  const markup = view.buildMeasurementItemMarkup({
    color: '#b6ff3c',
    name: 'Run <A> & "B"',
    pointCount: 4,
    page: 3,
    onOtherPage: true,
    isUnscaled: true,
    lengthHtml: 'unscaled',
    measurementId: 12,
  });

  assert.match(markup, /<div class="row head">/);
  assert.match(markup, /style="background:#b6ff3c; color:#b6ff3c"/);
  assert.match(markup, /value="Run &lt;A&gt; &amp; &quot;B&quot;"/);
  assert.match(markup, /title="4 anchors · page 3"/);
  assert.match(markup, /title="No page scale; excluded from totals\."/);
  assert.match(markup, /input class="length"/);
  assert.match(markup, /aria-label="Length"/);
  assert.match(markup, /class="length-error"/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /readonly/);
  assert.match(markup, /data-id="12"/);
});

test('buildPathGroupMarkup renders Path summary, category, coverage, and total safely', async () => {
  const view = await loadSidebarView();
  const markup = view.buildPathGroupMarkup({
    color: '#36d399',
    displayName: 'Cat 6 <A>',
    categorySubtitle: 'Low Voltage & Data',
    runCountText: '2 runs',
    unscaledText: '1 unscaled excluded',
    pageCoverageText: 'P 1-3',
    totalText: '12.50',
    totalUnitText: 'ft',
  });

  assert.match(markup, /class="path-group-marker"/);
  assert.match(markup, /style="background:#36d399; color:#36d399"/);
  assert.match(markup, /Cat 6 &lt;A&gt;/);
  assert.match(markup, /Low Voltage &amp; Data/);
  assert.match(markup, /2 runs/);
  assert.match(markup, /P 1-3/);
  assert.match(markup, /1 unscaled excluded/);
  assert.match(markup, /<strong>12\.50<\/strong><span>ft<\/span>/);
});

test('buildCategoryHeaderMarkup renders category label and summary safely', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryHeaderMarkup({
    key: 'category:power',
    name: 'Power <Branch>',
    summaryText: '2 paths · 4 runs',
    totalText: '18.25',
    totalUnitText: 'ft',
  });

  assert.match(markup, /class="path-category-title">Power &lt;Branch&gt;<\/div>/);
  assert.match(markup, /class="path-category-summary">2 paths · 4 runs<\/span>/);
  assert.match(markup, /class="path-category-total"><strong>18\.25<\/strong><span>ft<\/span>/);
  assert.match(markup, /data-path-category-key="category:power"/);
  assert.match(markup, /data-next-visible="false"/);
  assert.match(markup, /aria-label="Hide Power &lt;Branch&gt; category"/);
});

test('buildCategoryHeaderMarkup renders understated hidden category controls', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryHeaderMarkup({
    key: 'category:low-voltage',
    name: 'Low Voltage',
    summaryText: '1 path · 1 run',
    categoryVisible: false,
    hiddenText: '1 hidden',
    totalText: '0.00',
    totalUnitText: 'ft',
  });

  assert.match(markup, /class="path-category-hidden">1 hidden<\/span>/);
  assert.match(markup, /data-next-visible="true"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /aria-label="Show Low Voltage category"/);
});

test('buildCategoryVisibilityToolbarMarkup renders bulk category visibility controls', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryVisibilityToolbarMarkup({
    totalCount: 2,
    hiddenCount: 1,
    canShowAll: true,
    canHideAll: true,
  });

  assert.match(markup, /class="path-category-visibility-status">1 hidden<\/span>/);
  assert.match(markup, /data-category-visibility-action="show-all"/);
  assert.match(markup, /data-category-visibility-action="hide-all"/);
  assert.doesNotMatch(markup, /disabled/);
});
