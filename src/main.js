import './export-utils.js';
import './calibration-utils.js';
import './app/sidebar.js';
import './app/sidebar-view.js';
import './app/sidebar-controller.js';
import './app/state.js';
import './app/geometry.js';
import './app/measurements.js';
import './app/measurement-commands.js';
import './app/measurement-workflows.js';
import './app/page-state.js';
import './app/continuous-scroll.js';
import './app/continuous-renderer.js';
import './app/continuous-measurements.js';
import './app/hit-testing.js';
import './app/viewer.js';
import './app/pdf-page-cache.js';
import './app/input-controller.js';
import './app/pointer-controller.js';
import './app/pointer-workflow.js';
import './app/document-loader.js';
import './app/document-adapters.js';
import './app/document-store.js';
import './app/export-controller.js';
import './app/calibration-controller.js';
import './app/calibration-workflow.js';
import './app/svg-renderer.js';
import './app/history.js';
import './app/units.js';
import './app/tooltip-controller.js';

const pdfjsLib = window.pdfjsLib;
if (!pdfjsLib) throw new Error('PDF.js failed to load.');

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ------- State -------
const ONBOARDING_STATUS_KEY = 'cableRunStatusSeen';
const stateStore = window.TakeoffState;
const sidebarView = window.TakeoffSidebarView;
const sidebarController = window.TakeoffSidebarController;
const pointerController = window.TakeoffPointerController;
const pointerWorkflow = window.TakeoffPointerWorkflow;
const documentLoader = window.TakeoffDocumentLoader;
const documentAdapters = window.TakeoffDocumentAdapters;
const documentStore = window.TakeoffDocumentStore;
const exportController = window.TakeoffExportController;
const calibrationController = window.TakeoffCalibrationController;
const calibrationWorkflow = window.TakeoffCalibrationWorkflow;
const measurementWorkflows = window.TakeoffMeasurementWorkflows;
const pageState = window.TakeoffPageState;
const continuousScroll = window.TakeoffContinuousScroll;
const continuousRenderer = window.TakeoffContinuousRenderer;
const continuousMeasurements = window.TakeoffContinuousMeasurements;
const unitModel = window.TakeoffUnits;
const tooltipController = window.TakeoffTooltipController;
const state = stateStore.createInitialState();

const {
  parsePageRange,
  computePxPerInch,
  sameScalePdfEligibility,
  applyScaleToPages,
  clearPageScale,
  recomputeLengthsForPage: recomputePageLengths,
} = window.TakeoffCalibrationUtils;

function currentPage() { return pageState.currentPage(state); }
function totalPages() { return pageState.totalPages(state); }
function documentPageCount() { return pageState.documentPageCount(state); }

function updateSidebarScopeChrome(model) {
  sidebarController.applyScopeChrome({
    scopeTabs: $('scopeTabs'),
    totalHeading: $('totalHeading'),
    tabs: document.querySelectorAll('.tab'),
    model,
  });
}

function scaleHudText() { return unitModel.scaleHudText({ pxPerInch: state.pxPerInch, unit: state.unit }); }

function updateCursorHud() {
  const x = state.cursorImg ? state.cursorImg.x.toFixed(0) : '—';
  const y = state.cursorImg ? state.cursorImg.y.toFixed(0) : '—';
  $('cursorPos').innerHTML = `<span class="hud-part">scale: <strong>${scaleHudText()}</strong></span><span class="hud-part">x: <strong>${x}</strong></span><span class="hud-part">y: <strong>${y}</strong></span>`;
}

function updateScaleLabel() {
  $('resetScale').disabled = !state.pxPerInch;
  updateCursorHud();
  updateContinuousScrollControl();
}

function updatePageLabel() {
  const current = state.baseW ? currentPage() : '—';
  const total = state.baseW ? totalPages() : '—';
  $('pageLabel').innerHTML = `<span class="page-current">${current}</span><span class="page-sep">·</span><span>${total}</span>`;
  $('pageLabel').setAttribute('aria-label', state.baseW ? `Page ${current} of ${total}` : 'No page loaded');
  $('pageLabel').title = state.baseW ? `Page ${current} of ${total}` : 'No page loaded';
}

function updateContinuousScrollControl(eligibility = sameScalePdfEligibility(state)) {
  if (!eligibility.eligible) state.continuousScrollMode = false;
  const model = continuousScroll.controlModel({ state, eligibility });
  const button = $('continuousScrollToggle'), divider = document.querySelector('.continuous-scroll-divider');
  button.hidden = divider.hidden = !model.visible; button.disabled = !model.enabled;
  button.classList.toggle('active', model.active);
  button.setAttribute('aria-pressed', model.ariaPressed);
  button.setAttribute('aria-label', model.ariaLabel);
  button.title = button.dataset.tooltip = model.title;
  return model;
}

function focusContinuousPage(page = state.pdfPage) {
  const panY = continuousRenderer.panYForPage({ layout: state.continuousPageLayout, page, zoom: state.zoom, stageHeight: stage.clientHeight });
  if (Number.isFinite(panY)) state.panY = panY;
}

function syncContinuousPageFromView() {
  if (!state.continuousScrollMode || !state.continuousPageLayout) return;
  const page = continuousRenderer.nearestPageForViewport({ layout: state.continuousPageLayout, panY: state.panY, zoom: state.zoom, stageHeight: stage.clientHeight });
  if (!page || page === state.pdfPage) return;
  state.pdfPage = page; stateStore.syncCurrentPageScale(state, page);
  updatePageLabel(); updateScaleLabel(); renderList();
}
function continuousExitPage() { return continuousRenderer.nearestPageForViewport({ layout: state.continuousPageLayout, panY: state.panY, zoom: state.zoom, stageHeight: stage.clientHeight }) || state.pdfPage; }
function applyContinuousEligibilityExit(eligibility = sameScalePdfEligibility(state)) {
  const result = continuousScroll.applyEligibilityExit({ state, eligibility, page: continuousExitPage() });
  if (result.exited) stateStore.syncCurrentPageScale(state, state.pdfPage); updateContinuousScrollControl(eligibility); return result;
}
async function exitContinuousScrollIfNeeded({ eligibility = sameScalePdfEligibility(state), status = false, render = false, fit = false } = {}) {
  const result = applyContinuousEligibilityExit(eligibility);
  if (!result.exited) return false;
  if (render && state.pdf) await renderPdfPage({ fit, resetInteraction: false });
  else { updatePageLabel(); updateScaleLabel(); renderList(); redrawActivePreview(); }
  if (status) showStatus(result.reason, 2800, { force: true });
  saveActiveDocument(); return true;
}
function scheduleContinuousEligibilityCheck(options) { Promise.resolve().then(() => exitContinuousScrollIfNeeded(options)); }
function recomputeLengthsForPage(p) { recomputePageLengths(state.measurements, state.pageScales, p, measurementLengthPx); }

// distinct, dark-bg-friendly palette (red reserved for erase hover)
const PALETTE = [
  '#b6ff3c', '#4cd6ff', '#ff9b3c', '#ff5bd6',
  '#ffd93c', '#9b7bff', '#3cffb6', '#ffb13c',
  '#7cff7c', '#5b8cff', '#ff7ba8', '#3ce8ff',
];

// ------- DOM -------
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const viewport = $('viewport');
const baseCanvas = $('baseCanvas');
const drawCanvas = $('drawCanvas');
const drawSvg = $('drawSvg');
const baseCtx = baseCanvas.getContext('2d');
const drawCtx = drawCanvas.getContext('2d');
const empty = $('empty');
const statusEl = $('status');
const measList = $('measList');
const toolTip = $('toolTip');
const contextMenu = $('contextMenu');
const rotationPill = $('rotationPill');
const rotationInput = $('rotationInput');
const undoButton = $('undoButton');
const redoButton = $('redoButton');
const exportWrap = $('exportWrap');
const exportButton = $('exportButton');
const exportXlsxButton = $('exportXlsx');
const exportCsvButton = $('exportCsv');
const copySummaryButton = $('copySummary');

function setDocumentLoaded(loaded) { document.body.classList.toggle('no-document', !loaded); }

function snapshotActiveDocument(nameOverride = null) { return documentStore.createDocumentSnapshot(state, nameOverride); }

function saveActiveDocument(nameOverride = null) {
  const doc = documentStore.saveDocumentSnapshot(state, nameOverride);
  if (!doc) return;
  renderDocumentTabs();
}

function createHistorySnapshot() { return window.TakeoffHistory.createHistorySnapshot(state); }

function recordHistory(before, label = 'Edit') {
  if (!window.TakeoffHistory.recordHistory(state, before, label)) return false;
  updateHistoryButtons();
  saveActiveDocument();
  return true;
}

function applyHistorySnapshot(snapshot) {
  window.TakeoffHistory.applyHistorySnapshot(state, snapshot, currentPage());
  closeContextMenu();
  updateScaleLabel();
  updatePageLabel();
  updateRotationPill();
  renderList();
  redraw();
  saveActiveDocument();
  scheduleContinuousEligibilityCheck({ status: true, render: true, fit: false });
}

function undoHistory() {
  const entry = state.undoStack.pop();
  if (!entry) return false;
  state.redoStack.push(entry);
  applyHistorySnapshot(entry.before);
  updateHistoryButtons();
  showStatus(`Undid ${entry.label}`);
  return true;
}

function redoHistory() {
  const entry = state.redoStack.pop();
  if (!entry) return false;
  state.undoStack.push(entry);
  applyHistorySnapshot(entry.after);
  updateHistoryButtons();
  showStatus(`Redid ${entry.label}`);
  return true;
}

function clearHistory() { window.TakeoffHistory.clearHistory(state); updateHistoryButtons(); }

function updateHistoryButtons() { undoButton.disabled = state.undoStack.length === 0; redoButton.disabled = state.redoStack.length === 0; }

function renderDocumentTabs() {
  const tabs = $('docTabs');
  tabs.replaceChildren();
  for (const doc of state.documents) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `doc-tab${doc.id === state.activeDocId ? ' active' : ''}`;
    button.role = 'tab';
    button.title = doc.name;
    const title = document.createElement('span');
    title.className = 'doc-tab-title';
    title.textContent = doc.name;
    button.appendChild(title);
    button.setAttribute('aria-selected', doc.id === state.activeDocId ? 'true' : 'false');
    button.addEventListener('click', () => switchDocument(doc.id));
    tabs.appendChild(button);
  }
}

async function switchDocument(id) {
  if (id === state.activeDocId) return;
  saveActiveDocument();
  const doc = state.documents.find(d => d.id === id);
  if (!doc) return;
  await restoreDocument(doc);
}

