(function () {
  function sourceObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }

  function cloneAttachmentList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(attachment => attachment && typeof attachment === 'object' && !Array.isArray(attachment))
      .map(cloneValue);
  }

  function normalizeRunDetails(details = {}) {
    const source = sourceObject(details);
    return {
      text: String(source.text ?? ''),
      photos: cloneAttachmentList(source.photos),
      videos: cloneAttachmentList(source.videos),
    };
  }

  function hasRunDetails(details = {}) {
    const normalized = normalizeRunDetails(details);
    return normalized.text.length > 0
      || normalized.photos.length > 0
      || normalized.videos.length > 0;
  }

  function runDetailsPhotoCount(details = {}) {
    return normalizeRunDetails(details).photos.length;
  }

  function runDetailsVideoCount(details = {}) {
    return normalizeRunDetails(details).videos.length;
  }

  window.TakeoffRunDetails = {
    normalizeRunDetails,
    hasRunDetails,
    runDetailsPhotoCount,
    runDetailsVideoCount,
  };
})();
