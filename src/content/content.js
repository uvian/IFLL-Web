/*
 * IFLL — Content Script
 * Entry point: runs on every page, activates on Chinese content
 * Handles: initial injection, settings-change re-injection, lifecycle
 */
(async () => {
  /* ---- Initial injection ---- */
  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;
    const delay = document.readyState === 'complete' ? 100 : 500;
    setTimeout(() => {
      IFLL_INJECTOR.init();
    }, delay);
  }

  /* ---- Listen for settings changes from the popup ---- */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IFLL_SETTINGS_CHANGED') {
      const changed = message.settings;

      /* If user just disabled the extension, destroy everything */
      if (changed.enabled === false) {
        IFLL_INJECTOR.destroy();
        return;
      }

      /* If user just enabled it, inject fresh */
      if (changed.enabled === true) {
        IFLL_INJECTOR.destroy();
        IFLL_INJECTOR.init();
        return;
      }

      /* For frequency/level changes, re-inject without full destroy
         (just update settings and let MutationObserver handle it) */
      IFLL_INJECTOR.destroy();
      IFLL_INJECTOR.init();
    }
  });

  /* ---- Go ---- */
  init();
})();
