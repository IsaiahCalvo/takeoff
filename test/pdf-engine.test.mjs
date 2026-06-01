import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadPdfEngine() {
  const source = (await readFile(new URL('../src/app/pdf-engine.js', import.meta.url), 'utf8'))
    .replaceAll('import.meta.url', JSON.stringify(new URL('../src/app/pdf-engine.js', import.meta.url).href));
  const sandbox = {
    console: { ...console, warn() {} },
    window: {},
    ImageData: class {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, 'canvas');
        return {
          width: 0,
          height: 0,
          style: {},
          drawCalls: [],
          getContext(type) {
            assert.equal(type, '2d');
            return {
              tag: '2d-context',
              drawImage: (...args) => this.drawCalls.push(args),
              putImageData: (...args) => this.drawCalls.push(args),
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

function fakeEntry({ engine = 'embedpdf', cssWidth = 300, cssHeight = 200, renderScale = 1 } = {}) {
  return {
    canvas: { width: cssWidth * renderScale, height: cssHeight * renderScale, style: {} },
    cssWidth,
    cssHeight,
    renderScale,
    engine,
  };
}

function fakePdfiumWorkerFactory(messages) {
  return () => ({
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(message, transfer) {
      messages.push({ message, transfer });
      queueMicrotask(() => {
        if (message.type === 'open') {
          this.onmessage({ data: {
            id: message.id,
            ok: true,
            result: {
              docId: 'doc-1',
              pageCount: 2,
            },
          } });
          return;
        }
        if (message.type === 'getPageInfo') {
          this.onmessage({ data: {
            id: message.id,
            ok: true,
            result: {
              pageNumber: message.pageNumber,
              cssWidth: 612,
              cssHeight: 792,
              rotation: 0,
            },
          } });
          return;
        }
        if (message.type === 'renderPage') {
          this.onmessage({ data: {
            id: message.id,
            ok: true,
            result: {
              cssWidth: 612,
              cssHeight: 792,
              renderScale: message.scale,
              width: 1224,
              height: 1584,
              buffer: new Uint8ClampedArray(1224 * 1584 * 4).buffer,
              engine: 'pdfium-worker',
            },
          } });
          return;
        }
        if (message.type === 'close') {
          this.onmessage({ data: { id: message.id, ok: true, result: {} } });
        }
      });
    },
    terminate() {
      this.terminated = true;
    },
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('createPdfEngineDocument falls back to PDF.js when preferred engine is unavailable', async () => {
  const pdfEngine = await loadPdfEngine();
  const calls = [];
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([1, 2, 3]).buffer,
    pdfjsLib: {
      getDocument({ data }) {
        calls.push(data.byteLength);
        return { promise: Promise.resolve(fakePdfDocument()) };
      },
    },
    preferredFactory: null,
  });

  assert.equal(doc.engine, 'pdfjs');
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(calls, [3]);
});

test('createPdfEngineDocument can be forced to PDF.js without probing the preferred engine', async () => {
  const pdfEngine = await loadPdfEngine();
  const calls = [];
  let preferredCalls = 0;
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([1, 2, 3]).buffer,
    engine: 'pdfjs',
    pdfjsLib: {
      getDocument({ data }) {
        calls.push(['pdfjs', data.byteLength]);
        return { promise: Promise.resolve(fakePdfDocument({ pages: [fakePage()] })) };
      },
    },
    preferredFactory: async () => {
      preferredCalls += 1;
      throw new Error('preferred engine should not be probed when PDF.js is selected');
    },
  });

  assert.equal(doc.engine, 'pdfjs');
  assert.equal(doc.getPageCount(), 1);
  assert.equal(preferredCalls, 0);
  assert.deepEqual(calls, [['pdfjs', 3]]);
});

test('createPdfEngineDocument uses the EmbedPDF/PDFium path when requested', async () => {
  const pdfEngine = await loadPdfEngine();
  const calls = [];
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([4, 5, 6]).buffer,
    engine: 'embedpdf',
    pdfjsLib: { getDocument: () => { throw new Error('PDF.js should not load'); } },
    preferredFactory: async ({ data }) => {
      calls.push(['preferred', data.byteLength]);
      return {
        engine: 'pdfium-worker',
        getPageCount: () => 1,
        getPageInfo: async () => ({ pageNumber: 1, cssWidth: 300, cssHeight: 200, rotation: 0 }),
        renderPage: async (_pageNumber, renderOptions) => fakeEntry({ engine: 'pdfium-worker', renderScale: renderOptions.scale }),
        destroy() {},
      };
    },
  });

  const entry = await doc.renderPage(1, { scale: 2 });

  assert.equal(doc.engine, 'pdfium-worker');
  assert.equal(entry.engine, 'pdfium-worker');
  assert.deepEqual(calls, [['preferred', 3]]);
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
  assert.equal(pdf.lastPage.lastRenderOptions.canvasContext.tag, '2d-context');
});

test('PDF.js adapter requests flattened annotation rendering when supported', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdf = fakePdfDocument();
  const doc = pdfEngine.createPdfJsDocument(pdf, { annotationMode: { ENABLE: 1 } });

  await doc.renderPage(1, { scale: 1.5, withAnnotations: true });

  assert.equal(pdf.lastPage.lastRenderOptions.annotationMode, 1);
});

test('preferred engine receives flattened annotation render options', async () => {
  const pdfEngine = await loadPdfEngine();
  const options = [];
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([4, 5, 6]).buffer,
    pdfjsLib: { getDocument: () => { throw new Error('PDF.js should not load'); } },
    preferredFactory: async () => ({
      engine: 'embedpdf',
      getPageCount: () => 1,
      getPageInfo: async () => ({ pageNumber: 1, cssWidth: 300, cssHeight: 200, rotation: 0 }),
      renderPage: async (_pageNumber, renderOptions) => {
        options.push(renderOptions);
        return fakeEntry({ renderScale: renderOptions.scale });
      },
      destroy() {},
    }),
  });

  await doc.renderPage(1, { scale: 3 });

  assert.equal(doc.engine, 'embedpdf');
  assert.equal(options[0].withAnnotations, true);
});

