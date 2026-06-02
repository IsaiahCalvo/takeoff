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
  assert.match(markup, /readonly/);
  assert.match(markup, /data-id="12"/);
});

test('buildPageHeaderMarkup keeps page label, status, info, and jump actions distributed', async () => {
  const view = await loadSidebarView();
  const markup = view.buildPageHeaderMarkup({
    page: 2,
    collapsed: true,
    hasScale: false,
    scaleText: 'No scale',
    excludedTitle: '2 unscaled excluded on page 2',
    tooltipId: 'page-info-2',
  });

  assert.match(markup, /class="collapse-toggle"/);
  assert.match(markup, /Page <strong>2<\/strong>/);
  assert.match(markup, /page-status page-status-scale no-scale/);
  assert.match(markup, /aria-label="2 unscaled excluded on page 2"/);
  assert.match(markup, /class="jump" data-page="2"/);
  assert.equal(view.collapseIconPath(true), 'M4.5 3 7.5 6 4.5 9');
  assert.equal(view.collapseIconPath(false), 'M2.5 4.5 6 8l3.5-3.5');
});
