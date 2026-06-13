(function () {
  const UNIT_TO_INCH = { in: 1, ft: 12, yd: 36, cm: 0.393700787, m: 39.3700787 };
  const UNIT_LABEL = { in: 'in', ft: 'ft', yd: 'yd', cm: 'cm', m: 'm' };

  function unitToInch(unit) {
    return UNIT_TO_INCH[unit] || UNIT_TO_INCH.ft;
  }

  function unitLabel(unit) {
    return UNIT_LABEL[unit] || unit;
  }

  function pxToInches(px, pxPerInch) {
    if (!pxPerInch) return null;
    return px / pxPerInch;
  }

  function inchesToUnit(inches, unit) {
    return inches / unitToInch(unit);
  }

  function formatLengthInUnit(inches, unit) {
    if (inches == null) return '—';
    return inchesToUnit(inches, unit).toFixed(2);
  }

  function areaUnitLabel(unit) {
    return `${unitLabel(unit)}\u00b2`;
  }

  function formatAreaInUnit(squareInches, unit) {
    if (squareInches == null) return '—';
    const unitSize = unitToInch(unit);
    return (squareInches / (unitSize * unitSize)).toFixed(2);
  }

  function parseLengthInUnit(value, unit) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed * unitToInch(unit);
  }

  function scaleHudText({ pxPerInch, unit }) {
    if (!pxPerInch) return '—';
    return `1 ${unitLabel(unit)} = ${(unitToInch(unit) * pxPerInch).toFixed(2)} px`;
  }

  window.TakeoffUnits = {
    UNIT_TO_INCH,
    UNIT_LABEL,
    unitToInch,
    unitLabel,
    pxToInches,
    inchesToUnit,
    formatLengthInUnit,
    areaUnitLabel,
    formatAreaInUnit,
    parseLengthInUnit,
    scaleHudText,
  };
})();
