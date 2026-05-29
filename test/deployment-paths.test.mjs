import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('index uses relative local asset paths for GitHub Pages subpath deploys', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const rootRelativeRefs = [...html.matchAll(/\b(?:src|href)=["']\/(?!\/)|url\(["']?\/(?!\/)/g)]
    .map(match => match[0]);

  assert.deepEqual(rootRelativeRefs, []);
});

test('run summary text is owned by the dynamic counter', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<span id="runCount">[^<]*<\/span>\s+runs/);
});

test('single-page documents remove scope chrome entirely', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const hiddenRule = html.match(/\.tabs\[hidden\]\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /<div id="scopeTabs" class="tabs">/);
  assert.match(html, /function documentPageCount\(\)/);
  assert.match(html, /function updateSidebarScopeChrome\(model\)/);
  assert.match(html, /scopeTabs\.hidden = !model\.showScopeTabs;/);
  assert.match(html, /totalHeading'\)\.textContent = model\.totalHeadingText;/);
  assert.match(hiddenRule, /display:\s*none !important/);
  assert.doesNotMatch(html, /singleScopeTitle/);
  assert.doesNotMatch(html, /single-scope-title/);
  assert.doesNotMatch(html, /scopeTitle/);
  assert.match(html, /content:\s*'Nothing measured yet\.'/);
  assert.doesNotMatch(html, /No runs measured yet\./);
});

test('all-pages collapse toggle uses the left-rail svg chevron style', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const collapseToggleRule = html.match(/\.page-group \.collapse-toggle\s*\{[^}]+\}/)?.[0] || '';

  assert.match(html, /class="collapse-toggle-icon"/);
  assert.match(html, /M4\.5 3 7\.5 6 4\.5 9/);
  assert.match(html, /M2\.5 4\.5 6 8l3\.5-3\.5/);
  assert.doesNotMatch(html, /&#9656;|&#9662;/);
  assert.match(collapseToggleRule, /display:\s*inline-flex/);
  assert.match(collapseToggleRule, /align-items:\s*center/);
});

test('all-pages page group header keeps its label left aligned', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pageHeaderRule = html.match(/\.page-group \.page-header\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = html.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = html.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageHeaderRule, /display:\s*flex/);
  assert.match(pageHeaderRule, /text-align:\s*left/);
  assert.match(pageLabelRule, /flex:\s*1 1 auto/);
  assert.match(pageActionsRule, /margin-left:\s*auto/);
});

test('all-pages page group keeps page controls left and scale/info/go right', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pageGroupRule = html.match(/\.page-group\s*\{[^}]+\}/)?.[0] || '';
  const pageHeaderRule = html.match(/\.page-group \.page-header\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = html.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = html.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';
  const pageStatusRule = html.match(/\.page-group \.page-status\s*\{[^}]+\}/)?.[0] || '';
  const pageInfoRule = html.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageGroupRule, /margin:\s*0 0 6px/);
  assert.match(pageHeaderRule, /min-height:\s*31px/);
  assert.match(pageHeaderRule, /gap:\s*4px/);
  assert.doesNotMatch(html, /class="page-meta"/);
  assert.match(html, /class="page-actions"/);
  assert.match(html, /class="page-status page-status-scale/);
  assert.match(html, /class="page-info"/);
  assert.match(html, /const excludedTitle = excludedText \? `\$\{excludedText\} on page \$\{group\.page\}` : '';/);
  assert.match(html, /aria-label="\$\{excludedTitle\}"/);
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
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const childrenRule = html.match(/\.page-group \.page-children\s*\{[^}]+\}/)?.[0] || '';
  const childrenInnerRule = html.match(/\.page-group \.page-children-inner\s*\{[^}]+\}/)?.[0] || '';
  const collapsedChildrenRule = html.match(/\.page-group\.collapsed \.page-children\s*\{[^}]+\}/)?.[0] || '';
  const childItemRule = html.match(/\.page-group \.meas-item\s*\{[^}]+\}/)?.[0] || '';
  const childRowRule = html.match(/\.page-group \.meas-item \.row\s*\{[^}]+\}/)?.[0] || '';

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
  assert.match(childItemRule, /width:\s*100%/);
  assert.match(childItemRule, /min-height:\s*31px/);
  assert.match(childItemRule, /padding:\s*3px 5px/);
  assert.match(childRowRule, /grid-template-columns:\s*8px minmax\(0,\s*1fr\) auto auto auto/);
});

test('all-pages unscaled info icon opens a real tooltip on hover, focus, and click', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pageInfoRule = html.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';
  const tooltipRule = html.match(/\.page-group \.page-info-tooltip\s*\{[^}]+\}/)?.[0] || '';
  const tooltipOpenRule = html.match(/\.page-group \.page-info:is\([^}]+\}/)?.[0] || '';

  assert.match(html, /<button class="page-info"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-describedby="\$\{tooltipId\}"/);
  assert.match(html, /class="page-info-tooltip"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /const tooltipId = `page-info-\$\{group\.page\}`;/);
  assert.match(html, /pageInfoButton\.addEventListener\('click'/);
  assert.match(html, /pageInfoButton\.classList\.toggle\('is-open'/);
  assert.match(pageInfoRule, /position:\s*relative/);
  assert.match(tooltipRule, /position:\s*absolute/);
  assert.match(tooltipRule, /opacity:\s*0/);
  assert.match(tooltipOpenRule, /opacity:\s*1/);
});
