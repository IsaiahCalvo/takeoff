(function () {
  function conversionMenuState({ measurement, measurementModel, measurementCommands, target, measurements } = {}) {
    const canConvertToLine = !!(measurement && measurementModel?.isFreehandMeasurement(measurement));
    const canConvertToFreehand = !!(measurement && measurementModel?.isLineMeasurement(measurement));
    const canContinuePath = !!(
      measurement
      && target
      && !measurementModel?.isMixedMeasurement?.(measurement)
      && measurementCommands?.continuationEndpointRole?.(measurement, target)
    );
    const canMergePaths = !!(
      measurement
      && target
      && measurementCommands?.mergeConnectionForTarget?.({ measurements, measurement, target })
    );
    const canUnmergePaths = !!(
      measurement
      && measurementCommands?.unmergePathState?.(measurement)?.canUnmergePaths
    );
    return { canConvertToLine, canConvertToFreehand, canContinuePath, canMergePaths, canUnmergePaths };
  }

  function setButtonState(button, visible) {
    if (!button) return;
    button.hidden = !visible;
    button.disabled = !visible;
  }

  function applyConversionMenuState({ contextMenu, measurement, measurementModel, measurementCommands, target, measurements } = {}) {
    const state = conversionMenuState({ measurement, measurementModel, measurementCommands, target, measurements });
    setButtonState(contextMenu?.querySelector('[data-action="convert-to-line"]'), state.canConvertToLine);
    setButtonState(contextMenu?.querySelector('[data-action="convert-to-freehand"]'), state.canConvertToFreehand);
    setButtonState(contextMenu?.querySelector('[data-action="continue-path"]'), state.canContinuePath);
    setButtonState(contextMenu?.querySelector('[data-action="merge-paths"]'), state.canMergePaths);
    setButtonState(contextMenu?.querySelector('[data-action="unmerge-paths"]'), state.canUnmergePaths);
    return state;
  }

  function applyVisibilityMenuState({ contextMenu, measurement, state, stateStore } = {}) {
    const pathButton = contextMenu?.querySelector('[data-action="toggle-path-visibility"]');
    const categoryButton = contextMenu?.querySelector('[data-action="toggle-category-visibility"]');
    const categoryKey = measurement && stateStore?.pathCategoryVisibilityKeyForMeasurement
      ? stateStore.pathCategoryVisibilityKeyForMeasurement(measurement)
      : null;
    const canTogglePath = !!measurement;
    const canToggleCategory = !!(measurement && categoryKey);
    const pathVisible = measurement && stateStore?.isMeasurementPathVisible
      ? stateStore.isMeasurementPathVisible(measurement)
      : true;
    const categoryVisible = canToggleCategory && stateStore?.isPathCategoryVisible
      ? stateStore.isPathCategoryVisible(state, categoryKey)
      : true;

    setButtonState(pathButton, canTogglePath);
    setButtonState(categoryButton, canToggleCategory);
    if (pathButton) pathButton.textContent = pathVisible ? 'Hide path' : 'Show path';
    if (categoryButton) categoryButton.textContent = categoryVisible ? 'Hide category' : 'Show category';

    return { canTogglePath, canToggleCategory, pathVisible, categoryVisible, categoryKey };
  }

  function beginContinuePath({
    state,
    target,
    measurementCommands,
    isCurveMeasurement,
    currentPage,
    setMode,
    clearActiveFitMode,
    renderList,
    redraw,
    showStatus,
  } = {}) {
    if (!state || !target || target.kind !== 'anchor-hit') return false;
    const measurementId = target.measurementId ?? state.selectedId;
    const measurement = state.measurements?.find(item => item.id === measurementId);
    if (!measurement) return false;
    const endpoint = measurementCommands?.continuationEndpointRole?.(measurement, target);
    if (!endpoint) return false;
    const points = measurement.points || [];
    const point = endpoint === 'start' ? points[0] : points[points.length - 1];
    if (!point) return false;
    clearActiveFitMode();
    setMode('measure');
    state.selectedId = measurement.id;
    state.selectedIds = [measurement.id];
    state.inProgress = null;
    state.freehandDraft = null;
    const continuation = { measurementId: measurement.id, endpoint };
    if (isCurveMeasurement(measurement)) {
      state.freehandDraft = { page: measurement.page || currentPage(), rawPoints: [{ ...point }], previewSegments: [], continuation };
    } else {
      state.inProgress = { type: 'measure', page: measurement.page || currentPage(), points: [{ ...point }], continuation };
    }
    showStatus('Continue Path');
    renderList();
    redraw();
    return true;
  }

  function finishLineContinuation({
    state,
    points,
    page,
    historyBefore,
    measurementCommands,
    scaleForPage,
    recordHistory,
    renderList,
    redraw,
    showStatus,
  } = {}) {
    const continuation = state?.inProgress?.continuation || null;
    if (!continuation) return false;
    const snapConnection = state?.inProgress?.snapConnections?.[continuation.endpoint] || null;
    const measurement = state.measurements?.find(item => item.id === continuation.measurementId);
    const ok = measurementCommands?.continueLineMeasurement?.(measurement, {
      endpoint: continuation.endpoint,
      points: (points || []).slice(),
      pxPerInch: scaleForPage(page),
    });
    state.inProgress = null;
    if (ok) {
      if (snapConnection) measurementCommands.setEndpointSnapConnection(measurement, continuation.endpoint, snapConnection);
      else measurementCommands.clearEndpointSnapConnection(measurement, continuation.endpoint);
      state.selectedId = measurement.id;
      state.selectedIds = [measurement.id];
      recordHistory(historyBefore, 'path continuation');
      showStatus('Path continued');
    }
    renderList();
    redraw();
    return true;
  }

  function finishFreehandContinuation({
    state,
    draft,
    measurement,
    page,
    historyBefore,
    measurementCommands,
    scaleForPage,
    recordHistory,
    renderList,
    redraw,
    showStatus,
  } = {}) {
    const continuation = draft?.continuation || null;
    if (!continuation) return false;
    const snapConnection = draft?.snapConnections?.[continuation.endpoint] || null;
    const target = state?.measurements?.find(item => item.id === continuation.measurementId);
    const ok = measurement && measurementCommands?.continueFreehandMeasurement?.(target, {
      endpoint: continuation.endpoint,
      segments: measurement.segments,
      pxPerInch: scaleForPage(page),
    });
    if (ok) {
      if (snapConnection) measurementCommands.setEndpointSnapConnection(target, continuation.endpoint, snapConnection);
      else measurementCommands.clearEndpointSnapConnection(target, continuation.endpoint);
      state.selectedId = target.id;
      state.selectedIds = [target.id];
      recordHistory(historyBefore, 'path continuation');
      renderList();
      redraw();
      showStatus('Path continued');
    } else {
      redraw();
    }
    return true;
  }

  function convertSelectedMeasurement({
    nextShape,
    state,
    measurementCommands,
    scaleForPage,
    createHistorySnapshot,
    endRotateMode,
    renderList,
    redraw,
    recordHistory,
    showStatus,
    focusMeasurementName,
  } = {}) {
    const measurement = state?.measurements?.find(item => item.id === state.selectedId);
    if (!measurement) return false;
    const historyBefore = createHistorySnapshot();
    const ok = nextShape === 'line'
      ? measurementCommands.convertFreehandMeasurementToLine(measurement, { pxPerInch: scaleForPage(measurement.page) })
      : measurementCommands.convertLineMeasurementToFreehand(measurement, { pxPerInch: scaleForPage(measurement.page) });
    if (!ok) return false;
    state.selectedId = measurement.id;
    state.selectedIds = [measurement.id];
    if (state.rotateModeId === measurement.id) endRotateMode();
    renderList();
    redraw();
    recordHistory(historyBefore, 'run conversion');
    showStatus(`Converted to ${nextShape === 'line' ? 'Line' : 'Freehand'}`);
    return true;
  }

  function toggleSelectedPathVisibility({
    state,
    stateStore,
    createHistorySnapshot,
    endRotateMode,
    renderList,
    redraw,
    recordHistory,
    showStatus,
  } = {}) {
    const selected = state?.measurements?.find(m => m.id === state.selectedId);
    if (!selected) {
      showStatus('Select a path before changing visibility.');
      return false;
    }
    const nextVisible = !stateStore?.isMeasurementPathVisible?.(selected);
    const historyBefore = createHistorySnapshot();
    if (!stateStore?.setMeasurementPathVisibility?.(state, selected.id, nextVisible)) return false;
    if (!nextVisible && state.rotateModeId === selected.id) endRotateMode();
    renderList();
    redraw();
    recordHistory(historyBefore, nextVisible ? 'path show' : 'path hide');
    showStatus(`${nextVisible ? 'Shown' : 'Hidden'} ${selected.name || 'path'}`);
    return true;
  }

  function toggleSelectedCategoryVisibility({
    state,
    stateStore,
    createHistorySnapshot,
    renderList,
    redraw,
    recordHistory,
    showStatus,
  } = {}) {
    const selected = state?.measurements?.find(m => m.id === state.selectedId);
    const key = selected ? stateStore?.pathCategoryVisibilityKeyForMeasurement?.(selected) : null;
    if (!selected || !key) {
      showStatus('Select a path before changing category visibility.');
      return false;
    }
    const nextVisible = !stateStore.isPathCategoryVisible(state, key);
    const historyBefore = createHistorySnapshot();
    stateStore.setPathCategoryVisibility(state, key, nextVisible);
    renderList();
    redraw();
    recordHistory(historyBefore, nextVisible ? 'category show' : 'category hide');
    showStatus(`${nextVisible ? 'Shown' : 'Hidden'} category`);
    return true;
  }

  function mergeSnappedPaths({
    state,
    target,
    measurementCommands,
    scaleForPage,
    createHistorySnapshot,
    setMeasurements,
    endRotateMode,
    renderList,
    redraw,
    recordHistory,
    showStatus,
  } = {}) {
    if (!state || !target || target.kind !== 'anchor-hit') return false;
    const measurementId = target.measurementId ?? state.selectedId;
    const measurement = state.measurements?.find(item => item.id === measurementId);
    if (!measurement) return false;
    const connection = measurementCommands?.mergeConnectionForTarget?.({
      measurements: state.measurements,
      measurement,
      target,
    });
    if (!connection) return false;
    const historyBefore = createHistorySnapshot();
    const result = measurementCommands.mergeSnappedEndpointPaths(state.measurements, connection, {
      pxPerInch: scaleForPage(measurement.page),
    });
    if (!result?.merged) return false;
    setMeasurements(result.measurements, result.measurement.id);
    state.selectedId = result.measurement.id;
    state.selectedIds = [result.measurement.id];
    endRotateMode();
    renderList();
    redraw();
    recordHistory(historyBefore, 'path merge');
    if (typeof focusMeasurementName === 'function') focusMeasurementName(result.measurement.id);
    showStatus('Merge Paths');
    return true;
  }

  window.TakeoffContextMenuController = {
    conversionMenuState,
    applyConversionMenuState,
    applyVisibilityMenuState,
    beginContinuePath,
    finishLineContinuation,
    finishFreehandContinuation,
    convertSelectedMeasurement,
    toggleSelectedPathVisibility,
    toggleSelectedCategoryVisibility,
    mergeSnappedPaths,
  };
})();
