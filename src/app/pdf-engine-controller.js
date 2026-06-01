(function () {
  function normalizeChoice(value) {
    return value === 'pdfjs' ? 'pdfjs' : 'embedpdf';
  }

  function label(value) {
    return normalizeChoice(value) === 'pdfjs' ? 'PDF.js' : 'EmbedPDF';
  }

  function createPdfEngineController({
    state,
    pdfEngine,
    pdfjsLib,
    logger,
    toggle,
    documentStore,
    currentPage,
    totalPages,
    renderPdfPage,
    saveActiveDocument,
    showStatus,
  }) {
    function activeRenderEngine() {
      if (state.pdf?.engine) return state.pdf.engine;
      if (state.imageBitmap) return 'image';
      return normalizeChoice(state.pdfEngineChoice);
    }

    function updateLogContext(patch = {}) {
      logger.setContext({
        fileName: state.pdfFileName || documentStore.activeDocumentName(state) || null,
        page: state.baseW ? currentPage() : null,
        pageCount: state.pdfPages || (state.baseW ? totalPages() : 0),
        renderEngine: activeRenderEngine(),
        renderEngineChoice: normalizeChoice(state.pdfEngineChoice),
        continuousScrollMode: !!state.continuousScrollMode,
        ...patch,
      });
    }

    function updateToggle() {
      if (!toggle) return;
      toggle.hidden = !(state.pdf || state.pdfSourceData);
      const choice = normalizeChoice(state.pdfEngineChoice);
      toggle.querySelectorAll('[data-pdf-engine]').forEach(button => {
        const active = button.dataset.pdfEngine === choice;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      toggle.title = `PDF renderer: ${label(choice)}`;
    }

    async function switchEngine(choice) {
      const nextChoice = normalizeChoice(choice);
      if (nextChoice === state.pdfEngineChoice && state.pdf) return;
      const previousChoice = state.pdfEngineChoice;
      const previousPdf = state.pdf;
      const previousPage = state.pdfPage;
      state.pdfEngineChoice = nextChoice;
      updateToggle();
      updateLogContext({ renderEngineChoice: nextChoice });

      if (!state.pdf || !state.pdfSourceData) {
        saveActiveDocument();
        return;
      }

      showStatus(`Switching renderer to ${label(nextChoice)}...`, 0, { force: true });
      try {
        const pdfDoc = await pdfEngine.createPdfEngineDocument({
          data: state.pdfSourceData.slice(0),
          pdfjsLib,
          engine: nextChoice,
        });
        state.pdf = pdfDoc;
        state.pdfPages = pdfDoc.numPages;
        state.pdfPage = Math.min(previousPage, pdfDoc.numPages || previousPage);
        state.pageCache.clear();
        state.preRenderQueue = [];
        state.preRenderRunning = false;
        state.continuousPageLayout = null;
        updateToggle();
        updateLogContext({ renderEngine: pdfDoc.engine || 'unknown', renderEngineChoice: nextChoice });
        await renderPdfPage({ fit: false, resetInteraction: false, reason: 'engine-switch' });
        if (previousPdf?.destroy) Promise.resolve(previousPdf.destroy()).catch(() => {});
        saveActiveDocument();
        showStatus(`Renderer: ${label(nextChoice)}.`, 1600, { force: true });
      } catch (error) {
        state.pdfEngineChoice = previousChoice;
        state.pdf = previousPdf;
        state.pdfPages = previousPdf?.numPages || state.pdfPages;
        state.pdfPage = previousPage;
        state.pageCache.clear();
        state.continuousPageLayout = null;
        updateToggle();
        updateLogContext();
        showStatus(`Could not switch renderer: ${error?.message || error}`, 4200, { force: true });
      }
    }

    return {
      normalizeChoice,
      label,
      updateLogContext,
      updateToggle,
      switchEngine,
    };
  }

  window.TakeoffPdfEngineController = {
    createPdfEngineController,
    normalizeChoice,
    label,
  };
})();
