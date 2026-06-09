(function () {
  function cloneValue(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function createHistorySnapshot(source) {
    return {
      measurements: cloneValue(source.measurements) || [],
      pageScales: cloneValue(source.pageScales) || {},
      pageScaleReferences: cloneValue(source.pageScaleReferences) || {},
      pxPerInch: source.pxPerInch,
      nextRunNumber: source.nextRunNumber,
      nextMergedPathNumber: source.nextMergedPathNumber,
      nextMeasurementPanelOrder: source.nextMeasurementPanelOrder,
      selectedId: source.selectedId,
      selectedIds: cloneValue(source.selectedIds) || (source.selectedId != null ? [source.selectedId] : []),
      copiedMeasurement: cloneValue(source.copiedMeasurement),
      rotateModeId: source.rotateModeId,
    };
  }

  function snapshotsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function recordHistory(state, before, label = 'Edit') {
    if (!before) return false;
    const after = createHistorySnapshot(state);
    if (snapshotsEqual(before, after)) return false;
    state.undoStack.push({ label, before, after });
    if (state.undoStack.length > state.historyLimit) state.undoStack.shift();
    state.redoStack = [];
    return true;
  }

  function applyHistorySnapshot(state, snapshot, currentPage) {
    state.measurements = cloneValue(snapshot.measurements) || [];
    state.pageScales = cloneValue(snapshot.pageScales) || {};
    state.pageScaleReferences = cloneValue(snapshot.pageScaleReferences) || {};
    state.pxPerInch = state.pageScales[currentPage] || null;
    state.nextRunNumber = snapshot.nextRunNumber ?? state.nextRunNumber ?? 1;
    state.nextMergedPathNumber = snapshot.nextMergedPathNumber ?? state.nextMergedPathNumber ?? 1;
    state.nextMeasurementPanelOrder = snapshot.nextMeasurementPanelOrder ?? state.nextMeasurementPanelOrder ?? 1;
    state.selectedId = snapshot.selectedId ?? null;
    state.selectedIds = cloneValue(snapshot.selectedIds) || (state.selectedId != null ? [state.selectedId] : []);
    state.copiedMeasurement = cloneValue(snapshot.copiedMeasurement);
    state.rotateModeId = snapshot.rotateModeId ?? null;
    state.inProgress = null;
    state.freehandDraft = null;
    state.dragVertex = null;
    state.dragMeasurement = null;
    state.dragLabel = null;
    state.marqueeSelection = null;
    state.rotationDrag = null;
    state.snapFeedback = null;
    state.rotationInputVisible = false;
    state.pendingPaste = null;
    state.pendingUnmergePathId = null;
    state.contextTarget = null;
  }

  function clearHistory(state) {
    state.undoStack = [];
    state.redoStack = [];
  }

  window.TakeoffHistory = {
    cloneValue,
    createHistorySnapshot,
    snapshotsEqual,
    recordHistory,
    applyHistorySnapshot,
    clearHistory,
  };
})();