async function restoreDocument(doc) {
  stateStore.restoreDocumentState(state, doc);
  updateHistoryButtons();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.sidebarTab));
  $('totalHeading').textContent = state.sidebarTab === 'page' ? 'This Page Total' : 'Grand Total';
  if (state.pdf) {
    await renderPdfPage({ fit: false, resetInteraction: false });
  } else if (state.imageBitmap) {
    baseCanvas.width = state.imageBitmap.width;
    baseCanvas.height = state.imageBitmap.height;
    configureCanvasCssSize(baseCanvas, state.imageBitmap.width, state.imageBitmap.height);
    configureDrawCanvas();
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(state.imageBitmap, 0, 0);
    onPageReady({ fit: false, resetInteraction: false });
    applyTransform();
  }
  renderDocumentTabs();
}

tooltipController.createTooltipController({
  tooltipEl: toolTip,
  buttons: document.querySelectorAll('[data-tooltip]'),
  railEl: $('leftRail'),
});

window.addEventListener('resize', () => {
  requestAnimationFrame(refitActiveView);
});

// ------- Helpers -------
function setMode(m, opts = {}) {
  // Don't overwrite prevMode when entering pan via Space
  if (!opts.transient) state.prevMode = m === 'pan' ? state.prevMode : m;
  state.mode = m;
  ['selection','calibrate','measure','pan','erase'].forEach(x => {
    $('btn-' + x).classList.toggle('active', x === m);
  });
  stage.classList.toggle('selection', m === 'selection');
  stage.classList.toggle('pan', m === 'pan');
  stage.classList.toggle('erase', m === 'erase');
  if (m !== 'measure' && m !== 'calibrate') {
    state.inProgress = null;
    state.freehandDraft = null;
  }
  if (m !== 'selection') state.selectedId = null;
  if (m !== 'selection') endRotateMode();
  redrawActivePreview();
  updateStatus();
}

function syncPageScaleAndMode(page) { stateStore.syncCurrentPageScale(state, page); if (!state.pxPerInch) setMode('pan'); }

function updateStatus() {
  if (state.baseW || state.onboardingStatusSeen) {
    statusEl.classList.remove('show');
    return;
  }
  statusEl.textContent = 'Upload Image/PDF to begin.';
  statusEl.classList.add('show');
}
function markOnboardingStatusSeen() {
  if (!state.onboardingStatusSeen) {
    state.onboardingStatusSeen = true; try { localStorage.setItem(ONBOARDING_STATUS_KEY, '1'); } catch (_) { /* ignore */ }
  }
}
function showStatus(text, ms = 1800, opts = {}) {
  if (state.baseW && !opts.force) {
    statusEl.classList.remove('show');
    return;
  }
  statusEl.textContent = text;
  statusEl.classList.add('show');
  clearTimeout(showStatus._t);
  if (ms) showStatus._t = setTimeout(() => updateStatus(), ms);
}

function closeContextMenu() { contextMenu.classList.remove('show'); state.contextTarget = null; }

function openContextMenu(clientX, clientY, measurementId = null, target = null) {
  if (measurementId != null) state.selectedId = measurementId;
  state.contextTarget = target;
  const canActOnRun = state.selectedId != null;
  const addButton = contextMenu.querySelector('[data-action="add-anchor"]');
  const removeButton = contextMenu.querySelector('[data-action="remove-anchor"]');
  const canAddAnchor = !!(target && target.kind === 'path-hit');
  const canRemoveAnchor = !!(target && target.kind === 'anchor-hit' && canRemoveAnchorFromTarget(target));
  addButton.disabled = !canAddAnchor;
  removeButton.disabled = !canRemoveAnchor;
  contextMenu.querySelector('[data-action="cut"]').disabled = !canActOnRun;
  contextMenu.querySelector('[data-action="copy"]').disabled = !canActOnRun;
  contextMenu.querySelector('[data-action="rotate"]').disabled = !canActOnRun;
  contextMenu.querySelector('[data-action="paste"]').disabled = !state.copiedMeasurement;
  contextMenu.style.left = `${Math.min(clientX, window.innerWidth - 170)}px`;
  contextMenu.style.top = `${Math.min(clientY, window.innerHeight - 220)}px`;
  contextMenu.classList.add('show');
}

function applyTransform() {
  viewport.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  $('zoomLabel').innerHTML = `<strong>${Math.round(state.zoom * 100)}%</strong>`;
  updateRotationPill();
}

function desiredPdfRenderScale() {
  return pdfPageCache.desiredRenderScale({
    hasPdf: !!state.pdf,
    zoom: state.zoom,
    devicePixelRatio: window.devicePixelRatio || 1,
    minRenderScale: state.minPdfRenderScale,
    maxRenderScale: state.maxPdfRenderScale,
    maxBitmapEdge: state.maxPdfBitmapEdge,
    baseWidth: state.baseW,
    baseHeight: state.baseH,
  });
}

function configureCanvasCssSize(canvas, cssW, cssH) {
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

function configureViewportCssSize(cssW, cssH) {
  viewport.style.width = `${cssW}px`;
  viewport.style.height = `${cssH}px`;
}

function configureDrawCanvas() {
  if (!state.baseW || !state.baseH) return 1;
  configureViewportCssSize(state.baseW, state.baseH);
  drawCanvas.width = 1;
  drawCanvas.height = 1;
  configureCanvasCssSize(drawCanvas, state.baseW, state.baseH);
  drawSvg.setAttribute('width', state.baseW);
  drawSvg.setAttribute('height', state.baseH);
  drawSvg.setAttribute('viewBox', `0 0 ${state.baseW} ${state.baseH}`);
  configureCanvasCssSize(drawSvg, state.baseW, state.baseH);
  return 1;
}

function overlayScreenScale() {
  return Math.min(1.55, Math.max(0.38, Math.pow(Math.max(state.zoom, 0.05), 0.42)));
}

function overlayPageSize(screenPx) {
  return (screenPx * overlayScreenScale()) / Math.max(state.zoom, 0.05);
}

function screenToImage(clientX, clientY) {
  const stageRect = stage.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return viewerModel.screenToImagePoint({
    clientX,
    clientY,
    stageRect,
    viewportRect,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    baseWidth: state.baseW,
    baseHeight: state.baseH,
  });
}

function imageToScreen(x, y) {
  const stageRect = stage.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return viewerModel.imageToScreenPoint({ x, y }, {
    stageRect,
    viewportRect,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    baseWidth: state.baseW,
    baseHeight: state.baseH,
  });
}

const {
  distancePx,
  polylineLengthPx,
  flattenSegments,
  cubicLengthPx,
  normalizeDegrees,
  pointsBounds,
  constrainDeltaToRect,
  translatePoints,
  rotatedFramePoint,
  translateSegments,
  projectPointToPolyline,
} = window.TakeoffGeometry;

const {
  isCurveMeasurement,
  measurementLengthPx,
  measurementDisplayPoints,
  buildFreehandSegments,
  updateCurveAnchors,
  measurementBounds,
} = window.TakeoffMeasurements;
const measurementCommands = window.TakeoffMeasurementCommands;
const viewerModel = window.TakeoffViewer;
const pdfPageCache = window.TakeoffPdfPageCache;
const inputController = window.TakeoffInputController;
const sidebarModel = window.TakeoffSidebar;

function scaleForPage(page) { return state.pageScales[page] || (page === currentPage() ? state.pxPerInch : null); }
function pxToInches(px, page = currentPage()) { return unitModel.pxToInches(px, scaleForPage(page)); }
function formatLen(inches) { return unitModel.formatLengthInUnit(inches, state.unit); }

function constrainDeltaToPage(bounds, dx, dy, page = currentPage()) {
  const size = continuousMeasurements.pageSize(state, page);
  return constrainDeltaToRect(bounds, dx, dy, size.width, size.height);
}

function constrainGeometryToPage(points, segments = null, page = currentPage()) {
  const displayPoints = segments ? flattenSegments(segments, 18) : points;
  const bounds = pointsBounds(displayPoints);
  const constrained = constrainDeltaToPage(bounds, 0, 0, page);
  if (!constrained.dx && !constrained.dy) return { points, segments };
  return {
    points: translatePoints(points, constrained.dx, constrained.dy),
    segments: segments ? translateSegments(segments, constrained.dx, constrained.dy) : null,
  };
}

function setContinuousCurrentPage(page) {
  if (!continuousMeasurements.isActive(state) || !page || page === state.pdfPage) return;
  state.pdfPage = page; stateStore.syncCurrentPageScale(state, page);
  updatePageLabel(); updateScaleLabel(); renderList();
}

function localPointForMeasurement(m, point = state.cursorImg) { return continuousMeasurements.localPointForMeasurement(state, m, point); }

function drawingPointInfo(point, page = null) {
  const info = continuousMeasurements.pagePointInfo(state, point, page);
  if (info?.page) setContinuousCurrentPage(info.page);
  return info;
}

function createRotationFrame(m) {
  const bounds = measurementBounds(m);
  if (!bounds) return null;
  const pad = overlayPageSize(12);
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: Math.max(bounds.width + pad * 2, overlayPageSize(36)),
    height: Math.max(bounds.height + pad * 2, overlayPageSize(36)),
    cx: bounds.cx,
    cy: bounds.cy,
    angle: normalizeDegrees(m.rotationAngle || 0),
  };
}

function getRotationFrame(m) {
  if (!m) return null;
  if (!m.rotationFrame) m.rotationFrame = createRotationFrame(m);
  return m.rotationFrame;
}

function fitToView(fitMode = 'page') {
  const rect = stage.getBoundingClientRect();
  if (!state.baseW || !state.baseH) return;
  state.activeFitMode = fitMode;
  const transform = state.continuousScrollMode && state.continuousPageLayout
    ? continuousRenderer.fitTransformForPage({ layout: state.continuousPageLayout, page: state.pdfPage, stageWidth: rect.width, stageHeight: rect.height, fitMode })
    : viewerModel.computeFitViewTransform({ stageWidth: rect.width, stageHeight: rect.height, baseWidth: state.baseW, baseHeight: state.baseH, fitMode });
  if (!transform) return;
  state.zoom = transform.zoom;
  state.panX = transform.panX;
  state.panY = transform.panY;
  applyTransform();
}

function clearActiveFitMode() {
  state.activeFitMode = null;
}

function refitActiveView() {
  if (!state.activeFitMode || !state.baseW || !state.baseH) return;
  fitToView(state.activeFitMode);
  redrawActivePreview();
  schedulePdfRerenderForZoom();
}

// ------- File loading -------
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  await loadFile(file);
  e.target.value = '';
});
$('uploadButton').addEventListener('click', () => {
  $('fileInput').click();
});
$('emptyUploadButton').addEventListener('click', () => {
  $('fileInput').click();
});
undoButton.addEventListener('click', undoHistory);
redoButton.addEventListener('click', redoHistory);

stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  await loadFile(file);
});

