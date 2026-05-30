(function () {
  const renderer = window.TakeoffContinuousRenderer;

  function layout(state) {
    return state?.continuousScrollMode ? state.continuousPageLayout : null;
  }

  function isActive(state) {
    return !!layout(state);
  }

  function displayMeasurement(state, measurement) {
    const activeLayout = layout(state);
    return activeLayout ? renderer.measurementToStackMeasurement(measurement, activeLayout) : measurement;
  }

  function measurementsForView({ state, measurements, pageMeasurements }) {
    const activeLayout = layout(state);
    if (!activeLayout) return pageMeasurements(state, measurements);
    return (measurements || [])
      .map(measurement => renderer.measurementToStackMeasurement(measurement, activeLayout))
      .filter(Boolean);
  }

  function pagePointInfo(state, stackPoint, page = null) {
    const activeLayout = layout(state);
    if (!activeLayout) {
      return { page: page || state.pdfPage || 1, point: stackPoint, pageBox: { x: 0, y: 0, width: state.baseW, height: state.baseH } };
    }
    return renderer.stackPointToPagePoint(activeLayout, stackPoint, { page });
  }

  function pageForStackPoint(state, stackPoint, fallbackPage = null) {
    return pagePointInfo(state, stackPoint)?.page || fallbackPage;
  }

  function localPointForPage(state, page, stackPoint) {
    return pagePointInfo(state, stackPoint, page)?.point || stackPoint;
  }

  function localPointForMeasurement(state, measurement, stackPoint) {
    return localPointForPage(state, measurement?.page, stackPoint);
  }

  function stackPointForPage(state, page, point) {
    const activeLayout = layout(state);
    return activeLayout ? renderer.pagePointToStackPoint(activeLayout, page, point) : point;
  }

  function stackPointsForPage(state, page, points) {
    return (points || []).map(point => stackPointForPage(state, page, point)).filter(Boolean);
  }

  function stackSegmentsForPage(state, page, segments) {
    if (!isActive(state) || !segments) return segments;
    return renderer.measurementToStackMeasurement({ page, points: [], segments }, layout(state))?.segments || [];
  }

  function localizeTarget(state, measurement, target) {
    if (!target || !target.point) return target;
    return { ...target, point: localPointForMeasurement(state, measurement, target.point) };
  }

  function pageSize(state, page) {
    const activeLayout = layout(state);
    const pageBox = activeLayout ? renderer.pageBoxForPage(activeLayout, page) : null;
    return pageBox ? { width: pageBox.width, height: pageBox.height } : { width: state.baseW, height: state.baseH };
  }

  window.TakeoffContinuousMeasurements = {
    isActive,
    displayMeasurement,
    measurementsForView,
    pagePointInfo,
    pageForStackPoint,
    localPointForPage,
    localPointForMeasurement,
    stackPointForPage,
    stackPointsForPage,
    stackSegmentsForPage,
    localizeTarget,
    pageSize,
  };
})();
