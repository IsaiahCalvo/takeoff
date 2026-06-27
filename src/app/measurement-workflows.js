(function () {
  const LINE_DRAW_MODE = 'line';
  const FREEHAND_DRAW_MODE = 'freehand';
  const CIRCLE_RADIUS_DRAW_MODE = 'circle-radius';
  const CIRCLE_DIAMETER_DRAW_MODE = 'circle-diameter';
  const CIRCLE_2P_DRAW_MODE = 'circle-2p';
  const CIRCLE_3P_DRAW_MODE = 'circle-3p';
  const ARC_3P_DRAW_MODE = 'arc-3p';
  const ARC_CENTER_DRAW_MODE = 'arc-center';
  const CIRCLE_DRAW_MODES = new Set([CIRCLE_RADIUS_DRAW_MODE, CIRCLE_DIAMETER_DRAW_MODE, CIRCLE_2P_DRAW_MODE, CIRCLE_3P_DRAW_MODE]);
  const ARC_DRAW_MODES = new Set([ARC_3P_DRAW_MODE, ARC_CENTER_DRAW_MODE]);
  const DRAW_MODES = new Set([
    LINE_DRAW_MODE,
    FREEHAND_DRAW_MODE,
    CIRCLE_RADIUS_DRAW_MODE,
    CIRCLE_DIAMETER_DRAW_MODE,
    CIRCLE_2P_DRAW_MODE,
    CIRCLE_3P_DRAW_MODE,
    ARC_3P_DRAW_MODE,
    ARC_CENTER_DRAW_MODE,
  ]);

  function normalizeDrawMode(value) {
    return DRAW_MODES.has(value) ? value : LINE_DRAW_MODE;
  }

  function isCircleDrawMode(value) {
    return CIRCLE_DRAW_MODES.has(value);
  }

  function isArcDrawMode(value) {
    return ARC_DRAW_MODES.has(value);
  }

  function normalizeCircleDrawMode(value) {
    return isCircleDrawMode(value) ? value : CIRCLE_RADIUS_DRAW_MODE;
  }

  function normalizeArcDrawMode(value) {
    return isArcDrawMode(value) ? value : ARC_3P_DRAW_MODE;
  }

  function resolveMeasureStartDrawMode({ rememberedDrawMode, altKey = false } = {}) {
    const mode = normalizeDrawMode(rememberedDrawMode);
    if (!altKey) return mode;
    if (mode !== LINE_DRAW_MODE && mode !== FREEHAND_DRAW_MODE) return mode;
    return mode === FREEHAND_DRAW_MODE ? LINE_DRAW_MODE : FREEHAND_DRAW_MODE;
  }

  function resolveActiveMeasureDrawMode({
    rememberedDrawMode,
    altKey = false,
    inProgress = null,
    freehandDraft = null,
    circleArcDraft = null,
  } = {}) {
    if (circleArcDraft?.mode) return normalizeDrawMode(circleArcDraft.mode);
    if (freehandDraft) return FREEHAND_DRAW_MODE;
    if (inProgress && inProgress.type === 'measure') return LINE_DRAW_MODE;
    return resolveMeasureStartDrawMode({ rememberedDrawMode, altKey });
  }

  function deleteMeasurementResult({ measurements, selectedId, deletedId } = {}) {
    const before = measurements || [];
    const after = before.filter(measurement => measurement.id !== deletedId);
    return {
      measurements: after,
      selectedId: selectedId === deletedId ? null : selectedId,
      deleted: after.length !== before.length,
    };
  }

  function appendMeasurementResult({ measurements, measurement, selectedId = null, selectAppended = false } = {}) {
    if (!measurement) {
      return {
        measurements: measurements || [],
        selectedId,
        appended: false,
      };
    }
    return {
      measurements: [...(measurements || []), measurement],
      selectedId: selectAppended ? measurement.id : selectedId,
      appended: true,
    };
  }

  function defaultDistancePx(a, b) {
    const ax = Number(a?.x) || 0;
    const ay = Number(a?.y) || 0;
    const bx = Number(b?.x) || 0;
    const by = Number(b?.y) || 0;
    return Math.hypot(ax - bx, ay - by);
  }

  function applyFreehandDraftClick({
    draft,
    point,
    distancePx = defaultDistancePx,
    minDistance = 0.5,
  } = {}) {
    if (!draft || !point) return { draft: draft || null, appended: false, finished: false };
    if (!Array.isArray(draft.rawPoints)) draft.rawPoints = [];
    if (!Array.isArray(draft.anchorPoints)) draft.anchorPoints = [];
    const raw = draft.rawPoints;
    const last = raw[raw.length - 1];
    const distance = last && typeof distancePx === 'function' ? distancePx(last, point) : Infinity;
    const appended = !last || !Number.isFinite(distance) || distance > minDistance;
    if (appended) raw.push(point);
    const lastAnchor = draft.anchorPoints[draft.anchorPoints.length - 1];
    const anchorDistance = lastAnchor && typeof distancePx === 'function' ? distancePx(lastAnchor, point) : Infinity;
    if (!lastAnchor || !Number.isFinite(anchorDistance) || anchorDistance > minDistance) draft.anchorPoints.push(point);
    return { draft, appended, finished: false };
  }

  function activeMeasurePointCount({ inProgress = null, freehandDraft = null, circleArcDraft = null } = {}) {
    const circleArcCount = circleArcDraft?.points?.length || 0;
    if (circleArcCount) return circleArcCount;
    const freehandCount = freehandDraft?.rawPoints?.length || 0;
    if (freehandCount) return freehandCount;
    return inProgress?.points?.length || 0;
  }

  function activeDraftMode({ inProgress = null, freehandDraft = null, circleArcDraft = null } = {}) {
    if (circleArcDraft) return 'measure';
    if (freehandDraft) return 'measure';
    if (inProgress?.type === 'measure') return 'measure';
    if (inProgress?.type === 'calib') return 'calibrate';
    return null;
  }

  function shouldCancelDraftOnModeChange({
    nextMode,
    inProgress = null,
    freehandDraft = null,
    circleArcDraft = null,
    transient = false,
  } = {}) {
    if (transient) return false;
    const draftMode = activeDraftMode({ inProgress, freehandDraft, circleArcDraft });
    return !!(draftMode && nextMode !== draftMode);
  }

  function recomputeMeasurementLength(measurement, { pxPerInch, measureLengthPx } = {}) {
    if (!measurement || !measureLengthPx) return false;
    measurement.lengthPx = measureLengthPx(measurement);
    measurement.lengthInches = pxPerInch ? measurement.lengthPx / pxPerInch : null;
    return true;
  }

  window.TakeoffMeasurementWorkflows = {
    resolveMeasureStartDrawMode,
    resolveActiveMeasureDrawMode,
    normalizeDrawMode,
    isCircleDrawMode,
    isArcDrawMode,
    normalizeCircleDrawMode,
    normalizeArcDrawMode,
    deleteMeasurementResult,
    appendMeasurementResult,
    applyFreehandDraftClick,
    activeMeasurePointCount,
    shouldCancelDraftOnModeChange,
    recomputeMeasurementLength,
  };
})();
