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

  function positiveInteger(value, fallback = 1) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  }

  function measurementNameSet(measurements = []) {
    return new Set((measurements || [])
      .map(measurement => String(measurement?.name || '').trim().toLowerCase())
      .filter(Boolean));
  }

  function allocateGeneratedMeasurementName(state, counterKey, label, measurements = state?.measurements) {
    if (!state) return `${label} 1`;
    const names = measurementNameSet(measurements);
    let number = positiveInteger(state[counterKey], 1);
    let name = `${label} ${number}`;
    while (names.has(name.toLowerCase())) {
      number += 1;
      name = `${label} ${number}`;
    }
    state[counterKey] = number + 1;
    return name;
  }

  function allocateRunName(state, measurements = state?.measurements) {
    return allocateGeneratedMeasurementName(state, 'nextRunNumber', 'Run', measurements);
  }

  function allocateMergedPathName(state, measurements = state?.measurements) {
    return allocateGeneratedMeasurementName(state, 'nextMergedPathNumber', 'Merged Path', measurements);
  }

  function allocateMeasurementPanelOrder(state) {
    if (!state) return 1;
    const panelOrder = positiveInteger(state.nextMeasurementPanelOrder, 1);
    state.nextMeasurementPanelOrder = panelOrder + 1;
    return panelOrder;
  }

  const RUN_NAME_PATTERN = /^Run\s+(\d+)$/i;
  const MERGED_PATH_NAME_PATTERN = /^Merged Path\s+(\d+)$/i;

  function nextNumberAfterGeneratedNames(measurements = [], pattern) {
    let max = 0;
    for (const measurement of measurements || []) {
      const match = String(measurement?.name || '').trim().match(pattern);
      const number = match ? Number(match[1]) : 0;
      if (Number.isInteger(number) && number > max) max = number;
    }
    return max + 1;
  }

  function normalizeGeneratedNameCounter(savedValue, measurements, pattern) {
    return Math.max(
      positiveInteger(savedValue, 1),
      nextNumberAfterGeneratedNames(measurements, pattern),
    );
  }

  function normalizeMeasurementPanelOrders(measurements = []) {
    const used = new Set();
    let nextPanelOrder = 1;
    return (measurements || []).map(measurement => {
      const restored = measurement && typeof measurement === 'object' ? measurement : {};
      let panelOrder = positiveInteger(restored.panelOrder, 0);
      if (!panelOrder || used.has(panelOrder)) {
        while (used.has(nextPanelOrder)) nextPanelOrder += 1;
        panelOrder = nextPanelOrder;
      }
      used.add(panelOrder);
      nextPanelOrder = Math.max(nextPanelOrder, panelOrder + 1);
      return { ...restored, panelOrder };
    });
  }

  function nextMeasurementPanelOrder(savedValue, measurements = []) {
    const maxPanelOrder = (measurements || []).reduce((max, measurement) => {
      const panelOrder = positiveInteger(measurement?.panelOrder, 0);
      return panelOrder > max ? panelOrder : max;
    }, 0);
    return Math.max(positiveInteger(savedValue, 1), maxPanelOrder + 1);
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

  function measurementIdMatches(a, b) {
    return a === b || String(a) === String(b);
  }

  function isMeasurementPathVisible(measurement) {
    const source = sourceObject(measurement);
    if (!source) return true;
    if (source.hidden === true) return false;
    if (source.visible === false) return false;
    if (source.pathHidden === true) return false;
    return source.templateHidden !== true;
  }

  function setMeasurementPathVisibility(state, measurementId, visible = true) {
    if (!state || measurementId == null) return false;
    const measurement = (state.measurements || []).find(item => measurementIdMatches(item.id, measurementId));
    if (!measurement) return false;
    if (visible === false) measurement.pathHidden = true;
    else delete measurement.pathHidden;
    return true;
  }

  function isMeasurementVisibleForPathCategories(stateOrVisibility, measurement) {
    const key = pathCategoryVisibilityKeyForMeasurement(measurement);
    return isMeasurementPathVisible(measurement) && isPathCategoryVisible(stateOrVisibility, key);
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
      continuousScrollAutoEnable: false,
      continuousScrollPreferences: {},
      continuousPageLayout: null,
      cachedContinuousPageLayout: null,
      pathCategoryVisibility: {},
      imageBitmap: null,
      minPdfRenderScale: 2,
      maxPdfRenderScale: 12,
      maxPdfDetailTileScale: 40,
      maxPdfBitmapEdge: 15000,
      maxImageBitmapEdge: 4096,
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
      pageScaleReferences: {},
      inProgress: null,
      drawMode: 'line',
      freehandDraft: null,
      measurements: [],
      nextRunNumber: 1,
      nextMergedPathNumber: 1,
      nextMeasurementPanelOrder: 1,
      hoverId: null,
      selectedId: null,
      selectedIds: [],
      marqueeSelection: null,
      dragVertex: null,
      dragMeasurement: null,
      dragLabel: null,
      rotationDrag: null,
      transformResizeDrag: null,
      rotateModeId: null,
      snapToPaths: false,
      snapFeedback: null,
      rotationHandleHitbox: null,
      transformResizeHandleHitboxes: [],
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
    state.continuousScrollAutoEnable = false;
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
    state.nextRunNumber = 1;
    state.nextMergedPathNumber = 1;
    state.nextMeasurementPanelOrder = 1;
    clearHistoryState(state);
    state.pageScales = {};
    state.pageScaleReferences = {};
    state.pxPerInch = null;
    state.inProgress = null;
    state.freehandDraft = null;
    state.pendingUnmergePathId = null;
    state.snapFeedback = null;
    state.selectedId = null;
    state.selectedIds = [];
    state.marqueeSelection = null;
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
    state.continuousScrollAutoEnable = false;
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
    state.pageScaleReferences = cloneValue(doc.pageScaleReferences) || {};
    state.measurements = normalizeMeasurementPanelOrders(cloneValue(doc.measurements) || []);
    state.nextRunNumber = normalizeGeneratedNameCounter(doc.nextRunNumber, state.measurements, RUN_NAME_PATTERN);
    state.nextMergedPathNumber = normalizeGeneratedNameCounter(doc.nextMergedPathNumber, state.measurements, MERGED_PATH_NAME_PATTERN);
    state.nextMeasurementPanelOrder = nextMeasurementPanelOrder(doc.nextMeasurementPanelOrder, state.measurements);
    clearHistoryState(state);
    state.sidebarTab = doc.sidebarTab || 'page';
    state.collapsedPageGroups = { ...(doc.collapsedPageGroups || {}) };
    state.pageCache = new Map(doc.pageCache || []);
    state.inProgress = null;
    state.freehandDraft = null;
    state.snapFeedback = null;
    state.selectedId = null;
    state.selectedIds = [];
    state.marqueeSelection = null;
    state.dragLabel = null;
    state.navToken++;
  }

  function setMeasurements(state, measurements, { selectedId = state.selectedId, selectedIds = null } = {}) {
    state.measurements = measurements || [];
    state.selectedId = selectedId;
    state.selectedIds = Array.isArray(selectedIds)
      ? selectedIds.slice()
      : (selectedId != null ? [selectedId] : []);
    return state.measurements;
  }

  function clearMeasurements(state) {
    state.rotateModeId = null;
    state.rotationHandleHitbox = null;
    state.rotationInputVisible = false;
    state.rotationDrag = null;
    state.transformResizeDrag = null;
    state.transformResizeHandleHitboxes = [];
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
    isMeasurementPathVisible,
    setMeasurementPathVisibility,
    isMeasurementVisibleForPathCategories,
    visibleMeasurementsForPathCategories,
    allocateRunName,
    allocateMergedPathName,
    allocateMeasurementPanelOrder,
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
