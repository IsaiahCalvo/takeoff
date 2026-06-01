(function () {
  function createPerformanceController({
    logger,
    state,
    stage,
    viewerModel,
    desiredPdfRenderScale,
    desiredPdfDetailTileScale = desiredPdfRenderScale,
    cacheSet,
    cacheHasUsable,
    renderPdfPage,
    renderPdfDetailTile = null,
    usesPdfDetailTile = () => false,
    showStatus,
  }) {
    let zoomRenderSeq = 0;
    let zoomRenderRunning = false;
    let zoomRenderQueued = false;

    function viewState() {
      return { zoom: state.zoom, panX: state.panX, panY: state.panY };
    }

    function anchorAt(point, view = viewState()) {
      return viewerModel.screenToImagePoint({
        clientX: point.clientX,
        clientY: point.clientY,
        stageRect: stage.getBoundingClientRect(),
        zoom: view.zoom,
        panX: view.panX,
        panY: view.panY,
        baseWidth: state.baseW,
        baseHeight: state.baseH,
      });
    }

    function beforeZoom(point) {
      const before = viewState();
      return {
        before,
        anchorBefore: anchorAt(point, before),
      };
    }

    function afterZoom(trace, { point, factor, source }) {
      const after = viewState();
      logger.recordZoom({
        source,
        direction: after.zoom >= trace.before.zoom ? 'in' : 'out',
        factor,
        before: trace.before,
        after,
        cursor: point,
        anchorBefore: trace.anchorBefore,
        anchorAfter: anchorAt(point, after),
        targetRenderScale: desiredPdfRenderScale(),
        targetDetailRenderScale: desiredPdfDetailTileScale(),
      });
    }

    function beforeScroll() {
      return { panX: state.panX, panY: state.panY, page: state.pdfPage };
    }

    function afterScroll(before, { source, deltaX, deltaY }) {
      logger.recordScroll({
        source,
        deltaX,
        deltaY,
        before,
        after: { panX: state.panX, panY: state.panY, page: state.pdfPage },
        continuous: state.continuousScrollMode,
      });
    }

    async function renderPageToCanvas(pageNum, requestedScale = state.minPdfRenderScale, { reason = 'page-render' } = {}) {
      const startedAt = performance.now();
      const pageInfo = await state.pdf.getPageInfo(pageNum);
      const renderScale = Math.max(
        state.minPdfRenderScale,
        Math.min(requestedScale, Math.min(state.maxPdfRenderScale, state.maxPdfBitmapEdge / Math.max(pageInfo.cssWidth, pageInfo.cssHeight)))
      );
      logger.recordRender({ phase: 'start', reason, page: pageNum, requestedScale, scale: renderScale, continuous: !!state.continuousScrollMode, engine: state.pdf.engine || 'unknown' });
      try {
        const entry = await state.pdf.renderPage(pageNum, { scale: renderScale, withAnnotations: true });
        cacheSet(pageNum, entry);
        logger.recordRender({
          phase: 'end',
          reason,
          page: pageNum,
          requestedScale,
          scale: renderScale,
          durationMs: performance.now() - startedAt,
          continuous: !!state.continuousScrollMode,
          engine: entry.engine || state.pdf.engine || 'unknown',
          width: entry.canvas?.width || null,
          height: entry.canvas?.height || null,
        });
        return entry;
      } catch (error) {
        logger.recordRender({ phase: 'error', reason, page: pageNum, requestedScale, scale: renderScale, durationMs: performance.now() - startedAt, continuous: !!state.continuousScrollMode, engine: state.pdf.engine || 'unknown', message: error?.message || String(error) });
        throw error;
      }
    }

    function schedulePdfRerenderForZoom() {
      if (!state.pdf) return;
      state.preRenderQueue = [];
      zoomRenderSeq += 1;
      const seq = zoomRenderSeq;
      clearTimeout(state.zoomRenderTimer);
      state.zoomRenderTimer = setTimeout(() => {
        runZoomSharpen(seq);
      }, 240);
    }

    async function runZoomSharpen(seq) {
      if (!state.pdf || seq !== zoomRenderSeq) return;
      if (zoomRenderRunning) {
        zoomRenderQueued = true;
        logger.recordRender({ phase: 'queued', reason: 'zoom-sharpen', page: state.pdfPage, scale: desiredPdfRenderScale() });
        return;
      }
      const targetScale = desiredPdfRenderScale();
      if (state.continuousScrollMode && usesPdfDetailTile()) {
        const detailTargetScale = desiredPdfDetailTileScale();
        logger.recordRender({ phase: 'skip', reason: 'zoom-sharpen', page: state.pdfPage, scale: targetScale, cause: 'continuous-detail-tile' });
        if (renderPdfDetailTile) {
          showStatus(`Sharpening PDF detail at ${detailTargetScale.toFixed(1)}x...`, 0);
          const applied = await renderPdfDetailTile({ reason: 'zoom-sharpen-detail' });
          if (applied) showStatus(`PDF detail sharpened at ${detailTargetScale.toFixed(1)}x`);
        }
        return;
      }
      if (!state.continuousScrollMode && cacheHasUsable(state.pdfPage, targetScale)) {
        logger.recordRender({ phase: 'skip', reason: 'zoom-sharpen', page: state.pdfPage, scale: targetScale, cause: 'cache-usable' });
        return;
      }
      zoomRenderRunning = true;
      zoomRenderQueued = false;
      showStatus(`Sharpening PDF at ${targetScale.toFixed(1)}x...`, 0);
      try {
        const applied = await renderPdfPage({
          fit: false,
          resetInteraction: false,
          minRenderScale: targetScale,
          reason: 'zoom-sharpen',
          preRender: false,
          shouldApply: () => seq === zoomRenderSeq,
        });
        if (applied) showStatus(`PDF sharpened at ${targetScale.toFixed(1)}x`);
      } finally {
        zoomRenderRunning = false;
        if (zoomRenderQueued || seq !== zoomRenderSeq) {
          zoomRenderQueued = false;
          schedulePdfRerenderForZoom();
        }
      }
    }

    async function savePerformanceLog() {
      try {
        const result = await logger.save();
        if (result.method === 'local-endpoint') {
          showStatus(`Performance log saved: ${result.path}`, 3600, { force: true });
        } else {
          showStatus(`Performance log downloaded: ${result.filename}`, 3600, { force: true });
        }
      } catch (error) {
        showStatus(`Could not save performance log: ${error?.message || error}`, 4200, { force: true });
      }
    }

    return {
      beforeZoom,
      afterZoom,
      beforeScroll,
      afterScroll,
      renderPageToCanvas,
      schedulePdfRerenderForZoom,
      savePerformanceLog,
    };
  }

  window.TakeoffPerformanceController = {
    createPerformanceController,
  };
})();
