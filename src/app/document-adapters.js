(function () {
  function createPdfDocumentState(pdf) {
    return {
      pdf,
      pdfPages: pdf.numPages,
      pdfPage: 1,
      continuousScrollMode: false,
      continuousScrollAutoEnable: pdf.numPages > 1,
      imageBitmap: null,
    };
  }

  function createImageDocumentState(image) {
    return {
      imageBitmap: image,
      pdf: null,
      pdfPages: 1,
      pdfPage: 1,
      baseW: image.width,
      baseH: image.height,
    };
  }

  function boundedBitmapSize({ width, height, maxBitmapEdge }) {
    const maxEdge = Number(maxBitmapEdge);
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) return { width, height };
    const largest = Math.max(width, height);
    if (!largest || largest <= maxEdge) return { width, height };
    const scale = maxEdge / largest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  function renderImageBitmapToCanvas({
    image,
    maxBitmapEdge = null,
    baseCanvas,
    baseCtx,
    configureCanvasCssSize,
    configureDrawCanvas,
  }) {
    const state = createImageDocumentState(image);
    const bitmapSize = boundedBitmapSize({
      width: state.baseW,
      height: state.baseH,
      maxBitmapEdge,
    });
    baseCanvas.width = bitmapSize.width;
    baseCanvas.height = bitmapSize.height;
    configureCanvasCssSize(baseCanvas, state.baseW, state.baseH);
    configureDrawCanvas();
    if (bitmapSize.width === state.baseW && bitmapSize.height === state.baseH) {
      baseCtx.drawImage(image, 0, 0);
    } else {
      baseCtx.drawImage(image, 0, 0, bitmapSize.width, bitmapSize.height);
    }
    return state;
  }

  window.TakeoffDocumentAdapters = {
    createPdfDocumentState,
    createImageDocumentState,
    renderImageBitmapToCanvas,
  };
})();
