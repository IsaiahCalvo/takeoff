(function () {
  function stripToSingleDecimal(value) {
    let sanitized = '';
    let hasDecimal = false;
    for (const char of String(value || '')) {
      if (char >= '0' && char <= '9') {
        sanitized += char;
      } else if (char === '.' && !hasDecimal) {
        sanitized += char;
        hasDecimal = true;
      }
    }
    return sanitized;
  }

  function normalizeLeadingZero(value) {
    if (!value.startsWith('0') || value.length <= 1) return value;
    if (value[1] === '.') return value;

    const decimalDigits = value.slice(1).replace(/\./g, '');
    return decimalDigits ? `0.${decimalDigits}` : '0';
  }

  function sanitizePositiveDecimalInput(value) {
    return normalizeLeadingZero(stripToSingleDecimal(value));
  }

  window.TakeoffDecimalInput = {
    sanitizePositiveDecimalInput,
  };
})();
