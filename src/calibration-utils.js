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

  function isValidPageScale(scale) {
    return Number.isFinite(scale) && scale > 0;
  }

  function pageScaleMatches(scale, canonicalScale) {
    return isValidPageScale(scale) && Math.abs(scale - canonicalScale) <= sameScaleTolerance(scale, canonicalScale);
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

  function sameScalePageGroupEligibility(state, page = null) {
    const docState = state || {};
    const pageCount = Number(docState.pdfPages);
    const pageScales = docState.pageScales || {};
    const result = {
      eligible: false,
      reason: '',
      missingPages: [],
      mismatchedPages: [],
      canonicalScale: null,
      pages: [],
      startPage: null,
      endPage: null,
      groupPageCount: 0,
      wholeDocument: false,
    };

    if (!docState.pdf) {
      result.reason = 'not_pdf';
      return result;
    }

    if (!Number.isInteger(pageCount) || pageCount <= 1) {
      result.reason = 'single_page_pdf';
      return result;
    }

    const requestedPage = Number(page ?? docState.pdfPage ?? 1);
    const currentPage = Number.isInteger(requestedPage)
      ? Math.min(Math.max(requestedPage, 1), pageCount)
      : 1;
    const currentScale = pageScales[currentPage];

    if (!isValidPageScale(currentScale)) {
      result.reason = 'missing_page_calibration';
      result.missingPages.push(currentPage);
      return result;
    }

    result.canonicalScale = currentScale;
    let startPage = currentPage;
    let endPage = currentPage;

    while (startPage > 1 && pageScaleMatches(pageScales[startPage - 1], currentScale)) startPage -= 1;
    while (endPage < pageCount && pageScaleMatches(pageScales[endPage + 1], currentScale)) endPage += 1;

    for (let groupPage = startPage; groupPage <= endPage; groupPage += 1) {
      result.pages.push(groupPage);
    }
    result.startPage = startPage;
    result.endPage = endPage;
    result.groupPageCount = result.pages.length;
    result.wholeDocument = startPage === 1 && endPage === pageCount;

    if (result.groupPageCount <= 1) {
      result.reason = 'single_page_scale_group';
      result.mismatchedPages.push(currentPage);
      return result;
    }

    result.eligible = true;
    result.reason = 'eligible';
    return result;
  }

  function pdfContinuousScrollEligibility(state) {
    const pageCount = Number(state?.pdfPages);
    if (!state?.pdf) return { eligible: false, reason: 'not_pdf', pages: [], startPage: null, endPage: null, groupPageCount: 0, wholeDocument: false };
    if (!Number.isInteger(pageCount) || pageCount <= 1) return { eligible: false, reason: 'single_page_pdf', pages: [], startPage: null, endPage: null, groupPageCount: 0, wholeDocument: false };
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
    return { eligible: true, reason: 'eligible', pages, startPage: 1, endPage: pageCount, groupPageCount: pageCount, wholeDocument: true };
  }

  function cloneScaleReference(reference) {
    if (!reference || typeof reference !== 'object') return null;
    const value = Number(reference.value);
    const unit = reference.unit;
    const distancePx = Number(reference.distancePx);
    if (!Number.isFinite(value) || value <= 0 || !unit || !Number.isFinite(distancePx) || distancePx <= 0) return null;
    return { value, unit, distancePx };
  }

  function applyScaleToPages({ measurements, pageScales, pageScaleReferences, pages, pxPerInch, reference, measureLengthPx }) {
    const referenceCopy = cloneScaleReference(reference);
    for (const page of pages || []) {
      pageScales[page] = pxPerInch;
      if (pageScaleReferences) {
        if (referenceCopy) pageScaleReferences[page] = { ...referenceCopy };
        else delete pageScaleReferences[page];
      }
      recomputeLengthsForPage(measurements, pageScales, page, measureLengthPx);
    }
  }

  function clearPageScale({ measurements, pageScales, pageScaleReferences, page }) {
    delete pageScales[page];
    if (pageScaleReferences) delete pageScaleReferences[page];
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
    sameScalePageGroupEligibility,
    pdfContinuousScrollEligibility,
    applyScaleToPages,
    clearPageScale,
    recomputeLengthsForPage,
  };
})();
