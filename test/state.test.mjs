import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadStateStore() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const pathTemplateSource = await readFile(new URL('../src/app/path-templates.js', import.meta.url), 'utf8');
  vm.runInContext(pathTemplateSource, sandbox, { filename: 'path-templates.js' });
  const stateSource = await readFile(new URL('../src/app/state.js', import.meta.url), 'utf8');
  vm.runInContext(stateSource, sandbox, { filename: 'state.js' });
  return sandbox.window.TakeoffState;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createInitialState returns fresh mutable collections and current defaults', async () => {
  const store = await loadStateStore();
  const a = store.createInitialState();
  const b = store.createInitialState();

  a.documents.push({ id: 'doc' });
  a.pageCache.set(1, { page: 1 });
  a.measurements.push({ id: 1 });
  a.undoStack.push({ label: 'edit' });
  a.collapsedPageGroups[1] = true;
  a.continuousScrollPreferences['1,2,3'] = true;

  assert.equal(b.documents.length, 0);
  assert.equal(b.pageCache.size, 0);
  assert.equal(b.measurements.length, 0);
  assert.equal(b.undoStack.length, 0);
  assert.deepEqual(plain(b.collapsedPageGroups), {});
  assert.deepEqual(plain(b.continuousScrollPreferences), {});
  assert.deepEqual(plain(b.pathCategoryVisibility), {});
  assert.equal(b.mode, 'pan');
  assert.equal(b.drawMode, 'line');
  assert.equal(b.unit, 'ft');
  assert.equal('pdfEngineChoice' in b, false);
  assert.equal(b.continuousScrollMode, false);
  assert.equal(b.continuousPageLayout, null);
  assert.equal(b.historyLimit, 100);
  assert.equal(b.MAX_CACHE, 20);
  assert.deepEqual(plain(b.pathTemplates), [{
    id: 'default-path-template',
    title: 'Default',
    paths: [{
      id: 'default-path',
      templateId: 'default-path-template',
      name: 'Path',
      geometry: 'line',
      stroke: {
        color: '#b6ff3c',
        style: 'solid',
      },
      anchors: {
        fill: '#ffffff',
        border: '#b6ff3c',
        borderMatchesStroke: true,
      },
      order: 0,
    }],
  }]);
  assert.equal(b.activePathTemplateId, 'default-path-template');
  assert.equal(b.activePathId, 'default-path');
});

test('resetDocumentState clears active document data while preserving app-level state', async () => {
  const store = await loadStateStore();
  const state = store.createInitialState();
  state.documents = [{ id: 'doc-1' }];
  state.activeDocId = 'doc-2';
  state.unit = 'm';
  state.pdf = { id: 'pdf' };
  state.pdfPages = 12;
  state.pdfPage = 4;
  state.continuousScrollMode = true;
  state.continuousPageLayout = { pages: [{ page: 4 }] };
  state.imageBitmap = { id: 'image' };
  state.baseW = 100;
  state.baseH = 200;
  state.zoom = 3;
  state.panX = 10;
  state.panY = 20;
  state.measurements = [{ id: 1 }];
  state.undoStack = [{ label: 'edit' }];
  state.redoStack = [{ label: 'redo' }];
  state.pageScales = { 4: 5 };
  state.pxPerInch = 5;
  state.inProgress = { points: [] };
  state.freehandDraft = { rawPoints: [] };
  state.selectedId = 1;
  state.dragLabel = { measurementId: 1 };
  state.pageCache.set(1, { page: 1 });
  state.preRenderQueue = [2, 3];
  state.preRenderRunning = true;
  state.sidebarTab = 'all';
  state.collapsedPageGroups = { 1: true };
  state.continuousScrollPreferences = { '1,2,3': true };
  state.pathCategoryVisibility = { 'category:low-voltage': false };
  state.pathTemplates = [{
    id: 'template-2',
    title: 'Rough-in',
    paths: [{ id: 'path-2', templateId: 'template-2', name: 'Conduit' }],
  }];
  state.activePathTemplateId = 'template-2';
  state.activePathId = 'path-2';

  store.resetDocumentState(state);

  assert.deepEqual(state.documents, [{ id: 'doc-1' }]);
  assert.equal(state.activeDocId, 'doc-2');
  assert.equal(state.unit, 'm');
  assert.equal(state.pdf, null);
  assert.equal(state.pdfPages, 0);
  assert.equal(state.pdfPage, 1);
  assert.equal(state.continuousScrollMode, false);
  assert.equal(state.continuousPageLayout, null);
  assert.equal(state.imageBitmap, null);
  assert.equal(state.baseW, 0);
  assert.equal(state.baseH, 0);
  assert.equal(state.zoom, 1);
  assert.equal(state.panX, 0);
  assert.equal(state.panY, 0);
  assert.deepEqual(plain(state.measurements), []);
  assert.deepEqual(plain(state.undoStack), []);
  assert.deepEqual(plain(state.redoStack), []);
  assert.deepEqual(plain(state.pageScales), {});
  assert.equal(state.pxPerInch, null);
  assert.equal(state.inProgress, null);
  assert.equal(state.freehandDraft, null);
  assert.equal(state.selectedId, null);
  assert.equal(state.dragLabel, null);
  assert.equal(state.pageCache.size, 0);
  assert.deepEqual(plain(state.preRenderQueue), []);
  assert.equal(state.preRenderRunning, false);
  assert.equal(state.sidebarTab, 'page');
  assert.deepEqual(plain(state.collapsedPageGroups), {});
  assert.deepEqual(plain(state.continuousScrollPreferences), {});
  assert.deepEqual(plain(state.pathCategoryVisibility), {});
  assert.deepEqual(plain(state.pathTemplates), [{
    id: 'template-2',
    title: 'Rough-in',
    paths: [{ id: 'path-2', templateId: 'template-2', name: 'Conduit' }],
  }]);
  assert.equal(state.activePathTemplateId, 'template-2');
  assert.equal(state.activePathId, 'path-2');
});

