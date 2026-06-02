(function () {
  const STORAGE_KEY = 'takeoff.pathTemplates.v1';

  function browserStorage() {
    try {
      return window.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function createPathTemplateStore(options = {}) {
    const pathTemplates = options.pathTemplates || window.TakeoffPathTemplates;
    const storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : browserStorage();
    const key = options.key || STORAGE_KEY;

    function defaultState() {
      return pathTemplates.createInitialPathTemplateState();
    }

    function load() {
      if (!storage || typeof storage.getItem !== 'function') return defaultState();
      try {
        const raw = storage.getItem(key);
        if (!raw) return defaultState();
        return pathTemplates.normalizePathTemplateState(JSON.parse(raw));
      } catch (_) {
        return defaultState();
      }
    }

    function save(state) {
      if (!storage || typeof storage.setItem !== 'function') return false;
      try {
        storage.setItem(key, JSON.stringify(pathTemplates.normalizePathTemplateState(state)));
        return true;
      } catch (_) {
        return false;
      }
    }

    function clear() {
      if (!storage || typeof storage.removeItem !== 'function') return false;
      try {
        storage.removeItem(key);
        return true;
      } catch (_) {
        return false;
      }
    }

    return { load, save, clear };
  }

  window.TakeoffPathTemplateStore = {
    STORAGE_KEY,
    createPathTemplateStore,
  };
})();
