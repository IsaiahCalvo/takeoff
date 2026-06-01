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

  function measurementPage(measurement) {
    const page = Number(measurement?.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function measurementsForCurrentPage(state, measurements) {
    const page = currentPage(state);
    return (measurements || []).filter(measurement => measurementPage(measurement) === page);
  }

  window.TakeoffPageState = {
    currentPage,
    totalPages,
    documentPageCount,
    measurementPage,
    measurementsForCurrentPage,
  };
})();
