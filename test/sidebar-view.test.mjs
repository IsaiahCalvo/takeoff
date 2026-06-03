import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadSidebarView({ renderer = null } = {}) {
  const source = await readFile(new URL('../src/app/sidebar-view.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  if (renderer) sandbox.window.TakeoffPathStyleRenderer = renderer;
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
    pathCategorySubtitle: 'Cat 6 & Data',
    pathStyle: {
      stroke: { color: '#36d399', style: 'dashed' },
      anchors: { fill: '#ffffff', border: '#36d399' },
    },
  });

  assert.match(markup, /<div class="row head">/);
  assert.match(markup, /class="measurement-path-icon"/);
  assert.match(markup, /style="--path-color:#b6ff3c"/);
  assert.match(markup, /<svg viewBox="0 0 100 100"/);
  assert.match(markup, /d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26"/);
  assert.doesNotMatch(markup, /class="swatch"/);
  assert.doesNotMatch(markup, /style="background:/);
  assert.match(markup, /value="Run &lt;A&gt; &amp; &quot;B&quot;"/);
  assert.match(markup, /class="measurement-category">Cat 6 &amp; Data<\/span>/);
  assert.match(markup, /title="4 anchors · page 3"/);
  assert.match(markup, /title="No page scale; excluded from totals\."/);
  assert.match(markup, /input class="length"/);
  assert.match(markup, /aria-label="Length"/);
  assert.match(markup, /class="length-error"/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /readonly/);
  assert.doesNotMatch(markup, /measurement-category-toggle/);
  assert.doesNotMatch(markup, /data-path-category-key/);
  assert.doesNotMatch(markup, /class="path-category-bulb"/);
  assert.doesNotMatch(markup, />Visible</);
  assert.doesNotMatch(markup, />Hidden</);
  assert.match(markup, /class="run-details-action"/);
  assert.match(markup, /data-run-details-action="open"/);
  assert.match(markup, /aria-label="Add Run Details"/);
  assert.match(markup, /data-id="12"/);
});

test('buildMeasurementItemMarkup marks rows with saved Run Details compactly', async () => {
  const view = await loadSidebarView();
  const markup = view.buildMeasurementItemMarkup({
    color: '#b6ff3c',
    name: 'Detailed run',
    pointCount: 2,
    lengthValue: '8.00',
    lengthUnit: 'ft',
    measurementId: 42,
    detailsPresent: true,
  });

  assert.match(markup, /class="run-details-action has-details"/);
  assert.match(markup, /data-measurement-id="42"/);
  assert.match(markup, /aria-label="Edit Run Details\. Details saved\."/);
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
    settingsAvailable: true,
    settingsLabel: 'Path Settings for Cat 6 <A>',
  });

  assert.match(markup, /class="path-group-marker"/);
  assert.match(markup, /style="--path-color:#36d399"/);
  assert.match(markup, /<svg viewBox="0 0 100 100"/);
  assert.match(markup, /class="path-category-icon-diagonal"/);
  assert.match(markup, /d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26"/);
  assert.match(markup, /cx="18" cy="74" r="12"/);
  assert.match(markup, /cx="82" cy="26" r="12"/);
  assert.doesNotMatch(markup, /viewBox="0 0 16 16"/);
  assert.doesNotMatch(markup, /cx="9" cy="4"/);
  assert.match(markup, /Cat 6 &lt;A&gt;/);
  assert.match(markup, /Low Voltage &amp; Data/);
  assert.match(markup, /2 runs/);
  assert.match(markup, /P 1-3/);
  assert.match(markup, /1 unscaled excluded/);
  assert.match(markup, /<strong>12\.50<\/strong><span>ft<\/span>/);
  assert.match(markup, /class="path-group-settings"/);
  assert.match(markup, /data-path-settings-action="open"/);
  assert.match(markup, /aria-label="Path Settings for Cat 6 &lt;A&gt;"/);
  assert.doesNotMatch(markup, /title="Path Settings"/);
});

test('buildPageGroupMarkup renders page dropdown summary safely', async () => {
  const view = await loadSidebarView();
  const markup = view.buildPageGroupMarkup({
    page: 3,
    title: 'Page <3>',
    runCountText: '2 runs',
    unscaledText: '1 unscaled excluded',
    hiddenText: '1 hidden',
    totalText: '12.50',
    totalUnitText: 'ft',
    collapsed: true,
  });

  assert.match(markup, /class="page-group-toggle"/);
  assert.match(markup, /data-page-group-toggle/);
  assert.match(markup, /data-page-group-page="3"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="page-group-runs-3"/);
  assert.match(markup, /class="page-group-chevron"/);
  assert.match(markup, /M4\.5 7\.5 8 11l3\.5-3\.5/);
  assert.match(markup, /class="page-group-title">Page &lt;3&gt;<\/span>/);
  assert.match(markup, /class="page-group-total"><strong>12\.50<\/strong><span>ft<\/span>/);
  assert.match(markup, /2 runs/);
  assert.match(markup, /1 unscaled excluded/);
  assert.match(markup, /1 hidden/);
  assert.doesNotMatch(markup, /class="path-group-marker"/);
});