async function loadFile(file) {
  if (!file) return;
  const fileInfo = documentLoader.describeDocumentFile(file);
  if (!fileInfo.supported) {
    showStatus('Unsupported file. Use a PDF or image.');
    return;
  }

  const previousDocId = state.activeDocId;
  saveActiveDocument();
  const docId = Date.now();
  state.activeDocId = docId;
  try {
    resetDocState();
    if (fileInfo.kind === 'pdf') {
      const buf = await file.arrayBuffer();
      Object.assign(state, documentAdapters.createPdfDocumentState(
        await pdfjsLib.getDocument({ data: buf }).promise
      ));
      await renderPdfPage();
      showStatus(`Loaded ${fileInfo.displayName}`);
    } else {
      const img = await createImageBitmap(file);
      Object.assign(state, documentAdapters.renderImageBitmapToCanvas({
        image: img,
        baseCanvas,
        baseCtx,
        configureCanvasCssSize,
        configureDrawCanvas,
      }));
      onPageReady();
      showStatus(`Loaded ${fileInfo.displayName}`);
    }
    saveActiveDocument(fileInfo.displayName || 'Untitled');
  } catch (err) {
    console.error('Failed to load file', err);
    state.documents = state.documents.filter(d => d.id !== docId);
    state.activeDocId = previousDocId;
    if (previousDocId) {
      const previousDoc = state.documents.find(d => d.id === previousDocId);
      if (previousDoc) await restoreDocument(previousDoc);
    }
    renderDocumentTabs();
    showStatus('Could not load that file. Try another PDF or image.');
  }
}

function resetDocState() {
  setDocumentLoaded(false);
  continuousRenderer.clearContinuousPageLayer($('continuousBasePages'), baseCanvas);
  empty.style.display = 'flex';
  stateStore.resetDocumentState(state);
  updateHistoryButtons();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'page'));
  $('totalHeading').textContent = 'This Page Total';
  updateScaleLabel();
  updatePageLabel();
}

function cacheGet(p, minRenderScale = 0) {
  return pdfPageCache.getCachedPage(state.pageCache, p, minRenderScale);
}
function cacheHasUsable(p, minRenderScale = 0) {
  return pdfPageCache.hasUsableCachedPage(state.pageCache, p, minRenderScale);
}
function cacheSet(p, entry) {
  return pdfPageCache.setCachedPage(state.pageCache, p, entry, {
    maxEntries: state.MAX_CACHE,
    currentPage: state.pdfPage,
  });
}

async function renderPageToCanvas(pageNum, requestedScale = state.minPdfRenderScale) {
  const page = await state.pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const maxScaleForPage = Math.min(
    state.maxPdfRenderScale,
    state.maxPdfBitmapEdge / Math.max(baseViewport.width, baseViewport.height)
  );
  const renderScale = Math.max(
    state.minPdfRenderScale,
    Math.min(requestedScale, maxScaleForPage)
  );
  const viewport_ = page.getViewport({ scale: renderScale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(viewport_.width));
  c.height = Math.max(1, Math.ceil(viewport_.height));
  await page.render({ canvasContext: c.getContext('2d'), viewport: viewport_ }).promise;
  const entry = {
    canvas: c,
    cssWidth: baseViewport.width,
    cssHeight: baseViewport.height,
    renderScale,
  };
  cacheSet(pageNum, entry);
  return entry;
}

function blitToBase(entry) {
  continuousRenderer.clearContinuousPageLayer($('continuousBasePages'), baseCanvas);
  baseCanvas.width = entry.canvas.width;
  baseCanvas.height = entry.canvas.height;
  configureCanvasCssSize(baseCanvas, entry.cssWidth, entry.cssHeight);
  state.baseW = entry.cssWidth;
  state.baseH = entry.cssHeight;
  state.continuousPageLayout = null;
  configureDrawCanvas();
  baseCtx.drawImage(entry.canvas, 0, 0);
}

async function renderContinuousPdfPage({ fit = true, resetInteraction = true, minRenderScale = desiredPdfRenderScale() } = {}) {
  state.navToken++;
  const token = state.navToken;
  const result = await continuousRenderer.renderContinuousPdf({
    pageCount: state.pdfPages, requestedScale: minRenderScale, maxBitmapEdge: state.maxPdfBitmapEdge, cacheGet, renderPage: renderPageToCanvas,
    isCurrent: () => token === state.navToken,
    canvas: baseCanvas, context: baseCtx, pageLayer: $('continuousBasePages'), configureCanvasCssSize,
  });
  if (!result) return;
  state.baseW = result.layout.width; state.baseH = result.layout.height; state.continuousPageLayout = result.layout;
  configureDrawCanvas();
  onPageReady({ fit, resetInteraction });
}

async function renderPdfPage({ fit = true, resetInteraction = true, minRenderScale = desiredPdfRenderScale() } = {}) {
  const eligibility = sameScalePdfEligibility(state);
  if (state.continuousScrollMode && eligibility.eligible) {
    await renderContinuousPdfPage({ fit, resetInteraction, minRenderScale });
    return;
  }
  if (state.continuousScrollMode || state.continuousPageLayout) {
    const result = applyContinuousEligibilityExit(eligibility); if (result.exited) showStatus(result.reason, 2800, { force: true });
  }
  state.continuousPageLayout = null;
  state.navToken++;
  const myToken = state.navToken;
  const p = state.pdfPage;

  let cached = cacheGet(p, minRenderScale);
  if (cached) {
    blitToBase(cached);
    onPageReady({ fit, resetInteraction });
    schedulePreRender();
    return;
  }
  cached = await renderPageToCanvas(p, minRenderScale);
  if (myToken !== state.navToken) return; // user navigated away mid-render
  blitToBase(cached);
  onPageReady({ fit, resetInteraction });
  schedulePreRender();
}

function schedulePreRender() {
  if (!state.pdf) return;
  const targetScale = desiredPdfRenderScale();
  state.preRenderQueue = pdfPageCache.planPreRenderPages({
    currentPage: state.pdfPage,
    pageCount: state.pdfPages,
    cache: state.pageCache,
    targetScale,
  });
  runPreRender();
}

async function runPreRender() {
  if (state.preRenderRunning) return;
  state.preRenderRunning = true;
  try {
    while (state.preRenderQueue.length > 0 && state.pdf) {
      const n = state.preRenderQueue.shift();
      const targetScale = desiredPdfRenderScale();
      if (cacheHasUsable(n, targetScale)) continue;
      try { await renderPageToCanvas(n, targetScale); } catch (_) { /* ignore */ }
      // Yield to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    state.preRenderRunning = false;
  }
}

function onPageReady({ fit = true, resetInteraction = true } = {}) {
  markOnboardingStatusSeen();
  setDocumentLoaded(true);
  empty.style.display = 'none';
  if (resetInteraction) state.inProgress = null;
  syncPageScaleAndMode(currentPage());
  $('prevPage').disabled = currentPage() <= 1; $('nextPage').disabled = currentPage() >= totalPages();
  updatePageLabel(); updateScaleLabel(); renderList();
  if (fit) {
    fitToView(state.continuousScrollMode ? 'width' : 'page');
    if (state.continuousScrollMode) { focusContinuousPage(); applyTransform(); }
  }
  redrawActivePreview();
  updateStatus();
}

async function goToPage(n) {
  if (!state.pdf || n < 1 || n > state.pdfPages || n === state.pdfPage) return;
  state.pdfPage = n;
  if (state.continuousScrollMode && state.continuousPageLayout) {
    syncPageScaleAndMode(n);
    focusContinuousPage(n);
    applyTransform();
    updatePageLabel(); updateScaleLabel(); renderList();
    saveActiveDocument();
    return;
  }
  await renderPdfPage();
}

$('prevPage').addEventListener('click', () => goToPage(state.pdfPage - 1));
$('nextPage').addEventListener('click', () => goToPage(state.pdfPage + 1));
$('continuousScrollToggle').addEventListener('click', async () => {
  const eligibility = sameScalePdfEligibility(state);
  if (!eligibility.eligible) {
    const model = updateContinuousScrollControl(eligibility);
    showStatus(model.title, 2200, { force: true });
    return;
  }
  if (state.continuousScrollMode) syncContinuousPageFromView();
  state.continuousScrollMode = !state.continuousScrollMode;
  const model = updateContinuousScrollControl(eligibility);
  await renderPdfPage({ fit: true, resetInteraction: false });
  saveActiveDocument();
  showStatus(model.active ? 'Continuous scroll ready.' : 'Single-page view.', 1400, { force: true });
});

// ------- Tool buttons -------
$('btn-selection').addEventListener('click', () => setMode('selection'));
$('btn-calibrate').addEventListener('click', () => setMode('calibrate'));
$('btn-measure').addEventListener('click', () => setMode('measure'));
$('btn-pan').addEventListener('click', () => setMode('pan'));
$('btn-erase').addEventListener('click', () => setMode('erase'));
function setDrawMode(value) {
  state.drawMode = value === 'freehand' ? 'freehand' : 'line';
  state.inProgress = null;
  state.freehandDraft = null;
  document.querySelectorAll('.measure-mode-option').forEach(option => {
    const active = option.dataset.value === state.drawMode;
    option.classList.toggle('active', active);
    option.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  setMode('measure');
  redraw();
}
function closeMeasureModeMenu() {
  $('measureSplit').classList.remove('open');
  $('measureModeToggle').setAttribute('aria-expanded', 'false');
  $('measureModeToggle').querySelector('path').setAttribute('d', 'M4.5 3 7.5 6 4.5 9');
  $('measureModeMenu').classList.remove('show');
}
function closeFitMenu() {
  $('fitMenuToggle').setAttribute('aria-expanded', 'false');
  $('fitMenuToggle').querySelector('path').setAttribute('d', 'M4.5 3 7.5 6 4.5 9');
  $('fitMenu').classList.remove('show');
}
function positionMeasureModeMenu() {
  const anchor = $('measureSplit');
  const menu = $('measureModeMenu');
  const rect = anchor.getBoundingClientRect();
  const menuWidth = 116;
  const menuHeight = 76;
  const left = Math.max(6, Math.min(window.innerWidth - menuWidth - 6, rect.right + 8));
  const top = Math.max(6, Math.min(window.innerHeight - menuHeight - 6, rect.top + rect.height / 2 - menuHeight / 2));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
function positionFitMenu() {
  const button = $('fitSplit');
  const menu = $('fitMenu');
  const rect = button.getBoundingClientRect();
  const menuWidth = 124;
  const menuHeight = 108;
  const left = Math.max(6, Math.min(window.innerWidth - menuWidth - 6, rect.right + 8));
  const top = Math.max(6, Math.min(window.innerHeight - menuHeight - 6, rect.top + rect.height / 2 - menuHeight / 2));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
$('measureModeToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !$('measureSplit').classList.contains('open');
  $('measureSplit').classList.toggle('open', open);
  $('measureModeToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('measureModeToggle').querySelector('path').setAttribute('d', open ? 'M7.5 3 4.5 6 7.5 9' : 'M4.5 3 7.5 6 4.5 9');
  $('measureModeMenu').classList.toggle('show', open);
  if (open) positionMeasureModeMenu();
});
document.querySelectorAll('.measure-mode-option').forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    setDrawMode(option.dataset.value);
    closeMeasureModeMenu();
  });
});
document.addEventListener('click', (e) => {
  if (!$('measureSplit').contains(e.target) && !$('measureModeMenu').contains(e.target)) closeMeasureModeMenu();
  if (!$('fitSplit').contains(e.target) && !$('fitMenu').contains(e.target)) closeFitMenu();
});
window.addEventListener('resize', () => { closeMeasureModeMenu(); closeFitMenu(); });
document.querySelector('header').addEventListener('scroll', () => { closeMeasureModeMenu(); closeFitMenu(); });
$('btn-pan').classList.add('active');

// ------- Zoom buttons -------
$('zoomIn').addEventListener('click', () => zoomAt(stageCenter(), 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(stageCenter(), 0.8));
$('zoomFit').addEventListener('click', (e) => {
  e.stopPropagation();
  fitToView('page');
});
$('fitMenuToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !$('fitMenu').classList.contains('show');
  $('fitMenuToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('fitMenuToggle').querySelector('path').setAttribute('d', open ? 'M7.5 3 4.5 6 7.5 9' : 'M4.5 3 7.5 6 4.5 9');
  $('fitMenu').classList.toggle('show', open);
  if (open) positionFitMenu();
});
document.querySelectorAll('.fit-menu-option').forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    fitToView(option.dataset.fit);
    closeFitMenu();
  });
});
function stageCenter() { const r = stage.getBoundingClientRect(); return { clientX: r.left + r.width/2, clientY: r.top + r.height/2 }; }
function zoomAt(pt, factor) {
  clearActiveFitMode();
  const rect = stage.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const transform = viewerModel.zoomAtPoint({
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    stageRect: rect,
    viewportRect,
    point: pt,
    factor,
    baseWidth: state.baseW,
    baseHeight: state.baseH,
  });
  state.zoom = transform.zoom;
  state.panX = transform.panX;
  state.panY = transform.panY;
  if (state.inProgress) {
    state.suppressPointUntil = performance.now() + 320;
  }
  state.cursorImg = transform.cursorImg;
  applyTransform();
  redrawActivePreview();
  schedulePdfRerenderForZoom();
}

