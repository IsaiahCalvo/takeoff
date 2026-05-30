import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function readIndexAndSidebarView() {
  const [html, main, sidebarView, sidebarController, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sidebar-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8'),
  ]);
  return { html, main, sidebarView, sidebarController, styles, source: `${html}\n${main}\n${sidebarView}\n${sidebarController}\n${styles}` };
}

test('index uses relative local asset paths for GitHub Pages subpath deploys', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const rootRelativeRefs = [...html.matchAll(/\b(?:src|href)=["']\/(?!\/)|url\(["']?\/(?!\/)/g)]
    .map(match => match[0]);

  assert.deepEqual(rootRelativeRefs, []);
});

test('index keeps app shell styles in an external stylesheet', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\.\/app\/styles\.css" \/>/);
  assert.doesNotMatch(html, /<style>/);
});

test('index delegates app startup to one module entrypoint', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script src="src\/app\/pointer-controller\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>\s*pdfjsLib\.GlobalWorkerOptions/);
  assert.match(main, /import '\.\/export-utils\.js';/);
  assert.match(main, /import '\.\/app\/pointer-controller\.js';/);
  assert.match(main, /const pdfjsLib = window\.pdfjsLib;/);
});

test('index stays a small app shell instead of owning app logic', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const lineCount = html.trimEnd().split('\n').length;

  assert.equal(lineCount < 350, true, `index.html has ${lineCount} lines`);
  assert.doesNotMatch(html, /function loadFile\(/);
  assert.doesNotMatch(html, /function renderList\(/);
  assert.doesNotMatch(html, /addEventListener\('mousedown'/);
});

test('main runtime stays below the current coordination ceiling', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const lineCount = main.trimEnd().split('\n').length;

  assert.equal(lineCount < 2400, true, `src/main.js has ${lineCount} lines`);
  assert.doesNotMatch(main, /function downloadBytes\(/);
  assert.doesNotMatch(main, /function positionToolTip\(/);
  assert.match(main, /TakeoffPointerWorkflow/);
  assert.match(main, /TakeoffExportController/);
  assert.match(main, /TakeoffCalibrationController/);
  assert.match(main, /TakeoffSidebarController/);
});

test('vite builds bundled assets with relative paths for GitHub Pages', async () => {
  const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

  assert.match(config, /base:\s*['"]\.\/['"]/);
});

test('run summary text is owned by the dynamic counter', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<span id="runCount">[^<]*<\/span>\s+runs/);
});

test('calibration apply scope uses one compact combo row', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8');
  const menuRule = styles.match(/\.calib-scope-menu\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /id="calibScopeCombo"/);
  assert.match(html, /id="calibScopeMenu"[^>]+aria-expanded="false"/);
  assert.match(html, />Apply to the current page<\/button>/);
  assert.match(html, />Apply to all pages<\/button>/);
  assert.match(html, />Apply to a selected group of pages<\/button>/);
  assert.doesNotMatch(html, /id="calibRangeField"/);
  assert.match(styles, /\.calib-scope-combo\.custom input\[type=text\]\.calib-scope-range\s*\{\s*display:\s*block;/);
  assert.match(styles, /\.calib-scope-menu::before/);
  assert.match(menuRule, /justify-content:\s*center/);
});

test('measure mode menu uses Line and Freehand product wording', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, />Line<\/button>/);
  assert.match(html, />Freehand<\/button>/);
  assert.doesNotMatch(html, /Free hand|Bezier|Bézier|spline|polyline/);
});

test('freehand completion keeps the app in measure mode', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const finishFreehand = main.match(/function finishFreehandMeasurement\(\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(finishFreehand, /function finishFreehandMeasurement/);
  assert.doesNotMatch(finishFreehand, /setMode\('selection'\)/);
});

test('single-page documents remove scope chrome entirely', async () => {
  const { html, styles, source } = await readIndexAndSidebarView();
  const hiddenRule = styles.match(/\.tabs\[hidden\]\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /<div id="scopeTabs" class="tabs">/);
  assert.match(source, /function documentPageCount\(\)/);
  assert.match(source, /function updateSidebarScopeChrome\(model\)/);
  assert.match(source, /scopeTabs\.hidden = !model\.showScopeTabs;/);
  assert.match(source, /totalHeading\.textContent = model\.totalHeadingText;/);
  assert.match(hiddenRule, /display:\s*none !important/);
  assert.doesNotMatch(html, /singleScopeTitle/);
  assert.doesNotMatch(html, /single-scope-title/);
  assert.doesNotMatch(html, /scopeTitle/);
  assert.match(styles, /content:\s*'Nothing measured yet\.'/);
  assert.doesNotMatch(html, /No runs measured yet\./);
});

test('all-pages collapse toggle uses the left-rail svg chevron style', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const collapseToggleRule = styles.match(/\.page-group \.collapse-toggle\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /class="collapse-toggle-icon"/);
  assert.match(source, /M4\.5 3 7\.5 6 4\.5 9/);
  assert.match(source, /M2\.5 4\.5 6 8l3\.5-3\.5/);
  assert.doesNotMatch(source, /&#9656;|&#9662;/);
  assert.match(collapseToggleRule, /display:\s*inline-flex/);
  assert.match(collapseToggleRule, /align-items:\s*center/);
});

test('all-pages page group header keeps its label left aligned', async () => {
  const { styles } = await readIndexAndSidebarView();
  const pageHeaderRule = styles.match(/\.page-group \.page-header\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = styles.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = styles.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageHeaderRule, /display:\s*flex/);
  assert.match(pageHeaderRule, /text-align:\s*left/);
  assert.match(pageLabelRule, /flex:\s*1 1 auto/);
  assert.match(pageActionsRule, /margin-left:\s*auto/);
});

test('all-pages page group keeps page controls left and scale/info/go right', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const pageGroupRule = styles.match(/\.page-group\s*\{[^}]+\}/)?.[0] || '';
  const pageHeaderRule = styles.match(/\.page-group \.page-header\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = styles.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = styles.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';
  const pageStatusRule = styles.match(/\.page-group \.page-status\s*\{[^}]+\}/)?.[0] || '';
  const pageInfoRule = styles.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageGroupRule, /margin:\s*0 0 6px/);
  assert.match(pageHeaderRule, /min-height:\s*31px/);
  assert.match(pageHeaderRule, /gap:\s*4px/);
  assert.doesNotMatch(source, /class="page-meta"/);
  assert.match(source, /class="page-actions"/);
  assert.match(source, /class="page-status page-status-scale/);
  assert.match(source, /class="page-info"/);
  assert.match(source, /const excludedTitle = excludedText \? `\$\{excludedText\} on page \$\{group\.page\}` : '';/);
  assert.match(source, /aria-label="\$\{escapeHtml\(excludedTitle\)\}"/);
  assert.match(pageLabelRule, /white-space:\s*nowrap/);
  assert.match(pageLabelRule, /font-size:\s*10px/);
  assert.match(pageActionsRule, /margin-left:\s*auto/);
  assert.match(pageActionsRule, /justify-content:\s*flex-end/);
  assert.match(pageActionsRule, /display:\s*inline-flex/);
  assert.doesNotMatch(pageStatusRule, /grid-area:\s*scale/);
  assert.match(pageStatusRule, /font-size:\s*7px/);
  assert.match(pageStatusRule, /padding:\s*1px 4px/);
  assert.match(pageStatusRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(pageInfoRule, /grid-area:\s*info/);
});

test('all-pages page group nests full-width child runs under each page', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const childrenRule = styles.match(/\.page-group \.page-children\s*\{[^}]+\}/)?.[0] || '';
  const childrenInnerRule = styles.match(/\.page-group \.page-children-inner\s*\{[^}]+\}/)?.[0] || '';
  const openChildrenInnerRule = styles.match(/\.page-group\.open \.page-children-inner\s*\{[^}]+\}/)?.[0] || '';
  const collapsedChildrenRule = styles.match(/\.page-group\.collapsed \.page-children\s*\{[^}]+\}/)?.[0] || '';
  const childItemRule = styles.match(/\.page-group \.meas-item\s*\{[^}]+\}/)?.[0] || '';
  const childRowRule = styles.match(/\.page-group \.meas-item \.row\s*\{[^}]+\}/)?.[0] || '';
  const itemRule = styles.match(/\n\s*\.meas-item\s*\{[^}]+\}/)?.[0] || '';
  const rowRule = styles.match(/\n\s*\.meas-item \.row\s*\{[^}]+\}/)?.[0] || '';
  const inputRule = styles.match(/\n\s*\.meas-item input\.name\s*\{[^}]+\}/)?.[0] || '';
  const lengthRule = styles.match(/\n\s*\.meas-item \.len\s*\{[^}]+\}/)?.[0] || '';
  const deleteRule = styles.match(/\n\s*\.meas-item \.del\s*\{[^}]+\}/)?.[0] || '';
  const selectedUnscaledRule = styles.match(/\.meas-item\.selected\.unscaled\s*\{[^}]+\}/)?.[0] || '';

  assert.match(source, /groupEl\.className = `page-group \$\{group\.collapsed \? 'collapsed' : 'open'\}`;/);
  assert.match(source, /header\.className = 'page-header';/);
  assert.match(source, /children\.className = 'page-children';/);
  assert.match(source, /childrenInner\.className = 'page-children-inner';/);
  assert.match(source, /groupEl\.appendChild\(header\);/);
  assert.match(source, /childrenInner\.appendChild\(buildMeasItem\(m\)\);/);
  assert.match(source, /children\.appendChild\(childrenInner\);/);
  assert.match(source, /groupEl\.appendChild\(children\);/);
  assert.match(childrenRule, /display:\s*grid/);
  assert.match(childrenRule, /grid-template-rows:\s*1fr/);
  assert.match(childrenRule, /padding:\s*4px/);
  assert.match(childrenRule, /transition:\s*grid-template-rows/);
  assert.match(collapsedChildrenRule, /grid-template-rows:\s*0fr/);
  assert.doesNotMatch(collapsedChildrenRule, /display:\s*none/);
  assert.match(childrenInnerRule, /min-height:\s*0/);
  assert.match(childrenInnerRule, /overflow:\s*hidden/);
  assert.match(childrenInnerRule, /gap:\s*3px/);
  assert.match(openChildrenInnerRule, /overflow:\s*visible/);
  assert.match(itemRule, /display:\s*flex/);
  assert.match(itemRule, /align-items:\s*center/);
  assert.match(rowRule, /align-items:\s*center/);
  assert.match(rowRule, /width:\s*100%/);
  assert.match(inputRule, /height:\s*20px/);
  assert.match(inputRule, /line-height:\s*20px/);
  assert.match(lengthRule, /display:\s*inline-flex/);
  assert.match(lengthRule, /align-items:\s*center/);
  assert.match(deleteRule, /display:\s*inline-flex/);
  assert.match(deleteRule, /align-items:\s*center/);
  assert.match(selectedUnscaledRule, /border-color:\s*var\(--accent\)/);
  assert.match(selectedUnscaledRule, /box-shadow:\s*0 0 0 1px var\(--accent\)/);
  assert.match(childItemRule, /width:\s*100%/);
  assert.match(childItemRule, /min-height:\s*31px/);
  assert.match(childItemRule, /padding:\s*3px 5px/);
  assert.match(childRowRule, /grid-template-columns:\s*8px minmax\(0,\s*1fr\) auto auto auto/);
  assert.match(childRowRule, /min-height:\s*17px/);
});

test('all-pages unscaled info icon opens a real tooltip on hover, focus, and click', async () => {
  const { styles, source } = await readIndexAndSidebarView();
  const pageInfoRule = styles.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';
  const tooltipRule = styles.match(/\.page-group \.page-info-tooltip\s*\{[^}]+\}/)?.[0] || '';
  const tooltipOpenRule = styles.match(/\.page-group \.page-info:is\([^}]+\}/)?.[0] || '';

  assert.match(source, /<button class="page-info"/);
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /aria-describedby="\$\{escapeHtml\(tooltipId\)\}"/);
  assert.match(source, /class="page-info-tooltip"/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /const tooltipId = `page-info-\$\{group\.page\}`;/);
  assert.match(source, /pageInfoButton\.addEventListener\('click'/);
  assert.match(source, /sidebarController\.setPageInfoOpen\(pageInfoButton/);
  assert.match(source, /function setPageInfoOpen\(button, isOpen\)/);
  assert.match(pageInfoRule, /position:\s*relative/);
  assert.match(tooltipRule, /position:\s*absolute/);
  assert.match(tooltipRule, /opacity:\s*0/);
  assert.match(tooltipOpenRule, /opacity:\s*1/);
});
