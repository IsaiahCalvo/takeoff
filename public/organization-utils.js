(function () {
  const UNCATEGORIZED = 'Uncategorized';

  function cleanText(value) {
    return String(value || '').trim();
  }

  function normalizeMeasurementMeta(measurement = {}) {
    return {
      category: cleanText(measurement.category),
      notes: cleanText(measurement.notes),
    };
  }

  function categoryName(value) {
    return cleanText(value) || UNCATEGORIZED;
  }

  function isScaled(measurement) {
    return measurement && measurement.lengthInches != null && Number.isFinite(measurement.lengthInches);
  }

  function groupByCategory(measurements) {
    const groups = new Map();
    for (const measurement of measurements || []) {
      const category = categoryName(measurement.category);
      if (!groups.has(category)) {
        groups.set(category, {
          category,
          count: 0,
          scaledCount: 0,
          unscaledCount: 0,
          totalInches: 0,
          measurements: [],
        });
      }
      const group = groups.get(category);
      group.count += 1;
      group.measurements.push(measurement);
      if (isScaled(measurement)) {
        group.scaledCount += 1;
        group.totalInches += measurement.lengthInches;
      } else {
        group.unscaledCount += 1;
      }
    }
    return [...groups.values()].sort((a, b) => {
      if (a.category === UNCATEGORIZED) return 1;
      if (b.category === UNCATEGORIZED) return -1;
      return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
    });
  }

  window.TakeoffOrganizationUtils = {
    groupByCategory,
    normalizeMeasurementMeta,
    categoryName,
  };
})();
