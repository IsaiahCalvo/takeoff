(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };
  const SAME_SCALE_RELATIVE_TOLERANCE = 0.001;

  function isScaled(measurement) {
    return measurement && measurement.lengthInches != null && Number.isFinite(measurement.lengthInches);
  }

  function measurementPage(measurement) {
    const page = Number(measurement?.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
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
    const page = all.filter(measurement => measurementPage(measurement) === currentPage);
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
        const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
        if (!range) continue;
        const a = Number(range[1]);
        const b = Number(range[2]);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (i >= 1 && i <= max) set.add(i);
          }
        }
      } else {
        if (!/^\d+$/.test(s)) continue;
        const n = Number(s);
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
    if (!Number.isFinite(px) || px <= 0) return null;
    const inches = value * unitFactor;
    return px / inches;
  }

  function sameScaleTolerance(a, b) {
    return Math.max(Math.abs(a), Math.abs(b), Number.EPSILON) * SAME_SCALE_RELATIVE_TOLERANCE;
  }

  function sameScalePdfEligibility(state) {
    const docState = state || {};
    const pageCount = Number(docState.pdfPages);
    const pageScales = docState.pageScales || {};
    const result = {
      eligible: false,
      reason: '',
      missingPages: [],
      mismatchedPages: [],
      canonicalScale: null,
    };

    if (!docState.pdf) {
      result.reason = 'not_pdf';
      return result;
    }

    if (!Number.isInteger(pageCount) || pageCount <= 1) {
      result.reason = 'single_page_pdf';
      return result;
    }

    for (let page = 1; page <= pageCount; page += 1) {
      const scale = pageScales[page];
      if (!Number.isFinite(scale) || scale <= 0) {
        result.missingPages.push(page);
      }
    }

    if (result.missingPages.length > 0) {
      result.reason = 'missing_page_calibration';
      return result;
    }

    result.canonicalScale = pageScales[1];
    for (let page = 2; page <= pageCount; page += 1) {
      const scale = pageScales[page];
      if (Math.abs(scale - result.canonicalScale) > sameScaleTolerance(scale, result.canonicalScale)) {
        result.mismatchedPages.push(page);
      }
    }

    if (result.mismatchedPages.length > 0) {
      result.reason = 'mismatched_page_scale';
      return result;
    }

    result.eligible = true;
    result.reason = 'eligible';
    return result;
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
      if (measurementPage(measurement) === page) measurement.lengthInches = null;
    }
  }

  function recomputeLengthsForPage(measurements, pageScales, page, measureLengthPx) {
    const scale = pageScales[page] || null;
    for (const measurement of measurements || []) {
      if (measurementPage(measurement) !== page) continue;
      measurement.lengthPx = measureLengthPx(measurement);
      measurement.lengthInches = scale ? (measurement.lengthPx / scale) : null;
    }
  }

  window.TakeoffCalibrationUtils = {
    summarizeMeasurements,
    formatScaleStatus,
    measurementPage,
    parsePageRange,
    computePxPerInch,
    sameScalePdfEligibility,
    applyScaleToPages,
    clearPageScale,
    recomputeLengthsForPage,
  };
})();
