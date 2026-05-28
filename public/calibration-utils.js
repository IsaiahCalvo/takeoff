(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };

  function isScaled(measurement) {
    return measurement && measurement.lengthInches != null && Number.isFinite(measurement.lengthInches);
  }

  function summarizeList(measurements) {
    let totalInches = 0;
    let scaledCount = 0;
    let unscaledCount = 0;
    for (const measurement of measurements || []) {
      if (isScaled(measurement)) {
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
      hasScaledLengths: scaledCount > 0,
      hasUnscaledLengths: unscaledCount > 0,
      totalDisplayAvailable: scaledCount > 0 || unscaledCount === 0,
    };
  }

  function summarizeMeasurements(measurements, currentPage) {
    const all = measurements || [];
    const page = all.filter(measurement => (measurement.page || 1) === currentPage);
    return {
      page: summarizeList(page),
      all: summarizeList(all),
    };
  }

  function formatScaleStatus(pxPerInch, unit) {
    const unitLabel = UNIT_LABEL[unit] || unit || 'ft';
    const inchFactor = UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft;
    if (!pxPerInch || !Number.isFinite(pxPerInch)) {
      return {
        kind: 'missing',
        text: 'No page scale',
        title: 'Measurements on this page will be marked unscaled until you calibrate.',
      };
    }
    return {
      kind: 'ready',
      text: `Page scale: 1 ${unitLabel} = ${(pxPerInch * inchFactor).toFixed(2)} px`,
      title: 'Current page is calibrated.',
    };
  }

  window.TakeoffCalibrationUtils = {
    summarizeMeasurements,
    formatScaleStatus,
  };
})();
