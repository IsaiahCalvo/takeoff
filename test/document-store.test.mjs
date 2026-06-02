import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadDocumentStore() {
  const source = await readFile(new URL('../src/app/document-store.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'document-store.js' });
  return sandbox.window.TakeoffDocumentStore;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createDocumentSnapshot captures persisted document state only when a document is loaded', async () => {
  const store = await loadDocumentStore();
  const state = {
    activeDocId: 'doc-1',
    documents: [{ id: 'doc-1', name: 'Drawing.pdf' }],
    pdf: { numPages: 3 },
    pdfPage: 2,
    pdfPages: 3,
    continuousScrollMode: true,
    imageBitmap: null,
    baseW: 100,
    baseH: 200,
    zoom: 1.5,
    panX: 7,
    panY: 8,
    activeFitMode: 'page',
    pxPerInch: 4,
    pageScales: { 2: 4 },
    measurements: [{
      id: 1,
      pathCategoryId: 'low-voltage',
      lengthInches: 120,
      shape: {
        active: 'line',
        previousFreehand: {
          points: [{ x: 0, y: 0 }],
        },
      },
    }],
    sidebarTab: 'all',
    collapsedPageGroups: { 2: true },
    continuousScrollPreferences: { '1,2,3': true },
    pathCategoryVisibility: { 'category:low-voltage': false },
    pageCache: new Map([[2, { page: 2 }]]),
  };

  const snapshot = store.createDocumentSnapshot(state);
  state.measurements[0].shape.previousFreehand.points[0].x = 99;
  state.measurements[0].lengthInches = 0;
  state.pathCategoryVisibility['category:low-voltage'] = true;

  assert.equal(snapshot.id, 'doc-1');
  assert.equal(snapshot.name, 'Drawing.pdf');
  assert.equal(snapshot.continuousScrollMode, true);
  assert.deepEqual(plain(snapshot.continuousScrollPreferences), { '1,2,3': true });
  assert.deepEqual(plain(snapshot.pageScales), { 2: 4 });
  assert.equal(snapshot.measurements[0].shape.previousFreehand.points[0].x, 0);
  assert.equal(snapshot.measurements[0].pathCategoryId, 'low-voltage');
  assert.equal(snapshot.measurements[0].lengthInches, 120);
  assert.deepEqual(plain(snapshot.pathCategoryVisibility), { 'category:low-voltage': false });
  assert.equal(snapshot.pageCache.get(2).page, 2);
  assert.equal(store.createDocumentSnapshot({ activeDocId: 'doc-2', pdf: null, imageBitmap: null }), null);
});

test('saveDocumentSnapshot upserts the active document without duplicating tabs', async () => {
  const store = await loadDocumentStore();
  const state = {
    documents: [{ id: 'doc-1', name: 'Old.pdf' }],
    activeDocId: 'doc-1',
    pdf: { numPages: 1 },
    pdfPage: 1,
    pdfPages: 1,
    continuousScrollMode: false,
    pageScales: {},
    measurements: [],
    collapsedPageGroups: {},
    continuousScrollPreferences: {},
    pathCategoryVisibility: { 'category:low-voltage': false },
    pageCache: new Map(),
  };

  const saved = store.saveDocumentSnapshot(state, 'New Name.pdf');

  assert.equal(saved.name, 'New Name.pdf');
  assert.deepEqual(plain(saved.pathCategoryVisibility), { 'category:low-voltage': false });
  assert.equal(state.documents.length, 1);
  assert.equal(state.documents[0].name, 'New Name.pdf');
});

test('exportBaseName normalizes document titles for downloaded files', async () => {
  const store = await loadDocumentStore();
  const state = {
    activeDocId: 'doc-1',
    documents: [{ id: 'doc-1', name: 'SE-011 Security Shop Drawing.pdf' }],
  };

  assert.equal(store.activeDocumentName(state), 'SE-011 Security Shop Drawing.pdf');
  assert.equal(store.exportBaseName(state), 'se-011-security-shop-drawing');
  assert.equal(store.exportBaseName({ documents: [], activeDocId: null }), 'takeoff');
});
