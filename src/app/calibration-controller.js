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

  function scopeOptionButtons(scopeOptions) {
    if (!scopeOptions || typeof scopeOptions.querySelectorAll !== 'function') return [];
    return Array.from(scopeOptions.querySelectorAll('[data-scope]'));
  }

  function setScopeMenuOpen({ scopeCombo, menuButton, isOpen }) {
    scopeCombo.classList.toggle('open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
  }

  function applyScopeComboState({
    scope,
    scopeInput,
    scopeCombo,
    scopeDisplay,
    scopeOptions,
    menuButton,
    rangeInput,
    labelForScope,
    focusLater,
  }) {
    const nextScope = scope === 'all' || scope === 'custom' ? scope : 'this';
    const isCustom = nextScope === 'custom';

    scopeInput.value = nextScope;
    scopeCombo.dataset.scope = nextScope;
    scopeCombo.classList.toggle('custom', isCustom);
    scopeDisplay.textContent = labelForScope(nextScope);
    rangeInput.disabled = !isCustom;
    rangeInput.setAttribute('aria-hidden', String(!isCustom));

    for (const option of scopeOptionButtons(scopeOptions)) {
      const isActive = option.dataset.scope === nextScope;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-checked', String(isActive));
    }
    setScopeMenuOpen({ scopeCombo, menuButton, isOpen: false });
    if (isCustom && focusLater) focusLater(rangeInput);
  }

  function bindScopeCombo({
    root,
    scopeInput,
    scopeCombo,
    scopeDisplay,
    scopeOptions,
    menuButton,
    rangeInput,
    labelForScope,
    focusLater,
  }) {
    const toggleMenu = () => setScopeMenuOpen({
      scopeCombo,
      menuButton,
      isOpen: !scopeCombo.classList.contains('open'),
    });
    const applyScope = (scope, shouldFocusRange = false) => applyScopeComboState({
      scope,
      scopeInput,
      scopeCombo,
      scopeDisplay,
      scopeOptions,
      menuButton,
      rangeInput,
      labelForScope,
      focusLater: shouldFocusRange ? focusLater : null,
    });

    scopeDisplay.addEventListener('click', toggleMenu);
    menuButton.addEventListener('click', toggleMenu);
    scopeOptions.addEventListener('click', (event) => {
      const option = event.target.closest('[data-scope]');
      if (!option) return;
      applyScope(option.dataset.scope, option.dataset.scope === 'custom');
    });
    root.addEventListener('click', (event) => {
      if (scopeCombo.contains(event.target)) return;
      setScopeMenuOpen({ scopeCombo, menuButton, isOpen: false });
    });
  }

  function bindPageRangeInput({ rangeInput, okButton, sanitizePageRangeInput }) {
    rangeInput.addEventListener('beforeinput', (event) => {
      if (event.inputType && !event.inputType.startsWith('insert')) return;
      if (event.data && !/^[0-9,\-\s]+$/.test(event.data)) event.preventDefault();
    });
    rangeInput.addEventListener('input', () => {
      const value = sanitizePageRangeInput(rangeInput.value);
      if (rangeInput.value !== value) rangeInput.value = value;
    });
    rangeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !okButton.disabled) okButton.click();
    });
  }

  function applyModalState({
    modal,
    valueInput,
    okButton,
    unitSelect,
    scopeInput,
    scopeCombo,
    scopeDisplay,
    scopeOptions,
    menuButton,
    rangeInput,
    modalState,
    isPositiveCalibrationValue,
    labelForScope,
  }) {
    setModalOpen(modal, true);
    valueInput.value = modalState.value;
    okButton.disabled = !isPositiveCalibrationValue(modalState.value);
    unitSelect.value = modalState.unit;
    rangeInput.value = modalState.range;
    applyScopeComboState({
      scope: modalState.scope,
      scopeInput,
      scopeCombo,
      scopeDisplay,
      scopeOptions,
      menuButton,
      rangeInput,
      labelForScope,
    });
  }

  window.TakeoffCalibrationController = {
    countPageMeasurements,
    resetScaleConfirmMessage,
    setModalOpen,
    setScopeMenuOpen,
    applyModalState,
    applyScopeComboState,
    bindScopeCombo,
    bindPageRangeInput,
  };
})();