test('restoreDocumentState applies saved document fields and clears transient editing state', async () => {
  const store = await loadStateStore();
  const state = store.createInitialState();
  state.navToken = 7;
  state.continuousPageLayout = { pages: [{ page: 2 }] };
  state.inProgress = { points: [] };
  state.freehandDraft = { rawPoints: [] };
  state.selectedId = 3;
  state.dragLabel = { measurementId: 3 };
  state.pathTemplates = [{
    id: 'template-2',
    title: 'Rough-in',
    paths: [{ id: 'path-2', templateId: 'template-2', name: 'Conduit' }],
  }];
  state.activePathTemplateId = 'template-2';
  state.activePathId = 'path-2';
  const doc = {
    id: 'doc-1',
    pdf: { numPages: 9 },
    pdfPage: 3,
    continuousScrollMode: true,
    imageBitmap: { id: 'image' },
    baseW: 100,
    baseH: 200,
    zoom: 2,
    panX: 10,
    panY: 20,
    activeFitMode: 'width',
    pxPerInch: 4,
    pageScales: { 3: 4 },
    measurements: [{
      id: 1,
      shape: {
        active: 'line',
        previousFreehand: {
          points: [{ x: 0, y: 0 }],
        },
      },
    }],
    sidebarTab: 'all',
    collapsedPageGroups: { 1: true },
    continuousScrollPreferences: { '1,2,3': true },
    pathCategoryVisibility: {
      ' category:low-voltage ': { visible: false },
      'category:path-fallback': { hidden: false },
      'category:ignored': 'bad value',
    },
    pageCache: [[3, { page: 3 }]],
    pathTemplates: [{
      id: 'doc-template',
      title: 'Document template should not restore',
      paths: [],
    }],
    activePathTemplateId: 'doc-template',
    activePathId: null,
  };

  store.restoreDocumentState(state, doc);
  doc.measurements[0].shape.previousFreehand.points[0].x = 99;

  assert.equal(state.activeDocId, 'doc-1');
  assert.equal(state.pdf, doc.pdf);
  assert.equal(state.pdfPage, 3);
  assert.equal(state.pdfPages, 9);
  assert.equal(state.continuousScrollMode, true);
  assert.equal(state.continuousPageLayout, null);
  assert.equal(state.imageBitmap, doc.imageBitmap);
  assert.equal(state.baseW, 100);
  assert.equal(state.baseH, 200);
  assert.equal(state.zoom, 2);
  assert.equal(state.panX, 10);
  assert.equal(state.panY, 20);
  assert.equal(state.activeFitMode, 'width');
  assert.deepEqual(plain(state.pageScales), { 3: 4 });
  assert.deepEqual(plain(state.measurements), [{
    id: 1,
    shape: {
      active: 'line',
      previousFreehand: {
        points: [{ x: 0, y: 0 }],
      },
    },
  }]);
  assert.equal(state.sidebarTab, 'all');
  assert.deepEqual(plain(state.collapsedPageGroups), { 1: true });
  assert.deepEqual(plain(state.continuousScrollPreferences), { '1,2,3': true });
  assert.deepEqual(plain(state.pathCategoryVisibility), {
    'category:low-voltage': false,
    'category:path-fallback': true,
  });
  assert.equal(state.pageCache.get(3).page, 3);
  assert.deepEqual(plain(state.undoStack), []);
  assert.deepEqual(plain(state.redoStack), []);
  assert.equal(state.inProgress, null);
  assert.equal(state.freehandDraft, null);
  assert.equal(state.selectedId, null);
  assert.equal(state.dragLabel, null);
  assert.deepEqual(plain(state.pathTemplates), [{
    id: 'template-2',
    title: 'Rough-in',
    paths: [{ id: 'path-2', templateId: 'template-2', name: 'Conduit' }],
  }]);
  assert.equal(state.activePathTemplateId, 'template-2');
  assert.equal(state.activePathId, 'path-2');
  assert.equal(state.navToken, 8);
});

