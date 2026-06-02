(function () {
  function applyScopeChrome({ scopeTabs, totalHeading, tabs, model }) {
    scopeTabs.hidden = !model.showScopeTabs;
    totalHeading.textContent = model.totalHeadingText;
    for (const tab of tabs || []) {
      tab.classList.toggle('active', tab.dataset.tab === model.effectiveSidebarTab);
    }
  }

  function applyPageGroupCollapsedState({ groupEl, header, page, collapsed, collapseIconPath }) {
    groupEl.classList.toggle('collapsed', collapsed);
    groupEl.classList.toggle('open', !collapsed);
    header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const toggle = header.querySelector('.collapse-toggle');
    const iconPath = header.querySelector('.collapse-toggle-icon path');
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} page ${page}`);
      toggle.title = `${collapsed ? 'Expand' : 'Collapse'} page ${page}`;
    }
    if (iconPath) iconPath.setAttribute('d', collapseIconPath(collapsed));
  }

  function setPageInfoOpen(button, isOpen) {
    button.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function buildMeasurementItemViewModel({
    measurement,
    currentPage,
    selectedId,
    unit,
    cleanMeasurementName,
    formatLength,
    unitLabel,
    measurementItemClass,
  }) {
    const name = cleanMeasurementName(measurement.name, measurement);
    const isUnscaled = measurement.lengthInches == null;
    const onOtherPage = measurement.page !== currentPage;
    const lengthValue = isUnscaled ? 'unscaled' : formatLength(measurement.lengthInches);
    const lengthUnit = isUnscaled ? '' : unitLabel(unit);
    return {
      color: measurement.color,
      name,
      pointCount: measurement.points.length,
      page: measurement.page,
      onOtherPage,
      isUnscaled,
      lengthValue,
      lengthUnit,
      lengthHtml: isUnscaled ? 'unscaled' : `${lengthValue} <span class="unit">${lengthUnit}</span>`,
      measurementId: measurement.id,
      className: measurementItemClass({
        selected: selectedId === measurement.id,
        isUnscaled,
      }),
    };
  }

  function createEditableLengthInput({
    input,
    currentValue,
    commit,
    cancel,
    errorEl = null,
    validationMessage = 'Enter a positive Length.',
  } = {}) {
    function sanitizeDecimalInput(value) {
      return window.TakeoffDecimalInput.sanitizePositiveDecimalInput(value);
    }

    function setErrorVisible(visible) {
      if (!errorEl) return;
      errorEl.hidden = !visible;
      errorEl.textContent = visible ? validationMessage : '';
      if (visible && errorEl.id) input.setAttribute('aria-describedby', errorEl.id);
    }

    function clearValidation() {
      if (input.classList) input.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      setErrorVisible(false);
    }

    function showValidation() {
      if (input.classList) input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
      setErrorVisible(true);
      input.focus();
      if (input.select) input.select();
    }

    function end() {
      clearValidation();
      input.setAttribute('readonly', '');
      if (input.setSelectionRange) input.setSelectionRange(0, 0);
    }

    function start() {
      const value = currentValue ? currentValue() : input.value;
      input.dataset.originalLength = value;
      input.value = value;
      clearValidation();
      input.removeAttribute('readonly');
      input.focus();
      if (input.select) input.select();
    }

    function handleInput() {
      const sanitized = sanitizeDecimalInput(input.value);
      if (input.value !== sanitized) {
        const cursor = typeof input.selectionStart === 'number'
          ? Math.max(0, input.selectionStart - (input.value.length - sanitized.length))
          : sanitized.length;
        input.value = sanitized;
        if (input.setSelectionRange) input.setSelectionRange(cursor, cursor);
      }
      clearValidation();
    }

    function commitValue() {
      input.value = sanitizeDecimalInput(input.value);
      const accepted = commit ? commit(input.value) : true;
      if (!accepted) {
        showValidation();
        return false;
      }
      end();
      return !!accepted;
    }

    function cancelEdit() {
      const original = input.dataset.originalLength ?? (currentValue ? currentValue() : input.value);
      input.value = original;
      if (cancel) cancel(original);
      end();
    }

    function handleKeyDown(event) {
      if (input.hasAttribute('readonly')) return;
      if (event.key === 'Escape') {
        cancelEdit();
        input.blur();
        event.stopPropagation();
        event.preventDefault();
      } else if (event.key === 'Enter') {
        if (commitValue()) input.blur();
        event.stopPropagation();
        event.preventDefault();
      }
    }

    function handleBlur() {
      if (input.hasAttribute('readonly')) return;
      return commitValue();
    }

    if (input.addEventListener && !input.dataset.lengthSanitizerBound) {
      input.addEventListener('input', handleInput);
      input.dataset.lengthSanitizerBound = 'true';
    }

    return {
      start,
      commitValue,
      cancelEdit,
      handleInput,
      handleKeyDown,
      handleBlur,
    };
  }

  window.TakeoffSidebarController = {
    applyScopeChrome,
    applyPageGroupCollapsedState,
    setPageInfoOpen,
    buildMeasurementItemViewModel,
    createEditableLengthInput,
  };
})();
