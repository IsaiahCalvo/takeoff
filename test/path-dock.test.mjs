import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPathDock() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of [
    '../src/app/path-templates.js',
    '../src/app/path-style-renderer.js',
    '../src/app/path-dock.js',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  return {
    pathTemplates: sandbox.window.TakeoffPathTemplates,
    renderer: sandbox.window.TakeoffPathStyleRenderer,
    pathDock: sandbox.window.TakeoffPathDock,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function sampleTemplates() {
  return [{
    id: 'rough-in',
    title: 'Rough-in',
    paths: [
      { id: 'power', templateId: 'rough-in', name: 'Power', order: 0, stroke: { color: '#2f8cff', style: 'solid' } },
      { id: 'data', templateId: 'rough-in', name: 'Data', order: 1, stroke: { color: '#36d399', style: 'dashed' } },
      { id: 'security', templateId: 'rough-in', name: 'Security', order: 2, stroke: { color: '#ffb13c', style: 'dotted' } },
      { id: 'audio', templateId: 'rough-in', name: 'Audio', order: 3, stroke: { color: '#ff3b66', style: 'solid' } },
    ],
  }, {
    id: 'trim-out',
    title: 'Trim-out',
    paths: [
      { id: 'devices', templateId: 'trim-out', name: 'Devices', order: 0 },
    ],
  }];
}

function drawingContractTemplates() {
  return [{
    id: 'rough-in',
    title: 'Rough-in',
    paths: [
      {
        id: 'path-a',
        templateId: 'rough-in',
        name: 'Path A',
        geometry: 'line',
        order: 0,
        stroke: { color: '#ff4d7d', style: 'dashed' },
        anchors: { fill: '#101820', border: '#ff4d7d', borderMatchesStroke: true },
      },
      {
        id: 'path-b',
        templateId: 'rough-in',
        name: 'Path B',
        geometry: 'freehand',
        order: 1,
        stroke: { color: '#36d399', style: 'dotted' },
        anchors: { fill: '#f7fbfc', border: '#111619', borderMatchesStroke: false },
      },
    ],
  }];
}

test('builds a no-template fallback model with a default Path Template and Path', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({ pathTemplates: [] });

  assert.equal(model.fallback.kind, 'no-templates');
  assert.equal(model.fallback.label, 'No Path Templates');
  assert.equal(model.activeTemplate.id, 'default-path-template');
  assert.equal(model.activeTemplate.title, 'Default');
  assert.equal(model.activePath.id, 'default-path');
  assert.equal(model.activePath.name, 'Path');
  assert.equal(model.visiblePathTiles.length, 1);
  assert.equal(model.overflowCount, 0);
});

test('builds a no-path fallback model for an empty Path Template', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: [{ id: 'empty-template', title: 'Empty Template', paths: [] }],
    selectedTemplateId: 'empty-template',
  });

  assert.equal(model.fallback.kind, 'no-paths');
  assert.equal(model.fallback.label, 'No Paths');
  assert.equal(model.activeTemplate.id, 'empty-template');
  assert.equal(model.activePath.id, 'empty-template-default-path');
  assert.equal(model.activePath.templateId, 'empty-template');
  assert.equal(model.visiblePathTiles[0].name, 'Path');
});

test('does not show a no-path fallback for an inactive empty Path Template', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: [
      { id: 'active-template', title: 'Active Template', paths: [{ id: 'active-path', name: 'Active Path' }] },
      { id: 'empty-template', title: 'Empty Template', paths: [] },
    ],
    selectedTemplateId: 'active-template',
    selectedPathId: 'active-path',
  });

  assert.equal(model.fallback, null);
  assert.equal(model.activePath.id, 'active-path');
});

test('marks the active Path Template and active Path', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: sampleTemplates(),
    selectedTemplateId: 'rough-in',
    selectedPathId: 'security',
  });

  assert.equal(model.activeTemplateId, 'rough-in');
  assert.equal(model.activePathId, 'security');
  assert.deepEqual(plain(model.templateItems.map(item => ({ id: item.id, active: item.active }))), [
    { id: 'rough-in', active: true },
    { id: 'trim-out', active: false },
  ]);
  assert.deepEqual(plain(model.pathTiles.map(tile => ({ id: tile.id, active: tile.active }))), [
    { id: 'power', active: false },
    { id: 'data', active: false },
    { id: 'security', active: true },
    { id: 'audio', active: false },
  ]);
});