function shouldSuppressPointPlacement(e) {
  return pointerController.shouldSuppressPointPlacement({
    button: e.button,
    detail: e.detail,
    now: performance.now(),
    suppressPointUntil: state.suppressPointUntil,
  });
}

function schedulePdfRerenderForZoom() {
  if (!state.pdf) return;
  clearTimeout(state.zoomRenderTimer);
  state.zoomRenderTimer = setTimeout(async () => {
    const targetScale = desiredPdfRenderScale();
    if (!state.continuousScrollMode && cacheHasUsable(state.pdfPage, targetScale)) return;
    showStatus(`Sharpening PDF at ${targetScale.toFixed(1)}×…`, 0);
    await renderPdfPage({ fit: false, resetInteraction: false, minRenderScale: targetScale });
    showStatus(`PDF sharpened at ${targetScale.toFixed(1)}×`);
  }, 180);
}

// ------- Wheel: Ctrl+wheel = zoom, plain wheel = scroll (deltaX horizontal, deltaY vertical) -------
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    zoomAt({ clientX: e.clientX, clientY: e.clientY }, factor);
  } else {
    clearActiveFitMode();
    // Browsers translate Shift+wheel into deltaX on many systems; respect both axes.
    state.panX -= e.deltaX;
    state.panY -= e.deltaY;
    applyTransform();
    syncContinuousPageFromView();
    redrawActivePreview();
  }
}, { passive: false });

// ------- Mouse interactions -------
document.addEventListener('pointerdown', (e) => {
  blurActiveMeasurementName(e.target);
}, true);

stage.addEventListener('contextmenu', (e) => {
  if (!state.baseW) return;
  e.preventDefault();
  const p = screenToImage(e.clientX, e.clientY);
  state.cursorImg = p;
  const labelHit = findLabelHit(p);
  const anchorHit = findNearestAnchor(p, 10 / state.zoom);
  const pathHit = anchorHit ? null : findNearestPathPoint(p, 10 / state.zoom);
  const { hitId, target } = pointerWorkflow.buildContextMenuHit({ labelHit, anchorHit, pathHit });
  openContextMenu(e.clientX, e.clientY, hitId, target);
  renderList();
  redraw();
});

