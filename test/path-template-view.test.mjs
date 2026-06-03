import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathTemplateView() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of [
    '../src/app/path-templates.js',
    '../src/app/path-style-renderer.js',
    '../src/app/path-template-view.js',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  return {
    pathTemplates: sandbox.window.TakeoffPathTemplates,
    renderer: sandbox.window.TakeoffPathStyleRenderer,
    view: sandbox.window.TakeoffPathTemplateView,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('creates a default view model with active template and path', async () => {
  const { pathTemplates, view } = await loadPathTemplateView();

  const model = view.createPathTemplateViewModel({}, { pathTemplates });

  assert.equal(model.templateCount, 1);
  assert.equal(model.templateCountLabel, '1 template');
  assert.equal(model.activeTemplate.id, 'default-path-template');
  assert.equal(model.activeTemplate.title, 'Default');
  assert.equal(model.activePath.id, 'default-path');
  assert.equal(model.activePath.name, 'Path');
});

test('resolves active template and active path from state', async () => {
  const { pathTemplates, view } = await loadPathTemplateView();
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: [{
      id: 'template-a',
      title: 'Power',
      paths: [{ id: 'path-a', templateId: 'template-a', name: 'Home run' }],
    }, {
      id: 'template-b',
      title: 'Security',
      paths: [{ id: 'path-b', templateId: 'template-b', name: 'Camera', geometry: 'freehand' }],
    }],
    activePathTemplateId: 'template-b',
    activePathId: 'path-b',
  });

  const model = view.createPathTemplateViewModel(state, { pathTemplates });

  assert.equal(model.templateCountLabel, '2 templates');
  assert.equal(model.activeTemplate.title, 'Security');
  assert.equal(model.activePath.name, 'Camera');
  assert.equal(model.activePath.geometry, 'freehand');
});

test('maps style form fields into path style patches', async () => {
  const { view } = await loadPathTemplateView();
  const path = {
    stroke: { color: '#4cd6ff', style: 'solid', border: '#111111', borderMatchesFill: false },
    anchors: { fill: '#ffffff', border: '#111111', borderMatchesStroke: false },
  };

  assert.deepEqual(plain(view.stylePatchFromFormField('geometry', 'freehand', path)), {
    geometry: 'freehand',
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('stroke.color', '#ff9b3c', path)), {
    stroke: { color: '#ff9b3c' },
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('stroke.style', 'dotted', path)), {
    stroke: { style: 'dotted' },
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('stroke.border', '#111619', path)), {
    stroke: { border: '#111619', borderMatchesFill: false },
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('stroke.borderMatchesFill', true, path)), {
    stroke: { borderMatchesFill: true, border: '#4cd6ff' },
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('anchors.fill', '#101820', path)), {
    anchors: { fill: '#101820' },
  });
  assert.deepEqual(plain(view.stylePatchFromFormField('anchors.borderMatchesStroke', true, path)), {
    anchors: { borderMatchesStroke: true, border: '#4cd6ff' },
  });
});

test('uses Takeoff labels for geometry and stroke controls', async () => {
  const { view } = await loadPathTemplateView();

  assert.equal(view.geometryLabel('line'), 'Line');
  assert.equal(view.geometryLabel('freehand'), 'Freehand');
  assert.equal(view.geometryLabel('curve'), 'Line');
  assert.equal(view.strokeStyleLabel('solid'), 'Solid');
  assert.equal(view.strokeStyleLabel('dashed'), 'Dashed');
  assert.equal(view.strokeStyleLabel('dotted'), 'Dotted');
});

test('preview HTML is delegated to the path style renderer', async () => {
  const { view } = await loadPathTemplateView();
  const calls = [];
  const renderer = {
    renderPathStylePreviewSvg(style, options) {
      calls.push({ style, options });
      return '<svg data-test="preview"></svg>';
    },
  };

  const html = view.renderPathPreviewHtml({
    name: 'Branch',
    stroke: { color: '#b6ff3c', style: 'dashed' },
    anchors: { fill: '#ffffff', border: '#b6ff3c', borderMatchesStroke: true },
  }, renderer);

  assert.equal(html, '<svg data-test="preview"></svg>');
  assert.deepEqual(plain(calls), [{
    style: {
      stroke: { color: '#b6ff3c', style: 'dashed' },
      anchors: { fill: '#ffffff', border: '#b6ff3c', borderMatchesStroke: true },
    },
    options: { ariaLabel: 'Branch preview' },
  }]);
});

