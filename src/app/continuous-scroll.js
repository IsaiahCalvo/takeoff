(function () {
  function pagesList(pages) {
    const list = (pages || []).filter(page => Number.isInteger(page));
    if (list.length === 0) return '';
    if (list.length === 1) return `page ${list[0]}`;
    if (list.length === 2) return `pages ${list[0]} and ${list[1]}`;
    return `pages ${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
  }

  function unavailableReason(eligibility) {
    const reason = eligibility?.reason || '';
    if (reason === 'missing_page_calibration') {
      const pages = pagesList(eligibility.missingPages);
      return pages
        ? `Calibrate ${pages} to use continuous scroll.`
        : 'Calibrate every PDF page to use continuous scroll.';
    }
    if (reason === 'mismatched_page_scale') {
      const pages = pagesList(eligibility.mismatchedPages);
      return pages
        ? `Match calibration on ${pages} to use continuous scroll.`
        : 'Page scales must match to use continuous scroll.';
    }
    return 'Continuous scroll needs a multi-page PDF.';
  }

  function exitReason(eligibility) {
    const reason = eligibility?.reason || '';
    if (reason === 'missing_page_calibration') {
      const pages = eligibility.missingPages || [];
      if (pages.length === 1) return `Continuous scroll turned off because page ${pages[0]} has no scale.`;
      const pageText = pagesList(pages) || 'one or more pages';
      return `Continuous scroll turned off because ${pageText} have no scale.`;
    }
    if (reason === 'mismatched_page_scale') return 'Continuous scroll turned off because page scales no longer match.';
    if (reason === 'single_page_pdf') return 'Continuous scroll turned off because this document is no longer a multi-page PDF.';
    if (reason === 'not_pdf') return 'Continuous scroll turned off because this document is not a PDF.';
    return 'Continuous scroll turned off because this PDF is no longer eligible.';
  }

  function applyEligibilityExit({ state, eligibility, page = null } = {}) {
    if (!state || eligibility?.eligible) return { exited: false, reason: '' };
    const exited = Boolean(state.continuousScrollMode || state.continuousPageLayout);
    state.continuousScrollMode = false;
    state.continuousPageLayout = null;
    if (state.pdf && Number.isInteger(page) && page >= 1 && page <= state.pdfPages) state.pdfPage = page;
    return { exited, page: state.pdfPage, reason: exitReason(eligibility) };
  }

  function controlModel({ state, eligibility } = {}) {
    const pageCount = Number(state?.pdfPages || 0);
    const visible = Boolean(state?.pdf && pageCount > 1);
    const enabled = visible && Boolean(eligibility?.eligible);
    const active = enabled && Boolean(state?.continuousScrollMode);
    const title = enabled
      ? (active ? 'Return to single-page view' : 'Use continuous scroll')
      : unavailableReason(eligibility);

    return {
      visible,
      enabled,
      active,
      title,
      ariaLabel: enabled ? (active ? 'Return to single-page view' : 'Use continuous scroll') : title,
      ariaPressed: active ? 'true' : 'false',
    };
  }

  window.TakeoffContinuousScroll = {
    controlModel,
    unavailableReason,
    exitReason,
    applyEligibilityExit,
  };
})();
