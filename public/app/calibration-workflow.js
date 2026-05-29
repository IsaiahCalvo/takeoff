(function () {
  function initialModalState(unit) {
    return {
      value: '',
      unit,
      scope: 'this',
      range: '',
      rangeDisplay: 'none',
    };
  }

  function rangeDisplayForScope(scope) {
    return scope === 'custom' ? 'flex' : 'none';
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

  window.TakeoffCalibrationWorkflow = {
    initialModalState,
    rangeDisplayForScope,
    sanitizeCalibrationValueInput,
    calibrationValueNumber,
    isPositiveCalibrationValue,
    resolveTargetPages,
  };
})();
