import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfEngine() {
  const source = await readFile(new URL('../src/app/pdf-engine.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {},
    document: {
      createElement(tagName) {
        assert.equal(tagName, 'canvas');
        return {
          width: 0,
          height: 0,
          style: {},
          dataset: {},
          drawCalls: [],
          getContext(type) {
            assert.equal(type, '2d');
            return {
              tag: '2d-context',
              drawImage: (...args) => this.drawCalls.push(args),
            };
          },
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'pdf-engine.js' });
  return sandbox.window.TakeoffPdfEngine;
}

function fakePage({ width = 612, height = 792, rotation = 0 } = {}) {
  return {
    getViewport({ scale }) {
      return { width: width * scale, height: height * scale, rotation };
    },
    render(options) {
      this.lastRenderOptions = options;
      return { promise: Promise.resolve() };
    },
  };
}

function fakePdfDocument({ pages = [fakePage(), fakePage({ width: 792, height: 612 })] } = {}) {
  return {
    numPages: pages.length,
    lastPage: null,
    destroyed: false,
    async getPage(pageNumber) {
      this.lastPage = pages[pageNumber - 1];
      return this.lastPage;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createPdfEngineDocument always opens PDFs through PDF.js', async () => {
  const pdfEngine = await loadPdfEngine();
  const calls = [];
  const source = new Uint8Array([1, 2, 3]).buffer;
  const doc = await pdfEngine.createPdfEngineDocument({
    data: source,
    pdfjsLib: {
      getDocument({ data }) {
        calls.push(data.byteLength);
        return { promise: Promise.resolve(fakePdfDocument()) };
      },
    },
  });

  assert.equal(doc.engine, 'pdfjs');
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(calls, [3]);
});

test('createPdfEngineDocument gives PDF.js a clone so source data remains reusable', async () => {
  const pdfEngine = await loadPdfEngine();
  const source = new Uint8Array([10, 20, 30, 40]).buffer;
  let receivedData = null;

  await pdfEngine.createPdfEngineDocument({
    data: source,
    pdfjsLib: {
      getDocument({ data }) {
        receivedData = data;
        return { promise: Promise.resolve(fakePdfDocument()) };
      },
    },
  });

  assert.notEqual(receivedData.buffer || receivedData, source);
  assert.deepEqual(Array.from(new Uint8Array(receivedData.buffer || receivedData)), [10, 20, 30, 40]);
  assert.deepEqual(Array.from(new Uint8Array(source)), [10, 20, 30, 40]);
});

test('PDF.js adapter returns page info and render entries through one contract', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdf = fakePdfDocument();
  const doc = pdfEngine.createPdfJsDocument(pdf);

  assert.deepEqual(plain(await doc.getPageInfo(1)), {
    pageNumber: 1,
    cssWidth: 612,
    cssHeight: 792,
    rotation: 0,
  });

  const entry = await doc.renderPage(1, { scale: 2 });

  assert.equal(entry.cssWidth, 612);
  assert.equal(entry.cssHeight, 792);
  assert.equal(entry.renderScale, 2);
  assert.equal(entry.engine, 'pdfjs');
  assert.equal(entry.canvas.width, 1224);
  assert.equal(entry.canvas.height, 1584);
  assert.equal(entry.canvas.dataset.pdfEngine, 'pdfjs');
  assert.equal(pdf.lastPage.lastRenderOptions.canvasContext.tag, '2d-context');
});

test('PDF.js adapter requests flattened annotation rendering when supported', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdf = fakePdfDocument();
  const doc = pdfEngine.createPdfJsDocument(pdf, { annotationMode: { ENABLE: 1 } });

  await doc.renderPage(1, { scale: 1.5, withAnnotations: true });

  assert.equal(pdf.lastPage.lastRenderOptions.annotationMode, 1);
});

test('PDF.js adapter can render a viewport-sized detail tile with flattened annotations', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdf = fakePdfDocument();
  const doc = pdfEngine.createPdfJsDocument(pdf, { annotationMode: { ENABLE: 1 } });

  const entry = await doc.renderPageTile(1, {
    scale: 4,
    sourceX: 10,
    sourceY: 20,
    width: 120,
    height: 80,
    withAnnotations: true,
  });

  assert.equal(entry.cssX, 10);
  assert.equal(entry.cssY, 20);
  assert.equal(entry.cssWidth, 120);
  assert.equal(entry.cssHeight, 80);
  assert.equal(entry.renderScale, 4);
  assert.equal(entry.engine, 'pdfjs-detail-tile');
  assert.equal(entry.canvas.width, 480);
  assert.equal(entry.canvas.height, 320);
  assert.equal(entry.canvas.dataset.pdfEngine, 'pdfjs-detail-tile');
  assert.deepEqual(plain(pdf.lastPage.lastRenderOptions.transform), [1, 0, 0, 1, -40, -80]);
  assert.equal(pdf.lastPage.lastRenderOptions.annotationMode, 1);
});
