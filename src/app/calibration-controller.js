(function () {
  function countPageMeasurements(measurements, page) {
    return (measurements || []).filter(measurement => {
      const measurementPage = Number(measurement?.page);
      return (Number.isInteger(measurementPage) && measurementPage > 0 ? measurementPage : 1) === page;
    }).length;
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

  function setScopeMenuOpen({ scopeCombo, menuButton, scopeDisplay, isOpen }) {
    scopeCombo.classList.toggle('open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    if (scopeDisplay && typeof scopeDisplay.setAttribute === 'function') scopeDisplay.setAttribute('aria-expanded', String(isOpen));
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
    setScopeMenuOpen({ scopeCombo, menuButton, scopeDisplay, isOpen: false });
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
      scopeDisplay,
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
      setScopeMenuOpen({ scopeCombo, menuButton, scopeDisplay, isOpen: false });
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

  function setSourceMenuOpen({ sourceCombo, sourceDisplay, isOpen }) {
    if (!sourceCombo || !sourceDisplay) return;
    sourceCombo.classList.toggle('open', isOpen);
    sourceDisplay.setAttribute('aria-expanded', String(isOpen));
  }

  function setSourceText(element, text, hidden = false) {
    if (!element) return;
    element.textContent = text || '';
    element.hidden = hidden;
  }

  function appendSourceText(parent, className, text, hidden = false) {
    const child = parent.ownerDocument.createElement('span');
    child.className = className;
    child.textContent = text || '';
    if (hidden) child.hidden = true;
    parent.appendChild(child);
    return child;
  }

  function sourceOptionFromTarget(target, sourceOptions) {
    let node = target;
    while (node && node !== sourceOptions) {
      if (node.dataset && node.dataset.sourceValue) return node;
      node = node.parentNode;
    }
    return null;
  }

  function replaceCalibrationSourceOptions({ sourceOptions, options, selectedValue }) {
    if (!sourceOptions) return;
    sourceOptions.textContent = '';
    if (Array.isArray(sourceOptions.children)) sourceOptions.children.length = 0;
    for (const optionModel of options) {
      const option = sourceOptions.ownerDocument.createElement('button');
      option.type = 'button';
      option.className = `calib-source-option${optionModel.value === selectedValue ? ' active' : ''}`;
      option.dataset.sourceValue = optionModel.value;
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(optionModel.value === selectedValue));

      const main = sourceOptions.ownerDocument.createElement('span');
      main.className = 'calib-source-option-main';
      appendSourceText(main, 'calib-source-title', optionModel.pageLabel || optionModel.label);
      appendSourceText(main, 'calib-source-badge', optionModel.scaleLabel, !optionModel.scaleLabel);
      appendSourceText(main, 'calib-source-badge', optionModel.pageCountLabel, !optionModel.pageCountLabel);
      option.appendChild(main);
      sourceOptions.appendChild(option);
    }
  }

  function selectedCalibrationSource(options, selectedValue) {
    return options.find(option => option.value === selectedValue) || options[0] || null;
  }

  function applyCalibrationSourceState({
    sourceField,
    sourceInput,
    sourceCombo,
    sourceDisplay,
    sourceOptionsEl,
    sourceTitle,
    sourceScale,
    sourceCount,
    sourceHelper,
    valueInput,
    unitSelect,
    okButton,
    options,
    selectedValue,
    isPositiveCalibrationValue,
  }) {
    const sourceOptions = Array.isArray(options) && options.length
      ? options
      : [{ value: 'new', label: 'New calibration', pageLabel: 'New calibration', pages: [], page: null, helper: '' }];
    const selected = selectedCalibrationSource(sourceOptions, selectedValue) || sourceOptions[0];
    const isCopiedCalibration = Boolean(selected && selected.pages && selected.pages.length);

    if (sourceField) sourceField.hidden = sourceOptions.length <= 1;
    replaceCalibrationSourceOptions({ sourceOptions: sourceOptionsEl, options: sourceOptions, selectedValue: selected?.value });
    if (sourceInput && selected) sourceInput.value = selected.value;
    setSourceMenuOpen({ sourceCombo, sourceDisplay, isOpen: false });
    setSourceText(sourceTitle, selected?.pageLabel || selected?.label || 'New calibration');
    setSourceText(sourceScale, selected?.scaleLabel || '', !selected?.scaleLabel);
    setSourceText(sourceCount, selected?.pageCountLabel || '', !selected?.pageCountLabel);
    valueInput.disabled = isCopiedCalibration;
    unitSelect.disabled = isCopiedCalibration;
    okButton.textContent = isCopiedCalibration ? 'Match Scale' : 'Set Scale';
    okButton.disabled = isCopiedCalibration ? false : !isPositiveCalibrationValue(valueInput.value);

    const helperText = isCopiedCalibration ? (selected.helper || '') : '';
    if (sourceHelper) {
      sourceHelper.textContent = helperText;
      sourceHelper.hidden = !helperText;
    }

    return selected;
  }

  function applyModalState({
    modal,
    valueInput,
    okButton,
    unitSelect,
    sourceField,
    sourceInput,
    sourceCombo,
    sourceDisplay,
    sourceOptionsEl,
    sourceTitle,
    sourceScale,
    sourceCount,
    sourceHelper,
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
    if (sourceInput) {
      applyCalibrationSourceState({
        sourceField,
        sourceInput,
        sourceCombo,
        sourceDisplay,
        sourceOptionsEl,
        sourceTitle,
        sourceScale,
        sourceCount,
        sourceHelper,
        valueInput,
        unitSelect,
        okButton,
        options: modalState.sourceOptions,
        selectedValue: modalState.sourceValue || 'new',
        isPositiveCalibrationValue,
      });
    }
  }

  function createCalibrationModal({
    root,
    getElement,
    state,
    workflow,
    unitToInch,
    currentPage,
    totalPages,
    parsePageRange,
    computePxPerInch,
    distancePx,
    applyScaleToPages,
    measureLengthPx,
    createHistorySnapshot,
    recordHistory,
    updateScaleLabel,
    updatePageLabel,
    setMode,
    renderList,
    redraw,
    showStatus,
    alertUser,
    focusLater,
  }) {
    const $ = getElement;
    let pendingCalibration = null;

    function buildSourceOptions(unit) {
      return workflow.calibrationSourceOptions({
        pageScales: state.pageScales,
        currentPage: currentPage(),
        unit,
        unitToInch,
      });
    }

    function refreshSource(selectedValue = $('calibSource').value || 'new') {
      return applyCalibrationSourceState({
        sourceField: $('calibSourceField'),
        sourceInput: $('calibSource'),
        sourceCombo: $('calibSourceCombo'),
        sourceDisplay: $('calibSourceDisplay'),
        sourceOptionsEl: $('calibSourceOptions'),
        sourceTitle: $('calibSourceTitle'),
        sourceScale: $('calibSourceScale'),
        sourceCount: $('calibSourceCount'),
        sourceHelper: $('calibSourceHelper'),
        valueInput: $('calibValue'),
        unitSelect: $('calibUnit'),
        okButton: $('calibOk'),
        options: buildSourceOptions($('calibUnit').value || state.unit),
        selectedValue,
        isPositiveCalibrationValue: workflow.isPositiveCalibrationValue,
      });
    }

    function updateValueValidity() {
      const isCopiedCalibration = $('calibSource').value !== 'new';
      $('calibOk').disabled = isCopiedCalibration ? false : !workflow.isPositiveCalibrationValue($('calibValue').value);
    }

    function close() {
      setModalOpen($('calibModal'), false);
      state.inProgress = null;
      pendingCalibration = null;
      redraw();
    }

    function save() {
      const source = refreshSource($('calibSource').value);
      const isCopiedCalibration = Boolean(source && source.page != null);
      const value = workflow.calibrationValueNumber($('calibValue').value);
      if (!isCopiedCalibration && !workflow.isPositiveCalibrationValue($('calibValue').value)) {
        updateValueValidity();
        $('calibValue').focus();
        return;
      }

      const unit = $('calibUnit').value;
      const pxPerInch = isCopiedCalibration
        ? source.pxPerInch
        : computePxPerInch(pendingCalibration.points, value, unit, distancePx);
      const targetPageResult = workflow.resolveTargetPages({
        scope: $('calibScope').value,
        currentPage: currentPage(),
        totalPages: totalPages(),
        rangeText: $('calibRange').value,
        parsePageRange,
      });
      if (targetPageResult.error === 'empty-custom-range') {
        alertUser('Enter at least one valid page number (e.g. "1, 3, 5-7").');
        $('calibRange').focus();
        return;
      }

      const targetPages = targetPageResult.pages;
      const historyBefore = createHistorySnapshot();
      applyScaleToPages({
        measurements: state.measurements,
        pageScales: state.pageScales,
        pages: targetPages,
        pxPerInch,
        measureLengthPx,
      });
      if (targetPages.includes(currentPage())) state.pxPerInch = pxPerInch;
      updateScaleLabel();

      state.inProgress = null;
      pendingCalibration = null;
      setModalOpen($('calibModal'), false);
      setMode('measure');
      recordHistory(historyBefore, isCopiedCalibration ? 'scale match' : 'scale set');
      renderList();
      updatePageLabel();
      redraw();
      if (isCopiedCalibration) {
        showStatus(`Scale matched on ${targetPages.length} page${targetPages.length > 1 ? 's' : ''} from ${source.pageLabel}.`, 2400);
      } else {
        showStatus(`Scale set on ${targetPages.length} page${targetPages.length > 1 ? 's' : ''}: ${value} ${unit} reference`, 2400);
      }
    }

    bindScopeCombo({
      root,
      scopeInput: $('calibScope'),
      scopeCombo: $('calibScopeCombo'),
      scopeDisplay: $('calibScopeDisplay'),
      scopeOptions: $('calibScopeOptions'),
      menuButton: $('calibScopeMenu'),
      rangeInput: $('calibRange'),
      labelForScope: workflow.scopeLabel,
      focusLater,
    });
    $('calibSourceDisplay').addEventListener('click', () => {
      setSourceMenuOpen({
        sourceCombo: $('calibSourceCombo'),
        sourceDisplay: $('calibSourceDisplay'),
        isOpen: !$('calibSourceCombo').classList.contains('open'),
      });
    });
    $('calibSourceOptions').addEventListener('click', (event) => {
      const option = sourceOptionFromTarget(event.target, $('calibSourceOptions'));
      if (!option) return;
      refreshSource(option.dataset.sourceValue);
    });
    root.addEventListener('click', (event) => {
      if ($('calibSourceCombo').contains(event.target)) return;
      setSourceMenuOpen({
        sourceCombo: $('calibSourceCombo'),
        sourceDisplay: $('calibSourceDisplay'),
        isOpen: false,
      });
    });
    $('calibCancel').addEventListener('click', close);
    $('calibOk').addEventListener('click', save);
    $('calibValue').addEventListener('beforeinput', (event) => {
      if (event.inputType && !event.inputType.startsWith('insert')) return;
      if (event.data && !/^[0-9.]+$/.test(event.data)) event.preventDefault();
    });
    $('calibValue').addEventListener('input', () => {
      const input = $('calibValue');
      const value = workflow.sanitizeCalibrationValueInput(input.value);
      if (input.value !== value) input.value = value;
      updateValueValidity();
    });
    $('calibUnit').addEventListener('change', () => refreshSource($('calibSource').value));
    $('calibValue').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !$('calibOk').disabled) $('calibOk').click();
    });
    bindPageRangeInput({
      rangeInput: $('calibRange'),
      okButton: $('calibOk'),
      sanitizePageRangeInput: workflow.sanitizePageRangeInput,
    });

    return {
      open(calibrationDraft) {
        pendingCalibration = calibrationDraft;
        const modalState = workflow.initialModalState(state.unit);
        modalState.sourceOptions = buildSourceOptions(modalState.unit);
        modalState.sourceValue = 'new';
        applyModalState({
          modal: $('calibModal'),
          valueInput: $('calibValue'),
          okButton: $('calibOk'),
          unitSelect: $('calibUnit'),
          sourceField: $('calibSourceField'),
          sourceInput: $('calibSource'),
          sourceCombo: $('calibSourceCombo'),
          sourceDisplay: $('calibSourceDisplay'),
          sourceOptionsEl: $('calibSourceOptions'),
          sourceTitle: $('calibSourceTitle'),
          sourceScale: $('calibSourceScale'),
          sourceCount: $('calibSourceCount'),
          sourceHelper: $('calibSourceHelper'),
          scopeInput: $('calibScope'),
          scopeCombo: $('calibScopeCombo'),
          scopeDisplay: $('calibScopeDisplay'),
          scopeOptions: $('calibScopeOptions'),
          menuButton: $('calibScopeMenu'),
          rangeInput: $('calibRange'),
          modalState,
          isPositiveCalibrationValue: workflow.isPositiveCalibrationValue,
          labelForScope: workflow.scopeLabel,
        });
        setTimeout(() => $('calibValue').focus(), 50);
      },
      close,
    };
  }

  window.TakeoffCalibrationController = {
    countPageMeasurements,
    resetScaleConfirmMessage,
    setModalOpen,
    setScopeMenuOpen,
    applyModalState,
    applyScopeComboState,
    applyCalibrationSourceState,
    createCalibrationModal,
    bindScopeCombo,
    bindPageRangeInput,
  };
})();
