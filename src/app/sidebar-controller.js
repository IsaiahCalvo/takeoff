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

  function createEditableLengthInput({ input, currentValue, commit, cancel } = {}) {
    function end() {
      input.setAttribute('readonly', '');
      if (input.setSelectionRange) input.setSelectionRange(0, 0);
    }

    function resetToCurrent() {
      input.value = currentValue ? currentValue() : input.value;
    }

    function start() {
      const value = currentValue ? currentValue() : input.value;
      input.dataset.originalLength = value;
      input.value = value;
      input.removeAttribute('readonly');
      input.focus();
      if (input.select) input.select();
    }

    function commitValue() {
      const accepted = commit ? commit(input.value) : true;
      if (!accepted) resetToCurrent();
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
        commitValue();
        input.blur();
        event.stopPropagation();
        event.preventDefault();
      }
    }

    function handleBlur() {
      if (input.hasAttribute('readonly')) return;
      commitValue();
    }

    return {
      start,
      commitValue,
      cancelEdit,
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
