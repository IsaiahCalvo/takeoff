import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadDocumentAdapters() {
  const source = await readFile(new URL('../src/app/document-adapters.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'document-adapters.js' });
  return sandbox.window.TakeoffDocumentAdapters;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createPdfDocumentState starts multi-page PDFs in single-page mode for fast first paint', async () => {
  const adapters = await loadDocumentAdapters();
  const pdf = { numPages: 7 };
  const state = adapters.createPdfDocumentState(pdf);

  assert.equal(state.pdf, pdf);
  assert.equal(state.pdfPages, 7);
  assert.equal(state.pdfPage, 1);
  assert.equal(state.continuousScrollMode, false);
  assert.equal(state.continuousScrollAutoEnable, true);
  assert.equal(state.imageBitmap, null);
});

test('renderImageBitmapToCanvas sizes canvases and draws the image through one adapter', async () => {
  const adapters = await loadDocumentAdapters();
  const image = { width: 640, height: 480 };
  const baseCanvas = {};
  const calls = [];

  const state = adapters.renderImageBitmapToCanvas({
    image,
    baseCanvas,
    baseCtx: { drawImage: (...args) => calls.push(['drawImage', ...args]) },
    configureCanvasCssSize: (...args) => calls.push(['cssSize', ...args]),
    configureDrawCanvas: () => calls.push(['drawCanvas']),
  });

  assert.deepEqual(plain(state), {
    imageBitmap: image,
    pdf: null,
    pdfPages: 1,
    pdfPage: 1,
    baseW: 640,
    baseH: 480,
  });
  assert.equal(baseCanvas.width, 640);
  assert.equal(baseCanvas.height, 480);
  assert.deepEqual(calls, [
    ['cssSize', baseCanvas, 640, 480],
    ['drawCanvas'],
    ['drawImage', image, 0, 0],
  ]);
});

test('renderImageBitmapToCanvas caps large image backing bitmaps without changing document size', async () => {
  const adapters = await loadDocumentAdapters();
  const image = { width: 8000, height: 4000 };
  const baseCanvas = {};
  const calls = [];

  const state = adapters.renderImageBitmapToCanvas({
    image,
    maxBitmapEdge: 2000,
    baseCanvas,
    baseCtx: { drawImage: (...args) => calls.push(['drawImage', ...args]) },
    configureCanvasCssSize: (...args) => calls.push(['cssSize', ...args]),
    configureDrawCanvas: () => calls.push(['drawCanvas']),
  });

  assert.equal(state.baseW, 8000);
  assert.equal(state.baseH, 4000);
  assert.equal(baseCanvas.width, 2000);
  assert.equal(baseCanvas.height, 1000);
  assert.deepEqual(calls, [
    ['cssSize', baseCanvas, 8000, 4000],
    ['drawCanvas'],
    ['drawImage', image, 0, 0, 2000, 1000],
  ]);
});
