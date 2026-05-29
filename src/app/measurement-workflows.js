(function () {
  function deleteMeasurementResult({ measurements, selectedId, deletedId } = {}) {
    const before = measurements || [];
    const after = before.filter(measurement => measurement.id !== deletedId);
    return {
      measurements: after,
      selectedId: selectedId === deletedId ? null : selectedId,
      deleted: after.length !== before.length,
    };
  }

  function appendMeasurementResult({ measurements, measurement, selectedId = null, selectAppended = false } = {}) {
    if (!measurement) {
      return {
        measurements: measurements || [],
        selectedId,
        appended: false,
      };
    }
    return {
      measurements: [...(measurements || []), measurement],
      selectedId: selectAppended ? measurement.id : selectedId,
      appended: true,
    };
  }

  function recomputeMeasurementLength(measurement, { pxPerInch, measureLengthPx } = {}) {
    if (!measurement || !measureLengthPx) return false;
    measurement.lengthPx = measureLengthPx(measurement);
    measurement.lengthInches = pxPerInch ? measurement.lengthPx / pxPerInch : null;
    return true;
  }

  window.TakeoffMeasurementWorkflows = {
    deleteMeasurementResult,
    appendMeasurementResult,
    recomputeMeasurementLength,
  };
})();
