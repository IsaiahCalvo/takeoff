(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const DEFAULT_UNITS = ['in', 'ft', 'yd', 'cm', 'm'];
  const LEGACY_PATH_GROUP_ID = 'legacy:path';
  const LEGACY_PATH_DISPLAY_NAME = 'Legacy measurements';
  const UNCATEGORIZED_PATH_CATEGORY_PREFIX = 'category-path:';
  const VISIBILITY_FIELDS = ['visible', 'hidden', 'categoryHidden', 'pathHidden', 'templateHidden'];

  function cloneValue(value) {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
  }

  function cleanString(value) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  function cleanKey(value) {
    return cleanString(value);
  }

  function cleanName(value, fallback) {
    return cleanString(value) || fallback;
  }

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function visibilityBoolean(value) {
    if (typeof value === 'boolean') return value;
    const source = sourceObject(value);
    if (typeof source.visible === 'boolean') return source.visible;
    if (typeof source.hidden === 'boolean') return !source.hidden;
    return null;
  }

  function normalizePathCategoryVisibility(input = {}) {
    const source = sourceObject(input);
    const visibility = {};
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = cleanKey(rawKey);
      const visible = visibilityBoolean(rawValue);
      if (!key || visible == null) continue;
      visibility[key] = visible;
    }
    return visibility;
  }

  function normalizeTotalsScope(value) {
    return value === 'visible' ? 'visible' : 'all';
  }

  function scopedTotals({ allTotalsByUnit, visibleTotalsByUnit }, totalsScope) {
    return { ...(totalsScope === 'visible' ? visibleTotalsByUnit : allTotalsByUnit) };
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
    const normalized = String(value).toLowerCase();
    if (normalized === 'path') return 'path';
    if (normalized === 'circle') return 'circle';
    if (normalized === 'arc') return 'arc';
    if (measurement?.circle?.center && Number.isFinite(measurement.circle.radius)) return 'circle';
    if (measurement?.arc?.center && Number.isFinite(measurement.arc.radius)) return 'arc';
    return normalized === 'freehand' ? 'freehand' : 'line';
  }

  function measurementPointCount(measurement) {
    if (Array.isArray(measurement?.points) && measurement.points.length) return measurement.points.length;
    if (measurementType(measurement) === 'circle') return 2;
    if (measurementType(measurement) === 'arc') return 2;
    return 0;
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

  function pathCategoryVisibilityKey({ categoryKey, pathKey } = {}) {
    const cleanCategoryKey = cleanKey(categoryKey);
    if (cleanCategoryKey) return cleanCategoryKey;
    const cleanPathKey = cleanKey(pathKey) || LEGACY_PATH_GROUP_ID;
    return `${UNCATEGORIZED_PATH_CATEGORY_PREFIX}${encodeURIComponent(cleanPathKey)}`;
  }

  function effectiveVisibilityForRun(visibility, { categoryVisible, pathCategoryVisibilityKey: visibilityKey }) {
    const effective = { ...visibility };
    const isCategoryVisible = categoryVisible !== false;
    if (!isCategoryVisible) effective.categoryHidden = true;
    else if (effective.categoryHidden === undefined) effective.categoryHidden = false;
    effective.categoryVisible = isCategoryVisible;
    effective.pathCategoryVisibilityKey = visibilityKey;
    const hidden = isVisibilityHidden(effective);
    effective.visible = !hidden;
    effective.hidden = hidden;
    return effective;
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

  function pathCategoryVisibilityKeyForMeasurement(measurement) {
    const identity = pathIdentityForMeasurement(measurement);
    const category = categoryForMeasurement(measurement);
    return pathCategoryVisibilityKey({
      categoryKey: category.categoryKey,
      pathKey: identity.key,
    });
  }

  function createRunRecord({ measurement, identity, sourceIndex, page, units, pathCategoryVisibility }) {
    const pathStyle = cloneValue(measurement?.pathStyle) || null;
    const lengthInches = scaledLengthInches(measurement);
    const totalsByUnit = totalsForLength(lengthInches, units);
    const visibility = visibilityForMeasurement(measurement);
    const category = categoryForMeasurement(measurement);
    const visibilityKey = pathCategoryVisibilityKey({
      categoryKey: category.categoryKey,
      pathKey: identity.key,
    });
    const categoryVisible = pathCategoryVisibility[visibilityKey] !== false;
    const effectiveVisibility = effectiveVisibilityForRun(visibility, {
      categoryVisible,
      pathCategoryVisibilityKey: visibilityKey,
    });
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
      pathCategoryVisibilityKey: visibilityKey,
      categoryVisible,
      isVisible: !effectiveVisibility.hidden,
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
      effectiveVisibility,
      pointCount: measurementPointCount(measurement),
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
      pathCategoryVisibilityKey: run.pathCategoryVisibilityKey,
      categories: [],
      hasMixedCategories: false,
      categoryVisible: run.categoryVisible,
      isVisible: false,
      color: run.color,
      pathStyle: cloneValue(run.pathStyle) || null,
      runCount: 0,
      scaledRunCount: 0,
      unscaledRunCount: 0,
      visibleRunCount: 0,
      visibleScaledRunCount: 0,
      visibleUnscaledRunCount: 0,
      hiddenRunCount: 0,
      hiddenScaledRunCount: 0,
      hiddenUnscaledRunCount: 0,
      hasHiddenRuns: false,
      totalsByUnit: {},
      allTotalsByUnit: {},
      visibleTotalsByUnit: {},
      hiddenTotalsByUnit: {},
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
    if (!group.pathCategoryVisibilityKey && run.pathCategoryVisibilityKey) {
      group.pathCategoryVisibilityKey = run.pathCategoryVisibilityKey;
    }
  }

  function addRunToGroup(group, run) {
    refreshGroupMetadata(group, run);
    group.runs.push(run);
    group.runCount += 1;
    if (run.scaled) group.scaledRunCount += 1;
    else group.unscaledRunCount += 1;
    if (run.isVisible) {
      group.visibleRunCount += 1;
      if (run.scaled) group.visibleScaledRunCount += 1;
      else group.visibleUnscaledRunCount += 1;
      addTotals(group.visibleTotalsByUnit, run.totalsByUnit);
    } else {
      group.hiddenRunCount += 1;
      if (run.scaled) group.hiddenScaledRunCount += 1;
      else group.hiddenUnscaledRunCount += 1;
      addTotals(group.hiddenTotalsByUnit, run.totalsByUnit);
    }
    group.hasHiddenRuns = group.hiddenRunCount > 0;
    group.isVisible = group.visibleRunCount > 0;
    addTotals(group.allTotalsByUnit, run.totalsByUnit);
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

  function categoryDisplayName(run) {
    if (run.categoryKey) {
      return cleanString(run.categoryName) || cleanString(run.categoryId) || 'Uncategorized';
    }
    return cleanString(run.categoryName)
      || (!run.isLegacy ? cleanString(run.pathName) : null)
      || 'Uncategorized';
  }

  function createCategorySummary(run) {
    return {
      key: run.pathCategoryVisibilityKey,
      id: run.categoryId,
      name: run.categoryName,
      displayName: categoryDisplayName(run),
      categoryId: run.categoryId,
      categoryName: run.categoryName,
      categoryKey: run.categoryKey,
      pathCategoryVisibilityKey: run.pathCategoryVisibilityKey,
      categoryVisible: run.categoryVisible,
      isVisible: false,
      runCount: 0,
      scaledRunCount: 0,
      unscaledRunCount: 0,
      visibleRunCount: 0,
      visibleScaledRunCount: 0,
      visibleUnscaledRunCount: 0,
      hiddenRunCount: 0,
      hiddenScaledRunCount: 0,
      hiddenUnscaledRunCount: 0,
      hasHiddenRuns: false,
      totalsByUnit: {},
      allTotalsByUnit: {},
      visibleTotalsByUnit: {},
      hiddenTotalsByUnit: {},
      pathKeys: [],
      pathIds: [],
      pathTemplateIds: [],
      pages: [],
      pageCoverage: { pages: [], ranges: [], label: '' },
      _pathKeySet: new Set(),
      _pathIdSet: new Set(),
      _pathTemplateIdSet: new Set(),
      _pageSet: new Set(),
    };
  }

  function addRunToCategory(category, run) {
    category.runCount += 1;
    if (run.scaled) category.scaledRunCount += 1;
    else category.unscaledRunCount += 1;
    if (run.isVisible) {
      category.visibleRunCount += 1;
      if (run.scaled) category.visibleScaledRunCount += 1;
      else category.visibleUnscaledRunCount += 1;
      addTotals(category.visibleTotalsByUnit, run.totalsByUnit);
    } else {
      category.hiddenRunCount += 1;
      if (run.scaled) category.hiddenScaledRunCount += 1;
      else category.hiddenUnscaledRunCount += 1;
      addTotals(category.hiddenTotalsByUnit, run.totalsByUnit);
    }
    category.hasHiddenRuns = category.hiddenRunCount > 0;
    category.isVisible = category.visibleRunCount > 0;
    addTotals(category.allTotalsByUnit, run.totalsByUnit);
    category._pageSet.add(run.page);
    if (run.groupKey && !category._pathKeySet.has(run.groupKey)) {
      category._pathKeySet.add(run.groupKey);
      category.pathKeys.push(run.groupKey);
    }
    if (run.pathId && !category._pathIdSet.has(run.pathId)) {
      category._pathIdSet.add(run.pathId);
      category.pathIds.push(run.pathId);
    }
    if (run.pathTemplateId && !category._pathTemplateIdSet.has(run.pathTemplateId)) {
      category._pathTemplateIdSet.add(run.pathTemplateId);
      category.pathTemplateIds.push(run.pathTemplateId);
    }
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

  function finalizeGroup(group, totalsScope) {
    const coverage = buildPageCoverage(group._pageSet);
    group.pages = coverage.pages;
    group.pageCoverage = coverage;
    group.totalsByUnit = scopedTotals(group, totalsScope);
    group.visibility = {
      visibleRunCount: group.visibleRunCount,
      hiddenRunCount: group.hiddenRunCount,
      hasHiddenRuns: group.hasHiddenRuns,
      isVisible: group.isVisible,
    };
    delete group._pageSet;
    return group;
  }

  function finalizeCategory(category, totalsScope) {
    const coverage = buildPageCoverage(category._pageSet);
    category.pages = coverage.pages;
    category.pageCoverage = coverage;
    category.totalsByUnit = scopedTotals(category, totalsScope);
    category.visibility = {
      visibleRunCount: category.visibleRunCount,
      hiddenRunCount: category.hiddenRunCount,
      hasHiddenRuns: category.hasHiddenRuns,
      isVisible: category.isVisible,
    };
    delete category._pageSet;
    delete category._pathKeySet;
    delete category._pathIdSet;
    delete category._pathTemplateIdSet;
    return category;
  }

  function pathCategoryVisibilityFromOptions(options = {}) {
    return normalizePathCategoryVisibility(options.pathCategoryVisibility || options.categoryVisibility || {});
  }

  function buildPathRunGroups(measurements, options = {}) {
    const units = normalizeUnits(options);
    const allowedPages = normalizePagesOption(options.pages);
    const totalsScope = normalizeTotalsScope(options.totalsScope);
    const pathCategoryVisibility = pathCategoryVisibilityFromOptions(options);
    const groups = [];
    const groupByKey = new Map();
    const categories = [];
    const categoryByKey = new Map();
    const aggregatePageSet = new Set();
    const allTotalsByUnit = {};
    const visibleTotalsByUnit = {};
    const hiddenTotalsByUnit = {};
    let runCount = 0;
    let scaledRunCount = 0;
    let unscaledRunCount = 0;
    let visibleRunCount = 0;
    let visibleScaledRunCount = 0;
    let visibleUnscaledRunCount = 0;
    let hiddenRunCount = 0;
    let hiddenScaledRunCount = 0;
    let hiddenUnscaledRunCount = 0;

    (measurements || []).forEach((measurement, sourceIndex) => {
      const page = measurementPage(measurement);
      if (!measurementIncluded(measurement, page, options, allowedPages)) return;
      const identity = pathIdentityForMeasurement(measurement);
      const run = createRunRecord({
        measurement,
        identity,
        sourceIndex,
        page,
        units,
        pathCategoryVisibility,
      });
      let group = groupByKey.get(identity.key);
      if (!group) {
        group = createGroup(identity, run);
        groupByKey.set(identity.key, group);
        groups.push(group);
      }
      addRunToGroup(group, run);
      let category = categoryByKey.get(run.pathCategoryVisibilityKey);
      if (!category) {
        category = createCategorySummary(run);
        categoryByKey.set(run.pathCategoryVisibilityKey, category);
        categories.push(category);
      }
      addRunToCategory(category, run);
      addTotals(allTotalsByUnit, run.totalsByUnit);
      if (run.isVisible) {
        visibleRunCount += 1;
        if (run.scaled) visibleScaledRunCount += 1;
        else visibleUnscaledRunCount += 1;
        addTotals(visibleTotalsByUnit, run.totalsByUnit);
      } else {
        hiddenRunCount += 1;
        if (run.scaled) hiddenScaledRunCount += 1;
        else hiddenUnscaledRunCount += 1;
        addTotals(hiddenTotalsByUnit, run.totalsByUnit);
      }
      aggregatePageSet.add(page);
      runCount += 1;
      if (run.scaled) scaledRunCount += 1;
      else unscaledRunCount += 1;
    });

    const finalizedGroups = groups.map(group => finalizeGroup(group, totalsScope));
    const finalizedCategories = categories.map(category => finalizeCategory(category, totalsScope));
    const pageCoverage = buildPageCoverage(aggregatePageSet);
    const totalsByUnit = scopedTotals({ allTotalsByUnit, visibleTotalsByUnit }, totalsScope);
    return {
      groups: finalizedGroups,
      categories: finalizedCategories,
      groupCount: finalizedGroups.length,
      categoryCount: finalizedCategories.length,
      runCount,
      scaledRunCount,
      unscaledRunCount,
      visibleRunCount,
      visibleScaledRunCount,
      visibleUnscaledRunCount,
      hiddenRunCount,
      hiddenScaledRunCount,
      hiddenUnscaledRunCount,
      hasHiddenRuns: hiddenRunCount > 0,
      units: units.slice(),
      totalsByUnit,
      allTotalsByUnit,
      visibleTotalsByUnit,
      hiddenTotalsByUnit,
      totalsScope,
      pages: pageCoverage.pages,
      pageCoverage,
    };
  }

  window.TakeoffPathAggregation = {
    UNIT_TO_INCH,
    DEFAULT_UNITS,
    LEGACY_PATH_GROUP_ID,
    UNCATEGORIZED_PATH_CATEGORY_PREFIX,
    buildPathRunGroups,
    buildPageCoverage,
    categoryForMeasurement,
    pathIdentityForMeasurement,
    pathCategoryVisibilityKey,
    pathCategoryVisibilityKeyForMeasurement,
    normalizePathCategoryVisibility,
  };
})();
