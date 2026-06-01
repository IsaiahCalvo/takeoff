(function () {
  const DEFAULT_BASE_MAX_SCALE = 2.5;
  const DEFAULT_DEBOUNCE_MS = 90;
  const DEFAULT_OVERSCAN_PX = 32;

  function isPositive(value) {
    return Number.isFinite(value) && value > 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectRight(rect) {
    return Number.isFinite(rect?.right) ? rect.right : rect.left + rect.width;
  }

  function rectBottom(rect) {
    return Number.isFinite(rect?.bottom) ? rect.bottom : rect.top + rect.height;
  }

  function shouldUseDetailTile({
    engine,
    requestedScale = 1,
    baseMaxScale = DEFAULT_BASE_MAX_SCALE,
  } = {}) {
    return engine === 'pdfjs'
      && isPositive(requestedScale)
      && isPositive(baseMaxScale)
      && requestedScale > baseMaxScale;
  }

  function baseRenderScale(options = {}) {
    const baseMaxScale = options.baseMaxScale || DEFAULT_BASE_MAX_SCALE;
    return shouldUseDetailTile({ ...options, baseMaxScale }) ? baseMaxScale : options.requestedScale;
  }

  function visibleTileRect({
    stageRect,
    viewportRect,
    baseWidth,
    baseHeight,
    overscanPx = DEFAULT_OVERSCAN_PX,
  } = {}) {
    if (!stageRect || !viewportRect || !isPositive(baseWidth) || !isPositive(baseHeight)) return null;
    if (!isPositive(viewportRect.width) || !isPositive(viewportRect.height)) return null;
    const viewportRight = rectRight(viewportRect);
    const viewportBottom = rectBottom(viewportRect);
    const stageRight = rectRight(stageRect);
    const stageBottom = rectBottom(stageRect);
    const leftScreen = Math.max(stageRect.left, viewportRect.left) - overscanPx;
    const topScreen = Math.max(stageRect.top, viewportRect.top) - overscanPx;
    const rightScreen = Math.min(stageRight, viewportRight) + overscanPx;
    const bottomScreen = Math.min(stageBottom, viewportBottom) + overscanPx;
    if (rightScreen <= leftScreen || bottomScreen <= topScreen) return null;

    const scaleX = baseWidth / viewportRect.width;
    const scaleY = baseHeight / viewportRect.height;
    const sourceX = clamp((leftScreen - viewportRect.left) * scaleX, 0, baseWidth);
    const sourceY = clamp((topScreen - viewportRect.top) * scaleY, 0, baseHeight);
    const right = clamp((rightScreen - viewportRect.left) * scaleX, 0, baseWidth);
    const bottom = clamp((bottomScreen - viewportRect.top) * scaleY, 0, baseHeight);
    const width = right - sourceX;
    const height = bottom - sourceY;
    if (width <= 1 || height <= 1) return null;
    return { sourceX, sourceY, width, height };
  }

  function visiblePageTileRect({
    stageRect,
    viewportRect,
    pageBox,
    baseWidth,
    baseHeight,
    overscanPx = DEFAULT_OVERSCAN_PX,
  } = {}) {
    if (!pageBox || !isPositive(pageBox.width) || !isPositive(pageBox.height)) return null;
    if (!viewportRect || !isPositive(viewportRect.width) || !isPositive(viewportRect.height)) return null;
    if (!isPositive(baseWidth) || !isPositive(baseHeight)) return null;
    const scaleX = viewportRect.width / baseWidth;
    const scaleY = viewportRect.height / baseHeight;
    if (!isPositive(scaleX) || !isPositive(scaleY)) return null;
    const pageRect = {
      left: viewportRect.left + pageBox.x * scaleX,
      top: viewportRect.top + pageBox.y * scaleY,
      width: pageBox.width * scaleX,
      height: pageBox.height * scaleY,
    };
    pageRect.right = pageRect.left + pageRect.width;
    pageRect.bottom = pageRect.top + pageRect.height;
    const tile = visibleTileRect({
      stageRect,
      viewportRect: pageRect,
      baseWidth: pageBox.width,
      baseHeight: pageBox.height,
      overscanPx,
    });
    if (!tile) return null;
    return {
      page: pageBox.page,
      ...tile,
      stackX: pageBox.x + tile.sourceX,
      stackY: pageBox.y + tile.sourceY,
    };
  }

  function createPdfDetailTileController({
    state,
    stage,
    viewport,
    detailCanvas,
    logger,
    desiredPdfRenderScale,
    baseMaxScale = DEFAULT_BASE_MAX_SCALE,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    overscanPx = DEFAULT_OVERSCAN_PX,
  } = {}) {
    let timer = null;
    let generation = 0;

    function hasTileRenderer() {
      return !!(state?.pdf && typeof state.pdf.renderPageTile === 'function');
    }

    function canTile(requestedScale = desiredPdfRenderScale?.()) {
      return hasTileRenderer() && shouldUseDetailTile({
        engine: state.pdf?.engine,
        requestedScale,
        baseMaxScale,
      });
    }

    function cappedBaseRenderScale(requestedScale = desiredPdfRenderScale?.()) {
      return canTile(requestedScale) ? baseMaxScale : requestedScale;
    }

    function clear() {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      if (!detailCanvas) return;
      detailCanvas.style.display = 'none';
      detailCanvas.width = 1;
      detailCanvas.height = 1;
      if (detailCanvas.dataset) {
        delete detailCanvas.dataset.pdfEngine;
        delete detailCanvas.dataset.renderScale;
        delete detailCanvas.dataset.page;
      }
    }

    function paint(entry) {
      detailCanvas.width = entry.canvas.width;
      detailCanvas.height = entry.canvas.height;
      detailCanvas.style.left = `${entry.cssX}px`;
      detailCanvas.style.top = `${entry.cssY}px`;
      detailCanvas.style.width = `${entry.cssWidth}px`;
      detailCanvas.style.height = `${entry.cssHeight}px`;
      detailCanvas.style.display = 'block';
      if (detailCanvas.dataset) {
        detailCanvas.dataset.pdfEngine = entry.engine || 'pdfjs-detail-tile';
        detailCanvas.dataset.renderScale = String(entry.renderScale || '');
        detailCanvas.dataset.page = String(state.pdfPage || '');
      }
      const ctx = detailCanvas.getContext('2d');
      ctx.clearRect(0, 0, detailCanvas.width, detailCanvas.height);
      ctx.drawImage(entry.canvas, 0, 0);
    }

    async function renderNow({ reason = 'pdf-detail-tile' } = {}) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!detailCanvas || !stage || !viewport || !state?.pdf || !canTile()) {
        clear();
        return false;
      }
      const requestedScale = desiredPdfRenderScale();
      const stageRect = stage.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const pageBox = state.continuousScrollMode && state.continuousPageLayout
        ? state.continuousPageLayout.pages?.find(candidate => candidate.page === state.pdfPage)
        : null;
      const tileRect = pageBox
        ? visiblePageTileRect({ stageRect, viewportRect, pageBox, baseWidth: state.baseW, baseHeight: state.baseH, overscanPx })
        : visibleTileRect({ stageRect, viewportRect, baseWidth: state.baseW, baseHeight: state.baseH, overscanPx });
      if (!tileRect) {
        clear();
        return false;
      }
      const page = tileRect.page || state.pdfPage;
      const myGeneration = ++generation;
      const startedAt = performance.now();
      logger?.recordRender?.({
        phase: 'start',
        reason,
        page,
        requestedScale,
        scale: requestedScale,
        engine: 'pdfjs-detail-tile',
        tile: tileRect,
      });
      try {
        const entry = await state.pdf.renderPageTile(page, {
          scale: requestedScale,
          ...tileRect,
          withAnnotations: true,
        });
        if (myGeneration !== generation || page !== state.pdfPage) return false;
        paint({
          ...entry,
          cssX: tileRect.stackX ?? entry.cssX,
          cssY: tileRect.stackY ?? entry.cssY,
        });
        logger?.recordRender?.({
          phase: 'end',
          reason,
          page,
          requestedScale,
          scale: requestedScale,
          durationMs: performance.now() - startedAt,
          engine: entry.engine || 'pdfjs-detail-tile',
          width: entry.canvas?.width || null,
          height: entry.canvas?.height || null,
          tile: tileRect,
        });
        return true;
      } catch (error) {
        if (myGeneration === generation) {
          logger?.recordRender?.({
            phase: 'error',
            reason,
            page,
            requestedScale,
            scale: requestedScale,
            durationMs: performance.now() - startedAt,
            engine: 'pdfjs-detail-tile',
            message: error?.message || String(error),
          });
        }
        return false;
      }
    }

    function schedule({ reason = 'pdf-detail-tile', delay = debounceMs } = {}) {
      if (!canTile()) {
        clear();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        renderNow({ reason });
      }, delay);
    }

    return {
      baseRenderScale: cappedBaseRenderScale,
      clear,
      renderNow,
      schedule,
    };
  }

  window.TakeoffPdfDetailTile = {
    shouldUseDetailTile,
    baseRenderScale,
    visibleTileRect,
    visiblePageTileRect,
    createPdfDetailTileController,
  };
})();