stage.addEventListener('mousedown', (e) => {
  if (!state.baseW) return;
  if (e.button !== 2) closeContextMenu();
  if (e.button !== 0 && e.button !== 1) return;
  const p = screenToImage(e.clientX, e.clientY);
  state.cursorImg = p;
  state.shiftHeld = e.shiftKey;
  if (e.button === 0 && state.rotateModeId && isPointInBox(p, state.rotationHandleHitbox)) {
    const m = state.measurements.find(x => x.id === state.rotateModeId);
    const frame = getRotationFrame(m);
    if (m && frame) {
      clearActiveFitMode();
      state.rotationDrag = pointerWorkflow.createRotationDrag({
        measurement: m,
        frame,
        pointer: localPointForMeasurement(m, p),
        historyBefore: createHistorySnapshot(),
      });
      state.rotationInputVisible = true;
      stage.classList.add('dragging');
      e.preventDefault();
      return;
    }
  }
  if (pointerController.shouldStartPan({ button: e.button, mode: state.mode })) {
    state.isPanning = true;
    state.panStart = pointerController.createPanStart({
      clientX: e.clientX,
      clientY: e.clientY,
      panX: state.panX,
      panY: state.panY,
    });
    stage.classList.add('dragging');
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  const labelHit = state.mode === 'selection' ? null : findLabelHit(p);
  if (labelHit && state.mode !== 'erase') {
    clearActiveFitMode();
    state.selectedId = labelHit.measurementId;
    state.dragLabel = { measurementId: labelHit.measurementId, historyBefore: createHistorySnapshot() };
    stage.classList.add('dragging');
    renderList();
    redraw();
    e.preventDefault();
    return;
  }

  if (state.mode === 'selection') {
    // Vertex hit first — clicking a node selects its run AND starts drag
    const v = findNearestVertex(p, 10 / state.zoom);
    if (v) {
      clearActiveFitMode();
      state.selectedId = v.measurementId;
      state.dragVertex = { ...v, historyBefore: createHistorySnapshot() };
      stage.classList.add('dragging');
      renderList();
      redraw();
      return;
    }
    const selectedLabelHit = findLabelHit(p);
    if (selectedLabelHit) {
      clearActiveFitMode();
      state.selectedId = selectedLabelHit.measurementId;
      state.dragLabel = { measurementId: selectedLabelHit.measurementId, historyBefore: createHistorySnapshot() };
      stage.classList.add('dragging');
      renderList();
      redraw();
      e.preventDefault();
      return;
    }
    const hitId = findNearestMeasurement(p, 8 / state.zoom);
    if (hitId !== state.rotateModeId) endRotateMode();
    state.selectedId = hitId;
    if (hitId != null) {
      const m = state.measurements.find(x => x.id === hitId);
      if (m) {
        clearActiveFitMode();
        state.dragMeasurement = pointerWorkflow.createMeasurementDrag({
          measurement: m,
          pointer: localPointForMeasurement(m, p),
          historyBefore: createHistorySnapshot(),
          bounds: measurementBounds(m),
        });
        stage.classList.add('dragging');
      }
    }
    renderList();
    redraw();
  } else if (state.mode === 'calibrate') {
    clearActiveFitMode();
    if (shouldSuppressPointPlacement(e)) {
      redraw(getEffectiveCursor());
      return;
    }
    const drawInfo = continuousMeasurements.pagePointInfo(state, p);
    if (!drawInfo) return;
    if (state.inProgress && drawInfo.page !== state.inProgress.page) { showStatus('Finish calibration on the same page.', 2200); redraw(); return; }
    setContinuousCurrentPage(drawInfo.page);
    if (!state.inProgress) {
      state.inProgress = { type: 'calib', page: drawInfo.page, points: [drawInfo.point] };
    } else {
      state.inProgress = pointerWorkflow.appendPointToDraft({ inProgress: state.inProgress, point: drawInfo.point, shiftKey: e.shiftKey, snapPoint: (from, to) => snapAngle(from, to, state.inProgress.page) });
      openCalibModal();
    }
    redraw();
  } else if (state.mode === 'measure') {
    clearActiveFitMode();
    if (shouldSuppressPointPlacement(e)) {
      redraw(getEffectiveCursor());
      return;
    }
    const activeDrawMode = measurementWorkflows.resolveActiveMeasureDrawMode({
      rememberedDrawMode: state.drawMode,
      altKey: e.altKey,
      inProgress: state.inProgress,
      freehandDraft: state.freehandDraft,
    });
    if (activeDrawMode === 'freehand') {
      const drawInfo = drawingPointInfo(p, state.freehandDraft?.page || null);
      if (!drawInfo) return;
      if (state.freehandDraft) {
        const raw = state.freehandDraft.rawPoints;
        const last = raw[raw.length - 1];
        if (!last || distancePx(last, drawInfo.point) > 0.5) raw.push(drawInfo.point);
        finishFreehandMeasurement();
        e.preventDefault();
        return;
      }
      state.inProgress = null;
      state.freehandDraft = { page: drawInfo.page, rawPoints: [drawInfo.point], previewSegments: [] };
      redraw();
      e.preventDefault();
      return;
    }
    const drawInfo = drawingPointInfo(p, state.inProgress?.page || null);
    if (!drawInfo) return;
    if (!state.inProgress) {
      state.inProgress = { type: 'measure', page: drawInfo.page, points: [drawInfo.point] };
    } else {
      state.inProgress = pointerWorkflow.appendPointToDraft({
        inProgress: state.inProgress,
        point: drawInfo.point,
        shiftKey: e.shiftKey,
        snapPoint: (from, to) => snapAngle(from, to, state.inProgress.page),
      });
    }
    redraw();
  } else if (state.mode === 'erase') {
    const hitId = findNearestMeasurement(p, 8 / state.zoom);
    if (hitId != null) {
      const historyBefore = createHistorySnapshot();
      if (deleteMeasurementFromState(hitId)) {
        recordHistory(historyBefore, 'run deletion');
        renderList();
        redraw();
      }
    }
  }
});

stage.addEventListener('mousemove', (e) => {
  if (pointerController.shouldFinishPointerDragOnMove(state, e.buttons)) {
    finishPointerDrag();
  }
  if (state.isPanning) {
    clearActiveFitMode();
    const nextPan = pointerController.nextPanFromPointer({
      clientX: e.clientX,
      clientY: e.clientY,
      panStart: state.panStart,
    });
    state.panX = nextPan.panX;
    state.panY = nextPan.panY;
    applyTransform();
    syncContinuousPageFromView();
    return;
  }
  if (!state.baseW) return;
  state.cursorImg = screenToImage(e.clientX, e.clientY);
  updateCursorHud();

  if (state.freehandDraft) {
    const raw = state.freehandDraft.rawPoints;
    const previewPoint = continuousMeasurements.localPointForPage(state, state.freehandDraft.page, state.cursorImg);
    if (previewPoint && (!raw.length || distancePx(raw[raw.length - 1], previewPoint) > 0)) {
      const previewRaw = [...raw, previewPoint];
      state.freehandDraft.previewSegments = previewRaw.length > 2 ? buildFreehandSegments(previewRaw, 8) : [];
      redraw();
    }
    const last = raw[raw.length - 1];
    if (!last || distancePx(last, previewPoint) >= Math.max(1.5, 2.5 / state.zoom)) {
      raw.push({ ...previewPoint });
      state.freehandDraft.previewSegments = raw.length > 2 ? buildFreehandSegments(raw, 8) : [];
      redraw();
    }
    return;
  }

  if (state.rotateModeId) {
    state.rotationInputVisible = true;
    updateRotationPill();
  }

  if (state.rotationDrag) {
    updateRotationDrag(e.clientX, e.clientY, e.shiftKey);
    return;
  }

  if (state.dragVertex) {
    const m = state.measurements.find(x => x.id === state.dragVertex.measurementId);
    if (m) {
      applyVertexDrag(m, state.dragVertex, localPointForMeasurement(m));
      recomputeMeasurementLength(m);
      renderList();
      redraw();
    }
    return;
  }

  if (state.dragMeasurement) {
    const m = state.measurements.find(x => x.id === state.dragMeasurement.measurementId);
    if (m) {
      pointerWorkflow.applyMeasurementDrag({
        measurement: m,
        drag: state.dragMeasurement,
        cursor: localPointForMeasurement(m),
        constrainDelta: (bounds, dx, dy) => constrainDeltaToPage(bounds, dx, dy, m.page),
      });
      if (isCurveMeasurement(m)) {
        updateCurveAnchors(m);
      }
      recomputeMeasurementLength(m);
      renderList();
      redraw();
    }
    return;
  }

  if (state.dragLabel) {
    const m = state.measurements.find(x => x.id === state.dragLabel.measurementId);
    if (m) {
      const projection = projectPointToPolyline(localPointForMeasurement(m), measurementDisplayPoints(m));
      if (projection) {
        m.labelT = projection.t;
        redraw();
      }
    }
    return;
  }

  state.shiftHeld = e.shiftKey;

  if (state.inProgress) {
    // live preview (snapped to 45° when Shift is held)
    const preview = getEffectiveCursor();
    redraw(preview);
  }

  if (state.mode === 'erase' || state.mode === 'selection') {
    const newHover = findNearestMeasurement(state.cursorImg, 8 / state.zoom);
    if (newHover !== state.hoverId) {
      state.hoverId = newHover;
      redraw();
    }
    if (state.mode === 'selection') {
      const v = findNearestVertex(state.cursorImg, 10 / state.zoom);
      const rotateHit = state.rotateModeId && isPointInBox(state.cursorImg, state.rotationHandleHitbox);
      stage.style.cursor = rotateHit ? 'crosshair' : (v ? 'grab' : (newHover != null ? 'pointer' : ''));
    } else {
      stage.style.cursor = '';
    }
  }
});

function updateRotationDrag(clientX, clientY, shiftKey = false) {
  if (!state.rotationDrag) return false;
  const m = state.measurements.find(x => x.id === state.rotationDrag.measurementId);
  if (!m) return false;
  state.cursorImg = screenToImage(clientX, clientY);
  state.shiftHeld = !!shiftKey;
  pointerWorkflow.applyRotationDrag({
    measurement: m,
    drag: state.rotationDrag,
    cursor: localPointForMeasurement(m),
    shiftKey: state.shiftHeld,
    constrainGeometry: (points, segments) => constrainGeometryToPage(points, segments, m.page),
    createRotationFrame,
  });
  if (isCurveMeasurement(m)) {
    updateCurveAnchors(m);
  }
  recomputeMeasurementLength(m);
  renderList();
  redraw();
  return true;
}

function finishPointerDrag() {
  if (state.isPanning) {
    state.isPanning = false;
    stage.classList.remove('dragging');
  }
  if (state.dragVertex) {
    recordHistory(state.dragVertex.historyBefore, 'anchor move');
    state.dragVertex = null;
    stage.classList.remove('dragging');
  }
  if (state.dragMeasurement) {
    recordHistory(state.dragMeasurement.historyBefore, 'run move');
    state.dragMeasurement = null;
    stage.classList.remove('dragging');
  }
  if (state.dragLabel) {
    recordHistory(state.dragLabel.historyBefore, 'length tag move');
    state.dragLabel = null;
    stage.classList.remove('dragging');
  }
  if (state.rotationDrag) {
    recordHistory(state.rotationDrag.historyBefore, 'run rotation');
    state.rotationDrag = null;
    state.rotationInputVisible = true;
    stage.classList.remove('dragging');
    updateRotationPill();
  }
}

stage.addEventListener('mouseup', finishPointerDrag);
window.addEventListener('mousemove', (e) => {
  if (!state.rotationDrag) return;
  if (e.buttons === 0) {
    finishPointerDrag();
    return;
  }
  updateRotationDrag(e.clientX, e.clientY, e.shiftKey);
});
window.addEventListener('mouseup', finishPointerDrag);
window.addEventListener('pointerup', finishPointerDrag);
window.addEventListener('blur', finishPointerDrag);

stage.addEventListener('dblclick', (e) => {
  if (state.mode === 'measure' && state.inProgress && state.inProgress.points.length >= 2) {
    finishMeasurement();
  }
});

function currentInputState(target = null) {
  return {
    target,
    mode: state.mode,
    prevMode: state.prevMode,
    spaceHeld: state.spaceHeld,
    selectedId: state.selectedId,
    isPanning: state.isPanning,
    inProgressPointCount: state.inProgress?.points?.length || 0,
  };
}

window.addEventListener('keydown', (e) => {
  const inputAction = inputController.describeKeyDown(e, currentInputState(e.target));
  if (!inputAction) return;
  if (inputAction.action === 'undo') {
    if (undoHistory()) e.preventDefault();
    return;
  }
  if (inputAction.action === 'redo') {
    if (redoHistory()) e.preventDefault();
    return;
  }
  if (inputAction.action === 'copy') {
    if (copySelectedMeasurement()) e.preventDefault();
    return;
  }
  if (inputAction.action === 'cut') {
    if (cutSelectedMeasurement()) e.preventDefault();
    return;
  }
  if (inputAction.action === 'paste') {
    if (pasteCopiedMeasurement()) e.preventDefault();
    return;
  }
  if (inputAction.action === 'space-pan-start') {
    state.spaceHeld = true;
    state.prevMode = inputAction.previousMode;
    setMode('pan', { transient: true });
    e.preventDefault();
    return;
  }
  if (inputAction.action === 'space-pan-repeat') {
    if (!state.spaceHeld) state.spaceHeld = true;
    e.preventDefault();
    return;
  }
  if (inputAction.action === 'shift-down') {
    state.shiftHeld = true;
    if (inputAction.redraw) redraw(state.inProgress ? getEffectiveCursor() : undefined);
    return;
  }
  if (inputAction.action === 'escape') {
    clearActiveFitMode();
    state.inProgress = null;
    state.freehandDraft = null;
    closeMeasureModeMenu();
    redraw();
    return;
  }
  if (inputAction.action === 'finish-measurement') {
    finishMeasurement();
    return;
  }
  if (inputAction.action === 'delete-selection') {
    const historyBefore = createHistorySnapshot();
    if (deleteMeasurementFromState(state.selectedId)) {
      recordHistory(historyBefore, 'run deletion');
      renderList(); redraw();
    }
    e.preventDefault();
    return;
  }
  if (inputAction.action === 'set-mode') {
    setMode(inputAction.mode);
    return;
  }
  if (inputAction.action === 'fit-view') fitToView();
});

function isTextEntryTarget(target) { return inputController.isTextEntryTarget(target); }

contextMenu.addEventListener('click', (e) => {
  const action = e.target.closest('button')?.dataset.action;
  if (!action) return;
  let handledAnchorAction = false;
  if (action === 'add-anchor') handledAnchorAction = addAnchorFromContext();
  if (action === 'remove-anchor') handledAnchorAction = removeAnchorFromContext();
  closeContextMenu();
  if (handledAnchorAction) return;
  if (action === 'cut') cutSelectedMeasurement();
  if (action === 'copy') copySelectedMeasurement();
  if (action === 'paste') pasteCopiedMeasurement();
  if (action === 'rotate') beginRotateMode(state.selectedId);
});

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) closeContextMenu();
});

rotationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    commitRotationInput();
    e.preventDefault();
    e.stopPropagation();
  } else if (e.key === 'Escape') {
    updateRotationPill();
    rotationInput.blur();
    e.preventDefault();
    e.stopPropagation();
  }
});
rotationInput.addEventListener('blur', commitRotationInput);

window.addEventListener('keyup', (e) => {
  const inputAction = inputController.describeKeyUp(e, currentInputState(e.target));
  if (!inputAction) return;
  if (inputAction.action === 'space-up') {
    state.spaceHeld = false;
    if (inputAction.restoreMode) setMode(inputAction.restoreMode);
    if (inputAction.stopPanning) {
      state.isPanning = false;
      stage.classList.remove('dragging');
    }
    return;
  }
  if (inputAction.action === 'shift-up') {
    state.shiftHeld = false;
    if (inputAction.redraw) redraw(state.inProgress ? state.cursorImg : undefined);
  }
});