test('path category visibility helpers default visible and toggle durable keys', async () => {
  const store = await loadStateStore();
  const state = store.createInitialState();
  const lowVoltageKey = 'category:low-voltage';
  const pathFallbackKey = 'category-path:path%3Atemplate-security%3Apath-cat6';

  assert.equal(store.isPathCategoryVisible(state, lowVoltageKey), true);

  assert.deepEqual(plain(store.setPathCategoryVisibility(state, lowVoltageKey, false)), {
    [lowVoltageKey]: false,
  });
  assert.equal(store.isPathCategoryVisible(state, lowVoltageKey), false);
  assert.deepEqual(plain(store.pathCategoryVisibilityForAggregation(state)), {
    [lowVoltageKey]: false,
  });

  assert.equal(store.togglePathCategoryVisibility(state, lowVoltageKey), true);
  assert.equal(store.isPathCategoryVisible(state, lowVoltageKey), true);

  assert.equal(store.togglePathCategoryVisibility(state, pathFallbackKey), false);
  assert.deepEqual(plain(state.pathCategoryVisibility), {
    [lowVoltageKey]: true,
    [pathFallbackKey]: false,
  });
});

test('measurement state helpers replace and clear measurements with selection ownership', async () => {
  const store = await loadStateStore();
  const state = store.createInitialState();
  state.measurements = [{ id: 1 }];
  state.selectedId = 1;
  state.rotateModeId = 1;
  state.rotationHandleHitbox = { x: 0, y: 0, width: 1, height: 1 };
  state.rotationInputVisible = true;
  state.rotationDrag = { measurementId: 1 };

  store.setMeasurements(state, [{ id: 2 }], { selectedId: 2 });
  assert.deepEqual(plain(state.measurements), [{ id: 2 }]);
  assert.equal(state.selectedId, 2);

  store.clearMeasurements(state);
  assert.deepEqual(plain(state.measurements), []);
  assert.equal(state.selectedId, null);
  assert.equal(state.rotateModeId, null);
  assert.equal(state.rotationHandleHitbox, null);
  assert.equal(state.rotationInputVisible, false);
  assert.equal(state.rotationDrag, null);
});

test('page scale helpers own current-page scale mirroring', async () => {
  const store = await loadStateStore();
  const state = store.createInitialState();
  state.pageScales = { 3: 8 };
  state.pxPerInch = 99;

  assert.equal(store.hasPageScale(state, 3), true);
  assert.equal(store.hasPageScale(state, 4), false);
  assert.equal(store.syncCurrentPageScale(state, 3), 8);
  assert.equal(state.pxPerInch, 8);
  assert.equal(store.syncCurrentPageScale(state, 4), null);
  assert.equal(state.pxPerInch, null);
});
