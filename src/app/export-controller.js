(function () {
  function exportFilename(baseName, format) {
    return `${baseName}-measurements.${format}`;
  }

  function excelStatusMessage(rows) {
    const unscaled = (rows || []).filter(row => row.scaled === 'N').length;
    return unscaled
      ? `Excel export downloaded. ${unscaled} unscaled run${unscaled === 1 ? '' : 's'} marked N.`
      : 'Excel export downloaded.';
  }

  function createDownloadHelpers({ exportUtils, documentRef, createObjectURL, revokeObjectURL, textEncoder }) {
    function downloadBytes(bytes, filename, type) {
      const blob = exportUtils.makeDownloadBlob(bytes, type);
      const url = createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = filename;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      revokeObjectURL(url);
    }

    function downloadText(text, filename, type) {
      downloadBytes(new textEncoder().encode(text), filename, type);
    }

    return { downloadBytes, downloadText };
  }

  function setDisclosureOpen({ wrap, button, open }) {
    wrap.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeDisclosuresOnEscape({ event, disclosures = [] }) {
    if (!event || event.key !== 'Escape') return false;
    let closed = false;
    for (const { wrap, button } of disclosures) {
      if (!wrap || !button || !wrap.classList.contains('open')) continue;
      setDisclosureOpen({ wrap, button, open: false });
      closed = true;
    }
    if (closed) {
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
    }
    return closed;
  }

  function applyExportAvailability({ exportButton, actionButtons = [], disabled, isOpen }) {
    exportButton.disabled = disabled;
    exportButton.setAttribute('aria-expanded', !disabled && isOpen ? 'true' : 'false');
    for (const button of actionButtons) {
      button.disabled = disabled;
    }
  }

  window.TakeoffExportController = {
    exportFilename,
    excelStatusMessage,
    createDownloadHelpers,
    setDisclosureOpen,
    closeDisclosuresOnEscape,
    applyExportAvailability,
  };
})();
