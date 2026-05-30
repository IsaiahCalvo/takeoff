(function () {
  const DEFAULT_PAGE_GAP = 24;

  function buildContinuousPageLayout(entries, { pageGap = DEFAULT_PAGE_GAP } = {}) {
    const pages = [];
    const width = Math.max(...entries.map(entry => entry.cssWidth), 1);
    let y = 0;
    for (const entry of entries) {
      const x = (width - entry.cssWidth) / 2;
      pages.push({ page: entry.page, x, y, width: entry.cssWidth, height: entry.cssHeight });
      y += entry.cssHeight + pageGap;
    }
    return { width, height: Math.max(1, y - pageGap), pageGap, pages };
  }

  function pageBoxForPage(layout, page) {
    return layout?.pages?.find(candidate => candidate.page === page) || null;
  }

  function pageAtStackPoint(layout, point) {
    if (!point) return null;
    return (layout?.pages || []).find(page => (
      point.x >= page.x &&
      point.x <= page.x + page.width &&
      point.y >= page.y &&
      point.y <= page.y + page.height
    )) || null;
  }

  function stackPointToPagePoint(layout, point, { page = null } = {}) {
    const pageBox = page == null ? pageAtStackPoint(layout, point) : pageBoxForPage(layout, page);
    if (!pageBox || !point) return null;
    return {
      page: pageBox.page,
      point: { x: point.x - pageBox.x, y: point.y - pageBox.y },
      pageBox,
    };
  }

  function pagePointToStackPoint(layout, page, point) {
    const pageBox = pageBoxForPage(layout, page);
    if (!pageBox || !point) return null;
    return { x: point.x + pageBox.x, y: point.y + pageBox.y };
  }

  function translateSegment(segment, dx, dy) {
    return {
      ...segment,
      from: { x: segment.from.x + dx, y: segment.from.y + dy },
      c1: { x: segment.c1.x + dx, y: segment.c1.y + dy },
      c2: { x: segment.c2.x + dx, y: segment.c2.y + dy },
      to: { x: segment.to.x + dx, y: segment.to.y + dy },
    };
  }

  function measurementToStackMeasurement(measurement, layout) {
    const pageBox = pageBoxForPage(layout, measurement?.page);
    if (!measurement || !pageBox) return null;
    const dx = pageBox.x;
    const dy = pageBox.y;
    const translated = {
      ...measurement,
      points: (measurement.points || []).map(point => ({ x: point.x + dx, y: point.y + dy })),
      segments: measurement.segments ? measurement.segments.map(segment => translateSegment(segment, dx, dy)) : null,
    };
    if (measurement.rotationFrame) {
      translated.rotationFrame = {
        ...measurement.rotationFrame,
        x: measurement.rotationFrame.x + dx,
        y: measurement.rotationFrame.y + dy,
        cx: measurement.rotationFrame.cx + dx,
        cy: measurement.rotationFrame.cy + dy,
      };
    }
    return translated;
  }

  function continuousRenderScale({ requestedScale, layout, maxBitmapEdge }) {
    const maxEdge = Math.max(layout.width, layout.height, 1);
    return Math.max(0.1, Math.min(requestedScale, maxBitmapEdge / maxEdge));
  }

  function paintContinuousPages({ canvas, context, entries, layout, renderScale }) {
    canvas.width = Math.max(1, Math.ceil(layout.width * renderScale));
    canvas.height = Math.max(1, Math.ceil(layout.height * renderScale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(renderScale, renderScale);
    context.strokeStyle = 'rgba(125, 138, 145, 0.42)';
    context.lineWidth = 1 / renderScale;
    for (const page of layout.pages) {
      const entry = entries.find(item => item.page === page.page);
      context.drawImage(entry.canvas, page.x, page.y, page.width, page.height);
      context.strokeRect(page.x, page.y, page.width, page.height);
    }
    context.restore();
  }

  async function renderContinuousPdf({
    pageCount,
    requestedScale,
    maxBitmapEdge,
    cacheGet,
    renderPage,
    isCurrent,
    canvas,
    context,
    configureCanvasCssSize,
  }) {
    const entries = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const entry = cacheGet(page, requestedScale) || await renderPage(page, requestedScale);
      if (!isCurrent()) return null;
      entries.push({ ...entry, page });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!isCurrent()) return null;
    const layout = buildContinuousPageLayout(entries);
    const renderScale = continuousRenderScale({ requestedScale, layout, maxBitmapEdge });
    paintContinuousPages({ canvas, context, entries, layout, renderScale });
    configureCanvasCssSize(canvas, layout.width, layout.height);
    return { layout, renderScale };
  }

  function nearestPageForViewport({ layout, panY, zoom, stageHeight }) {
    if (!layout?.pages?.length || !zoom) return null;
    const centerY = (stageHeight / 2 - panY) / zoom;
    let nearest = layout.pages[0];
    let nearestDistance = Infinity;
    for (const page of layout.pages) {
      const distance = Math.abs(centerY - (page.y + page.height / 2));
      if (distance < nearestDistance) {
        nearest = page;
        nearestDistance = distance;
      }
    }
    return nearest.page;
  }

  function panYForPage({ layout, page, zoom, stageHeight, topPadding = 32 }) {
    const item = layout?.pages?.find(candidate => candidate.page === page);
    if (!item || !zoom) return null;
    const centered = (stageHeight - item.height * zoom) / 2;
    return Math.min(topPadding, centered) - item.y * zoom;
  }

  window.TakeoffContinuousRenderer = {
    buildContinuousPageLayout,
    pageBoxForPage,
    pageAtStackPoint,
    stackPointToPagePoint,
    pagePointToStackPoint,
    measurementToStackMeasurement,
    continuousRenderScale,
    paintContinuousPages,
    renderContinuousPdf,
    nearestPageForViewport,
    panYForPage,
  };
})();
