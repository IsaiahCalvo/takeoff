(function () {
  function createPdfDocumentState(pdf) {
    return {
      pdf,
      pdfPages: pdf.numPages,
      pdfPage: 1,
      continuousScrollMode: pdf.numPages > 1,
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

  function renderImageBitmapToCanvas({
    image,
    baseCanvas,
    baseCtx,
    configureCanvasCssSize,
    configureDrawCanvas,
  }) {
    const state = createImageDocumentState(image);
    baseCanvas.width = state.baseW;
    baseCanvas.height = state.baseH;
    configureCanvasCssSize(baseCanvas, state.baseW, state.baseH);
    configureDrawCanvas();
    baseCtx.drawImage(image, 0, 0);
    return state;
  }

  window.TakeoffDocumentAdapters = {
    createPdfDocumentState,
    createImageDocumentState,
    renderImageBitmapToCanvas,
  };
})();
