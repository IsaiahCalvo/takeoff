(function () {
  const SAME_SCALE_RELATIVE_TOLERANCE = 0.001;

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
    return window.TakeoffDecimalInput.sanitizePositiveDecimalInput(input);
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

  function pageRangeText(pages) {
    const sorted = [...new Set(pages || [])]
      .map(page => Number(page))
      .filter(page => Number.isInteger(page))
      .sort((a, b) => a - b);
    const parts = [];
    for (let index = 0; index < sorted.length; index += 1) {
      const start = sorted[index];
      let end = start;
      while (sorted[index + 1] === end + 1) {
        end = sorted[index + 1];
        index += 1;
      }
      parts.push(start === end ? String(start) : `${start}-${end}`);
    }
    return parts.join(',');
  }

  function pageRangeLabel(pages) {
    const range = pageRangeText(pages);
    return `${pages && pages.length === 1 ? 'Page' : 'Pages'} ${range}`;
  }

  function sameScaleTolerance(left, right) {
    return Math.max(Math.abs(left), Math.abs(right), Number.EPSILON) * SAME_SCALE_RELATIVE_TOLERANCE;
  }

  function isSameCalibrationScale(left, right) {
    return Number.isFinite(left)
      && Number.isFinite(right)
      && Math.abs(left - right) <= sameScaleTolerance(left, right);
  }

  function calibrationSourceOptions({ pageScales, currentPage, unit, unitToInch } = {}) {
    const options = [{
      value: 'new',
      page: null,
      pages: [],
      pxPerInch: null,
      label: 'New calibration',
      pageLabel: 'New calibration',
      scaleLabel: '',
      pageCountLabel: '',
      helper: '',
    }];

    const pages = Object.keys(pageScales || {})
      .map(page => Number(page))
      .filter(page => Number.isInteger(page) && page !== currentPage)
      .sort((a, b) => a - b);

    for (const page of pages) {
      const pxPerInch = pageScales[page];
      if (!Number.isFinite(pxPerInch) || pxPerInch <= 0) continue;
      let group = options.find(option => option.value !== 'new' && isSameCalibrationScale(option.pxPerInch, pxPerInch));
      if (!group) {
        group = {
          value: `scale:${pxPerInch}`,
          page,
          pages: [],
          pxPerInch,
          label: '',
          pageLabel: '',
          scaleLabel: '',
          pageCountLabel: '',
          helper: '',
        };
        options.push(group);
      }
      group.pages.push(page);
    }

    for (const option of options) {
      if (option.value === 'new') continue;
      const summary = scaleSummary(option.pxPerInch, unit, unitToInch);
      option.page = option.pages[0] || null;
      option.pageLabel = pageRangeLabel(option.pages);
      option.scaleLabel = summary;
      option.pageCountLabel = `${option.pages.length} ${option.pages.length === 1 ? 'page' : 'pages'}`;
      option.label = `${option.pageLabel} (${summary})`;
      option.helper = option.pages.length === 1
        ? 'Uses the scale from this page.'
        : 'Uses the scale from these pages.';
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
    pageRangeText,
    pageRangeLabel,
    calibrationSourceOptions,
  };
})();
