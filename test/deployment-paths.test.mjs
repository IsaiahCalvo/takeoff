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
  const pageGroupRule = html.match(/\.page-group\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = html.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = html.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageGroupRule, /justify-items:\s*start/);
  assert.match(pageGroupRule, /text-align:\s*left/);
  assert.match(pageLabelRule, /justify-self:\s*start/);
  assert.match(pageActionsRule, /justify-self:\s*end/);
});

test('all-pages page group keeps page controls left and scale/info/go right', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pageGroupRule = html.match(/\.page-group\s*\{[^}]+\}/)?.[0] || '';
  const pageLabelRule = html.match(/\.page-group \.page-label\s*\{[^}]+\}/)?.[0] || '';
  const pageActionsRule = html.match(/\.page-group \.page-actions\s*\{[^}]+\}/)?.[0] || '';
  const pageStatusRule = html.match(/\.page-group \.page-status\s*\{[^}]+\}/)?.[0] || '';
  const pageInfoRule = html.match(/\.page-group \.page-info\s*\{[^}]+\}/)?.[0] || '';

  assert.match(pageGroupRule, /grid-template-columns:\s*18px auto minmax\(12px,\s*1fr\) auto/);
  assert.match(pageGroupRule, /grid-template-areas:\s*"toggle label spacer actions"/);
  assert.doesNotMatch(pageGroupRule, /meta/);
  assert.doesNotMatch(html, /class="page-meta"/);
  assert.match(html, /class="page-actions"/);
  assert.match(html, /class="page-status page-status-scale/);
  assert.match(html, /class="page-info"/);
  assert.match(html, /const excludedTitle = excludedText \? `\$\{excludedText\} on page \$\{group\.page\}` : '';/);
  assert.match(html, /aria-label="\$\{excludedTitle\}"/);
  assert.match(pageLabelRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(pageLabelRule, /display:\s*flex/);
  assert.match(pageActionsRule, /grid-area:\s*actions/);
  assert.match(pageActionsRule, /justify-self:\s*end/);
  assert.match(pageActionsRule, /display:\s*inline-flex/);
  assert.doesNotMatch(pageStatusRule, /grid-area:\s*scale/);
  assert.match(pageStatusRule, /font-size:\s*9px/);
  assert.match(pageStatusRule, /padding:\s*2px 4px/);
  assert.match(pageStatusRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(pageInfoRule, /grid-area:\s*info/);
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