function finishMeasurement() {
  const historyBefore = createHistorySnapshot();
  const pts = state.inProgress.points;
  const page = state.inProgress.page || currentPage();
  const id = Date.now();
  const measurement = measurementCommands.createLineMeasurement({
    id,
    points: pts.slice(),
    existingMeasurements: state.measurements,
    palette: PALETTE,
    page,
    pxPerInch: scaleForPage(page),
  });
  const result = measurementWorkflows.appendMeasurementResult({
    measurements: state.measurements,
    measurement,
    selectedId: state.selectedId,
  });
  stateStore.setMeasurements(state, result.measurements, { selectedId: result.selectedId });
  state.inProgress = null;
  recordHistory(historyBefore, 'run creation');
  renderList();
  redraw();
  // Auto-focus the name input on the just-added run with text selected.
  // User can type to rename, hit Enter / Escape to commit, or just click the
  // canvas to start a new measurement (canvas click naturally blurs the input
  // and the default "Run N" name stays).
  requestAnimationFrame(() => {
    const item = measList.querySelector(`.meas-item[data-meas-id="${id}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
      const input = item.querySelector('input.name');
      if (input && item.startNameEdit) item.startNameEdit();
    }
  });
}

function finishFreehandMeasurement() {
  const draft = state.freehandDraft;
  if (!draft) return;
  const historyBefore = createHistorySnapshot();
  const raw = draft.rawPoints || [];
  state.freehandDraft = null;
  const page = draft.page || currentPage();
  const id = Date.now();
  const measurement = measurementCommands.createFreehandMeasurement({
    id,
    rawPoints: raw,
    existingMeasurements: state.measurements,
    palette: PALETTE,
    page,
    pxPerInch: scaleForPage(page),
    constrainGeometry: (points, segments) => constrainGeometryToPage(points, segments, page),
  });
  if (!measurement) {
    redraw();
    return;
  }
  const result = measurementWorkflows.appendMeasurementResult({
    measurements: state.measurements,
    measurement,
    selectedId: state.selectedId,
    selectAppended: true,
  });
  stateStore.setMeasurements(state, result.measurements, { selectedId: result.selectedId });
  recordHistory(historyBefore, 'run creation');
  renderList();
  redraw();
  requestAnimationFrame(() => {
    const item = measList.querySelector(`.meas-item[data-meas-id="${id}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
  });
}

function snapAngle(from, to, page = currentPage()) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return to;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 12; // 15 degrees
  const snapped = Math.round(angle / step) * step;
  const size = continuousMeasurements.pageSize(state, page);
  return {
    x: Math.max(0, Math.min(size.width, from.x + Math.cos(snapped) * dist)),
    y: Math.max(0, Math.min(size.height, from.y + Math.sin(snapped) * dist)),
  };
}

function getEffectiveCursor() {
  if (!state.inProgress || !state.cursorImg) return state.cursorImg;
  if (state.inProgress.type !== 'measure') {
    const page = state.inProgress.page || currentPage();
    const cursor = continuousMeasurements.localPointForPage(state, page, state.cursorImg);
    if (!state.shiftHeld || state.inProgress.points.length < 1) return cursor;
    return snapAngle(state.inProgress.points[state.inProgress.points.length - 1], cursor, page);
  }
  const cursor = continuousMeasurements.localPointForPage(state, state.inProgress.page, state.cursorImg);
  if (!state.shiftHeld || state.inProgress.points.length < 1) return cursor;
  const last = state.inProgress.points[state.inProgress.points.length - 1];
  return snapAngle(last, cursor, state.inProgress.page);
}

function cleanMeasurementName(value, m) {
  return measurementCommands.cleanMeasurementName(state.measurements, value, m);
}

function deleteMeasurementFromState(id) {
  const result = measurementWorkflows.deleteMeasurementResult({
    measurements: state.measurements,
    selectedId: state.selectedId,
    deletedId: id,
  });
  stateStore.setMeasurements(state, result.measurements, { selectedId: result.selectedId });
  if (state.rotateModeId === id) endRotateMode();
  return result.deleted;
}

function recomputeMeasurementLength(m) {
  return measurementWorkflows.recomputeMeasurementLength(m, {
    pxPerInch: scaleForPage(m.page),
    measureLengthPx: measurementLengthPx,
  });
}

function blurActiveMeasurementName(target) {
  const active = document.activeElement;
  if (!active || !active.classList || !active.classList.contains('name')) return;
  if (active === target) return;
  if (target && target.closest && target.closest('input.name')) return;
  if (active.setSelectionRange) active.setSelectionRange(0, 0);
  active.blur();
}

function copySelectedMeasurement() {
  const selected = state.measurements.find(m => m.id === state.selectedId);
  if (!selected) {
    showStatus('Select a measurement before copying.');
    return false;
  }
  state.copiedMeasurement = measurementCommands.cloneMeasurementForClipboard(selected, state.pageScales);
  showStatus(`Copied ${selected.name}`);
  return true;
}

function cutSelectedMeasurement() {
  const historyBefore = createHistorySnapshot();
  if (!copySelectedMeasurement()) return false;
  deleteMeasurementFromState(state.selectedId);
  recordHistory(historyBefore, 'run cut');
  renderList();
  redraw();
  return true;
}

function pasteCopiedMeasurement(mode = null) {
  if (!state.copiedMeasurement) {
    showStatus('Copy a measurement before pasting.');
    return false;
  }
  if (!mode && shouldAskPasteMode(state.copiedMeasurement)) {
    openPasteChoice();
    return true;
  }
  const historyBefore = createHistorySnapshot();
  const source = state.copiedMeasurement;
  const pasteAt = state.pendingPaste?.cursorImg || state.cursorImg || screenToImage(stageCenter().clientX, stageCenter().clientY);
  const pastePage = continuousMeasurements.pageForStackPoint(state, pasteAt, currentPage());
  const pastePoint = continuousMeasurements.localPointForPage(state, pastePage, pasteAt);
  setContinuousCurrentPage(pastePage);
  const pasted = measurementCommands.createPastedMeasurement({
    source,
    id: Date.now(),
    existingMeasurements: state.measurements,
    palette: PALETTE,
    pasteAt: pastePoint,
    currentPage: pastePage,
    pxPerInch: scaleForPage(pastePage),
    mode,
    constrainGeometry: (points, segments) => constrainGeometryToPage(points, segments, pastePage),
  });
  if (!pasted) return false;
  const result = measurementWorkflows.appendMeasurementResult({
    measurements: state.measurements,
    measurement: pasted,
    selectedId: state.selectedId,
    selectAppended: true,
  });
  stateStore.setMeasurements(state, result.measurements, { selectedId: result.selectedId });
  recordHistory(historyBefore, 'run paste');
  renderList();
  redraw();
  showStatus(`Pasted ${pasted.name}`);
  return true;
}

function shouldAskPasteMode(source) {
  const cursor = state.pendingPaste?.cursorImg || state.cursorImg;
  const page = cursor ? continuousMeasurements.pageForStackPoint(state, cursor, currentPage()) : currentPage();
  return measurementCommands.shouldAskPasteMode(source, {
    currentPage: page,
    pxPerInch: scaleForPage(page),
  });
}

function openPasteChoice() {
  state.pendingPaste = { cursorImg: state.cursorImg ? { ...state.cursorImg } : null };
  $('pasteChoiceModal').classList.add('show');
}

function closePasteChoice() {
  state.pendingPaste = null;
  $('pasteChoiceModal').classList.remove('show');
}

function measurementsOnCurrentPage() {
  return continuousMeasurements.measurementsForView({
    state,
    measurements: state.measurements,
    pageMeasurements: pageState.measurementsForCurrentPage,
  });
}

function findNearestVertex(p, tol) {
  return window.TakeoffHitTesting.findNearestVertex(
    measurementsOnCurrentPage(),
    p,
    tol,
    { includeCurveControls: state.shiftHeld },
  );
}

function findNearestAnchor(p, tol) {
  return window.TakeoffHitTesting.findNearestAnchor(measurementsOnCurrentPage(), p, tol);
}

function applyVertexDrag(m, drag, point) {
  measurementCommands.applyVertexDrag(m, drag, point);
}

function canRemoveAnchorFromTarget(target) {
  if (!target || target.kind !== 'anchor-hit') return false;
  const m = state.measurements.find(x => x.id === target.measurementId);
  return measurementCommands.canRemoveAnchorFromMeasurement(m);
}

function addAnchorFromContext() {
  const target = state.contextTarget;
  if (!target || target.kind !== 'path-hit') return false;
  const m = state.measurements.find(x => x.id === target.measurementId);
  if (!m) return false;
  const historyBefore = createHistorySnapshot();
  const labelPoint = currentMeasurementLabelPoint(m);
  if (!measurementCommands.addAnchorToMeasurement(m, continuousMeasurements.localizeTarget(state, m, target))) return false;
  finalizeMeasurementGeometry(m, labelPoint);
  recordHistory(historyBefore, 'anchor add');
  showStatus('Anchor added');
  return true;
}

function removeAnchorFromContext() {
  const target = state.contextTarget;
  if (!target || target.kind !== 'anchor-hit' || !canRemoveAnchorFromTarget(target)) return false;
  const m = state.measurements.find(x => x.id === target.measurementId);
  if (!m) return false;
  const historyBefore = createHistorySnapshot();
  const labelPoint = currentMeasurementLabelPoint(m);
  if (!measurementCommands.removeAnchorFromMeasurement(m, target)) return false;
  finalizeMeasurementGeometry(m, labelPoint);
  recordHistory(historyBefore, 'anchor removal');
  showStatus('Anchor removed');
  return true;
}

function finalizeMeasurementGeometry(m, preservedLabelPoint = null) {
  measurementCommands.finalizeMeasurementGeometry(m, {
    pxPerInch: scaleForPage(m.page),
    preservedLabelPoint,
  });
  state.selectedId = m.id;
  if (state.rotateModeId === m.id) endRotateMode();
  renderList();
  redraw();
}

function currentMeasurementLabelPoint(m) { return measurementCommands.measurementLabelPoint(m); }

function findNearestPathPoint(p, tol) { return window.TakeoffHitTesting.findNearestPathPoint(measurementsOnCurrentPage(), p, tol); }

function findNearestMeasurement(p, tol) { return window.TakeoffHitTesting.findNearestMeasurement(measurementsOnCurrentPage(), p, tol); }

function findLabelHit(p) { return window.TakeoffHitTesting.findLabelHit(state.labelHitboxes, p, overlayPageSize(6)); }

function isPointInBox(p, box) { return window.TakeoffHitTesting.isPointInBox(p, box); }

function beginRotateMode(id) {
  const m = state.measurements.find(x => x.id === id);
  if (!m) return false;
  m.rotationFrame = createRotationFrame(m);
  m.rotationAngle = m.rotationFrame?.angle || normalizeDegrees(m.rotationAngle || 0);
  setMode('selection');
  state.selectedId = id;
  state.rotateModeId = id;
  state.rotationInputVisible = true;
  renderList();
  redraw();
  return true;
}

function endRotateMode() {
  state.rotateModeId = null;
  state.rotationDrag = null;
  state.rotationHandleHitbox = null;
  state.rotationInputVisible = false;
  rotationPill.classList.remove('show');
}

function drawRotationOverlay(m) {
  const frame = getRotationFrame(m);
  if (!frame) return;
  const { x, y, width: w, height: h, cx, cy } = frame;
  const topY = y;
  const handleGap = overlayPageSize(30);
  const handleR = overlayPageSize(7);
  const hx = cx;
  const hy = topY - handleGap;
  const g = svgNode('g', {
    'data-rotation-overlay': m.id,
    transform: frame.angle ? `rotate(${frame.angle}, ${cx}, ${cy})` : null,
  });
  drawSvg.appendChild(g);
  g.appendChild(svgNode('rect', {
    x, y, width: w, height: h,
    fill: 'none',
    stroke: 'rgba(182,255,60,0.9)',
    'stroke-width': overlayPageSize(1.4),
    'stroke-dasharray': `${overlayPageSize(6)} ${overlayPageSize(5)}`,
  }));
  g.appendChild(svgNode('line', {
    x1: cx,
    y1: topY,
    x2: hx,
    y2: hy,
    stroke: 'rgba(182,255,60,0.8)',
    'stroke-width': overlayPageSize(1.2),
  }));
  g.appendChild(svgNode('circle', {
    cx: hx,
    cy: hy,
    r: handleR,
    fill: '#111619',
    stroke: '#b6ff3c',
    'stroke-width': overlayPageSize(2),
  }));
  g.appendChild(svgNode('path', {
    d: `M ${hx - handleR * 0.45} ${hy - handleR * 0.1} A ${handleR * 0.55} ${handleR * 0.55} 0 1 1 ${hx + handleR * 0.2} ${hy + handleR * 0.45}`,
    fill: 'none',
    stroke: '#b6ff3c',
    'stroke-width': overlayPageSize(1.4),
    'stroke-linecap': 'round',
  }));
  const handleCenter = rotatedFramePoint(frame, hx, hy);
  state.rotationHandleHitbox = {
    x: handleCenter.x - handleR - overlayPageSize(8),
    y: handleCenter.y - handleR - overlayPageSize(8),
    width: (handleR + overlayPageSize(8)) * 2,
    height: (handleR + overlayPageSize(8)) * 2,
    center: handleCenter,
    shapeCenter: { x: cx, y: cy },
  };
  updateRotationPill();
}

function updateRotationPill() {
  if (!state.rotateModeId || !state.rotationHandleHitbox || !state.rotationInputVisible) {
    rotationPill.classList.remove('show');
    return;
  }
  const m = state.measurements.find(x => x.id === state.rotateModeId);
  if (!m) {
    rotationPill.classList.remove('show');
    return;
  }
  const handle = state.rotationHandleHitbox;
  const screen = imageToScreen(handle.center.x, handle.center.y);
  const centerScreen = imageToScreen(handle.shapeCenter.x, handle.shapeCenter.y);
  const rect = stage.getBoundingClientRect();
  const vecX = screen.x - centerScreen.x;
  const vecY = screen.y - centerScreen.y;
  const len = Math.hypot(vecX, vecY) || 1;
  const offset = 54;
  let left = rect.left + screen.x + (vecX / len) * offset - 32;
  let top = rect.top + screen.y + (vecY / len) * offset - 14;
  left = Math.max(4, Math.min(window.innerWidth - 68, left));
  top = Math.max(4, Math.min(window.innerHeight - 32, top));
  rotationPill.style.left = `${left}px`;
  rotationPill.style.top = `${top}px`;
  if (document.activeElement !== rotationInput) rotationInput.value = String(Math.round(normalizeDegrees(m.rotationAngle || 0)));
  rotationPill.classList.add('show');
}

function commitRotationInput() {
  const m = state.measurements.find(x => x.id === state.rotateModeId);
  if (!m) return;
  const raw = String(rotationInput.value || '').trim();
  const parsed = raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) {
    updateRotationPill();
    return;
  }
  const nextAngle = normalizeDegrees(parsed);
  const historyBefore = createHistorySnapshot();
  const frame = getRotationFrame(m);
  if (!frame) return;
  const center = { x: frame.cx, y: frame.cy };
  pointerWorkflow.applyMeasurementRotation({
    measurement: m,
    center,
    nextAngle,
    constrainGeometry: (points, segments) => constrainGeometryToPage(points, segments, m.page),
    createRotationFrame,
  });
  if (isCurveMeasurement(m)) {
    updateCurveAnchors(m);
  }
  recomputeMeasurementLength(m);
  rotationInput.blur();
  recordHistory(historyBefore, 'run rotation');
  renderList();
  redraw();
}