test('splits visible Path tiles from overflow Paths and preserves overflow open state', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: sampleTemplates(),
    selectedTemplateId: 'rough-in',
    maxVisiblePathCount: 2,
    overflowOpen: true,
  });

  assert.deepEqual(model.visiblePathTiles.map(tile => tile.id), ['power', 'data']);
  assert.deepEqual(model.overflowPaths.map(tile => tile.id), ['security', 'audio']);
  assert.equal(model.overflowCount, 2);
  assert.equal(model.overflow.open, true);
  assert.equal(model.overflow.action, 'path-dock-close-overflow');
});

test('keeps overflow closed when there are no overflow Paths', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: sampleTemplates(),
    selectedTemplateId: 'trim-out',
    maxVisiblePathCount: 6,
    overflowOpen: true,
  });

  assert.equal(model.overflowCount, 0);
  assert.equal(model.overflow.open, false);
  assert.equal(model.overflow.action, 'path-dock-open-overflow');
});

test('builds template dropup model and render actions', async () => {
  const { pathDock } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: sampleTemplates(),
    selectedTemplateId: 'trim-out',
    templateDropupOpen: true,
  });
  const html = pathDock.renderPathDockHtml(model);

  assert.equal(model.templateDropup.open, true);
  assert.equal(model.templateDropup.action, 'path-dock-close-template-dropup');
  assert.match(html, /aria-label="Path Template menu"/);
  assert.match(html, /data-action="path-dock-close-template-dropup"/);
  assert.match(html, /data-action="path-dock-select-template"/);
  assert.match(html, /data-path-dock-template-id="rough-in"/);
  assert.match(html, /Path Template/);
  assert.doesNotMatch(html, /\bnode\b/i);
  assert.doesNotMatch(html, /\bcategory\b/i);
});

test('renders Path tiles with stable action data and two-anchor previews', async () => {
  const { pathDock, renderer } = await loadPathDock();

  const model = pathDock.createPathDockViewModel({
    pathTemplates: sampleTemplates(),
    selectedTemplateId: 'rough-in',
    selectedPathId: 'data',
    maxVisiblePathCount: 2,
    overflowOpen: true,
  });
  const html = pathDock.renderPathDockHtml(model);

  assert.match(html, /aria-label="Path Dock"/);
  assert.match(html, /data-action="path-dock-select-path"/);
  assert.match(html, /data-path-dock-path-id="data"/);
  assert.match(html, /data-path-dock-active="true"/);
  assert.match(html, /data-action="path-dock-close-overflow"/);
  assert.equal((html.match(/data-path-dock-preview="true"/g) || []).length, 4);
  assert.equal(html.includes(`d="${renderer.PATH_STYLE_PREVIEW_GEOMETRY.pathD}"`), true);
  assert.equal((html.match(/<circle /g) || []).length, 8);
  assert.match(html, /stroke-dasharray="18 13"/);
  assert.match(html, /stroke-dasharray="1 16"/);
});

test('escapes Path Template and Path names in rendered dock markup', async () => {
  const { pathDock } = await loadPathDock();

  const html = pathDock.renderPathDockHtml({
    pathTemplates: [{
      id: 'template-danger',
      title: 'Template <script>',
      paths: [{
        id: 'path-danger',
        templateId: 'template-danger',
        name: 'Path "quoted" <img>',
        order: 0,
      }],
    }],
    selectedTemplateId: 'template-danger',
    selectedPathId: 'path-danger',
    templateDropupOpen: true,
  });

  assert.match(html, /Template &lt;script&gt;/);
  assert.match(html, /Path "quoted" &lt;img&gt;/);
  assert.match(html, /aria-label="Path &quot;quoted&quot; &lt;img&gt; preview"/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img>/);
});

test('creates an unmounted DOM fragment when a document adapter is supplied', async () => {
  const { pathDock } = await loadPathDock();
  const documentAdapter = {
    createElement(name) {
      assert.equal(name, 'template');
      return {
        innerHTML: '',
        content: { marker: 'fragment' },
      };
    },
  };

  const fragment = pathDock.renderPathDockFragment({
    pathTemplates: sampleTemplates(),
  }, {
    document: documentAdapter,
  });

  assert.deepEqual(fragment, { marker: 'fragment' });
});

