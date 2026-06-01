(function () {
  function annotationModeValue(pdfjsLib, options = {}) {
    if (options.annotationMode?.ENABLE != null) return options.annotationMode.ENABLE;
    if (pdfjsLib?.AnnotationMode?.ENABLE != null) return pdfjsLib.AnnotationMode.ENABLE;
    return null;
  }

  function markCanvasEngine(canvas, engine) {
    if (canvas?.dataset) canvas.dataset.pdfEngine = engine;
  }

  function copyPdfData(data) {
    if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') return new Uint8Array(data.slice(0));
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    return data;
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
      async renderPageTile(pageNumber, { scale = 1, sourceX = 0, sourceY = 0, width = 1, height = 1, withAnnotations = true } = {}) {
        const page = await pdf.getPage(pageNumber);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width * scale));
        canvas.height = Math.max(1, Math.ceil(height * scale));
        markCanvasEngine(canvas, 'pdfjs-detail-tile');
        await page.render({
          ...renderOptionsForPdfJs({
            canvasContext: canvas.getContext('2d'),
            viewport: page.getViewport({ scale }),
            withAnnotations,
            pdfjsLib: options.pdfjsLib,
            options,
          }),
          transform: [1, 0, 0, 1, -sourceX * scale, -sourceY * scale],
        }).promise;
        return {
          canvas,
          cssX: sourceX,
          cssY: sourceY,
          cssWidth: width,
          cssHeight: height,
          renderScale: scale,
          engine: 'pdfjs-detail-tile',
        };
      },
      destroy() {
        if (typeof pdf.destroy === 'function') pdf.destroy();
      },
    };
  }

  async function loadPdfJsDocument({ data, pdfjsLib }) {
    if (!pdfjsLib?.getDocument) throw new Error('PDF.js is unavailable.');
    return createPdfJsDocument(await pdfjsLib.getDocument({ data: copyPdfData(data) }).promise, { pdfjsLib });
  }

  async function createPdfEngineDocument({ data, pdfjsLib } = {}) {
    return loadPdfJsDocument({ data, pdfjsLib });
  }

  window.TakeoffPdfEngine = {
    createPdfJsDocument,
    createPdfEngineDocument,
  };
})();
