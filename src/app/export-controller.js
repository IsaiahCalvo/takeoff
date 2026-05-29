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

  window.TakeoffExportController = {
    exportFilename,
    excelStatusMessage,
    createDownloadHelpers,
  };
})();
