(function () {
  function conversionMenuState({ measurement, measurementModel } = {}) {
    const canConvertToLine = !!(measurement && measurementModel?.isFreehandMeasurement(measurement));
    const canConvertToFreehand = !!(measurement && measurementModel?.isLineMeasurement(measurement));
    return { canConvertToLine, canConvertToFreehand };
  }

  function setButtonState(button, visible) {
    if (!button) return;
    button.hidden = !visible;
    button.disabled = !visible;
  }

  function applyConversionMenuState({ contextMenu, measurement, measurementModel } = {}) {
    const state = conversionMenuState({ measurement, measurementModel });
    setButtonState(contextMenu?.querySelector('[data-action="convert-to-line"]'), state.canConvertToLine);
    setButtonState(contextMenu?.querySelector('[data-action="convert-to-freehand"]'), state.canConvertToFreehand);
    return state;
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
  } = {}) {
    const measurement = state?.measurements?.find(item => item.id === state.selectedId);
    if (!measurement) return false;
    const historyBefore = createHistorySnapshot();
    const ok = nextShape === 'line'
      ? measurementCommands.convertFreehandMeasurementToLine(measurement, { pxPerInch: scaleForPage(measurement.page) })
      : measurementCommands.convertLineMeasurementToFreehand(measurement, { pxPerInch: scaleForPage(measurement.page) });
    if (!ok) return false;
    state.selectedId = measurement.id;
    if (state.rotateModeId === measurement.id) endRotateMode();
    renderList();
    redraw();
    recordHistory(historyBefore, 'run conversion');
    showStatus(`Converted to ${nextShape === 'line' ? 'Line' : 'Freehand'}`);
    return true;
  }

  window.TakeoffContextMenuController = {
    conversionMenuState,
    applyConversionMenuState,
    convertSelectedMeasurement,
  };
})();
