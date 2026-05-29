(function () {
  function createInitialState() {
    return {
      documents: [],
      activeDocId: null,
      mode: 'pan',
      prevMode: 'pan',
      spaceHeld: false,
      pdf: null,
      pdfPage: 1,
      pdfPages: 0,
      imageBitmap: null,
      minPdfRenderScale: 2,
      maxPdfRenderScale: 12,
      maxPdfBitmapEdge: 15000,
      baseW: 0,
      baseH: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      activeFitMode: null,
      isPanning: false,
      panStart: null,
      pxPerInch: null,
      pageScales: {},
      inProgress: null,
      drawMode: 'line',
      freehandDraft: null,
      measurements: [],
      hoverId: null,
      selectedId: null,
      dragVertex: null,
      dragMeasurement: null,
      dragLabel: null,
      rotationDrag: null,
      rotateModeId: null,
      rotationHandleHitbox: null,
      rotationInputVisible: false,
      pendingPaste: null,
      copiedMeasurement: null,
      contextTarget: null,
      undoStack: [],
      redoStack: [],
      historyLimit: 100,
      onboardingStatusSeen: false,
      shiftHeld: false,
      unit: 'ft',
      cursorImg: null,
      sidebarTab: 'page',
      collapsedPageGroups: {},
      pageCache: new Map(),
      MAX_CACHE: 20,
      preRenderQueue: [],
      preRenderRunning: false,
      navToken: 0,
      zoomRenderTimer: null,
      suppressPointUntil: 0,
      labelHitboxes: [],
    };
  }

  function clearHistoryState(state) {
    state.undoStack = [];
    state.redoStack = [];
  }

  function resetDocumentState(state) {
    state.pdf = null;
    state.pdfPages = 0;
    state.pdfPage = 1;
    state.imageBitmap = null;
    state.baseW = 0;
    state.baseH = 0;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.measurements = [];
    clearHistoryState(state);
    state.pageScales = {};
    state.pxPerInch = null;
    state.inProgress = null;
    state.freehandDraft = null;
    state.selectedId = null;
    state.dragLabel = null;
    state.pageCache.clear();
    state.preRenderQueue = [];
    state.preRenderRunning = false;
    state.sidebarTab = 'page';
    state.collapsedPageGroups = {};
  }

  function restoreDocumentState(state, doc) {
    state.activeDocId = doc.id;
    state.pdf = doc.pdf;
    state.pdfPage = doc.pdfPage || 1;
    state.pdfPages = doc.pdfPages || (doc.pdf ? doc.pdf.numPages : 1);
    state.imageBitmap = doc.imageBitmap || null;
    state.baseW = doc.baseW || 0;
    state.baseH = doc.baseH || 0;
    state.zoom = doc.zoom || 1;
    state.panX = doc.panX || 0;
    state.panY = doc.panY || 0;
    state.activeFitMode = doc.activeFitMode || null;
    state.pxPerInch = doc.pxPerInch || null;
    state.pageScales = { ...(doc.pageScales || {}) };
    state.measurements = doc.measurements || [];
    clearHistoryState(state);
    state.sidebarTab = doc.sidebarTab || 'page';
    state.collapsedPageGroups = { ...(doc.collapsedPageGroups || {}) };
    state.pageCache = new Map(doc.pageCache || []);
    state.inProgress = null;
    state.freehandDraft = null;
    state.selectedId = null;
    state.dragLabel = null;
    state.navToken++;
  }

  window.TakeoffState = {
    createInitialState,
    clearHistoryState,
    resetDocumentState,
    restoreDocumentState,
  };
})();
