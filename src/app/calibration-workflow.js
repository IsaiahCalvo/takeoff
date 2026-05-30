(function () {
  function initialModalState(unit) {
    return {
      value: '',
      unit,
      scope: 'this',
      range: '',
    };
  }

  function scopeLabel(scope) {
    if (scope === 'all') return 'Apply to all pages';
    if (scope === 'custom') return 'Apply to a selected group of pages';
    return 'Apply to the current page';
  }

  function sanitizePageRangeInput(input) {
    return String(input || '').replace(/[^0-9,\-\s]/g, '');
  }

  function sanitizeCalibrationValueInput(input) {
    let value = String(input || '').replace(/[^0-9.]/g, '');
    const dotIndex = value.indexOf('.');
    if (dotIndex !== -1) {
      value = value.slice(0, dotIndex + 1) + value.slice(dotIndex + 1).replace(/\./g, '');
    }
    if (/^0+$/.test(value)) value = '';
    return value;
  }

  function calibrationValueNumber(value) {
    return parseFloat(value);
  }

  function isPositiveCalibrationValue(value) {
    const parsed = calibrationValueNumber(value);
    return Number.isFinite(parsed) && parsed > 0;
  }

  function resolveTargetPages({ scope, currentPage, totalPages, rangeText, parsePageRange } = {}) {
    if (scope === 'all') {
      const pages = [];
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return { pages, error: null };
    }
    if (scope === 'custom') {
      const pages = parsePageRange(rangeText, totalPages);
      return pages.length ? { pages, error: null } : { pages: [], error: 'empty-custom-range' };
    }
    return { pages: [currentPage], error: null };
  }

  function scaleSummary(pxPerInch, unit, unitToInch) {
    const unitLabel = unit || 'ft';
    const inchFactor = typeof unitToInch === 'function' ? unitToInch(unitLabel) : 1;
    return `1 ${unitLabel} = ${(pxPerInch * inchFactor).toFixed(2)} px`;
  }

  function calibrationSourceOptions({ pageScales, currentPage, unit, unitToInch } = {}) {
    const options = [{
      value: 'new',
      page: null,
      pxPerInch: null,
      label: 'New calibration',
      helper: '',
    }];

    const pages = Object.keys(pageScales || {})
      .map(page => Number(page))
      .filter(page => Number.isInteger(page) && page !== currentPage)
      .sort((a, b) => a - b);

    for (const page of pages) {
      const pxPerInch = pageScales[page];
      if (!Number.isFinite(pxPerInch) || pxPerInch <= 0) continue;
      const summary = scaleSummary(pxPerInch, unit, unitToInch);
      options.push({
        value: `page:${page}`,
        page,
        pxPerInch,
        label: `Page ${page} (${summary})`,
        helper: `Uses Page ${page}'s scale: ${summary}.`,
      });
    }

    return options;
  }

  window.TakeoffCalibrationWorkflow = {
    initialModalState,
    scopeLabel,
    sanitizePageRangeInput,
    sanitizeCalibrationValueInput,
    calibrationValueNumber,
    isPositiveCalibrationValue,
    resolveTargetPages,
    calibrationSourceOptions,
  };
})();
