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

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function measurementItemClass({ selected = false, isUnscaled = false, pathVisibilityHidden = false, pathCategoryHidden = false } = {}) {
    const visibilityHidden = pathVisibilityHidden || pathCategoryHidden;
    return ['meas-item', selected ? 'selected' : '', isUnscaled ? 'unscaled' : '', visibilityHidden ? 'visibility-hidden' : '']
      .filter(Boolean)
      .join(' ');
  }

  function buildMeasurementItemMarkup({
    color = '#7d8a91',
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
    pathCategorySubtitle = '',
    pathStyle = null,
  } = {}) {
    const pointTitle = `${pointCount} anchors${onOtherPage ? ' · page ' + page : ''}`;
    const lengthTitle = isUnscaled ? 'No page scale; excluded from totals.' : '';
    const lengthInputTitle = isUnscaled ? lengthTitle : 'Double-click to edit Length';
    const unitMarkup = !isUnscaled && lengthUnit ? `<span class="unit">${escapeHtml(lengthUnit)}</span>` : '';
    const lengthErrorId = `length-error-${escapeHtml(measurementId)}`;
    const detailsClass = detailsPresent ? 'run-details-action has-details' : 'run-details-action';
    const detailsLabel = detailsPresent ? 'Edit Run Details. Details saved.' : 'Add Run Details';
    const categoryMarkup = pathCategorySubtitle
      ? `<span class="measurement-category">${escapeHtml(pathCategorySubtitle)}</span>`
      : '';
    return `
    <div class="row head">
      <span class="measurement-path-icon" style="--path-color:${escapeHtml(color)}" aria-hidden="true">${measurementPathIconSvg({ color, pathStyle })}</span>
      <span class="measurement-copy">
        <input class="name" value="${escapeHtml(name)}" readonly title="Double-click to rename" />
        ${categoryMarkup}
      </span>
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
        <span class="path-group-marker" style="--path-color:${escapeHtml(color)}" aria-hidden="true">
          ${angledPathIconSvg()}
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

  function buildPageGroupMarkup({
    page = 1,
    title = 'Page 1',
    runCountText = '0 runs',
    averageText = '',
    unscaledText = '',
    hiddenText = '',
    totalText = '0.00',
    totalUnitText = '',
    collapsed = false,
    runsId = `page-group-runs-${page}`,
  } = {}) {
    const unscaledMarkup = unscaledText
      ? `<span class="path-group-chip path-group-chip-warn">${escapeHtml(unscaledText)}</span>`
      : '';
    const averageMarkup = averageText
      ? `<span class="path-group-average page-group-average">${escapeHtml(averageText)}</span>`
      : '';
    const hiddenMarkup = hiddenText
      ? `<span class="path-group-chip path-group-chip-muted">${escapeHtml(hiddenText)}</span>`
      : '';
    return `
      <button class="page-group-toggle" type="button" data-page-group-toggle data-page-group-page="${escapeHtml(page)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="${escapeHtml(runsId)}">
        <span class="page-group-chevron" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M4.5 7.5 8 11l3.5-3.5"/></svg></span>
        <span class="page-group-copy">
          <span class="page-group-title">${escapeHtml(title)}</span>
          <span class="path-group-meta page-group-meta">
            <span class="path-group-chip">${escapeHtml(runCountText)}</span>
            ${unscaledMarkup}
            ${hiddenMarkup}
          </span>
        </span>
        <span class="page-group-summary">
          <span class="page-group-total"><strong>${escapeHtml(totalText)}</strong><span>${escapeHtml(totalUnitText)}</span></span>
          ${averageMarkup}
        </span>
      </button>
    `;
  }

  function categoryBulbIconMarkup(visible) {
    const boltMarkup = visible
      ? '<path class="path-category-bulb-bolt" d="M12.7857 8.5L10.6429 11.5H13.6429L11.5 14.5" />'
      : '';
    return `<svg class="path-category-bulb" viewBox="0 0 24 24" focusable="false">
        <path class="path-category-bulb-outline" d="M14.5 19.5H9.5M14.5 19.5C14.5 18.7865 14.5 18.4297 14.5381 18.193C14.6609 17.4296 14.6824 17.3815 15.1692 16.7807C15.3201 16.5945 15.8805 16.0927 17.0012 15.0892C18.5349 13.7159 19.5 11.7206 19.5 9.5C19.5 5.35786 16.1421 2 12 2C7.85786 2 4.5 5.35786 4.5 9.5C4.5 11.7206 5.4651 13.7159 6.99876 15.0892C8.11945 16.0927 8.67987 16.5945 8.83082 16.7807C9.31762 17.3815 9.3391 17.4296 9.46192 18.193C9.5 18.4297 9.5 18.7865 9.5 19.5M14.5 19.5C14.5 20.4346 14.5 20.9019 14.299 21.25C14.1674 21.478 13.978 21.6674 13.75 21.799C13.4019 22 12.9346 22 12 22C11.0654 22 10.5981 22 10.25 21.799C10.022 21.6674 9.83261 21.478 9.70096 21.25C9.5 20.9019 9.5 20.4346 9.5 19.5" />
        ${boltMarkup}
      </svg>`;
  }

  function templateCategoryIconSvg() {
    return angledPathIconSvg();
  }

  function pathStyleForIcon(style, color) {
    const source = sourceObject(style);
    const stroke = sourceObject(source.stroke);
    const anchors = sourceObject(source.anchors);
    return {
      stroke: {
        ...stroke,
        color: stroke.color || color,
      },
      anchors: {
        ...anchors,
        border: anchors.border || color,
      },
    };
  }

  function measurementPathIconSvg({ color = '#7d8a91', pathStyle = null } = {}) {
    const renderer = window.TakeoffPathStyleRenderer;
    if (renderer?.renderPathStylePreviewSvg) {
      return renderer.renderPathStylePreviewSvg(pathStyleForIcon(pathStyle, color));
    }
    return angledPathIconSvg();
  }

  function angledPathIconSvg() {
    return `
      <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
        <g class="path-category-icon-diagonal">
          <path class="tail" d="M18 74 C34 74 34 54 50 54 C66 54 66 26 82 26" />
          <circle class="anchor-dot" cx="18" cy="74" r="12" />
          <circle class="anchor-dot" cx="82" cy="26" r="12" />
        </g>
      </svg>
    `;
  }

  function categoryIconMarkup({ color = '#7d8a91', iconKind = 'template', hidden = false, pathStyle = null } = {}) {
    const kind = iconKind === 'manual' ? 'manual' : 'template';
    const hiddenClass = hidden ? ' hidden-icon' : '';
    const artwork = kind === 'manual'
      ? '<span class="path-category-square" aria-hidden="true"></span>'
      : (pathStyle ? measurementPathIconSvg({ color, pathStyle }) : templateCategoryIconSvg());
    return `<span class="path-category-icon path-category-icon-${kind}${hiddenClass}" style="--path-color:${escapeHtml(color)}" aria-hidden="true">${artwork}</span>`;
  }

  function buildCategoryHeaderMarkup({
    key = '',
    name = 'Uncategorized',
    summaryText = '',
    averageText = '',
    categoryVisible = true,
    hiddenText = '',
    totalText = '0.00',
    totalUnitText = '',
    color = '#7d8a91',
    iconKind = 'template',
    pathStyle = null,
  } = {}) {
    const isVisible = categoryVisible !== false;
    const summaryMarkup = summaryText
      ? `<span class="path-category-summary">${escapeHtml(summaryText)}</span>`
      : '';
    const averageMarkup = averageText
      ? `<span class="path-group-average path-category-average">${escapeHtml(averageText)}</span>`
      : '';
    const hiddenMarkup = hiddenText
      ? `<span class="path-category-hidden path-category-hidden-total">${escapeHtml(hiddenText)}</span>`
      : '';
    const actionText = isVisible ? 'Hide' : 'Show';
    return `
      <button class="path-category-row" type="button" data-path-category-key="${escapeHtml(key)}" data-next-visible="${isVisible ? 'false' : 'true'}" aria-pressed="${isVisible ? 'true' : 'false'}" aria-label="${actionText} ${escapeHtml(name)} category">
        ${categoryIconMarkup({ color, iconKind, hidden: !isVisible, pathStyle })}
        <span class="path-category-copy">
          <span class="path-category-title">${escapeHtml(name)}</span>
          <span class="path-category-meta">
            ${summaryMarkup}
            ${averageMarkup}
          </span>
        </span>
        <span class="path-category-controls">
          <span class="path-category-control-top">
            <span class="path-category-total"><strong>${escapeHtml(totalText)}</strong><span>${escapeHtml(totalUnitText)}</span></span>
            <span class="path-category-status${isVisible ? '' : ' off'}" aria-hidden="true">${categoryBulbIconMarkup(isVisible)}</span>
          </span>
          ${hiddenMarkup}
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
    const allVisible = hiddenCount === 0;
    const action = allVisible ? 'hide-all' : 'show-all';
    const actionText = allVisible ? 'Hide all categories' : 'Show all categories';
    const enabled = allVisible ? canHideAll : canShowAll;
    return `
      <div class="path-category-visibility-toolbar" aria-label="Category visibility controls">
        <span class="path-category-visibility-status">${escapeHtml(status)}</span>
        <div class="path-category-visibility-actions">
          <button class="path-category-bulk-toggle path-category-status${allVisible ? '' : ' off'}" type="button" data-category-visibility-action="${action}" aria-label="${actionText}" title="${actionText}" aria-pressed="${allVisible ? 'true' : 'false'}"${enabled ? '' : ' disabled'}>
            ${categoryBulbIconMarkup(allVisible)}
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
    buildPageGroupMarkup,
    buildCategoryHeaderMarkup,
    buildCategoryVisibilityToolbarMarkup,
  };
})();