// ------- Calibration modal -------
const calibrationModal = calibrationController.createCalibrationModal({
  root: document,
  getElement: $,
  state,
  workflow: calibrationWorkflow,
  unitToInch: unitModel.unitToInch,
  currentPage,
  totalPages,
  parsePageRange,
  computePxPerInch,
  distancePx,
  applyScaleToPages,
  measureLengthPx: measurementLengthPx,
  createHistorySnapshot,
  recordHistory,
  updateScaleLabel: () => { updateScaleLabel(); scheduleContinuousEligibilityCheck({ status: true, render: true, fit: false }); },
  updatePageLabel,
  setMode,
  renderList,
  redraw,
  showStatus,
  alertUser: alert,
  focusLater: input => setTimeout(() => input.focus(), 30),
});
function openCalibModal() { calibrationModal.open(state.inProgress); }

$('resetScale').addEventListener('click', async () => {
  const p = currentPage();
  if (!stateStore.hasPageScale(state, p)) return;
  const affectedCount = calibrationController.countPageMeasurements(state.measurements, p);
  if (!confirm(calibrationController.resetScaleConfirmMessage({ page: p, affectedCount }))) return;
  const historyBefore = createHistorySnapshot();
  clearPageScale({ measurements: state.measurements, pageScales: state.pageScales, page: p });
  stateStore.syncCurrentPageScale(state, p);
  updateScaleLabel();
  recordHistory(historyBefore, 'scale reset');
  const exited = await exitContinuousScrollIfNeeded({ status: true, render: true, fit: false });
  if (exited) return;
  updatePageLabel(); renderList(); redraw();
  showStatus(`Page ${p} calibration cleared. Undo is available.`, 2200);
});

// Sidebar tab switching
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    state.sidebarTab = btn.dataset.tab;
    if (state.sidebarTab === 'all') state.collapsedPageGroups = {};
    renderList();
  });
});

// ------- Unit + clear -------
function setUnit(value) {
  state.unit = value;
  $('unitSelect').value = value;
  const active = document.querySelector(`.unit-option[data-value="${value}"]`);
  $('unitSelectButton').textContent = active ? active.textContent : value;
  document.querySelectorAll('.unit-option').forEach(option => {
    const isActive = option.dataset.value === value;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  $('totalUnit').textContent = unitModel.unitLabel(state.unit);
  updateScaleLabel();
  renderList();
}

function activeDocumentName() {
  return documentStore.activeDocumentName(state);
}

function exportBaseName() {
  return documentStore.exportBaseName(state);
}

function getExportRows() {
  const utils = window.TakeoffExportUtils;
  if (!utils) return [];
  return utils.buildExportRows(state.measurements, { unit: state.unit });
}

const exportDownloads = exportController.createDownloadHelpers({
  exportUtils: window.TakeoffExportUtils,
  documentRef: document,
  createObjectURL: URL.createObjectURL.bind(URL),
  revokeObjectURL: URL.revokeObjectURL.bind(URL),
  textEncoder: TextEncoder,
});

function updateExportButtons() {
  const disabled = state.measurements.length === 0;
  exportController.applyExportAvailability({
    exportButton,
    actionButtons: [exportXlsxButton, exportCsvButton, copySummaryButton],
    disabled,
    isOpen: exportWrap.classList.contains('open'),
  });
  if (disabled) closeExportMenu();
}

function closeExportMenu() {
  exportController.setDisclosureOpen({ wrap: exportWrap, button: exportButton, open: false });
}

function toggleExportMenu() {
  if (exportButton.disabled) return;
  exportController.setDisclosureOpen({
    wrap: exportWrap,
    button: exportButton,
    open: !exportWrap.classList.contains('open'),
  });
}

function exportExcel() {
  const rows = getExportRows();
  if (!rows.length) return;
  const bytes = window.TakeoffExportUtils.generateXlsxPackage(rows);
  exportDownloads.downloadBytes(
    bytes,
    exportController.exportFilename(exportBaseName(), 'xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  showStatus(exportController.excelStatusMessage(rows), 2400);
}

function exportCsv() {
  const rows = getExportRows();
  if (!rows.length) return;
  exportDownloads.downloadText(
    window.TakeoffExportUtils.generateCsv(rows),
    exportController.exportFilename(exportBaseName(), 'csv'),
    'text/csv;charset=utf-8'
  );
  showStatus('CSV export downloaded.', 1800);
}

async function copyMeasurementSummary() {
  const rows = getExportRows();
  if (!rows.length) return;
  const summary = window.TakeoffExportUtils.generateSummary(rows);
  try {
    await navigator.clipboard.writeText(summary);
    showStatus('Measurement summary copied.', 1800);
  } catch (_) {
    showStatus('Clipboard copy was blocked by the browser.', 2200);
  }
}

function closeUnitMenu() {
  exportController.setDisclosureOpen({
    wrap: document.querySelector('.select-wrap'),
    button: $('unitSelectButton'),
    open: false,
  });
}

$('unitSelectButton').addEventListener('click', (e) => {
  e.stopPropagation();
  const wrap = document.querySelector('.select-wrap');
  exportController.setDisclosureOpen({
    wrap,
    button: $('unitSelectButton'),
    open: !wrap.classList.contains('open'),
  });
});

document.querySelectorAll('.unit-option').forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    setUnit(option.dataset.value);
    closeUnitMenu();
  });
});

exportXlsxButton.addEventListener('click', exportExcel);
exportCsvButton.addEventListener('click', exportCsv);
copySummaryButton.addEventListener('click', copyMeasurementSummary);
exportButton.addEventListener('click', (e) => {
  e.stopPropagation();
  closeUnitMenu();
  toggleExportMenu();
});

for (const button of [exportXlsxButton, exportCsvButton, copySummaryButton]) {
  button.addEventListener('click', closeExportMenu);
}

document.addEventListener('click', (e) => {
  closeUnitMenu();
  if (!exportWrap.contains(e.target)) closeExportMenu();
});
document.addEventListener('keydown', e => exportController.closeDisclosuresOnEscape({ event: e, disclosures: [
  { wrap: document.querySelector('.select-wrap'), button: $('unitSelectButton') },
  { wrap: exportWrap, button: exportButton },
] }));

$('unitSelect').addEventListener('change', (e) => {
  setUnit(e.target.value);
});
$('clearAll').addEventListener('click', () => {
  if (state.measurements.length === 0) return;
  if (!confirm('Delete all measurements?')) return;
  const historyBefore = createHistorySnapshot();
  stateStore.clearMeasurements(state);
  recordHistory(historyBefore, 'clear all');
  renderList();
  redraw();
});

