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

  function parsePageRange(input, max) {
    const set = new Set();
    for (const part of String(input || '').split(',')) {
      const s = part.trim();
      if (!s) continue;
      if (s.includes('-')) {
        const [a, b] = s.split('-').map(n => parseInt(n.trim(), 10));
        if (Number.isFinite(a) && Number.isFinite(b)) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (i >= 1 && i <= max) set.add(i);
          }
        }
      } else {
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n >= 1 && n <= max) set.add(n);
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  function computePxPerInch(points, realLength, unit, distancePx) {
    const value = Number(realLength);
    const unitFactor = UNIT_TO_INCH[unit];
    if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(value) || value <= 0 || !unitFactor) {
      return null;
    }
    const px = distancePx(points[0], points[1]);
    const inches = value * unitFactor;
    return px / inches;
  }

  function applyScaleToPages({ measurements, pageScales, pages, pxPerInch, measureLengthPx }) {
    for (const page of pages || []) {
      pageScales[page] = pxPerInch;
      recomputeLengthsForPage(measurements, pageScales, page, measureLengthPx);
    }
  }

  function clearPageScale({ measurements, pageScales, page }) {
    delete pageScales[page];
    for (const measurement of measurements || []) {
      if (measurement.page === page) measurement.lengthInches = null;
    }
  }

  function recomputeLengthsForPage(measurements, pageScales, page, measureLengthPx) {
    const scale = pageScales[page] || null;
    for (const measurement of measurements || []) {
      if (measurement.page !== page) continue;
      measurement.lengthPx = measureLengthPx(measurement);
      measurement.lengthInches = scale ? (measurement.lengthPx / scale) : null;
    }
  }

  window.TakeoffCalibrationUtils = {
    summarizeMeasurements,
    formatScaleStatus,
    parsePageRange,
    computePxPerInch,
    applyScaleToPages,
    clearPageScale,
    recomputeLengthsForPage,
  };
})();
