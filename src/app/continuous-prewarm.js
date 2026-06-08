(function () {
  function createContinuousPrewarmController({
    canPrewarm,
    groupPages,
    cachedMatches,
    samePageNumbers,
    prewarm,
    onReady = null,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = id => clearTimeout(id),
  } = {}) {
    let key = 0;
    let timer = null;
    let promise = null;
    let pendingPages = [];

    function pagesMatch(pages) {
      return pendingPages.length > 0 && samePageNumbers?.(pendingPages, pages);
    }

    function clearPendingTimer() {
      if (!timer) return;
      clearTimer(timer);
      timer = null;
    }

    function invalidate() {
      key += 1;
      clearPendingTimer();
      promise = null;
      pendingPages = [];
    }

    function startPrewarm(runKey, pages, options = {}) {
      const runPromise = Promise.resolve(prewarm?.(pages, {
        ...options,
        isCurrent: () => runKey === key,
      })).then(async result => {
        if (runKey === key && result && onReady) {
          if (promise === runPromise) promise = null;
          await onReady(pages, options);
        }
        return result;
      }).finally(() => {
        if (runKey === key && promise === runPromise) promise = null;
      });
      promise = runPromise;
      return promise;
    }

    function schedule(eligibility) {
      const pages = groupPages?.(eligibility) || [];
      if (!canPrewarm?.(eligibility) || !eligibility?.eligible || cachedMatches?.(pages) || promise || timer) return false;
      const runKey = key;
      pendingPages = pages;
      timer = setTimer(() => {
        timer = null;
        if (runKey !== key) return;
        return startPrewarm(runKey, pages, { allowContinuousMode: false });
      }, 0);
      return true;
    }

    async function activatePending(pages) {
      if (!pagesMatch(pages)) return !!cachedMatches?.(pages);
      const runKey = key;
      const runPages = pendingPages;
      if (timer) {
        clearPendingTimer();
        startPrewarm(runKey, runPages, { allowContinuousMode: true });
      }
      if (promise) await promise;
      return !!cachedMatches?.(pages);
    }

    return {
      invalidate,
      schedule,
      activatePending,
    };
  }

  window.TakeoffContinuousPrewarm = {
    createContinuousPrewarmController,
  };
})();
