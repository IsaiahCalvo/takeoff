(function () {
  const FPDF_ANNOT = 0x01;
  const FPDF_REVERSE_BYTE_ORDER = 0x10;
  const PDFIUM_RENDER_FLAGS = FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER;
  const WHITE_RGBA = 0xFFFFFFFF;
  let pdfiumModulePromise = null;

  function annotationModeValue(pdfjsLib, options = {}) {
    if (options.annotationMode?.ENABLE != null) return options.annotationMode.ENABLE;
    if (pdfjsLib?.AnnotationMode?.ENABLE != null) return pdfjsLib.AnnotationMode.ENABLE;
    return null;
  }

  function markCanvasEngine(canvas, engine) {
    if (canvas?.dataset) canvas.dataset.pdfEngine = engine;
  }

  function renderOptionsForPdfJs({ canvasContext, viewport, withAnnotations, pdfjsLib, options }) {
    const renderOptions = { canvasContext, viewport };
    const annotationMode = annotationModeValue(pdfjsLib, options);
    if (withAnnotations && annotationMode != null) renderOptions.annotationMode = annotationMode;
    return renderOptions;
  }

  function createPdfJsDocument(pdf, options = {}) {
    return {
      engine: 'pdfjs',
      numPages: pdf.numPages,
      getPageCount() {
        return pdf.numPages;
      },
      async getPageInfo(pageNumber) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        return {
          pageNumber,
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          rotation: viewport.rotation || 0,
        };
      },
      async renderPage(pageNumber, { scale = 1, withAnnotations = true } = {}) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        markCanvasEngine(canvas, 'pdfjs');
        await page.render(renderOptionsForPdfJs({
          canvasContext: canvas.getContext('2d'),
          viewport,
          withAnnotations,
          pdfjsLib: options.pdfjsLib,
          options,
        })).promise;
        return {
          canvas,
          cssWidth: baseViewport.width,
          cssHeight: baseViewport.height,
          renderScale: scale,
          engine: 'pdfjs',
        };
      },
      destroy() {
        if (typeof pdf.destroy === 'function') pdf.destroy();
      },
    };
  }

  async function loadPdfJsDocument({ data, pdfjsLib }) {
    if (!pdfjsLib?.getDocument) throw new Error('PDF.js is unavailable.');
    return createPdfJsDocument(await pdfjsLib.getDocument({ data }).promise, { pdfjsLib });
  }

  function rotationDegrees(rotation) {
    return [0, 90, 180, 270][rotation] || 0;
  }

  function displayedPageSize({ width, height, rotation }) {
    return {
      cssWidth: width || 1,
      cssHeight: height || 1,
    };
  }

  function copyArrayBuffer(data) {
    if (data?.slice && typeof data.byteLength === 'number' && data.byteOffset == null) return data.slice(0);
    if (data instanceof ArrayBuffer) return data.slice(0);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }

  function defaultPdfiumWorkerFactory() {
    if (typeof Worker === 'undefined') throw new Error('PDFium worker rendering is unavailable.');
    return new Worker(new URL('./pdfium-render-worker.js', import.meta.url), { type: 'module' });
  }

  function workerMessageError(error) {
    return error instanceof Error ? error : new Error(error?.message || String(error || 'PDFium worker failed.'));
  }

  function createWorkerClient(worker) {
    let nextId = 1;
    const pending = new Map();
    worker.onmessage = event => {
      const message = event.data || {};
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      if (message.ok) callbacks.resolve(message.result);
      else callbacks.reject(new Error(message.error || 'PDFium worker failed.'));
    };
    worker.onerror = event => {
      const error = workerMessageError(event.error || event.message);
      for (const callbacks of pending.values()) callbacks.reject(error);
      pending.clear();
    };
    return {
      post(type, payload = {}, transfer = []) {
        const id = nextId;
        nextId += 1;
        const promise = new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
        });
        worker.postMessage({ id, type, ...payload }, transfer);
        return promise;
      },
      terminate() {
        worker.terminate();
      },
    };
  }

  function canvasFromWorkerRender(result) {
    const rgba = new Uint8ClampedArray(result.buffer);
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    markCanvasEngine(canvas, result.engine || 'pdfium-worker');
    canvas.getContext('2d').putImageData(new ImageData(rgba, result.width, result.height), 0, 0);
    return {
      canvas,
      cssWidth: result.cssWidth,
      cssHeight: result.cssHeight,
      renderScale: result.renderScale,
      engine: result.engine || 'pdfium-worker',
    };
  }

  async function createPdfiumWorkerDocument({
    data,
    workerFactory = defaultPdfiumWorkerFactory,
  } = {}) {
    const worker = workerFactory();
    const client = createWorkerClient(worker);
    const buffer = copyArrayBuffer(data);
    try {
      const opened = await client.post('open', { data: buffer }, [buffer]);
      return {
        engine: 'pdfium-worker',
        numPages: opened.pageCount,
        getPageCount() {
          return opened.pageCount;
        },
        getPageInfo(pageNumber) {
          return client.post('getPageInfo', { docId: opened.docId, pageNumber });
        },
        async renderPage(pageNumber, { scale = 1, withAnnotations = true } = {}) {
          const result = await client.post('renderPage', {
            docId: opened.docId,
            pageNumber,
            scale,
            withAnnotations,
          });
          return canvasFromWorkerRender(result);
        },
        async destroy() {
          try {
            await client.post('close', { docId: opened.docId });
          } finally {
            client.terminate();
          }
        },
      };
    } catch (error) {
      client.terminate();
      throw error;
    }
  }

  function pageDimensions(pdfium, pagePtr) {
    const width = pdfium.FPDF_GetPageWidthF(pagePtr);
    const height = pdfium.FPDF_GetPageHeightF(pagePtr);
    const rotation = pdfium.FPDFPage_GetRotation(pagePtr) || 0;
    return {
      width,
      height,
      rotation,
      ...displayedPageSize({ width, height, rotation }),
    };
  }

  function createPdfiumDocument({ pdfium, filePtr, docPtr }) {
    const pageCount = pdfium.FPDF_GetPageCount(docPtr);
    return {
      engine: 'pdfium',
      numPages: pageCount,
      getPageCount() {
        return pageCount;
      },
      async getPageInfo(pageNumber) {
        const pagePtr = pdfium.FPDF_LoadPage(docPtr, pageNumber - 1);
        if (!pagePtr) throw new Error(`Invalid PDF page ${pageNumber}.`);
        try {
          const dims = pageDimensions(pdfium, pagePtr);
          return {
            pageNumber,
            cssWidth: dims.cssWidth,
            cssHeight: dims.cssHeight,
            rotation: rotationDegrees(dims.rotation),
          };
        } finally {
          pdfium.FPDF_ClosePage(pagePtr);
        }
      },
      async renderPage(pageNumber, { scale = 1, withAnnotations = true } = {}) {
        const pagePtr = pdfium.FPDF_LoadPage(docPtr, pageNumber - 1);
        if (!pagePtr) throw new Error(`Invalid PDF page ${pageNumber}.`);
        let bitmapPtr = 0;
        try {
          const dims = pageDimensions(pdfium, pagePtr);
          const canvasWidth = Math.max(1, Math.ceil(dims.cssWidth * scale));
          const canvasHeight = Math.max(1, Math.ceil(dims.cssHeight * scale));
          bitmapPtr = pdfium.FPDFBitmap_Create(canvasWidth, canvasHeight, 0);
          if (!bitmapPtr) throw new Error('Could not create PDFium bitmap.');
          pdfium.FPDFBitmap_FillRect(bitmapPtr, 0, 0, canvasWidth, canvasHeight, WHITE_RGBA);
          pdfium.FPDF_RenderPageBitmap(
            bitmapPtr,
            pagePtr,
            0,
            0,
            canvasWidth,
            canvasHeight,
            0,
            withAnnotations ? PDFIUM_RENDER_FLAGS : FPDF_REVERSE_BYTE_ORDER
          );
          const bufferPtr = pdfium.FPDFBitmap_GetBuffer(bitmapPtr);
          if (!bufferPtr) throw new Error('Could not read PDFium bitmap.');
          const bufferSize = canvasWidth * canvasHeight * 4;
          const rgba = new Uint8ClampedArray(pdfium.pdfium.HEAPU8.buffer, bufferPtr, bufferSize).slice();
          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          markCanvasEngine(canvas, 'pdfium');
          canvas.getContext('2d').putImageData(new ImageData(rgba, canvasWidth, canvasHeight), 0, 0);
          return {
            canvas,
            cssWidth: dims.cssWidth,
            cssHeight: dims.cssHeight,
            renderScale: scale,
            engine: 'pdfium',
          };
        } finally {
          if (bitmapPtr) pdfium.FPDFBitmap_Destroy(bitmapPtr);
          pdfium.FPDF_ClosePage(pagePtr);
        }
      },
      destroy() {
        pdfium.FPDF_CloseDocument(docPtr);
        pdfium.pdfium.wasmExports.free(filePtr);
      },
    };
  }

  async function loadPdfiumModule() {
    if (!pdfiumModulePromise) {
      pdfiumModulePromise = import('@embedpdf/pdfium').then(async ({ init, DEFAULT_PDFIUM_WASM_URL }) => {
        const response = await fetch(DEFAULT_PDFIUM_WASM_URL);
        if (!response.ok) throw new Error(`Could not load PDFium WASM: ${response.status}`);
        const pdfium = await init({ wasmBinary: await response.arrayBuffer() });
        pdfium.PDFiumExt_Init();
        return pdfium;
      });
    }
    return pdfiumModulePromise;
  }

  async function createPdfiumDocumentFromBuffer({ data }) {
    const pdfium = await loadPdfiumModule();
    const content = new Uint8Array(copyArrayBuffer(data));
    const filePtr = pdfium.pdfium.wasmExports.malloc(content.length);
    pdfium.pdfium.HEAPU8.set(content, filePtr);
    const docPtr = pdfium.FPDF_LoadMemDocument(filePtr, content.length, '');
    if (!docPtr) {
      pdfium.pdfium.wasmExports.free(filePtr);
      throw new Error(`PDFium failed to load PDF: ${pdfium.FPDF_GetLastError?.() || 'unknown error'}`);
    }
    return createPdfiumDocument({ pdfium, filePtr, docPtr });
  }

  async function createPdfEngineDocument({
    data,
    pdfjsLib,
    preferredFactory = createPdfiumWorkerDocument,
  } = {}) {
    if (preferredFactory) {
      try {
        const preferred = await preferredFactory({ data });
        if (preferred) {
          const originalRenderPage = preferred.renderPage.bind(preferred);
          const numPages = preferred.numPages ?? preferred.getPageCount?.();
          return {
            ...preferred,
            numPages,
            async renderPage(pageNumber, options = {}) {
              return originalRenderPage(pageNumber, {
                withAnnotations: true,
                ...options,
              });
            },
          };
        }
      } catch (err) {
        console.warn('Preferred PDF engine failed; falling back to PDF.js.', err);
      }
    }
    return loadPdfJsDocument({ data, pdfjsLib });
  }

  window.TakeoffPdfEngine = {
    createPdfJsDocument,
    createPdfiumWorkerDocument,
    createPdfiumDocument,
    createPdfEngineDocument,
  };
})();
