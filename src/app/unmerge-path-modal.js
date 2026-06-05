(function () {
  function createUnmergePathModal({
    getElement,
    state,
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
    function close() {
      state.pendingUnmergePathId = null;
      getElement('unmergePathModal').classList.remove('show');
    }

    function open() {
      const measurement = state.measurements.find(item => item.id === state.selectedId);
      const unmergeState = measurementCommands.unmergePathState(measurement);
      if (!unmergeState.canUnmergePaths) {
        showStatus('Select a merged Path first.');
        return false;
      }
      if (unmergeState.hasMaintainedEdits === false) {
        state.pendingUnmergePathId = measurement.id;
        return perform('original');
      }
      state.pendingUnmergePathId = measurement.id;
      const maintainButton = getElement('unmergeMaintain');
      const reason = getElement('unmergeMaintainReason');
      maintainButton.disabled = !unmergeState.canMaintainEdits;
      reason.hidden = unmergeState.canMaintainEdits;
      reason.textContent = unmergeState.maintainEditsReason || '';
      getElement('unmergePathModal').classList.add('show');
      return true;
    }

    function perform(mode) {
      const measurementId = state.pendingUnmergePathId ?? state.selectedId;
      const measurement = state.measurements.find(item => item.id === measurementId);
      if (!measurement) {
        close();
        return false;
      }
      const historyBefore = createHistorySnapshot();
      const result = measurementCommands.unmergePaths(state.measurements, measurement.id, {
        mode,
        pxPerInch: scaleForPage(measurement.page),
      });
      if (!result.unmerged) {
        showStatus(result.reason || 'Unmerge Paths is not available.');
        open();
        return false;
      }
      setMeasurements(result.measurements, result.measurement?.id ?? null);
      if (state.rotateModeId === measurement.id) endRotateMode();
      recordHistory(historyBefore, 'path unmerge');
      renderList();
      redraw();
      close();
      showStatus('Unmerge Paths');
      return true;
    }

    getElement('unmergeOriginal').addEventListener('click', () => perform('original'));
    getElement('unmergeMaintain').addEventListener('click', () => perform('maintain-edits'));
    getElement('unmergeCancel').addEventListener('click', close);
    return { open, close, perform };
  }

  window.TakeoffUnmergePathModal = { createUnmergePathModal };
})();
