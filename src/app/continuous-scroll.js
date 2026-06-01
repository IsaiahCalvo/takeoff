(function () {
  function pagesList(pages) {
    const list = (pages || []).filter(page => Number.isInteger(page));
    if (list.length === 0) return '';
    if (list.length === 1) return `page ${list[0]}`;
    if (list.length === 2) return `pages ${list[0]} and ${list[1]}`;
    return `pages ${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
  }

  function compactPageRanges(pages) {
    const list = [...new Set((pages || []).filter(page => Number.isInteger(page)))].sort((a, b) => a - b);
    const ranges = [];
    for (let index = 0; index < list.length; index += 1) {
      const start = list[index];
      let end = start;
      while (list[index + 1] === end + 1) {
        index += 1;
        end = list[index];
      }
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
    }
    return ranges.join(',');
  }

  function groupPreferenceKey(eligibility) {
    const pages = (eligibility?.pages || []).filter(page => Number.isInteger(page));
    return eligibility?.eligible && pages.length > 0 ? pages.join(',') : '';
  }

  function preferredGroupMode(preferences, eligibility) {
    const key = groupPreferenceKey(eligibility);
    if (!key || !preferences || !Object.prototype.hasOwnProperty.call(preferences, key)) return null;
    return !!preferences[key];
  }

  function recordGroupPreference(preferences, eligibility, enabled) {
    const key = groupPreferenceKey(eligibility);
    if (!key || !preferences) return '';
    preferences[key] = !!enabled;
    return key;
  }

  function unavailableReason(eligibility) {
    const reason = eligibility?.reason || '';
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
    const enabledTitle = active ? 'Turn continuous scroll off' : 'Turn continuous scroll on';
    const title = enabled
      ? enabledTitle
      : unavailableReason(eligibility);

    return {
      visible,
      enabled,
      active,
      title,
      ariaLabel: enabled ? enabledTitle : title,
      ariaPressed: active ? 'true' : 'false',
    };
  }

  window.TakeoffContinuousScroll = {
    compactPageRanges,
    groupPreferenceKey,
    preferredGroupMode,
    recordGroupPreference,
    controlModel,
    unavailableReason,
    exitReason,
    applyEligibilityExit,
  };
})();
