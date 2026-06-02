(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const DEFAULT_UNITS = ['in', 'ft', 'yd', 'cm', 'm'];
  const LEGACY_PATH_GROUP_ID = 'legacy:path';
  const LEGACY_PATH_DISPLAY_NAME = 'Legacy measurements';
  const VISIBILITY_FIELDS = ['visible', 'hidden', 'categoryHidden', 'pathHidden', 'templateHidden'];

  function cloneValue(value) {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function cleanString(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function cleanName(value, fallback) {
    return cleanString(value) || fallback;
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function unitToInch(unit) {
    return UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft;
  }

  function inchesToUnit(inches, unit) {
    return inches / unitToInch(unit);
  }

  function normalizeUnits(options = {}) {
    const source = Array.isArray(options.units)
      ? options.units
      : (options.unit ? [options.unit] : DEFAULT_UNITS);
    const units = [];
    for (const unit of source || []) {
      const normalized = cleanString(unit);
      if (normalized && !units.includes(normalized)) units.push(normalized);
    }
    return units.length ? units : DEFAULT_UNITS.slice();
  }

  function measurementPage(measurement) {
    const page = Number(measurement?.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  function normalizePagesOption(pages) {
    if (!Array.isArray(pages)) return null;
    const normalized = pages
      .map(page => Number(page))
      .filter(page => Number.isInteger(page) && page > 0);
    return normalized.length ? new Set(normalized) : null;
  }

  function measurementIncluded(measurement, page, options = {}, allowedPages = null) {
    if (typeof options.filter === 'function' && !options.filter(measurement, page)) return false;
    if (typeof options.pageFilter === 'function' && !options.pageFilter(page, measurement)) return false;
    if (allowedPages && !allowedPages.has(page)) return false;
    if (options.scope === 'page' && options.page != null) return page === Number(options.page);
    return true;
  }

  function pathIdentityForMeasurement(measurement) {
    const pathTemplateId = cleanString(measurement?.pathTemplateId);
    const pathId = cleanString(measurement?.pathId);
    if (!pathTemplateId || !pathId) {
      return {
        id: LEGACY_PATH_GROUP_ID,
        key: LEGACY_PATH_GROUP_ID,
        kind: 'legacy',
        isLegacy: true,
        pathTemplateId: null,
        pathId: null,
      };
    }
    const key = `path:${encodeURIComponent(pathTemplateId)}:${encodeURIComponent(pathId)}`;
    return {
      id: key,
      key,
      kind: 'path',
      isLegacy: false,
      pathTemplateId,
      pathId,
    };
  }

  function measurementType(measurement) {
    const value = measurement?.shape?.active
      || measurement?.shape?.kind
      || measurement?.drawType
      || measurement?.type
      || 'line';
    return String(value).toLowerCase() === 'freehand' ? 'freehand' : 'line';
  }

  function scaledLengthInches(measurement) {
    if (measurement?.lengthInches == null) return null;
    const inches = Number(measurement.lengthInches);
    return Number.isFinite(inches) ? inches : null;
  }

  function totalsForLength(lengthInches, units) {
    if (lengthInches == null) return {};
    const totals = {};
    for (const unit of units) totals[unit] = inchesToUnit(lengthInches, unit);
    return totals;
  }

  function addTotals(target, totals) {
    for (const [unit, value] of Object.entries(totals || {})) {
      target[unit] = (target[unit] || 0) + value;
    }
  }

  function visibilityForMeasurement(measurement) {
    const visibility = {};
    for (const field of VISIBILITY_FIELDS) {
      if (measurement && measurement[field] !== undefined) visibility[field] = measurement[field];
    }
    return visibility;
  }

  function isVisibilityHidden(visibility) {
    if (visibility.hidden === true) return true;
    if (visibility.visible === false) return true;
    if (visibility.categoryHidden === true) return true;
    if (visibility.pathHidden === true) return true;
    return visibility.templateHidden === true;
  }

  function styleColor(pathStyle) {
    return pathStyle?.stroke?.color || null;
  }

  function runColor(measurement, pathStyle) {
    return styleColor(pathStyle) || measurement?.color || null;
  }

  function categoryForMeasurement(measurement) {
    const pathCategory = measurement?.pathCategory;
    const category = measurement?.category;
    const pathCategoryObject = sourceObject(pathCategory);
    const categoryObject = sourceObject(category);
    const categoryId = cleanString(measurement?.pathCategoryId)
      || cleanString(measurement?.categoryId)
      || cleanString(pathCategoryObject.id)
      || cleanString(categoryObject.id);
    const categoryName = cleanString(measurement?.pathCategoryName)
      || cleanString(measurement?.categoryName)
      || (typeof pathCategory === 'string' ? cleanString(pathCategory) : null)
      || (typeof category === 'string' ? cleanString(category) : null)
      || cleanString(pathCategoryObject.name)
      || cleanString(categoryObject.name);
    const categoryKey = categoryId
      ? `category:${encodeURIComponent(categoryId)}`
      : (categoryName ? `category-name:${encodeURIComponent(categoryName)}` : null);
    return {
      categoryId,
      categoryName,
      categoryKey,
    };
  }

  function createRunRecord({ measurement, identity, sourceIndex, page, units }) {
    const pathStyle = cloneValue(measurement?.pathStyle) || null;
    const lengthInches = scaledLengthInches(measurement);
    const totalsByUnit = totalsForLength(lengthInches, units);
    const visibility = visibilityForMeasurement(measurement);
    const category = categoryForMeasurement(measurement);
    const run = {
      id: measurement?.id ?? `run-${sourceIndex + 1}`,
      measurementId: measurement?.id ?? null,
      sourceIndex,
      groupId: identity.id,
      groupKey: identity.key,
      kind: identity.kind,
      isLegacy: identity.isLegacy,
      pathTemplateId: identity.pathTemplateId,
      pathId: identity.pathId,
      pathName: identity.isLegacy ? null : cleanName(measurement?.pathName, 'Path'),
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryKey: category.categoryKey,
      displayName: cleanName(measurement?.name, `Run ${sourceIndex + 1}`),
      measurementType: measurementType(measurement),
      page,
      color: runColor(measurement, pathStyle),
      pathStyle,
      lengthInches,
      lengthPx: Number.isFinite(Number(measurement?.lengthPx)) ? Number(measurement.lengthPx) : null,
      totalsByUnit,
      scaled: lengthInches != null,
      visibility,
      pointCount: Array.isArray(measurement?.points) ? measurement.points.length : 0,
    };
    for (const [field, value] of Object.entries(visibility)) run[field] = value;
    return run;
  }

  function createGroup(identity, run) {
    const displayName = identity.isLegacy ? LEGACY_PATH_DISPLAY_NAME : run.pathName;
    return {
      id: identity.id,
      key: identity.key,
      kind: identity.kind,
      isLegacy: identity.isLegacy,
      pathTemplateId: identity.pathTemplateId,
      pathId: identity.pathId,
      pathName: identity.isLegacy ? null : run.pathName,
      displayName,
      categoryId: run.categoryId,
      categoryName: run.categoryName,
      categoryKey: run.categoryKey,
      categories: [],
      hasMixedCategories: false,
      color: run.color,
      pathStyle: cloneValue(run.pathStyle) || null,
      runCount: 0,
      scaledRunCount: 0,
      unscaledRunCount: 0,
      visibleRunCount: 0,
      hiddenRunCount: 0,
      hasHiddenRuns: false,
      totalsByUnit: {},
      pages: [],
      pageCoverage: { pages: [], ranges: [], label: '' },
      runs: [],
      _pageSet: new Set(),
    };
  }

  function refreshGroupMetadata(group, run) {
    if (!group.color && run.color) group.color = run.color;
    if (!group.pathStyle && run.pathStyle) group.pathStyle = cloneValue(run.pathStyle);
    if (group.kind === 'path' && (!group.pathName || group.pathName === 'Path') && run.pathName) {
      group.pathName = run.pathName;
      group.displayName = run.pathName;
    }
  }

  function addRunToGroup(group, run) {
    refreshGroupMetadata(group, run);
    group.runs.push(run);
    group.runCount += 1;
    if (run.scaled) group.scaledRunCount += 1;
    else group.unscaledRunCount += 1;
    if (isVisibilityHidden(run.visibility)) group.hiddenRunCount += 1;
    else group.visibleRunCount += 1;
    group.hasHiddenRuns = group.hiddenRunCount > 0;
    addTotals(group.totalsByUnit, run.totalsByUnit);
    group._pageSet.add(run.page);
    if (run.categoryKey && !group.categories.some(category => category.key === run.categoryKey)) {
      group.categories.push({
        key: run.categoryKey,
        id: run.categoryId,
        name: run.categoryName,
      });
    }
    if (!group.categoryKey && run.categoryKey) {
      group.categoryId = run.categoryId;
      group.categoryName = run.categoryName;
      group.categoryKey = run.categoryKey;
    }
    group.hasMixedCategories = group.categories.length > 1;
  }

  function pageRangeLabel(start, end) {
    return start === end ? String(start) : `${start}-${end}`;
  }

  function buildPageCoverage(pageSet) {
    const pages = [...pageSet].sort((a, b) => a - b);
    const ranges = [];
    for (const page of pages) {
      const last = ranges[ranges.length - 1];
      if (last && page === last.end + 1) {
        last.end = page;
        last.label = pageRangeLabel(last.start, last.end);
      } else {
        ranges.push({ start: page, end: page, label: String(page) });
      }
    }
    return {
      pages,
      ranges,
      label: ranges.map(range => range.label).join(', '),
    };
  }

  function finalizeGroup(group) {
    const coverage = buildPageCoverage(group._pageSet);
    group.pages = coverage.pages;
    group.pageCoverage = coverage;
    group.visibility = {
      visibleRunCount: group.visibleRunCount,
      hiddenRunCount: group.hiddenRunCount,
      hasHiddenRuns: group.hasHiddenRuns,
    };
    delete group._pageSet;
    return group;
  }

  function buildPathRunGroups(measurements, options = {}) {
    const units = normalizeUnits(options);
    const allowedPages = normalizePagesOption(options.pages);
    const groups = [];
    const groupByKey = new Map();
    const aggregatePageSet = new Set();
    const totalsByUnit = {};
    let runCount = 0;
    let scaledRunCount = 0;
    let unscaledRunCount = 0;

    (measurements || []).forEach((measurement, sourceIndex) => {
      const page = measurementPage(measurement);
      if (!measurementIncluded(measurement, page, options, allowedPages)) return;
      const identity = pathIdentityForMeasurement(measurement);
      const run = createRunRecord({ measurement, identity, sourceIndex, page, units });
      let group = groupByKey.get(identity.key);
      if (!group) {
        group = createGroup(identity, run);
        groupByKey.set(identity.key, group);
        groups.push(group);
      }
      addRunToGroup(group, run);
      addTotals(totalsByUnit, run.totalsByUnit);
      aggregatePageSet.add(page);
      runCount += 1;
      if (run.scaled) scaledRunCount += 1;
      else unscaledRunCount += 1;
    });

    const finalizedGroups = groups.map(finalizeGroup);
    const pageCoverage = buildPageCoverage(aggregatePageSet);
    return {
      groups: finalizedGroups,
      groupCount: finalizedGroups.length,
      runCount,
      scaledRunCount,
      unscaledRunCount,
      units: units.slice(),
      totalsByUnit,
      pages: pageCoverage.pages,
      pageCoverage,
    };
  }

  window.TakeoffPathAggregation = {
    UNIT_TO_INCH,
    DEFAULT_UNITS,
    LEGACY_PATH_GROUP_ID,
    buildPathRunGroups,
    buildPageCoverage,
    categoryForMeasurement,
    pathIdentityForMeasurement,
  };
})();
