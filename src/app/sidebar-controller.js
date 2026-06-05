(function () {
  function defaultHasRunDetails(details) {
    return window.TakeoffRunDetails?.hasRunDetails?.(details) || false;
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function cleanString(value) {
    const text = String(value ?? '').trim();
    return text || '';
  }

  function measurementCategorySubtitle(measurement) {
    const pathCategory = sourceObject(measurement?.pathCategory);
    const category = sourceObject(measurement?.category);
    return cleanString(measurement?.pathCategoryName)
      || cleanString(measurement?.categoryName)
      || (typeof measurement?.pathCategory === 'string' ? cleanString(measurement.pathCategory) : '')
      || (typeof measurement?.category === 'string' ? cleanString(measurement.category) : '')
      || cleanString(pathCategory.name)
      || cleanString(category.name)
      || cleanString(measurement?.pathName)
      || 'Uncategorized';
  }

  function applyScopeChrome({ scopeTabs, totalHeading, entireTotal, tabs, model }) {
    scopeTabs.hidden = !model.showScopeTabs;
    totalHeading.textContent = model.totalHeadingText;
    const availableTabs = Array.isArray(model.availableScopeTabs) ? new Set(model.availableScopeTabs) : null;
    if (scopeTabs.style?.setProperty) {
      scopeTabs.style.setProperty('--scope-tab-count', String(availableTabs?.size || 3));
    }
    if (entireTotal) {
      entireTotal.hidden = !model.showEntireTotal;
      entireTotal.textContent = model.entireTotalText || '';
    }
    for (const tab of tabs || []) {
      if (availableTabs) tab.hidden = !availableTabs.has(tab.dataset.tab);
      tab.classList.toggle('active', tab.dataset.tab === model.effectiveSidebarTab);
    }
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
    hasRunDetails,
    pathCategoryVisibilityKey = measurement?.pathCategoryVisibilityKey,
    pathCategoryVisible = measurement?.pathCategoryVisible,
    pathCategoryHidden = measurement?.pathCategoryHidden,
    pathVisibilityHidden = measurement?.pathVisibilityHidden,
  }) {
    const name = cleanMeasurementName(measurement.name, measurement);
    const isUnscaled = measurement.lengthInches == null;
    const onOtherPage = measurement.page !== currentPage;
    const lengthValue = isUnscaled ? 'unscaled' : formatLength(measurement.lengthInches);
    const lengthUnit = isUnscaled ? '' : unitLabel(unit);
    const detailsPresent = (hasRunDetails || defaultHasRunDetails)(measurement.runDetails);
    const pathDisplayName = cleanString(measurement.pathName) || name || 'Path';
    const pathCategorySubtitle = measurementCategorySubtitle(measurement);
    const visibilityKey = cleanString(pathCategoryVisibilityKey);
    const categoryVisible = pathCategoryVisible !== false;
    return {
      color: measurement.color,
      name,
      pathDisplayName,
      pathCategorySubtitle,
      pathCategoryVisibilityKey: visibilityKey,
      pathCategoryVisible: categoryVisible,
      pathCategoryToggleName: pathCategorySubtitle || pathDisplayName || name || 'Path',
      pathStyle: measurement.pathStyle || null,
      pointCount: measurement.points.length,
      page: measurement.page,
      onOtherPage,
      isUnscaled,
      lengthValue,
      lengthUnit,
      lengthHtml: isUnscaled ? 'unscaled' : `${lengthValue} <span class="unit">${lengthUnit}</span>`,
      measurementId: measurement.id,
      detailsPresent,
      className: measurementItemClass({
        selected: selectedId === measurement.id,
        isUnscaled,
        pathVisibilityHidden: pathVisibilityHidden === true || pathCategoryHidden === true,
      }),
    };
  }

  function createEditableLengthInput({
    input,
    currentValue,
    commit,
    cancel,
    afterInput,
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
      if (afterInput) afterInput(input.value);
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
      if (afterInput) afterInput(input.value);
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

  function categoryVisibilityKeys(root) {
    return [...new Set([...root.querySelectorAll('[data-path-category-key]')]
      .map(button => button.dataset.pathCategoryKey)
      .filter(Boolean))];
  }

  function bindCategoryVisibilityControls({ root, setVisibility }) {
    root.addEventListener('click', (event) => {
      const bulkButton = event.target.closest('[data-category-visibility-action]');
      if (bulkButton && root.contains(bulkButton)) {
        event.stopPropagation();
        setVisibility(categoryVisibilityKeys(root), bulkButton.dataset.categoryVisibilityAction === 'show-all');
        return;
      }
      const visibilityButton = event.target.closest('[data-path-category-key]');
      if (!visibilityButton || !root.contains(visibilityButton)) return;
      event.stopPropagation();
      if (event.preventDefault) event.preventDefault();
      setVisibility([visibilityButton.dataset.pathCategoryKey], visibilityButton.dataset.nextVisible !== 'false');
    });
  }

  function bindPathGroupSettingsControls({ root, openSettings }) {
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-path-settings-action="open"]');
      if (!button || !root.contains(button)) return;
      event.stopPropagation();
      event.preventDefault();
      if (openSettings) openSettings(button.dataset.pathGroupId || null, button);
    });
  }

  function bindRunDetailsControls({ root, openDetails }) {
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-run-details-action="open"]');
      if (!button || !root.contains(button)) return;
      event.stopPropagation();
      event.preventDefault();
      if (openDetails) openDetails(button.dataset.measurementId || null, button);
    });
  }

  function selectMeasurementRowFromSidebar({
    measurementId,
    event = {},
    selection,
    renderList,
    syncSidebarSelection,
    redraw,
  } = {}) {
    if (!selection?.selectFromClick) return null;
    const action = selection.selectFromClick(measurementId, event);
    if (action !== 'preserve') {
      if (event.target?.tagName === 'INPUT') syncSidebarSelection?.();
      else renderList?.();
      redraw?.();
    }
    return action;
  }

  function measurementIdMatches(left, right) {
    return left != null && right != null && String(left) === String(right);
  }

  function findMeasurementRow(root, measurementId) {
    if (!root?.querySelectorAll || measurementId == null) return null;
    return [...root.querySelectorAll('.meas-item')]
      .find(item => measurementIdMatches(item?.dataset?.measId, measurementId)) || null;
  }

  function expandContainingPathGroup(row) {
    const group = row?.closest?.('.path-group');
    if (!group) return null;
    group.classList?.remove('collapsed');
    const runs = group.querySelector?.('.path-group-runs');
    if (runs && runs.hidden === true) runs.hidden = false;
    const collapsedToggle = group.querySelector?.('[aria-expanded="false"]');
    if (collapsedToggle?.setAttribute) collapsedToggle.setAttribute('aria-expanded', 'true');
    return group;
  }

  function revealMeasurementRow({
    root,
    measurementId,
    scrollOptions = { block: 'center', inline: 'nearest' },
  } = {}) {
    const row = findMeasurementRow(root, measurementId);
    if (!row) return null;
    expandContainingPathGroup(row);
    if (row.scrollIntoView) row.scrollIntoView(scrollOptions);
    return row;
  }

  window.TakeoffSidebarController = {
    applyScopeChrome,
    buildMeasurementItemViewModel,
    createEditableLengthInput,
    categoryVisibilityKeys,
    bindCategoryVisibilityControls,
    bindPathGroupSettingsControls,
    bindRunDetailsControls,
    selectMeasurementRowFromSidebar,
    measurementIdMatches,
    findMeasurementRow,
    expandContainingPathGroup,
    revealMeasurementRow,
  };
})();
