/*
 * IFLL — Content Script
 * Entry point: runs on every page, activates on Chinese content
 */
(async () => {
  /* Only activate on pages with Chinese content */
  const htmlLang = document.documentElement.lang || '';
  if (htmlLang.startsWith('en') || htmlLang.startsWith('ja') || htmlLang.startsWith('ko')) {
    // Skip English/Japanese/Korean-only pages
    // But still activate if the page has significant Chinese text
  }

  const settings = await IFLL_STORAGE.get();
  if (!settings.enabled) return;

  /* Wait a moment for DOM to settle, then inject */
  const delay = document.readyState === 'complete' ? 100 : 500;
  setTimeout(() => {
    IFLL_INJECTOR.init();
  }, delay);
})();
