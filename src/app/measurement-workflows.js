(function () {
  const LINE_DRAW_MODE = 'line';
  const FREEHAND_DRAW_MODE = 'freehand';

  function normalizeDrawMode(value) {
    return value === FREEHAND_DRAW_MODE ? FREEHAND_DRAW_MODE : LINE_DRAW_MODE;
  }

  function resolveMeasureStartDrawMode({ rememberedDrawMode, altKey = false } = {}) {
    const mode = normalizeDrawMode(rememberedDrawMode);
    if (!altKey) return mode;
    return mode === FREEHAND_DRAW_MODE ? LINE_DRAW_MODE : FREEHAND_DRAW_MODE;
  }

  function resolveActiveMeasureDrawMode({
    rememberedDrawMode,
    altKey = false,
    inProgress = null,
    freehandDraft = null,
  } = {}) {
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

  function activeMeasurePointCount({ inProgress = null, freehandDraft = null } = {}) {
    const freehandCount = freehandDraft?.rawPoints?.length || 0;
    if (freehandCount) return freehandCount;
    return inProgress?.points?.length || 0;
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
    deleteMeasurementResult,
    appendMeasurementResult,
    applyFreehandDraftClick,
    activeMeasurePointCount,
    recomputeMeasurementLength,
  };
})();