test('PDFium worker adapter opens, renders, and closes through async messages', async () => {
  const pdfEngine = await loadPdfEngine();
  const messages = [];
  const doc = await pdfEngine.createPdfiumWorkerDocument({
    data: new Uint8Array([1, 2, 3]).buffer,
    workerFactory: fakePdfiumWorkerFactory(messages),
  });

  assert.equal(doc.engine, 'pdfium-worker');
  assert.equal(doc.numPages, 2);
  assert.equal(messages[0].message.type, 'open');
  assert.equal(messages[0].transfer.length, 1);

  assert.deepEqual(plain(await doc.getPageInfo(1)), {
    pageNumber: 1,
    cssWidth: 612,
    cssHeight: 792,
    rotation: 0,
  });

  const entry = await doc.renderPage(1, { scale: 2, withAnnotations: true });

  assert.equal(messages.find(item => item.message.type === 'renderPage').message.withAnnotations, true);
  assert.equal(entry.engine, 'pdfium-worker');
  assert.equal(entry.canvas.width, 1224);
  assert.equal(entry.canvas.height, 1584);
  assert.equal(entry.cssWidth, 612);
  assert.equal(entry.cssHeight, 792);
  assert.equal(entry.renderScale, 2);

  await doc.destroy();
  assert.equal(messages.at(-1).message.type, 'close');
});

test('preferred engine load failure falls back to PDF.js', async () => {
  const pdfEngine = await loadPdfEngine();
  const doc = await pdfEngine.createPdfEngineDocument({
    data: new Uint8Array([7, 8, 9]).buffer,
    pdfjsLib: {
      getDocument() {
        return { promise: Promise.resolve(fakePdfDocument({ pages: [fakePage({ width: 400, height: 500 })] })) };
      },
    },
    preferredFactory: async () => {
      throw new Error('preferred engine failed');
    },
  });

  assert.equal(doc.engine, 'pdfjs');
  assert.equal(doc.getPageCount(), 1);
});

