(function () {
  function countPageMeasurements(measurements, page) {
    return (measurements || []).filter(measurement => measurement.page === page).length;
  }

  function resetScaleConfirmMessage({ page, affectedCount }) {
    return `Reset calibration for page ${page}? ${affectedCount} run${affectedCount === 1 ? '' : 's'} on this page will be marked unscaled and excluded from totals. You can undo this.`;
  }

  window.TakeoffCalibrationController = {
    countPageMeasurements,
    resetScaleConfirmMessage,
  };
})();
