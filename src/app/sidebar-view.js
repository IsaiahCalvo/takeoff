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
    const lengthErrorId = `length-error-${escapeHtml(measurementId)}`;
    return `
    <div class="row head">
      <div class="swatch" style="background:${escapeHtml(color)}; color:${escapeHtml(color)}"></div>
      <input class="name" value="${escapeHtml(name)}" readonly title="Double-click to rename" />
      <span class="point-count" title="${escapeHtml(pointTitle)}">${pointCount}</span>
      <span class="len" title="${escapeHtml(lengthTitle)}"><input class="length" value="${escapeHtml(lengthValue)}" readonly inputmode="decimal" aria-label="Length" title="${escapeHtml(lengthInputTitle)}" />${unitMarkup}<span class="length-error" id="${lengthErrorId}" role="alert" hidden></span></span>
      <button class="del" data-id="${escapeHtml(measurementId)}" title="Delete">×</button>
    </div>
  `;
  }

  function buildPathGroupMarkup({
    color = '#7d8a91',
    displayName = 'Path',
    categorySubtitle = '',
    runCountText = '0 runs',
    unscaledText = '',
    pageCoverageText = 'No page',
    totalText = '0.00',
    totalUnitText = '',
  } = {}) {
    const subtitleMarkup = categorySubtitle
      ? `<span class="path-group-subtitle">${escapeHtml(categorySubtitle)}</span>`
      : '';
    const unscaledMarkup = unscaledText
      ? `<span class="path-group-chip path-group-chip-warn">${escapeHtml(unscaledText)}</span>`
      : '';
    return `
      <div class="path-group-summary">
        <span class="path-group-marker" style="background:${escapeHtml(color)}; color:${escapeHtml(color)}" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false"><path d="M3 12c3.8 0 2.2-8 6-8s2.2 8 4 8"/><circle cx="3" cy="12" r="1.7"/><circle cx="9" cy="4" r="1.7"/><circle cx="13" cy="12" r="1.7"/></svg>
        </span>
        <span class="path-group-copy">
          <span class="path-group-title">${escapeHtml(displayName)}</span>
          ${subtitleMarkup}
        </span>
        <span class="path-group-total"><strong>${escapeHtml(totalText)}</strong><span>${escapeHtml(totalUnitText)}</span></span>
      </div>
      <div class="path-group-meta">
        <span class="path-group-chip">${escapeHtml(runCountText)}</span>
        <span class="path-group-chip">${escapeHtml(pageCoverageText)}</span>
        ${unscaledMarkup}
      </div>
    `;
  }

  function buildCategoryHeaderMarkup({ name = 'Uncategorized', summaryText = '' } = {}) {
    const summaryMarkup = summaryText
      ? `<span class="path-category-summary">${escapeHtml(summaryText)}</span>`
      : '';
    return `
      <div class="path-category-title">${escapeHtml(name)}</div>
      ${summaryMarkup}
    `;
  }

  window.TakeoffSidebarView = {
    escapeHtml,
    measurementItemClass,
    buildMeasurementItemMarkup,
    buildPathGroupMarkup,
    buildCategoryHeaderMarkup,
  };
})();
