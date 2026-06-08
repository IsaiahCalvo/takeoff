(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };
  const SIDEBAR_TABS = new Set(['page', 'categories', 'all']);

  function inchesToUnit(inches, unit) {
    return inches / (UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft);
  }

  function cleanString(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function measurementPage(measurement) {
    if (window.TakeoffCalibrationUtils?.measurementPage) return window.TakeoffCalibrationUtils.measurementPage(measurement);
    const page = Number(measurement?.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function summarizeList(measurements) {
    let totalInches = 0;
    let scaledCount = 0;
    let unscaledCount = 0;
    for (const measurement of measurements || []) {
      if (measurement.lengthInches != null && Number.isFinite(measurement.lengthInches)) {
        totalInches += measurement.lengthInches;
        scaledCount += 1;
      } else {
        unscaledCount += 1;
      }
    }
    return {
      count: (measurements || []).length,
      totalInches,
      scaledCount,
      unscaledCount,
      totalDisplayAvailable: scaledCount > 0 || unscaledCount === 0,
    };
  }

  function summarizeMeasurements(measurements, currentPage) {
    if (window.TakeoffCalibrationUtils?.summarizeMeasurements) {
      return window.TakeoffCalibrationUtils.summarizeMeasurements(measurements, currentPage);
    }
    const all = measurements || [];
    return {
      page: summarizeList(all.filter(measurement => measurementPage(measurement) === currentPage)),
      all: summarizeList(all),
    };
  }

  function formatTotal(summary, unit) {
    return summary.totalDisplayAvailable ? inchesToUnit(summary.totalInches, unit).toFixed(2) : '—';
  }

  function formatRunCount(summary) {
    return summary.unscaledCount
      ? `${summary.count} runs · ${summary.unscaledCount} unscaled excluded`
      : `${summary.count} runs`;
  }

  function resolvePageCount(measurements, pageCount) {
    const numericPageCount = Number(pageCount);
    if (Number.isFinite(numericPageCount) && numericPageCount > 0) return Math.floor(numericPageCount);
    const pages = (measurements || []).map(measurementPage);
    return Math.max(1, ...pages);
  }

  function normalizeSidebarTab(sidebarTab) {
    return SIDEBAR_TABS.has(sidebarTab) ? sidebarTab : 'page';
  }

  function pathAggregationForTab(measurements, currentPage, effectiveSidebarTab, unit, pathCategoryVisibility) {
    const aggregation = window.TakeoffPathAggregation;
    if (!aggregation?.buildPathRunGroups) {
      throw new Error('TakeoffPathAggregation.buildPathRunGroups is required for sidebar Path groups.');
    }
    const options = { units: [unit], pathCategoryVisibility, totalsScope: 'visible' };
    if (effectiveSidebarTab === 'page') {
      options.scope = 'page';
      options.page = currentPage;
    }
    return aggregation.buildPathRunGroups(measurements, options);
  }

  function measurementLookup(measurements) {
    const byId = new Map();
    (measurements || []).forEach((measurement, index) => {
      if (measurement?.id != null) byId.set(measurement.id, measurement);
      byId.set(`index:${index}`, measurement);
    });
    return byId;
  }

  function formatPathTotal(group, unit) {
    const value = Number(group?.totalsByUnit?.[unit] || 0);
    if (group?.scaledRunCount > 0 || group?.unscaledRunCount === 0) return value.toFixed(2);
    return '—';
  }

  function formatTotalsByUnit(totalsByUnit, unit, source = {}) {
    const value = Number(totalsByUnit?.[unit] || 0);
    if (source?.scaledRunCount > 0 || source?.unscaledRunCount === 0) return value.toFixed(2);
    return '—';
  }

  function formatAverageByCount(totalsByUnit, unit, count, label = 'Avg/run') {
    const scaledCount = Number(count || 0);
    if (!Number.isFinite(scaledCount) || scaledCount <= 0) return `${label} —`;
    const total = Number(totalsByUnit?.[unit] || 0);
    const unitText = UNIT_LABEL[unit] || unit;
    return `${label} ${(total / scaledCount).toFixed(2)} ${unitText}`;
  }

  function visibleScaledCount(source) {
    return Number(source?.visibleScaledRunCount || 0);
  }

  function formatAggregationAverage(aggregation, unit, effectiveSidebarTab, resolvedPageCount) {
    if (effectiveSidebarTab === 'all') {
      if (visibleScaledCount(aggregation) <= 0) return 'Avg/page —';
      const pageCount = Math.max(1, Number(resolvedPageCount || 1));
      return formatAverageByCount(aggregation?.totalsByUnit, unit, pageCount, 'Avg/page');
    }
    return formatAverageByCount(aggregation?.totalsByUnit, unit, visibleScaledCount(aggregation));
  }

  function addTotals(target, totals) {
    for (const [unit, value] of Object.entries(totals || {})) {
      target[unit] = (target[unit] || 0) + value;
    }
  }

  function formatPathRunCount(group) {
    const count = Number(group?.runCount || 0);
    return `${count} run${count === 1 ? '' : 's'}`;
  }

  function formatHiddenRunCount(group) {
    const count = Number(group?.hiddenRunCount || 0);
    return count ? `${count} hidden` : '';
  }

  function formatAggregationRunCount(aggregation) {
    const countText = formatPathRunCount(aggregation);
    const unscaledText = formatUnscaledCount(aggregation);
    return unscaledText ? `${countText} · ${unscaledText}` : countText;
  }

  function formatUnscaledCount(group) {
    const count = Number(group?.unscaledRunCount || 0);
    return count ? `${count} unscaled excluded` : '';
  }

  function categorySubtitle(group) {
    if (group?.hasMixedCategories) return 'Mixed categories';
    return cleanString(group?.categoryName) || '';
  }

  function pageCoverageText(group) {
    const label = cleanString(group?.pageCoverage?.label);
    return label ? `P ${label}` : 'No page';
  }

  function pathGroupViewModel(group, measurements, unit, lookup) {
    const measurementRows = (group.runs || []).map(run => measurementRowViewModel(run, lookup)).filter(Boolean);
    return {
      id: group.id,
      key: group.key,
      kind: group.kind,
      isLegacy: !!group.isLegacy,
      pathTemplateId: group.pathTemplateId || null,
      pathId: group.pathId || null,
      pathName: group.pathName || null,
      pathStyle: group.pathStyle || null,
      categoryId: group.hasMixedCategories ? null : (group.categoryId || null),
      pathCategoryVisibilityKey: group.pathCategoryVisibilityKey,
      categoryKey: group.pathCategoryVisibilityKey || group.categoryKey || 'uncategorized',
      categoryName: group.hasMixedCategories ? 'Mixed categories' : (group.categoryName || 'Uncategorized'),
      hasMixedCategories: !!group.hasMixedCategories,
      categoryVisible: group.categoryVisible !== false,
      isVisible: group.isVisible !== false,
      visibleRunCount: group.visibleRunCount || 0,
      hiddenRunCount: group.hiddenRunCount || 0,
      hiddenText: formatHiddenRunCount(group),
      displayName: group.displayName || 'Path',
      categorySubtitle: categorySubtitle(group),
      color: group.color || '#7d8a91',
      runCount: group.runCount,
      runCountText: formatPathRunCount(group),
      unscaledText: formatUnscaledCount(group),
      totalText: formatPathTotal(group, unit),
      totalUnitText: UNIT_LABEL[unit] || unit,
      pageCoverageText: pageCoverageText(group),
      settingsAvailable: !group.isLegacy && !!group.pathTemplateId && !!group.pathId,
      settingsLabel: `Path Settings for ${group.displayName || 'Path'}`,
      measurements: measurementRows.map(row => row.measurement),
      measurementRows,
    };
  }

  function measurementRowViewModel(run, lookup) {
    const measurement = lookup.get(run.measurementId) || lookup.get(`index:${run.sourceIndex}`);
    if (!measurement) return null;
    return {
      measurement,
      pathCategorySubtitle: cleanString(run.categoryName) || cleanString(run.pathName) || '',
      pathVisibilityHidden: run.isVisible === false,
    };
  }

  function measurementRowsBySourceIndex(aggregation, measurements) {
    const lookup = measurementLookup(measurements);
    const rows = new Map();
    for (const group of aggregation?.groups || []) {
      for (const run of group.runs || []) {
        const row = measurementRowViewModel(run, lookup);
        if (row) rows.set(run.sourceIndex, row);
      }
    }
    return rows;
  }

  function measurementRowsForPage(aggregation, measurements, currentPage) {
    const rowsByIndex = measurementRowsBySourceIndex(aggregation, measurements);
    const rows = [];
    (measurements || []).forEach((measurement, index) => {
      if (measurementPage(measurement) !== currentPage) return;
      rows.push(rowsByIndex.get(index) || {
        measurement,
        pathCategoryVisibilityKey: null,
        pathCategoryVisible: true,
        pathCategoryHidden: false,
      });
    });
    return rows;
  }

  function createPageSection(page, collapsed) {
    return {
      page,
      title: `Page ${page}`,
      runCount: 0,
      scaledRunCount: 0,
      unscaledRunCount: 0,
      visibleRunCount: 0,
      hiddenRunCount: 0,
      visibleScaledRunCount: 0,
      visibleUnscaledRunCount: 0,
      allTotalsByUnit: {},
      visibleTotalsByUnit: {},
      hiddenTotalsByUnit: {},
      measurements: [],
      measurementRows: [],
      collapsed: !!collapsed,
      runsId: `page-group-runs-${page}`,
    };
  }

  function finalizePageSection(section, unit) {
    const visibleSource = {
      scaledRunCount: section.visibleScaledRunCount,
      unscaledRunCount: section.visibleUnscaledRunCount,
    };
    return {
      ...section,
      runCountText: formatPathRunCount(section),
      unscaledText: formatUnscaledCount(section),
      hiddenText: formatHiddenRunCount(section),
      totalText: formatTotalsByUnit(section.visibleTotalsByUnit, unit, visibleSource),
      totalUnitText: UNIT_LABEL[unit] || unit,
      averageText: formatAverageByCount(section.visibleTotalsByUnit, unit, section.visibleScaledRunCount),
    };
  }

  function pageSectionViewModels(aggregation, measurements, unit, collapsedPageGroups = {}) {
    const lookup = measurementLookup(measurements);
    const sections = new Map();
    const runs = [];
    for (const group of aggregation?.groups || []) runs.push(...(group.runs || []));
    runs.sort((a, b) => (a.page || 1) - (b.page || 1) || (a.sourceIndex || 0) - (b.sourceIndex || 0));
    for (const run of runs) {
      const page = measurementPage(lookup.get(run.measurementId) || lookup.get(`index:${run.sourceIndex}`) || run);
      if (!sections.has(page)) sections.set(page, createPageSection(page, collapsedPageGroups?.[page]));
      const section = sections.get(page);
      const measurement = lookup.get(run.measurementId) || lookup.get(`index:${run.sourceIndex}`);
      section.runCount += 1;
      if (run.scaled) section.scaledRunCount += 1;
      else section.unscaledRunCount += 1;
      if (run.isVisible) {
        section.visibleRunCount += 1;
        if (run.scaled) section.visibleScaledRunCount += 1;
        else section.visibleUnscaledRunCount += 1;
        addTotals(section.visibleTotalsByUnit, run.totalsByUnit);
      } else {
        section.hiddenRunCount += 1;
        addTotals(section.hiddenTotalsByUnit, run.totalsByUnit);
      }
      addTotals(section.allTotalsByUnit, run.totalsByUnit);
      if (measurement) {
        const row = measurementRowViewModel(run, lookup);
        section.measurements.push(measurement);
        if (row) section.measurementRows.push(row);
      }
    }
    return [...sections.values()].map(section => finalizePageSection(section, unit));
  }

  function categorySectionViewModel(category, pathGroupsByKey, unit) {
    const pathGroups = (category.pathKeys || []).map(key => pathGroupsByKey.get(key)).filter(Boolean);
    const pathCount = pathGroups.length || Number(category.pathKeys?.length || 0);
    const hiddenRunCount = Number(category.hiddenRunCount || 0);
    const visibleRunCount = Number(category.visibleRunCount || 0);
    const templateBacked = pathGroups.some(group => !group.isLegacy && group.pathTemplateId && group.pathId);
    const firstColorGroup = pathGroups.find(group => group.color);
    const pathStyle = pathGroups.length === 1 ? (pathGroups[0].pathStyle || null) : null;
    return {
      key: category.key,
      name: categorySectionName(category),
      categoryVisible: category.categoryVisible !== false,
      isVisible: category.isVisible !== false,
      color: firstColorGroup?.color || '#7d8a91',
      pathStyle,
      iconKind: templateBacked ? 'template' : 'manual',
      visibleRunCount,
      hiddenRunCount,
      hiddenText: formatHiddenRunCount(category),
      pathGroups: [],
      pathCount,
      runCount: category.runCount || 0,
      summaryText: formatPathRunCount(category),
      averageText: formatAverageByCount(category.totalsByUnit, unit, visibleScaledCount(category)),
      totalText: formatPathTotal(category, unit),
      totalUnitText: UNIT_LABEL[unit] || unit,
    };
  }

  function categorySectionName(category) {
    const displayName = cleanString(category?.displayName);
    if (displayName && displayName !== 'Uncategorized') return displayName;
    return cleanString(category?.name)
      || cleanString(category?.categoryName)
      || cleanString(category?.id)
      || cleanString(category?.categoryId)
      || displayName
      || 'Uncategorized';
  }

  function buildPathGroups(measurements, currentPage, effectiveSidebarTab, unit, pathCategoryVisibility) {
    const aggregation = pathAggregationForTab(measurements, currentPage, effectiveSidebarTab, unit, pathCategoryVisibility);
    const lookup = measurementLookup(measurements);
    const pathGroups = (aggregation.groups || []).map(group => pathGroupViewModel(group, measurements, unit, lookup));
    const pathGroupsByKey = new Map(pathGroups.map(group => [group.key, group]));
    return {
      aggregation,
      pathGroups,
      categorySections: (aggregation.categories || []).map(category => categorySectionViewModel(category, pathGroupsByKey, unit)),
    };
  }

  function categoryVisibilityControls(categorySections) {
    const totalCount = categorySections.length;
    const hiddenCount = categorySections.filter(section => section.categoryVisible === false).length;
    return {
      totalCount,
      hiddenCount,
      visibleCount: totalCount - hiddenCount,
      canShowAll: hiddenCount > 0,
      canHideAll: hiddenCount < totalCount,
    };
  }

  function buildSidebarModel({ measurements, currentPage, sidebarTab, pageCount, unit, pathCategoryVisibility, collapsedPageGroups = {} }) {
    const all = measurements || [];
    const resolvedPageCount = resolvePageCount(all, pageCount);
    const isSinglePage = resolvedPageCount <= 1;
    const availableScopeTabs = isSinglePage ? ['page', 'categories'] : ['page', 'categories', 'all'];
    const requestedSidebarTab = normalizeSidebarTab(sidebarTab);
    const effectiveSidebarTab = availableScopeTabs.includes(requestedSidebarTab) ? requestedSidebarTab : 'page';
    const summary = summarizeMeasurements(all, currentPage);
    const activeSummary = effectiveSidebarTab === 'page' ? summary.page : summary.all;
    const {
      aggregation: pathRunAggregation,
      pathGroups,
      categorySections,
    } = buildPathGroups(all, currentPage, effectiveSidebarTab, unit, pathCategoryVisibility);
    const measurementRowsForTab = measurementRowsForPage(pathRunAggregation, all, currentPage);
    const measurementsForTab = measurementRowsForTab.map(row => row.measurement);
    const hiddenCount = Number(pathRunAggregation.hiddenRunCount || 0);
    const hasHidden = hiddenCount > 0;
    const allTotalText = formatTotalsByUnit(pathRunAggregation.allTotalsByUnit, unit, pathRunAggregation);
    return {
      measurementsForTab,
      measurementRowsForTab,
      pageSummary: summary.page,
      allSummary: summary.all,
      activeSummary,
      totalLenText: formatPathTotal(pathRunAggregation, unit),
      runCountText: formatAggregationRunCount(pathRunAggregation),
      averageText: formatAggregationAverage(pathRunAggregation, unit, effectiveSidebarTab, resolvedPageCount),
      totalUnitText: UNIT_LABEL[unit],
      effectiveSidebarTab,
      isSinglePage,
      availableScopeTabs,
      showScopeTabs: availableScopeTabs.length > 1,
      totalHeadingText: hasHidden ? 'Visible Total' : ({
        page: 'This Page Total',
        categories: 'Categories Total',
        all: 'Grand Total',
      }[effectiveSidebarTab]),
      showEntireTotal: hasHidden,
      entireTotalText: `Total: ${allTotalText} ${UNIT_LABEL[unit] || unit}`,
      pathRunAggregation,
      pathGroups,
      pageSections: effectiveSidebarTab === 'all' ? pageSectionViewModels(pathRunAggregation, all, unit, collapsedPageGroups) : [],
      categorySections: effectiveSidebarTab === 'categories' ? categorySections : [],
      categoryVisibilityControls: categoryVisibilityControls(categorySections),
    };
  }

  function shouldSelectMeasurementFromSidebarClick(target) {
    if (!target) return true;
    if (target.closest?.('[data-path-category-key]')) return false;
    if (target.closest?.('.path-group-settings') || target.classList?.contains('path-group-settings')) return false;
    if (target.closest?.('.run-details-action') || target.classList?.contains('run-details-action')) return false;
    if (target.closest?.('.del') || target.classList?.contains('del')) return false;
    if (target.tagName === 'INPUT') return target.hasAttribute?.('readonly') === true;
    return true;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  window.TakeoffSidebar = {
    buildSidebarModel,
    shouldSelectMeasurementFromSidebarClick,
    escapeHtml,
  };
})();
