(function () {
  function fileName(file) {
    return String(file?.name || '');
  }

  function fileType(file) {
    return String(file?.type || '');
  }

  function isPdfFile(file) {
    return fileType(file) === 'application/pdf' || /\.pdf$/i.test(fileName(file));
  }

  function isImageFile(file) {
    return fileType(file).startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(fileName(file));
  }

  function isSupportedDocumentFile(file) {
    return isPdfFile(file) || isImageFile(file);
  }

  function describeDocumentFile(file) {
    const kind = isPdfFile(file) ? 'pdf' : (isImageFile(file) ? 'image' : 'unsupported');
    const fallbackName = kind === 'pdf' ? 'PDF' : (kind === 'image' ? 'image' : 'Untitled');
    return {
      kind,
      displayName: fileName(file) || fallbackName,
      supported: kind !== 'unsupported',
    };
  }

  function createImageDocumentState(image) {
    return {
      pdf: null,
      pdfPages: 1,
      pdfPage: 1,
      baseW: image.width,
      baseH: image.height,
    };
  }

  window.TakeoffDocumentLoader = {
    isPdfFile,
    isImageFile,
    isSupportedDocumentFile,
    describeDocumentFile,
    createImageDocumentState,
  };
})();