test('path cards render shared angled two-anchor preview glyphs while detail preview uses four anchors', async () => {
  const { pathTemplates, renderer, view } = await loadPathTemplateView();
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: [{
      id: 'template-a',
      title: 'Signal',
      paths: [{
        id: 'solid-path',
        templateId: 'template-a',
        name: 'Solid path',
        stroke: { color: '#2f8cff', style: 'solid', border: '#111619', borderMatchesFill: false },
        anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: false },
      }, {
        id: 'dashed-path',
        templateId: 'template-a',
        name: 'Dashed path',
        geometry: 'freehand',
        stroke: { color: '#36d399', style: 'dashed' },
        anchors: { fill: '#0b0f11', borderMatchesStroke: true },
      }, {
        id: 'dotted-path',
        templateId: 'template-a',
        name: 'Dotted path',
        stroke: { color: '#ffb13c', style: 'dotted' },
        anchors: { fill: '#7c3cff', border: '#ffd166', borderMatchesStroke: false },
      }],
    }],
    activePathTemplateId: 'template-a',
    activePathId: 'solid-path',
  });
  const root = {
    innerHTML: '',
    addEventListener() {},
    removeEventListener() {},
  };

  view.createPathTemplateHome({ root, state, pathTemplates, renderer });

  assert.match(root.innerHTML, /path-template-layout/);
  assert.match(root.innerHTML, /path-template-sidebar/);
  assert.match(root.innerHTML, /path-template-editor-header/);
  assert.match(root.innerHTML, /path-template-detail-grid/);
  assert.match(root.innerHTML, /path-template-category-panel/);
  assert.match(root.innerHTML, /path-template-appearance-panel/);
  assert.match(root.innerHTML, /path-template-preview-panel/);
  assert.match(root.innerHTML, /data-tab="line"/);
  assert.match(root.innerHTML, /data-tab="anchor"/);
  assert.match(root.innerHTML, /Template paths/);
  assert.match(root.innerHTML, /Paths/);
  assert.match(root.innerHTML, /Path style/);
  assert.match(root.innerHTML, /Line fill/);
  assert.match(root.innerHTML, /Line border/);
  assert.match(root.innerHTML, /data-field="stroke.borderMatchesFill"/);
  assert.match(root.innerHTML, /Add path/);
  assert.doesNotMatch(root.innerHTML, /Add category/);
  assert.doesNotMatch(root.innerHTML, /Line type/);
  assert.doesNotMatch(root.innerHTML, /Freehand/);
  assert.doesNotMatch(root.innerHTML, /data-field="geometry"/);
  assert.doesNotMatch(root.innerHTML, /Path Templates/);

  const card = (id) => root.innerHTML.match(new RegExp(`<button class="path-template-path-card[\\s\\S]*?data-path-id="${id}"[\\s\\S]*?</button>`))?.[0] || '';
  const solidCard = card('solid-path');
  const dashedCard = card('dashed-path');
  const dottedCard = card('dotted-path');
  const detailPreview = root.innerHTML.match(/<div class="path-template-preview" data-preview>[\s\S]*?<div class="path-template-preview-meta">/)?.[0] || '';

  assert.doesNotMatch(root.innerHTML, /path-template-path-swatch/);
  assert.equal((root.innerHTML.match(/path-template-path-preview/g) || []).length, 3);
  assert.match(solidCard, /<svg\b/);
  assert.equal(solidCard.includes(`d="${renderer.PATH_STYLE_PREVIEW_GEOMETRY.pathD}"`), true);
  assert.equal(solidCard.includes(`d="${renderer.PATH_STYLE_DETAIL_PREVIEW_GEOMETRY.pathD}"`), false);
  assert.equal(solidCard.includes('stroke="#2f8cff"'), true);
  assert.equal(solidCard.includes('stroke="#111619"'), true);
  assert.equal(solidCard.includes('fill="#ff3b66" stroke="#ffffff"'), true);
  assert.doesNotMatch(solidCard, /Line \/ Solid/);
  assert.doesNotMatch(solidCard, /stroke-dasharray/);
  assert.match(dashedCard, /stroke-dasharray="18 13"/);
  assert.equal(dashedCard.includes('fill="#0b0f11" stroke="#36d399"'), true);
  assert.match(dottedCard, /stroke-dasharray="1 16"/);
  assert.equal(dottedCard.includes('fill="#7c3cff" stroke="#ffd166"'), true);
  assert.equal(detailPreview.includes(`d="${renderer.PATH_STYLE_DETAIL_PREVIEW_GEOMETRY.pathD}"`), true);
  assert.equal((detailPreview.match(/<circle /g) || []).length, 4);
});

test('style tab changes preserve the template panel scroll position', async () => {
  const { pathTemplates, renderer, view } = await loadPathTemplateView();
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: [{
      id: 'template-a',
      title: 'Signal',
      paths: [{
        id: 'solid-path',
        templateId: 'template-a',
        name: 'Solid path',
        stroke: { color: '#2f8cff', style: 'solid' },
        anchors: { fill: '#ff3b66', border: '#ffffff', borderMatchesStroke: true },
      }],
    }],
    activePathTemplateId: 'template-a',
    activePathId: 'solid-path',
  });
  const listeners = {};
  const scroller = { scrollTop: 0 };
  const anchorTab = {
    dataset: { action: 'style-tab', tab: 'anchor' },
    closest(selector) {
      return selector === '[data-action]' ? this : null;
    },
  };
  const root = {
    _innerHTML: '',
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    removeEventListener() {},
    closest(selector) {
      return selector === '[data-home-panel]' ? scroller : null;
    },
    contains() {
      return true;
    },
  };
  Object.defineProperty(root, 'innerHTML', {
    get() {
      return this._innerHTML;
    },
    set(value) {
      this._innerHTML = value;
      scroller.scrollTop = 0;
    },
  });

  view.createPathTemplateHome({ root, state, pathTemplates, renderer });
  scroller.scrollTop = 214;

  listeners.click({ target: anchorTab });

  assert.equal(scroller.scrollTop, 214);
  assert.match(root.innerHTML, /data-style-panel="anchor"[^>]*>/);
  assert.match(root.innerHTML, /data-tab="anchor" role="tab" aria-selected="true"/);
  assert.doesNotMatch(root.innerHTML, />Anchor border</);
});
