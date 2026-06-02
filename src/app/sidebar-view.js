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
    detailsPresent = false,
  } = {}) {
    const pointTitle = `${pointCount} anchors${onOtherPage ? ' · page ' + page : ''}`;
    const lengthTitle = isUnscaled ? 'No page scale; excluded from totals.' : '';
    const lengthInputTitle = isUnscaled ? lengthTitle : 'Double-click to edit Length';
    const unitMarkup = !isUnscaled && lengthUnit ? `<span class="unit">${escapeHtml(lengthUnit)}</span>` : '';
    const lengthErrorId = `length-error-${escapeHtml(measurementId)}`;
    const detailsClass = detailsPresent ? 'run-details-action has-details' : 'run-details-action';
    const detailsLabel = detailsPresent ? 'Edit Run Details. Details saved.' : 'Add Run Details';
    return `
    <div class="row head">
      <div class="swatch" style="background:${escapeHtml(color)}; color:${escapeHtml(color)}"></div>
      <input class="name" value="${escapeHtml(name)}" readonly title="Double-click to rename" />
      <span class="point-count" title="${escapeHtml(pointTitle)}">${pointCount}</span>
      <span class="len" title="${escapeHtml(lengthTitle)}"><input class="length" value="${escapeHtml(lengthValue)}" readonly inputmode="decimal" aria-label="Length" title="${escapeHtml(lengthInputTitle)}" />${unitMarkup}<span class="length-error" id="${lengthErrorId}" role="alert" hidden></span></span>
      <button class="${detailsClass}" type="button" data-run-details-action="open" data-measurement-id="${escapeHtml(measurementId)}" aria-label="${escapeHtml(detailsLabel)}" title="${escapeHtml(detailsLabel)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></svg>
      </button>
      <button class="del" data-id="${escapeHtml(measurementId)}" title="Delete">×</button>
    </div>
  `;
  }

  function buildPathGroupMarkup({
    id = '',
    color = '#7d8a91',
    displayName = 'Path',
    categorySubtitle = '',
    runCountText = '0 runs',
    unscaledText = '',
    hiddenText = '',
    pageCoverageText = 'No page',
    totalText = '0.00',
    totalUnitText = '',
    settingsAvailable = false,
    settingsLabel = 'Path Settings',
  } = {}) {
    const subtitleMarkup = categorySubtitle
      ? `<span class="path-group-subtitle">${escapeHtml(categorySubtitle)}</span>`
      : '';
    const unscaledMarkup = unscaledText
      ? `<span class="path-group-chip path-group-chip-warn">${escapeHtml(unscaledText)}</span>`
      : '';
    const hiddenMarkup = hiddenText
      ? `<span class="path-group-chip path-group-chip-muted">${escapeHtml(hiddenText)}</span>`
      : '';
    const settingsMarkup = settingsAvailable
      ? `<button class="path-group-settings" type="button" data-path-settings-action="open" data-path-group-id="${escapeHtml(id)}" aria-label="${escapeHtml(settingsLabel)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M4.2 6.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 17.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
        </button>`
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
        ${settingsMarkup}
      </div>
      <div class="path-group-meta">
        <span class="path-group-chip">${escapeHtml(runCountText)}</span>
        <span class="path-group-chip">${escapeHtml(pageCoverageText)}</span>
        ${unscaledMarkup}
        ${hiddenMarkup}
      </div>
    `;
  }

  function visibilityIconMarkup(visible) {
    if (visible) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6c1.5 0 2.8.3 4 .8"/><path d="M21.5 12s-3.5 6-9.5 6c-1.5 0-2.8-.3-4-.8"/><path d="m4 4 16 16"/><path d="M9.8 9.8a2.5 2.5 0 0 0 3.4 3.4"/></svg>';
  }

  function templateCategoryIconSvg() {
    return `
      <svg viewBox="-3 -42 170 170" focusable="false" aria-hidden="true">
        <path class="tail" d="M130 43 C109 43 109 25 87 25 C64 25 64 61 42 61 C30 61 24 56 20 52" />
        <circle class="anchor-dot" cx="20" cy="52" r="13" />
        <circle class="anchor-dot" cx="144" cy="43" r="13" />
      </svg>
    `;
  }

  function categoryIconMarkup({ color = '#7d8a91', iconKind = 'template', hidden = false } = {}) {
    const kind = iconKind === 'manual' ? 'manual' : 'template';
    const hiddenClass = hidden ? ' hidden-icon' : '';
    const artwork = kind === 'manual'
      ? '<span class="path-category-square" aria-hidden="true"></span>'
      : templateCategoryIconSvg();
    return `<span class="path-category-icon path-category-icon-${kind}${hiddenClass}" style="--path-color:${escapeHtml(color)}" aria-hidden="true">${artwork}</span>`;
  }

  function buildCategoryHeaderMarkup({
    key = '',
    name = 'Uncategorized',
    summaryText = '',
    categoryVisible = true,
    hiddenText = '',
    totalText = '0.00',
    totalUnitText = '',
    color = '#7d8a91',
    iconKind = 'template',
  } = {}) {
    const isVisible = categoryVisible !== false;
    const summaryMarkup = summaryText
      ? `<span class="path-category-summary">${escapeHtml(summaryText)}</span>`
      : '';
    const hiddenMarkup = hiddenText
      ? `<span class="path-category-hidden">${escapeHtml(hiddenText)}</span>`
      : '';
    const actionText = isVisible ? 'Hide' : 'Show';
    return `
      <button class="path-category-row" type="button" data-path-category-key="${escapeHtml(key)}" data-next-visible="${isVisible ? 'false' : 'true'}" aria-pressed="${isVisible ? 'true' : 'false'}" aria-label="${actionText} ${escapeHtml(name)} category">
        ${categoryIconMarkup({ color, iconKind, hidden: !isVisible })}
        <span class="path-category-copy">
          <span class="path-category-title">${escapeHtml(name)}</span>
          <span class="path-category-meta">
            ${summaryMarkup}
            ${hiddenMarkup}
          </span>
        </span>
        <span class="path-category-controls">
          <span class="path-category-total"><strong>${escapeHtml(totalText)}</strong><span>${escapeHtml(totalUnitText)}</span></span>
          <span class="path-category-status${isVisible ? '' : ' off'}">${isVisible ? 'Visible' : 'Hidden'}</span>
        </span>
      </button>
    `;
  }

  function buildCategoryVisibilityToolbarMarkup({
    totalCount = 0,
    hiddenCount = 0,
    canShowAll = false,
    canHideAll = false,
  } = {}) {
    if (!totalCount) return '';
    const status = hiddenCount ? `${hiddenCount} hidden` : 'All visible';
    return `
      <div class="path-category-visibility-toolbar" aria-label="Category visibility controls">
        <span class="path-category-visibility-status">${escapeHtml(status)}</span>
        <div class="path-category-visibility-actions">
          <button class="path-category-bulk-action" type="button" data-category-visibility-action="show-all" aria-label="Show all categories" title="Show all categories"${canShowAll ? '' : ' disabled'}>
            ${visibilityIconMarkup(true)}
          </button>
          <button class="path-category-bulk-action" type="button" data-category-visibility-action="hide-all" aria-label="Hide all categories" title="Hide all categories"${canHideAll ? '' : ' disabled'}>
            ${visibilityIconMarkup(false)}
          </button>
        </div>
      </div>
    `;
  }

  window.TakeoffSidebarView = {
    escapeHtml,
    measurementItemClass,
    buildMeasurementItemMarkup,
    buildPathGroupMarkup,
    buildCategoryHeaderMarkup,
    buildCategoryVisibilityToolbarMarkup,
  };
})();