test('buildCategoryHeaderMarkup renders category label and summary safely', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryHeaderMarkup({
    key: 'category:power',
    name: 'Power <Branch>',
    summaryText: '2 paths · 4 runs',
    totalText: '18.25',
    totalUnitText: 'ft',
    color: '#36d399',
    iconKind: 'template',
  });

  assert.match(markup, /class="path-category-icon path-category-icon-template"/);
  assert.match(markup, /style="--path-color:#36d399"/);
  assert.match(markup, /<svg viewBox="0 0 100 100"/);
  assert.match(markup, /class="path-category-icon-diagonal"/);
  assert.match(markup, /d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26"/);
  assert.match(markup, /cx="18" cy="74" r="12"/);
  assert.match(markup, /cx="82" cy="26" r="12"/);
  assert.match(markup, /class="tail"/);
  assert.match(markup, /class="anchor-dot"/);
  assert.match(markup, /class="path-category-title">Power &lt;Branch&gt;<\/span>/);
  assert.match(markup, /class="path-category-summary">2 paths · 4 runs<\/span>/);
  assert.match(markup, /class="path-category-total"><strong>18\.25<\/strong><span>ft<\/span>/);
  assert.match(markup, /class="path-category-status" aria-hidden="true"/);
  assert.match(markup, /class="path-category-bulb"/);
  assert.match(markup, /M14\.5 19\.5H9\.5/);
  assert.match(markup, /M12\.7857 8\.5L10\.6429 11\.5H13\.6429L11\.5 14\.5/);
  assert.match(markup, /data-next-visible="false"/);
  assert.match(markup, /aria-label="Hide Power &lt;Branch&gt; category"/);
  assert.doesNotMatch(markup, /title="/);
  assert.doesNotMatch(markup, />Visible</);
  assert.doesNotMatch(markup, />Hidden</);
});

test('buildCategoryHeaderMarkup uses custom Path style artwork for template rows', async () => {
  const view = await loadSidebarView({
    renderer: {
      renderPathStylePreviewSvg(style) {
        return `<svg data-rendered-path-style="${style.stroke.style}" data-stroke="${style.stroke.color}" data-anchor-fill="${style.anchors.fill}" data-anchor-border="${style.anchors.border}"></svg>`;
      },
    },
  });
  const markup = view.buildCategoryHeaderMarkup({
    key: 'category-path:path%3Adefault%3Acat6',
    name: 'Cat6',
    summaryText: '1 path · 1 run',
    totalText: '12.50',
    totalUnitText: 'ft',
    color: '#36d399',
    iconKind: 'template',
    pathStyle: {
      stroke: { color: '#ff5500', style: 'dashed' },
      anchors: { fill: '#101820', border: '#f7f7f7' },
    },
  });

  assert.match(markup, /class="path-category-icon path-category-icon-template"/);
  assert.match(markup, /data-rendered-path-style="dashed"/);
  assert.match(markup, /data-stroke="#ff5500"/);
  assert.match(markup, /data-anchor-fill="#101820"/);
  assert.match(markup, /data-anchor-border="#f7f7f7"/);
  assert.doesNotMatch(markup, /d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26"/);
});

test('template category icons do not counter-rotate the angled SVG artwork', async () => {
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');

  assert.doesNotMatch(styles, /\.path-category-icon-template svg\s*\{[^}]*transform:/s);
});

test('buildCategoryHeaderMarkup renders approved hidden category icon styling', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryHeaderMarkup({
    key: 'category:low-voltage',
    name: 'Low Voltage',
    summaryText: '1 path · 1 run',
    categoryVisible: false,
    hiddenText: '1 hidden',
    totalText: '0.00',
    totalUnitText: 'ft',
    color: '#59d6ff',
    iconKind: 'manual',
  });

  assert.match(markup, /class="path-category-icon path-category-icon-manual hidden-icon"/);
  assert.match(markup, /style="--path-color:#59d6ff"/);
  assert.match(markup, /class="path-category-square"/);
  assert.match(markup, /class="path-category-status off" aria-hidden="true"/);
  assert.match(markup, /class="path-category-bulb"/);
  assert.doesNotMatch(markup, /M12\.7857 8\.5L10\.6429 11\.5H13\.6429L11\.5 14\.5/);
  assert.doesNotMatch(markup, /#f00|#ff0000|red/i);
  assert.match(markup, /class="path-category-hidden">1 hidden<\/span>/);
  assert.match(markup, /data-next-visible="true"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /aria-label="Show Low Voltage category"/);
  assert.doesNotMatch(markup, />Visible</);
  assert.doesNotMatch(markup, />Hidden</);
});

test('buildCategoryVisibilityToolbarMarkup renders one bulk light bulb toggle', async () => {
  const view = await loadSidebarView();
  const markup = view.buildCategoryVisibilityToolbarMarkup({
    totalCount: 2,
    hiddenCount: 1,
    canShowAll: true,
    canHideAll: true,
  });
  const allVisibleMarkup = view.buildCategoryVisibilityToolbarMarkup({
    totalCount: 2,
    hiddenCount: 0,
    canShowAll: false,
    canHideAll: true,
  });

  assert.match(markup, /class="path-category-visibility-status">1 hidden<\/span>/);
  assert.match(markup, /data-category-visibility-action="show-all"/);
  assert.match(markup, /class="path-category-bulk-toggle path-category-status off"/);
  assert.match(markup, /aria-label="Show all categories"/);
  assert.match(markup, /class="path-category-bulb"/);
  assert.doesNotMatch(markup, /data-category-visibility-action="hide-all"/);
  assert.doesNotMatch(markup, /M2\.5 12s3\.5-6 9\.5-6/);
  assert.doesNotMatch(markup, /m4 4 16 16/);
  assert.doesNotMatch(markup, /disabled/);

  assert.match(allVisibleMarkup, /class="path-category-visibility-status">All visible<\/span>/);
  assert.match(allVisibleMarkup, /data-category-visibility-action="hide-all"/);
  assert.match(allVisibleMarkup, /class="path-category-bulk-toggle path-category-status"/);
  assert.match(allVisibleMarkup, /aria-label="Hide all categories"/);
  assert.match(allVisibleMarkup, /M12\.7857 8\.5L10\.6429 11\.5H13\.6429L11\.5 14\.5/);
  assert.doesNotMatch(allVisibleMarkup, /data-category-visibility-action="show-all"/);
});