test('controller mounts visible dock, commits Path selection, and closes menus', async () => {
  const { pathTemplates, renderer, pathDock } = await loadPathDock();
  const listeners = { document: {}, window: {} };
  const windowAdapter = {
    addEventListener(type, handler) { listeners.window[type] = handler; },
    removeEventListener() {},
  };
  const documentAdapter = {
    defaultView: windowAdapter,
    addEventListener(type, handler) { listeners.document[type] = handler; },
    removeEventListener() {},
  };
  const root = {
    hidden: true,
    innerHTML: '',
    ownerDocument: documentAdapter,
    addEventListener() {},
    removeEventListener() {},
    replaceChildren() { this.innerHTML = ''; },
    contains(target) { return target?.insideRoot === true; },
  };
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: sampleTemplates(),
    activePathTemplateId: 'rough-in',
    activePathId: 'power',
  });
  state.baseW = 100;
  state.mode = 'measure';
  let saveCount = 0;
  let homeRenderCount = 0;

  const controller = pathDock.createPathDockController({
    root,
    state,
    pathTemplates,
    renderer,
    document: documentAdapter,
    window: windowAdapter,
    maxVisiblePathCount: 1,
    visible: () => !!(state.baseW && state.mode === 'measure'),
    save: () => { saveCount += 1; },
    renderTemplateHome: () => { homeRenderCount += 1; },
  });

  controller.render();
  assert.equal(root.hidden, false);
  assert.match(root.innerHTML, /data-path-dock-active-path-id="power"/);
  assert.match(root.innerHTML, /data-action="path-dock-open-overflow"/);

  controller.handleAction({ dataset: { action: 'path-dock-select-path', pathDockTemplateId: 'rough-in', pathDockPathId: 'data' } });
  assert.equal(state.activePathId, 'data');
  assert.equal(saveCount, 1);
  assert.equal(homeRenderCount, 1);
  assert.match(root.innerHTML, /data-path-dock-active-path-id="data"/);

  controller.handleAction({ dataset: { action: 'path-dock-open-template-dropup' } });
  assert.match(root.innerHTML, /data-path-dock-template-dropup-open="true"/);
  listeners.document.click({ target: { insideRoot: false } });
  assert.match(root.innerHTML, /data-path-dock-template-dropup-open="false"/);

  controller.handleAction({ dataset: { action: 'path-dock-open-overflow' } });
  let stopped = false;
  listeners.window.keydown({
    key: 'Escape',
    preventDefault() {},
    stopImmediatePropagation() { stopped = true; },
  });
  assert.equal(stopped, true);
  assert.match(root.innerHTML, /data-path-dock-overflow-open="false"/);

  state.mode = 'pan';
  controller.render();
  assert.equal(root.hidden, true);
  assert.equal(root.innerHTML, '');
});

test('controller selection feeds the next run and does not mutate an active draft Path', async () => {
  const { pathTemplates, renderer, pathDock } = await loadPathDock();
  const root = {
    hidden: true,
    innerHTML: '',
    ownerDocument: {
      defaultView: { addEventListener() {}, removeEventListener() {} },
      addEventListener() {},
      removeEventListener() {},
    },
    addEventListener() {},
    removeEventListener() {},
    replaceChildren() { this.innerHTML = ''; },
    contains(target) { return target?.insideRoot === true; },
  };
  const state = pathTemplates.normalizePathTemplateState({
    pathTemplates: drawingContractTemplates(),
    activePathTemplateId: 'rough-in',
    activePathId: 'path-a',
  });
  state.baseW = 100;
  state.mode = 'measure';

  const controller = pathDock.createPathDockController({
    root,
    state,
    pathTemplates,
    renderer,
    maxVisiblePathCount: 2,
    visible: () => true,
  });

  controller.render();
  assert.match(root.innerHTML, /data-path-dock-active-path-id="path-a"/);

  controller.handleAction({ dataset: { action: 'path-dock-select-path', pathDockTemplateId: 'rough-in', pathDockPathId: 'path-b' } });
  const nextRunPath = pathTemplates.activePathForState(state);
  assert.equal(nextRunPath.id, 'path-b');
  assert.equal(nextRunPath.geometry, 'freehand');
  assert.deepEqual(plain(nextRunPath.stroke), { color: '#36d399', style: 'dotted' });
  assert.deepEqual(plain(nextRunPath.anchors), {
    fill: '#f7fbfc',
    border: '#111619',
    borderMatchesStroke: false,
  });

  const activeDraft = { type: 'measure', points: [{ x: 0, y: 0 }], activePath: nextRunPath };
  state.inProgress = activeDraft;
  controller.handleAction({ dataset: { action: 'path-dock-select-path', pathDockTemplateId: 'rough-in', pathDockPathId: 'path-a' } });

  assert.equal(pathTemplates.activePathForState(state).id, 'path-a');
  assert.equal(activeDraft.activePath.id, 'path-b');
  assert.equal(activeDraft.activePath.geometry, 'freehand');
  assert.deepEqual(plain(activeDraft.activePath.stroke), { color: '#36d399', style: 'dotted' });
  assert.deepEqual(plain(activeDraft.activePath.anchors), {
    fill: '#f7fbfc',
    border: '#111619',
    borderMatchesStroke: false,
  });
  assert.match(root.innerHTML, /data-path-dock-active-path-id="path-a"/);
});
