/*
 * IFLL — Content Script
 * Entry point: runs on every page
 * Handles: initial injection, settings-change re-injection, AI enhancement
 */
(async () => {
  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;

    const hostname = window.location.hostname;
    if (settings.excludedSites && settings.excludedSites.some(s => hostname.includes(s))) return;

    const delay = document.readyState === 'complete' ? 100 : 500;
    setTimeout(() => { IFLL_INJECTOR.init(); }, delay);
  }

  /* ---- Listen for settings changes ---- */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IFLL_SETTINGS_CHANGED') {
      if (message.settings.enabled === false) { IFLL_INJECTOR.destroy(); return; }
      if (message.settings.excludedSites) {
        const hostname = window.location.hostname;
        if (message.settings.excludedSites.some(s => hostname.includes(s))) {
          IFLL_INJECTOR.destroy();
          return;
        }
      }
      IFLL_INJECTOR.destroy();
      IFLL_INJECTOR.init();
    }
  });

  init();
})();
