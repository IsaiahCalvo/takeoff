(function () {
  const LINE_DRAW_MODE = 'line';
  const FREEHAND_DRAW_MODE = 'freehand';

  function normalizeDrawMode(value) {
    return value === FREEHAND_DRAW_MODE ? FREEHAND_DRAW_MODE : LINE_DRAW_MODE;
  }

  function resolveMeasureStartDrawMode({ rememberedDrawMode, shiftKey = false } = {}) {
    const mode = normalizeDrawMode(rememberedDrawMode);
    if (!shiftKey) return mode;
    return mode === FREEHAND_DRAW_MODE ? LINE_DRAW_MODE : FREEHAND_DRAW_MODE;
  }

  function resolveActiveMeasureDrawMode({
    rememberedDrawMode,
    shiftKey = false,
    inProgress = null,
    freehandDraft = null,
  } = {}) {
    if (freehandDraft) return FREEHAND_DRAW_MODE;
    if (inProgress && inProgress.type === 'measure') return LINE_DRAW_MODE;
    return resolveMeasureStartDrawMode({ rememberedDrawMode, shiftKey });
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
    recomputeMeasurementLength,
  };
})();
