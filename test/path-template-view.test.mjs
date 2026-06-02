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
    stroke: { color: '#4cd6ff', style: 'solid' },
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
