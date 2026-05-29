(function () {
  function currentPage(state) {
    return state.pdf ? state.pdfPage : 1;
  }

  function totalPages(state) {
    return state.pdf ? state.pdfPages : 1;
  }

  function documentPageCount(state) {
    return state.pdf ? state.pdfPages : (state.baseW ? 1 : 0);
  }

  function measurementsForCurrentPage(state, measurements) {
    const page = currentPage(state);
    return (measurements || []).filter(measurement => measurement.page === page);
  }

  window.TakeoffPageState = {
    currentPage,
    totalPages,
    documentPageCount,
    measurementsForCurrentPage,
  };
})();
