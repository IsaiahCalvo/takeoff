import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function readIndexAndSidebarView() {
  const [html, sidebarView, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/sidebar-view.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app/styles.css', import.meta.url), 'utf8'),
  ]);
  return { html, sidebarView, styles, source: `${html}\n${sidebarView}\n${styles}` };
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

test('run summary text is owned by the dynamic counter', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<span id="runCount">[^<]*<\/span>\s+runs/);
});

test('single-page documents remove scope chrome entirely', async () => {
  const { html, styles } = await readIndexAndSidebarView();
  const hiddenRule = styles.match(/\.tabs\[hidden\]\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /<div id="scopeTabs" class="tabs">/);
  assert.match(html, /function documentPageCount\(\)/);
  assert.match(html, /function updateSidebarScopeChrome\(model\)/);
  assert.match(html, /scopeTabs\.hidden = !model\.showScopeTabs;/);
  assert.match(html, /totalHeading'\)\.textContent = model\.totalHeadingText;/);
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
  const { html, styles, source } = await readIndexAndSidebarView();
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
  assert.match(html, /const excludedTitle = excludedText \? `\$\{excludedText\} on page \$\{group\.page\}` : '';/);
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
  const { html, styles } = await readIndexAndSidebarView();
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

  assert.match(html, /groupEl\.className = `page-group \$\{group\.collapsed \? 'collapsed' : 'open'\}`;/);
  assert.match(html, /header\.className = 'page-header';/);
  assert.match(html, /children\.className = 'page-children';/);
  assert.match(html, /childrenInner\.className = 'page-children-inner';/);
  assert.match(html, /groupEl\.appendChild\(header\);/);
  assert.match(html, /childrenInner\.appendChild\(buildMeasItem\(m\)\);/);
  assert.match(html, /children\.appendChild\(childrenInner\);/);
  assert.match(html, /groupEl\.appendChild\(children\);/);
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
  const { html, styles, source } = await readIndexAndSidebarView();
  const pageInfoRule = styles.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';
  const tooltipRule = styles.match(/\.page-group \.page-info-tooltip\s*\{[^}]+\}/)?.[0] || '';
  const tooltipOpenRule = styles.match(/\.page-group \.page-info:is\([^}]+\}/)?.[0] || '';

  assert.match(source, /<button class="page-info"/);
  assert.match(source, /aria-expanded="false"/);
  assert.match(source, /aria-describedby="\$\{escapeHtml\(tooltipId\)\}"/);
  assert.match(source, /class="page-info-tooltip"/);
  assert.match(source, /role="tooltip"/);
  assert.match(html, /const tooltipId = `page-info-\$\{group\.page\}`;/);
  assert.match(html, /pageInfoButton\.addEventListener\('click'/);
  assert.match(html, /pageInfoButton\.classList\.toggle\('is-open'/);
  assert.match(pageInfoRule, /position:\s*relative/);
  assert.match(tooltipRule, /position:\s*absolute/);
  assert.match(tooltipRule, /opacity:\s*0/);
  assert.match(tooltipOpenRule, /opacity:\s*1/);
});
