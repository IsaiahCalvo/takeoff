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
    return {
      color: measurement.color,
      name,
      pointCount: measurement.points.length,
      page: measurement.page,
      onOtherPage,
      isUnscaled,
      lengthHtml: isUnscaled ? 'unscaled' : `${formatLength(measurement.lengthInches)} <span class="unit">${unitLabel(unit)}</span>`,
      measurementId: measurement.id,
      className: measurementItemClass({
        selected: selectedId === measurement.id,
        isUnscaled,
      }),
    };
  }

  window.TakeoffSidebarController = {
    applyScopeChrome,
    applyPageGroupCollapsedState,
    setPageInfoOpen,
    buildMeasurementItemViewModel,
  };
})();
