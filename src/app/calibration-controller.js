(function () {
  function countPageMeasurements(measurements, page) {
    return (measurements || []).filter(measurement => measurement.page === page).length;
  }

  function resetScaleConfirmMessage({ page, affectedCount }) {
    return `Reset calibration for page ${page}? ${affectedCount} run${affectedCount === 1 ? '' : 's'} on this page will be marked unscaled and excluded from totals. You can undo this.`;
  }

  function setModalOpen(modal, isOpen) {
    modal.classList.toggle('show', isOpen);
  }

  function applyModalState({
    modal,
    valueInput,
    okButton,
    unitSelect,
    scopeSelect,
    rangeInput,
    rangeField,
    modalState,
    isPositiveCalibrationValue,
  }) {
    setModalOpen(modal, true);
    valueInput.value = modalState.value;
    okButton.disabled = !isPositiveCalibrationValue(modalState.value);
    unitSelect.value = modalState.unit;
    scopeSelect.value = modalState.scope;
    rangeInput.value = modalState.range;
    rangeField.style.display = modalState.rangeDisplay;
  }

  function applyScopeRangeState({ scope, rangeField, rangeInput, rangeDisplayForScope, focusLater }) {
    rangeField.style.display = rangeDisplayForScope(scope);
    if (scope === 'custom' && focusLater) focusLater(rangeInput);
  }

  window.TakeoffCalibrationController = {
    countPageMeasurements,
    resetScaleConfirmMessage,
    setModalOpen,
    applyModalState,
    applyScopeRangeState,
  };
})();
