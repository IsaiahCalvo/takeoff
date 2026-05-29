(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };

  function inchesToUnit(inches, unit) {
    return inches / (UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft);
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
      page: summarizeList(all.filter(measurement => measurement.page === currentPage)),
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
    const pages = (measurements || []).map(measurement => measurement.page || 1);
    return Math.max(1, ...pages);
  }

  function pageGroups(measurements, pageScales, unit, collapsedPageGroups = {}) {
    const byPage = new Map();
    for (const measurement of measurements || []) {
      const page = measurement.page || 1;
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page).push(measurement);
    }
    return [...byPage.keys()].sort((a, b) => a - b).map(page => {
      const list = byPage.get(page);
      const pageSummary = summarizeMeasurements(measurements, page).page;
      return {
        page,
        measurements: list,
        measurementCount: list.length,
        collapsed: collapsedPageGroups[page] !== false,
        hasScale: !!(pageScales || {})[page],
        pageTotalText: pageSummary.totalDisplayAvailable
          ? `${inchesToUnit(pageSummary.totalInches, unit).toFixed(2)} ${UNIT_LABEL[unit]}`
          : 'no measured total',
        excludedText: pageSummary.unscaledCount ? ` · ${pageSummary.unscaledCount} unscaled excluded` : '',
      };
    });
  }

  function buildSidebarModel({ measurements, currentPage, sidebarTab, pageScales, collapsedPageGroups, pageCount, unit }) {
    const all = measurements || [];
    const resolvedPageCount = resolvePageCount(all, pageCount);
    const isSinglePage = resolvedPageCount <= 1;
    const effectiveSidebarTab = isSinglePage ? 'page' : (sidebarTab === 'all' ? 'all' : 'page');
    const measurementsForTab = all.filter(measurement => measurement.page === currentPage);
    const summary = summarizeMeasurements(all, currentPage);
    const activeSummary = effectiveSidebarTab === 'page' ? summary.page : summary.all;
    return {
      measurementsForTab,
      pageSummary: summary.page,
      allSummary: summary.all,
      activeSummary,
      totalLenText: formatTotal(activeSummary, unit),
      runCountText: formatRunCount(activeSummary),
      totalUnitText: UNIT_LABEL[unit],
      effectiveSidebarTab,
      isSinglePage,
      showScopeTabs: !isSinglePage,
      totalHeadingText: isSinglePage ? 'Total' : (effectiveSidebarTab === 'page' ? 'This Page Total' : 'Grand Total'),
      pageGroups: effectiveSidebarTab === 'all' ? pageGroups(all, pageScales, unit, collapsedPageGroups) : [],
    };
  }

  function shouldSelectMeasurementFromSidebarClick(target) {
    if (!target) return true;
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
