(function () {
  const DEFAULT_PATH_STYLE = Object.freeze({
    stroke: Object.freeze({
      color: '#b6ff3c',
      style: 'solid',
    }),
    anchors: Object.freeze({
      fill: '#ffffff',
      border: '#b6ff3c',
      borderMatchesStroke: true,
    }),
  });

  const VALID_STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
  const STROKE_PATTERNS = Object.freeze({
    solid: Object.freeze([]),
    dashed: Object.freeze([18, 13]),
    dotted: Object.freeze([1, 16]),
  });

  const PATH_STYLE_PREVIEW_GEOMETRY = Object.freeze({
    viewBox: '-3 -42 170 170',
    pathD: 'M132 46 C114 46 109 34 88 34 C65 34 64 56 41 56 C30 56 24 51 19 48',
    pathStrokeWidth: 8,
    anchorRadius: 13,
    anchorStrokeWidth: 5,
    previewWidth: 170,
    previewHeight: 170,
    anchors: Object.freeze([
      Object.freeze({ cx: 19, cy: 48 }),
      Object.freeze({ cx: 146, cy: 46 }),
    ]),
  });

  function sourceObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function finitePositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
  }

  function sanitizeColor(value, fallback = DEFAULT_PATH_STYLE.stroke.color) {
    if (typeof value !== 'string') return fallback;
    const text = value.trim().toLowerCase();
    return /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/.test(text) ? text : fallback;
  }

  function normalizeStrokeStyle(value) {
    const style = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return VALID_STROKE_STYLES.has(style) ? style : DEFAULT_PATH_STYLE.stroke.style;
  }

  function normalizePathStyle(style = {}) {
    const source = sourceObject(style);
    const strokeSource = sourceObject(source.stroke);
    const stroke = {
      color: sanitizeColor(strokeSource.color, DEFAULT_PATH_STYLE.stroke.color),
      style: normalizeStrokeStyle(strokeSource.style),
    };
    const anchorSource = sourceObject(source.anchors);
    const borderMatchesStroke = typeof anchorSource.borderMatchesStroke === 'boolean'
      ? anchorSource.borderMatchesStroke
      : DEFAULT_PATH_STYLE.anchors.borderMatchesStroke;
    return {
      stroke,
      anchors: {
        fill: sanitizeColor(anchorSource.fill, DEFAULT_PATH_STYLE.anchors.fill),
        border: borderMatchesStroke
          ? stroke.color
          : sanitizeColor(anchorSource.border, stroke.color),
        borderMatchesStroke,
      },
    };
  }

  function strokeDasharrayForStyle(strokeStyle, dashScale = 1) {
    const pattern = STROKE_PATTERNS[normalizeStrokeStyle(strokeStyle)];
    if (!pattern.length) return null;
    const scale = finitePositiveNumber(dashScale, 1);
    return pattern.map(value => formatNumber(value * scale)).join(' ');
  }

  function pathStrokeAttributes(style = {}, options = {}) {
    const normalized = normalizePathStyle(style);
    const attrs = {
      fill: 'none',
      stroke: normalized.stroke.color,
      'stroke-width': finitePositiveNumber(options.strokeWidth, PATH_STYLE_PREVIEW_GEOMETRY.pathStrokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    const dasharray = strokeDasharrayForStyle(normalized.stroke.style, options.dashScale);
    if (dasharray) attrs['stroke-dasharray'] = dasharray;
    return attrs;
  }

  function anchorCircleAttributes(style = {}, options = {}) {
    const normalized = normalizePathStyle(style);
    return {
      r: finitePositiveNumber(options.radius, PATH_STYLE_PREVIEW_GEOMETRY.anchorRadius),
      fill: normalized.anchors.fill,
      stroke: normalized.anchors.border,
      'stroke-width': finitePositiveNumber(options.strokeWidth, PATH_STYLE_PREVIEW_GEOMETRY.anchorStrokeWidth),
    };
  }

  function getPathStylePreviewAttributes(style = {}) {
    const normalized = normalizePathStyle(style);
    const path = {
      d: PATH_STYLE_PREVIEW_GEOMETRY.pathD,
      ...pathStrokeAttributes(normalized, {
        strokeWidth: PATH_STYLE_PREVIEW_GEOMETRY.pathStrokeWidth,
        dashScale: 1,
      }),
    };
    const anchorStyle = anchorCircleAttributes(normalized, {
      radius: PATH_STYLE_PREVIEW_GEOMETRY.anchorRadius,
      strokeWidth: PATH_STYLE_PREVIEW_GEOMETRY.anchorStrokeWidth,
    });
    return {
      style: normalized,
      svg: {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: PATH_STYLE_PREVIEW_GEOMETRY.viewBox,
        width: PATH_STYLE_PREVIEW_GEOMETRY.previewWidth,
        height: PATH_STYLE_PREVIEW_GEOMETRY.previewHeight,
        style: `width:${PATH_STYLE_PREVIEW_GEOMETRY.previewWidth}px;height:${PATH_STYLE_PREVIEW_GEOMETRY.previewHeight}px;display:block;overflow:visible`,
        'aria-hidden': 'true',
      },
      path,
      anchors: PATH_STYLE_PREVIEW_GEOMETRY.anchors.map(anchor => ({
        ...anchor,
        ...anchorStyle,
      })),
    };
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, '&quot;');
  }

  function renderPathStylePreviewSvg(style = {}, options = {}) {
    const attrs = getPathStylePreviewAttributes(style);
    const label = typeof options.ariaLabel === 'string' ? options.ariaLabel.trim() : '';
    const aria = label
      ? `role="img" aria-label="${escapeAttribute(label)}"`
      : 'aria-hidden="true"';
    const dash = attrs.path['stroke-dasharray']
      ? ` stroke-dasharray="${attrs.path['stroke-dasharray']}"`
      : '';
    const path = `<path d="${attrs.path.d}" fill="${attrs.path.fill}" stroke="${attrs.path.stroke}" stroke-width="${attrs.path['stroke-width']}" stroke-linecap="${attrs.path['stroke-linecap']}" stroke-linejoin="${attrs.path['stroke-linejoin']}"${dash}/>`;
    const anchors = attrs.anchors
      .map(anchor => `<circle cx="${anchor.cx}" cy="${anchor.cy}" r="${anchor.r}" fill="${anchor.fill}" stroke="${anchor.stroke}" stroke-width="${anchor['stroke-width']}"/>`)
      .join('');
    return `<svg xmlns="${attrs.svg.xmlns}" viewBox="${attrs.svg.viewBox}" width="${attrs.svg.width}" height="${attrs.svg.height}" style="${attrs.svg.style}" ${aria}>${path}${anchors}</svg>`;
  }

  window.TakeoffPathStyleRenderer = {
    DEFAULT_PATH_STYLE,
    PATH_STYLE_PREVIEW_GEOMETRY,
    sanitizeColor,
    normalizeStrokeStyle,
    normalizePathStyle,
    strokeDasharrayForStyle,
    pathStrokeAttributes,
    anchorCircleAttributes,
    getPathStylePreviewAttributes,
    renderPathStylePreviewSvg,
  };
})();