$('pasteVisualSize').addEventListener('click', () => {
  pasteCopiedMeasurement('visual-size');
  closePasteChoice();
});
$('pasteRealLength').addEventListener('click', () => {
  pasteCopiedMeasurement('real-length');
  closePasteChoice();
});
$('pasteCancel').addEventListener('click', closePasteChoice);

// ------- Rendering measurements -------
const svgRenderer = window.TakeoffSvgRenderer.createMeasurementRenderer({ drawSvg, drawCtx, overlayPageSize });

function redraw(previewTo) {
  configureDrawCanvas();
  drawSvg.replaceChildren();
  state.labelHitboxes = [];
  state.rotationHandleHitbox = null;

  // existing measurements for the active view
  for (const m of measurementsOnCurrentPage()) {
    const isEraseHover = state.hoverId === m.id && state.mode === 'erase';
    const isSelected = state.selectedId === m.id;
    const isSelHover = state.hoverId === m.id && state.mode === 'selection' && !isSelected;
    const baseColor = m.color || '#b6ff3c';
    const color = isEraseHover ? '#ff5b5b' : baseColor;
    drawMeasurementPath(m, {
      color,
      width: isSelected ? 4 : 3,
      dots: true,
      emphasizeDots: isSelected,
      glow: isSelected || isSelHover,
      label: m.lengthInches != null ? `${formatLen(m.lengthInches)} ${unitModel.unitLabel(state.unit)}` : 'no scale',
      labelColor: color,
      measurementId: m.id,
      labelT: m.labelT,
    });
  }

  const rotateMeasurement = measurementsOnCurrentPage().find(m => m.id === state.rotateModeId);
  if (rotateMeasurement) drawRotationOverlay(rotateMeasurement);

  // in-progress
  if (state.inProgress) {
    const pts = state.inProgress.points.slice();
    if (previewTo) pts.push(previewTo);
    const isCalib = state.inProgress.type === 'calib';
    const page = state.inProgress.page || currentPage();
    const drawPts = continuousMeasurements.stackPointsForPage(state, page, pts);
    drawPolyline(drawPts, {
      color: isCalib ? '#ffb13c' : '#b6ff3c',
      width: 2,
      dashed: true,
      dots: true,
      labelColor: isCalib ? '#ffb13c' : '#b6ff3c',
      label: !isCalib && scaleForPage(page)
        ? `${formatLen(pxToInches(polylineLengthPx(pts), page))} ${unitModel.unitLabel(state.unit)}`
        : null,
    });
  }

  if (state.freehandDraft) {
    const page = state.freehandDraft.page || currentPage();
    const raw = state.freehandDraft.rawPoints || [];
    const livePx = state.freehandDraft.previewSegments?.length
      ? state.freehandDraft.previewSegments.reduce((sum, seg) => sum + cubicLengthPx(seg), 0)
      : polylineLengthPx(raw);
    const liveLabel = scaleForPage(page) ? `${formatLen(pxToInches(livePx, page))} ${unitModel.unitLabel(state.unit)}` : 'no scale';
    const drawRaw = continuousMeasurements.stackPointsForPage(state, page, raw);
    const drawSegments = continuousMeasurements.stackSegmentsForPage(state, page, state.freehandDraft.previewSegments);
    if (state.freehandDraft.previewSegments?.length) {
      drawBezierSegments(drawSegments, {
        color: '#b6ff3c',
        width: 2,
        dashed: true,
        dots: false,
        label: liveLabel,
        labelColor: '#b6ff3c',
        labelPoints: flattenSegments(drawSegments, 18),
        rawPoints: drawRaw,
      });
    } else {
      drawPolyline(drawRaw, {
        color: '#b6ff3c',
        width: 2,
        dashed: true,
        dots: false,
        label: liveLabel,
        labelColor: '#b6ff3c',
      });
    }
    drawEndpointAnchors(drawRaw, '#b6ff3c');
  }
}

function redrawActivePreview() { redraw(state.inProgress ? getEffectiveCursor() : undefined); }

function drawMeasurementPath(m, opts) {
  if (isCurveMeasurement(m)) {
    drawBezierSegments(m.segments, {
      ...opts,
      labelPoints: measurementDisplayPoints(m),
      measurementId: m.id,
      showControls: opts.emphasizeDots && state.shiftHeld && !state.rotationDrag && !state.rotateModeId,
    });
  } else {
    drawPolyline(m.points, opts);
  }
}

function drawBezierSegments(segments, opts) { svgRenderer.drawBezierSegments(segments, { ...opts, labelHitboxes: state.labelHitboxes }); }

function drawEndpointAnchors(points, color) { svgRenderer.drawEndpointAnchors(points, color); }

function drawPolyline(points, opts) { svgRenderer.drawPolyline(points, { ...opts, labelHitboxes: state.labelHitboxes }); }

function svgNode(tag, attrs = {}) { return window.TakeoffSvgRenderer.svgNode(tag, attrs); }
// ------- Sidebar list -------
function syncSidebarSelection() {
  measList.querySelectorAll('.meas-item').forEach(item => {
    item.classList.toggle('selected', Number(item.dataset.measId) === state.selectedId);
  });
}

function buildMeasItem(m) {
  const item = document.createElement('div');
  const itemModel = sidebarController.buildMeasurementItemViewModel({
    measurement: m,
    currentPage: currentPage(),
    selectedId: state.selectedId,
    unit: state.unit,
    cleanMeasurementName,
    formatLength: formatLen,
    unitLabel: unitModel.unitLabel,
    measurementItemClass: sidebarView.measurementItemClass,
  });
  const onOtherPage = itemModel.onOtherPage;
  m.name = itemModel.name;
  item.className = itemModel.className;
  item.dataset.measId = m.id;
  item.innerHTML = sidebarView.buildMeasurementItemMarkup(itemModel);
  const nameInput = item.querySelector('.name');
  const startNameEdit = () => {
    nameInput.dataset.originalName = cleanMeasurementName(m.name, m);
    nameInput.removeAttribute('readonly');
    nameInput.focus();
    nameInput.select();
  };
  const commitNameEdit = () => {
    m.name = cleanMeasurementName(nameInput.value, m);
    nameInput.value = m.name;
    nameInput.setAttribute('readonly', '');
    nameInput.setSelectionRange(0, 0);
  };
  nameInput.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startNameEdit();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (nameInput.hasAttribute('readonly')) return;
    if (e.key === 'Escape') {
      m.name = cleanMeasurementName(nameInput.dataset.originalName, m);
      nameInput.value = m.name;
      nameInput.setAttribute('readonly', '');
      nameInput.setSelectionRange(0, 0);
      nameInput.blur();
      e.stopPropagation();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      commitNameEdit();
      nameInput.blur();
      e.stopPropagation();
      e.preventDefault();
    }
  });
  nameInput.addEventListener('blur', commitNameEdit);
  item.startNameEdit = startNameEdit;
  item.querySelector('.del').addEventListener('click', (e) => {
    e.stopPropagation();
    const historyBefore = createHistorySnapshot();
    if (deleteMeasurementFromState(m.id)) {
      recordHistory(historyBefore, 'run deletion');
      renderList();
      redraw();
    }
  });
  item.addEventListener('click', async (e) => {
    if (!sidebarModel.shouldSelectMeasurementFromSidebarClick(e.target)) return;
    if (onOtherPage) await goToPage(m.page);
    setMode('selection');
    state.selectedId = m.id;
    if (e.target.tagName === 'INPUT') syncSidebarSelection();
    else renderList();
    redraw();
  });
  return item;
}

function renderList() {
  measList.innerHTML = '';
  updateExportButtons();
  const model = sidebarModel.buildSidebarModel({
    measurements: state.measurements,
    currentPage: currentPage(),
    sidebarTab: state.sidebarTab,
    pageScales: state.pageScales,
    collapsedPageGroups: state.collapsedPageGroups,
    pageCount: documentPageCount(),
    unit: state.unit,
  });
  updateSidebarScopeChrome(model);

  if (model.effectiveSidebarTab === 'page') {
    for (const m of model.measurementsForTab) measList.appendChild(buildMeasItem(m));
  } else {
    for (const group of model.pageGroups) {
      const groupEl = document.createElement('div');
      const header = document.createElement('div');
      const children = document.createElement('div');
      const childrenInner = document.createElement('div');
      const scaleText = group.hasScale ? group.pageTotalText : 'No scale';
      const excludedText = group.excludedText.replace(/^ · /, '');
      const excludedTitle = excludedText ? `${excludedText} on page ${group.page}` : '';
      const tooltipId = `page-info-${group.page}`;
      groupEl.className = `page-group ${group.collapsed ? 'collapsed' : 'open'}`;
      header.className = 'page-header';
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true');
      children.className = 'page-children';
      childrenInner.className = 'page-children-inner';
      header.innerHTML = sidebarView.buildPageHeaderMarkup({
        page: group.page,
        collapsed: group.collapsed,
        hasScale: group.hasScale,
        scaleText,
        excludedTitle,
        tooltipId,
      });
      const toggleGroup = () => {
        const isCollapsed = groupEl.classList.contains('collapsed');
        const nextCollapsed = !isCollapsed;
        state.collapsedPageGroups[group.page] = nextCollapsed;
        sidebarController.applyPageGroupCollapsedState({
          groupEl,
          header,
          page: group.page,
          collapsed: nextCollapsed,
          collapseIconPath: sidebarView.collapseIconPath,
        });
        saveActiveDocument();
      };
      header.addEventListener('click', (e) => {
        if (e.target.closest('.page-actions')) return;
        toggleGroup();
      });
      header.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleGroup();
      });
      header.querySelector('.collapse-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGroup();
      });
      const pageInfoButton = header.querySelector('.page-info');
      if (pageInfoButton) {
        pageInfoButton.addEventListener('click', (e) => {
          e.stopPropagation();
          sidebarController.setPageInfoOpen(pageInfoButton, !pageInfoButton.classList.contains('is-open'));
        });
        pageInfoButton.addEventListener('blur', () => {
          sidebarController.setPageInfoOpen(pageInfoButton, false);
        });
      }
      header.querySelector('.jump').addEventListener('click', (e) => {
        e.stopPropagation();
        goToPage(group.page);
      });
      groupEl.appendChild(header);
      for (const m of group.measurements) childrenInner.appendChild(buildMeasItem(m));
      children.appendChild(childrenInner);
      groupEl.appendChild(children);
      measList.appendChild(groupEl);
    }
  }

  $('totalLen').textContent = model.totalLenText;
  $('runCount').textContent = model.runCountText;
  $('totalUnit').textContent = unitModel.unitLabel(state.unit);
}

// init
try { state.onboardingStatusSeen = localStorage.getItem(ONBOARDING_STATUS_KEY) === '1'; } catch (_) { /* ignore */ }
applyTransform();
updateStatus();
updateExportButtons();
updateScaleLabel();
if (!state.onboardingStatusSeen) markOnboardingStatusSeen();
