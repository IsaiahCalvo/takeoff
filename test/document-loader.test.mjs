import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadDocumentLoader() {
  const source = await readFile(new URL('../src/app/document-loader.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'document-loader.js' });
  return sandbox.window.TakeoffDocumentLoader;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('classifies supported PDFs and images from type or extension', async () => {
  const loader = await loadDocumentLoader();

  assert.equal(loader.isPdfFile({ type: 'application/pdf', name: 'drawing.bin' }), true);
  assert.equal(loader.isPdfFile({ type: '', name: 'drawing.PDF' }), true);
  assert.equal(loader.isImageFile({ type: 'image/png', name: 'drawing.bin' }), true);
  assert.equal(loader.isImageFile({ type: '', name: 'photo.HEIC' }), true);
  assert.equal(loader.isSupportedDocumentFile({ type: 'text/plain', name: 'notes.txt' }), false);
});

test('describeDocumentFile returns a stable document kind and fallback display name', async () => {
  const loader = await loadDocumentLoader();

  assert.deepEqual(plain(loader.describeDocumentFile({ type: 'application/pdf', name: '' })), {
    kind: 'pdf',
    displayName: 'PDF',
    supported: true,
  });
  assert.deepEqual(plain(loader.describeDocumentFile({ type: 'image/webp', name: 'photo.webp' })), {
    kind: 'image',
    displayName: 'photo.webp',
    supported: true,
  });
  assert.deepEqual(plain(loader.describeDocumentFile({ type: 'application/json', name: 'data.json' })), {
    kind: 'unsupported',
    displayName: 'data.json',
    supported: false,
  });
});

test('createImageDocumentState describes the single-page image state written into app state', async () => {
  const loader = await loadDocumentLoader();

  assert.deepEqual(plain(loader.createImageDocumentState({ width: 1200, height: 800 })), {
    pdf: null,
    pdfPages: 1,
    pdfPage: 1,
    baseW: 1200,
    baseH: 800,
  });
});
