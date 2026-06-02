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
      measurements: (group.runs || []).map(run => (
        lookup.get(run.measurementId) || lookup.get(`index:${run.sourceIndex}`)
      )).filter(Boolean),
    };
  }

  function categorySectionViewModel(category, pathGroupsByKey, unit) {
    const pathGroups = (category.pathKeys || []).map(key => pathGroupsByKey.get(key)).filter(Boolean);
    const pathCount = pathGroups.length || Number(category.pathKeys?.length || 0);
    const hiddenRunCount = Number(category.hiddenRunCount || 0);
    const visibleRunCount = Number(category.visibleRunCount || 0);
    return {
      key: category.key,
      name: category.displayName || category.name || 'Uncategorized',
      categoryVisible: category.categoryVisible !== false,
      isVisible: category.isVisible !== false,
      visibleRunCount,
      hiddenRunCount,
      hiddenText: formatHiddenRunCount(category),
      pathGroups,
      pathCount,
      runCount: category.runCount || 0,
      summaryText: `${pathCount} path${pathCount === 1 ? '' : 's'} · ${formatPathRunCount(category)}`,
      totalText: formatPathTotal(category, unit),
      totalUnitText: UNIT_LABEL[unit] || unit,
    };
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

  function buildSidebarModel({ measurements, currentPage, sidebarTab, pageCount, unit, pathCategoryVisibility }) {
    const all = measurements || [];
    const resolvedPageCount = resolvePageCount(all, pageCount);
    const isSinglePage = resolvedPageCount <= 1;
    const effectiveSidebarTab = isSinglePage ? 'page' : normalizeSidebarTab(sidebarTab);
    const measurementsForTab = all.filter(measurement => measurementPage(measurement) === currentPage);
    const summary = summarizeMeasurements(all, currentPage);
    const activeSummary = effectiveSidebarTab === 'page' ? summary.page : summary.all;
    const {
      aggregation: pathRunAggregation,
      pathGroups,
      categorySections,
    } = buildPathGroups(all, currentPage, effectiveSidebarTab, unit, pathCategoryVisibility);
    return {
      measurementsForTab,
      pageSummary: summary.page,
      allSummary: summary.all,
      activeSummary,
      totalLenText: formatPathTotal(pathRunAggregation, unit),
      runCountText: formatAggregationRunCount(pathRunAggregation),
      totalUnitText: UNIT_LABEL[unit],
      effectiveSidebarTab,
      isSinglePage,
      showScopeTabs: !isSinglePage,
      totalHeadingText: isSinglePage ? 'Total' : ({
        page: 'This Page Total',
        categories: 'Categories Total',
        all: 'Grand Total',
      }[effectiveSidebarTab]),
      pathRunAggregation,
      pathGroups,
      categorySections: effectiveSidebarTab === 'categories' ? categorySections : [],
      categoryVisibilityControls: categoryVisibilityControls(categorySections),
    };
  }

  function shouldSelectMeasurementFromSidebarClick(target) {
    if (!target) return true;
    if (target.closest?.('.path-group-settings') || target.classList?.contains('path-group-settings')) return false;
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
