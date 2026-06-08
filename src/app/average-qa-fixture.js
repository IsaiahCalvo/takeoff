(function () {
  const PAGE_WIDTH = 960;
  const PAGE_HEIGHT = 1240;
  const PAGE_COUNT = 3;
  const PATH_COLOR = '#b6ff3c';
  const HEADER_COLOR = '#325aa8';

  function shouldUseAverageQaFixture(search = window.location.search) {
    const params = new URLSearchParams(search || '');
    return /^averages(?:-|$)/.test(params.get('qa') || '');
  }

  function ftToInches(ft) {
    return Number((Number(ft || 0) * 12).toFixed(6));
  }

  function measurementLengthPx(points = []) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1];
      const next = points[index];
      length += Math.hypot(next.x - prev.x, next.y - prev.y);
    }
    return Number(length.toFixed(3));
  }

  function createMeasurement({ id, page, name, ft, points, color = PATH_COLOR }) {
    return {
      id,
      name,
      page,
      points,
      lengthPx: measurementLengthPx(points),
      lengthInches: ftToInches(ft),
      color,
      labelT: 0.5,
      drawType: 'line',
      shape: { active: 'line' },
      pathTemplateId: 'qa-average-template',
      pathId: 'path',
      pathName: 'PATH',
      pathCategoryId: 'path',
      pathCategoryName: 'PATH',
      pathStyle: {
        stroke: { color, width: 3 },
      },
    };
  }

  function createAverageQaMeasurements() {
    const rows = [
      { page: 1, name: 'Run 1', ft: 7.27, points: [{ x: 305, y: 840 }, { x: 420, y: 700 }] },
      { page: 1, name: 'Run 2', ft: 4.37, points: [{ x: 700, y: 790 }, { x: 790, y: 750 }] },
      { page: 1, name: 'Run 3', ft: 6.45, points: [{ x: 560, y: 610 }, { x: 690, y: 655 }] },
      { page: 2, name: 'Run 4', ft: 10.00, points: [{ x: 180, y: 350 }, { x: 360, y: 350 }] },
      { page: 2, name: 'Run 5', ft: 12.00, points: [{ x: 250, y: 520 }, { x: 520, y: 530 }] },
      { page: 2, name: 'Run 6', ft: 15.00, points: [{ x: 620, y: 300 }, { x: 720, y: 455 }, { x: 700, y: 625 }] },
      { page: 2, name: 'Run 7', ft: 20.00, points: [{ x: 200, y: 780 }, { x: 520, y: 730 }, { x: 730, y: 820 }] },
      { page: 2, name: 'Run 8', ft: 20.00, points: [{ x: 250, y: 980 }, { x: 540, y: 960 }, { x: 790, y: 1040 }] },
      { page: 3, name: 'Run 9', ft: 11.20, points: [{ x: 180, y: 310 }, { x: 360, y: 430 }] },
      { page: 3, name: 'Run 10', ft: 14.80, points: [{ x: 520, y: 360 }, { x: 790, y: 410 }] },
      { page: 3, name: 'Run 11', ft: 20.00, points: [{ x: 240, y: 690 }, { x: 510, y: 690 }, { x: 730, y: 850 }] },
      { page: 3, name: 'Run 12', ft: 13.13, points: [{ x: 310, y: 1010 }, { x: 520, y: 910 }, { x: 735, y: 965 }] },
    ];
    return rows.map((row, index) => createMeasurement({ ...row, id: index + 1 }));
  }

  function drawPageBackground(ctx, pageNumber = 1) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.fillStyle = HEADER_COLOR;
    ctx.fillRect(0, 0, PAGE_WIDTH, 86);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`Average QA - Page ${pageNumber}`, 52, 54);
    ctx.fillStyle = '#30363a';
    ctx.font = '600 20px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Measured runs are seeded for page, category, and document average QA.', 52, 146);
    ctx.strokeStyle = '#d6d9dc';
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 180, PAGE_WIDTH - 104, PAGE_HEIGHT - 240);
    ctx.strokeStyle = '#eceff1';
    ctx.lineWidth = 1;
    for (let y = 240; y < PAGE_HEIGHT - 96; y += 72) {
      ctx.beginPath();
      ctx.moveTo(52, y);
      ctx.lineTo(PAGE_WIDTH - 52, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function createAverageQaPdf() {
    return {
      engine: 'qa-fixture',
      numPages: PAGE_COUNT,
      getPageCount() {
        return PAGE_COUNT;
      },
      async getPageInfo(pageNumber) {
        return {
          pageNumber,
          cssWidth: PAGE_WIDTH,
          cssHeight: PAGE_HEIGHT,
          rotation: 0,
        };
      },
      async renderPage(pageNumber, { scale = 1 } = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(PAGE_WIDTH * scale));
        canvas.height = Math.max(1, Math.ceil(PAGE_HEIGHT * scale));
        if (canvas.dataset) canvas.dataset.pdfEngine = 'qa-fixture';
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        drawPageBackground(ctx, pageNumber);
        return {
          canvas,
          cssWidth: PAGE_WIDTH,
          cssHeight: PAGE_HEIGHT,
          renderScale: scale,
          engine: 'qa-fixture',
        };
      },
      destroy() {},
    };
  }

  function paintFixturePage({
    state,
    baseCanvas,
    baseCtx,
    configureCanvasCssSize,
    configureDrawCanvas,
    page = 1,
  } = {}) {
    if (!state || !baseCanvas || !baseCtx) return false;
    baseCanvas.width = PAGE_WIDTH;
    baseCanvas.height = PAGE_HEIGHT;
    if (baseCanvas.dataset) baseCanvas.dataset.pdfEngine = 'qa-fixture';
    state.baseW = PAGE_WIDTH;
    state.baseH = PAGE_HEIGHT;
    configureCanvasCssSize?.(baseCanvas, state.baseW, state.baseH);
    configureDrawCanvas?.();
    drawPageBackground(baseCtx, page);
    return true;
  }

  function loadIfRequested({
    state,
    resetDocState,
    baseCanvas,
    baseCtx,
    configureCanvasCssSize,
    configureDrawCanvas,
    onPageReady,
    setMode,
    saveActiveDocument,
  } = {}) {
    if (!shouldUseAverageQaFixture()) return false;
    if (!state || typeof resetDocState !== 'function') return false;

    resetDocState();
    state.documents = [];
    state.activeDocId = 'qa-averages';
    state.pdf = createAverageQaPdf();
    state.pdfSourceData = null;
    state.pdfFileName = 'averages-demo.pdf';
    state.pdfPage = 1;
    state.pdfPages = PAGE_COUNT;
    state.continuousScrollMode = false;
    state.continuousScrollPreferences = {};
    state.pathCategoryVisibility = {};
    state.unit = 'ft';
    state.pageScales = { 1: 100, 2: 100, 3: 100 };
    state.pxPerInch = state.pageScales[state.pdfPage];
    state.measurements = createAverageQaMeasurements();
    state.nextRunNumber = state.measurements.length + 1;
    state.nextMeasurementPanelOrder = state.measurements.length + 1;
    state.sidebarTab = 'page';
    state.collapsedPageGroups = {};

    paintFixturePage({
      state,
      baseCanvas,
      baseCtx,
      configureCanvasCssSize,
      configureDrawCanvas,
      page: state.pdfPage,
    });
    onPageReady?.({ fit: true, resetInteraction: true });
    setMode?.('selection');
    saveActiveDocument?.('averages-demo.pdf');
    return true;
  }

  window.TakeoffAverageQaFixture = {
    PAGE_WIDTH,
    PAGE_HEIGHT,
    PAGE_COUNT,
    shouldUseAverageQaFixture,
    createAverageQaMeasurements,
    createAverageQaPdf,
    drawPageBackground,
    paintFixturePage,
    loadIfRequested,
  };
})();
