(function () {
  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function sourceObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanKey(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function visibilityBoolean(value) {
    if (typeof value === 'boolean') return value;
    const source = sourceObject(value);
    if (typeof source.visible === 'boolean') return source.visible;
    if (typeof source.hidden === 'boolean') return !source.hidden;
    return null;
  }

  function normalizePathCategoryVisibility(input = {}) {
    const source = sourceObject(input);
    const visibility = {};
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = cleanKey(rawKey);
      const visible = visibilityBoolean(rawValue);
      if (!key || visible == null) continue;
      visibility[key] = visible;
    }
    return visibility;
  }

  function pathCategoryVisibilitySource(stateOrVisibility = {}) {
    const source = sourceObject(stateOrVisibility);
    return Object.prototype.hasOwnProperty.call(source, 'pathCategoryVisibility')
      ? sourceObject(source.pathCategoryVisibility)
      : stateOrVisibility;
  }

  function pathCategoryVisibilityForAggregation(stateOrVisibility = {}) {
    return normalizePathCategoryVisibility(pathCategoryVisibilitySource(stateOrVisibility));
  }

  function isPathCategoryVisible(stateOrVisibility, key) {
    const cleanVisibilityKey = cleanKey(key);
    if (!cleanVisibilityKey) return true;
    const visibility = pathCategoryVisibilityForAggregation(stateOrVisibility);
    return visibility[cleanVisibilityKey] !== false;
  }

  function setPathCategoryVisibility(state, key, visible = true) {
    if (!state) return {};
    const cleanVisibilityKey = cleanKey(key);
    state.pathCategoryVisibility = normalizePathCategoryVisibility(state.pathCategoryVisibility);
    if (!cleanVisibilityKey) return state.pathCategoryVisibility;
    state.pathCategoryVisibility[cleanVisibilityKey] = visible !== false;
    return state.pathCategoryVisibility;
  }

  function togglePathCategoryVisibility(state, key) {
    const nextVisible = !isPathCategoryVisible(state, key);
    setPathCategoryVisibility(state, key, nextVisible);
    return nextVisible;
  }

  function pathCategoryVisibilityKeyForMeasurement(measurement) {
    const aggregation = window.TakeoffPathAggregation;
    if (!aggregation?.pathCategoryVisibilityKeyForMeasurement) return null;
    return aggregation.pathCategoryVisibilityKeyForMeasurement(measurement);
  }

  function isMeasurementVisibleForPathCategories(stateOrVisibility, measurement) {
    const key = pathCategoryVisibilityKeyForMeasurement(measurement);
    return isPathCategoryVisible(stateOrVisibility, key);
  }

  function visibleMeasurementsForPathCategories(stateOrVisibility, measurements) {
    return (measurements || []).filter(measurement => (
      isMeasurementVisibleForPathCategories(stateOrVisibility, measurement)
    ));
  }

  function createInitialPathTemplateState(pathTemplateState) {
    const pathTemplates = window.TakeoffPathTemplates;
    if (pathTemplates?.normalizePathTemplateState) {
      return pathTemplates.normalizePathTemplateState(pathTemplateState);
    }
    return {
      pathTemplates: [],
      activePathTemplateId: null,
      activePathId: null,
    };
  }

  function createInitialState(options = {}) {
    const pathTemplateState = createInitialPathTemplateState(options.pathTemplateState);
    return {
      documents: [],
      activeDocId: null,
      pathTemplates: pathTemplateState.pathTemplates,
      activePathTemplateId: pathTemplateState.activePathTemplateId,
      activePathId: pathTemplateState.activePathId,
      mode: 'pan',
      prevMode: 'pan',
      spaceHeld: false,
      pdf: null,
      pdfSourceData: null,
      pdfFileName: null,
      pdfPage: 1,
      pdfPages: 0,
      continuousScrollMode: false,
      continuousScrollPreferences: {},
      continuousPageLayout: null,
      cachedContinuousPageLayout: null,
      pathCategoryVisibility: {},
      imageBitmap: null,
      minPdfRenderScale: 2,
      maxPdfRenderScale: 12,
      maxPdfDetailTileScale: 40,
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
      snapToPaths: false,
      snapFeedback: null,
      rotationHandleHitbox: null,
      rotationInputVisible: false,
      pendingPaste: null,
      pendingUnmergePathId: null,
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
      maxPreRenderPages: 4,
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
    state.pdfSourceData = null;
    state.pdfFileName = null;
    state.pdfPages = 0;
    state.pdfPage = 1;
    state.continuousScrollMode = false;
    state.continuousScrollPreferences = {};
    state.continuousPageLayout = null;
    state.cachedContinuousPageLayout = null;
    state.pathCategoryVisibility = {};
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
    state.pendingUnmergePathId = null;
    state.snapFeedback = null;
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
    state.pdfSourceData = doc.pdfSourceData || null;
    state.pdfFileName = doc.pdfFileName || doc.name || null;
    state.pdfPage = doc.pdfPage || 1;
    state.pdfPages = doc.pdfPages || (doc.pdf ? doc.pdf.numPages : 1);
    state.continuousScrollMode = !!doc.continuousScrollMode;
    state.continuousScrollPreferences = { ...(doc.continuousScrollPreferences || {}) };
    state.continuousPageLayout = null;
    state.cachedContinuousPageLayout = null;
    state.pathCategoryVisibility = normalizePathCategoryVisibility(doc.pathCategoryVisibility);
    state.imageBitmap = doc.imageBitmap || null;
    state.baseW = doc.baseW || 0;
    state.baseH = doc.baseH || 0;
    state.zoom = doc.zoom || 1;
    state.panX = doc.panX || 0;
    state.panY = doc.panY || 0;
    state.activeFitMode = doc.activeFitMode || null;
    state.pxPerInch = doc.pxPerInch || null;
    state.pageScales = { ...(doc.pageScales || {}) };
    state.measurements = cloneValue(doc.measurements) || [];
    clearHistoryState(state);
    state.sidebarTab = doc.sidebarTab || 'page';
    state.collapsedPageGroups = { ...(doc.collapsedPageGroups || {}) };
    state.pageCache = new Map(doc.pageCache || []);
    state.inProgress = null;
    state.freehandDraft = null;
    state.snapFeedback = null;
    state.selectedId = null;
    state.dragLabel = null;
    state.navToken++;
  }

  function setMeasurements(state, measurements, { selectedId = state.selectedId } = {}) {
    state.measurements = measurements || [];
    state.selectedId = selectedId;
    return state.measurements;
  }

  function clearMeasurements(state) {
    state.rotateModeId = null;
    state.rotationHandleHitbox = null;
    state.rotationInputVisible = false;
    state.rotationDrag = null;
    return setMeasurements(state, [], { selectedId: null });
  }

  function hasPageScale(state, page) {
    return !!state.pageScales[page];
  }

  function syncCurrentPageScale(state, page) {
    state.pxPerInch = state.pageScales[page] || null;
    return state.pxPerInch;
  }

  window.TakeoffState = {
    cloneValue,
    normalizePathCategoryVisibility,
    pathCategoryVisibilityForAggregation,
    isPathCategoryVisible,
    setPathCategoryVisibility,
    togglePathCategoryVisibility,
    pathCategoryVisibilityKeyForMeasurement,
    isMeasurementVisibleForPathCategories,
    visibleMeasurementsForPathCategories,
    createInitialState,
    clearHistoryState,
    resetDocumentState,
    restoreDocumentState,
    setMeasurements,
    clearMeasurements,
    hasPageScale,
    syncCurrentPageScale,
  };
})();
