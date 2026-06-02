(function () {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function measurementItemClass({ selected = false, isUnscaled = false } = {}) {
    return ['meas-item', selected ? 'selected' : '', isUnscaled ? 'unscaled' : '']
      .filter(Boolean)
      .join(' ');
  }

  function collapseIconPath(collapsed) {
    return collapsed ? 'M4.5 3 7.5 6 4.5 9' : 'M2.5 4.5 6 8l3.5-3.5';
  }

  function buildMeasurementItemMarkup({
    color,
    name,
    pointCount,
    page,
    onOtherPage = false,
    isUnscaled = false,
    lengthHtml = '',
    lengthValue = lengthHtml,
    lengthUnit = '',
    measurementId,
  } = {}) {
    const pointTitle = `${pointCount} anchors${onOtherPage ? ' · page ' + page : ''}`;
    const lengthTitle = isUnscaled ? 'No page scale; excluded from totals.' : '';
    const lengthInputTitle = isUnscaled ? lengthTitle : 'Double-click to edit Length';
    const unitMarkup = !isUnscaled && lengthUnit ? `<span class="unit">${escapeHtml(lengthUnit)}</span>` : '';
    return `
    <div class="row head">
      <div class="swatch" style="background:${escapeHtml(color)}; color:${escapeHtml(color)}"></div>
      <input class="name" value="${escapeHtml(name)}" readonly title="Double-click to rename" />
      <span class="point-count" title="${escapeHtml(pointTitle)}">${pointCount}</span>
      <span class="len" title="${escapeHtml(lengthTitle)}"><input class="length" value="${escapeHtml(lengthValue)}" readonly inputmode="decimal" aria-label="Length" title="${escapeHtml(lengthInputTitle)}" />${unitMarkup}</span>
      <button class="del" data-id="${escapeHtml(measurementId)}" title="Delete">×</button>
    </div>
  `;
  }

  function buildPageHeaderMarkup({
    page,
    collapsed = true,
    hasScale = false,
    scaleText = '',
    excludedTitle = '',
    tooltipId = '',
  } = {}) {
    const toggleText = collapsed ? 'Expand' : 'Collapse';
    const infoMarkup = excludedTitle
      ? `<button class="page-info" type="button" aria-label="${escapeHtml(excludedTitle)}" aria-describedby="${escapeHtml(tooltipId)}" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 7.2v3.8"></path><path d="M8 5h.01"></path></svg><span class="page-info-tooltip" id="${escapeHtml(tooltipId)}" role="tooltip">${escapeHtml(excludedTitle)}</span></button>`
      : '';
    return `
        <button class="collapse-toggle" type="button" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${toggleText} page ${page}" title="${toggleText} page ${page}">
          <svg class="collapse-toggle-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="${collapseIconPath(collapsed)}"></path></svg>
        </button>
        <span class="page-label">Page <strong>${page}</strong></span>
        <span class="page-actions">
          <span class="page-status page-status-scale${hasScale ? '' : ' no-scale'}">${escapeHtml(scaleText)}</span>
          ${infoMarkup}
          <button class="jump" data-page="${page}">Go</button>
        </span>
      `;
  }

  window.TakeoffSidebarView = {
    escapeHtml,
    measurementItemClass,
    collapseIconPath,
    buildMeasurementItemMarkup,
    buildPageHeaderMarkup,
  };
})();