function fakePdfium({ pages = [{ width: 300, height: 200, rotation: 0 }] } = {}) {
  const calls = [];
  const heap = new Uint8Array(12_000_000);
  return {
    calls,
    pdfium: {
      HEAPU8: heap,
      wasmExports: {
        malloc(size) {
          calls.push(['malloc', size]);
          return 32;
        },
        free(ptr) {
          calls.push(['free', ptr]);
        },
      },
    },
    FPDF_GetPageCount() {
      return pages.length;
    },
    FPDF_LoadPage(_docPtr, pageIndex) {
      calls.push(['loadPage', pageIndex]);
      return pageIndex + 100;
    },
    FPDF_ClosePage(pagePtr) {
      calls.push(['closePage', pagePtr]);
    },
    FPDF_GetPageWidthF(pagePtr) {
      return pages[pagePtr - 100].width;
    },
    FPDF_GetPageHeightF(pagePtr) {
      return pages[pagePtr - 100].height;
    },
    FPDFPage_GetRotation(pagePtr) {
      return pages[pagePtr - 100].rotation;
    },
    FPDFBitmap_Create(width, height) {
      calls.push(['createBitmap', width, height]);
      return 800;
    },
    FPDFBitmap_FillRect(bitmapPtr, x, y, width, height, color) {
      calls.push(['fillRect', bitmapPtr, x, y, width, height, color]);
      return true;
    },
    FPDF_RenderPageBitmap(bitmapPtr, pagePtr, x, y, width, height, rotation, flags) {
      calls.push(['renderBitmap', bitmapPtr, pagePtr, x, y, width, height, rotation, flags]);
    },
    FPDFBitmap_GetBuffer() {
      return 64;
    },
    FPDFBitmap_Destroy(bitmapPtr) {
      calls.push(['destroyBitmap', bitmapPtr]);
    },
    FPDF_CloseDocument(docPtr) {
      calls.push(['closeDocument', docPtr]);
    },
  };
}

test('PDFium adapter renders flattened annotations into canvas entries', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdfium = fakePdfium();
  const doc = pdfEngine.createPdfiumDocument({ pdfium, filePtr: 32, docPtr: 44 });

  assert.equal(doc.engine, 'pdfium');
  assert.equal(doc.numPages, 1);
  assert.deepEqual(plain(await doc.getPageInfo(1)), {
    pageNumber: 1,
    cssWidth: 300,
    cssHeight: 200,
    rotation: 0,
  });

  const entry = await doc.renderPage(1, { scale: 3, withAnnotations: true });

  assert.equal(entry.engine, 'pdfium');
  assert.equal(entry.canvas.width, 900);
  assert.equal(entry.canvas.height, 600);
  assert.equal(entry.cssWidth, 300);
  assert.equal(entry.cssHeight, 200);
  assert.equal(entry.renderScale, 3);
  assert.deepEqual(pdfium.calls.find(call => call[0] === 'renderBitmap'), ['renderBitmap', 800, 100, 0, 0, 900, 600, 0, 17]);
});

test('PDFium adapter keeps rotated PDF pages in displayed orientation', async () => {
  const pdfEngine = await loadPdfEngine();
  const pdfium = fakePdfium({ pages: [{ width: 792, height: 612, rotation: 1 }] });
  const doc = pdfEngine.createPdfiumDocument({ pdfium, filePtr: 32, docPtr: 44 });

  assert.deepEqual(plain(await doc.getPageInfo(1)), {
    pageNumber: 1,
    cssWidth: 792,
    cssHeight: 612,
    rotation: 90,
  });

  const entry = await doc.renderPage(1, { scale: 2 });

  assert.equal(entry.cssWidth, 792);
  assert.equal(entry.cssHeight, 612);
  assert.deepEqual(pdfium.calls.find(call => call[0] === 'renderBitmap'), ['renderBitmap', 800, 100, 0, 0, 1584, 1224, 0, 17]);
});
