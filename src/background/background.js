/*
 * IFLL — Background Service Worker
 * Handles settings-change messages from popup and tab activation
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFLL_SETTINGS_CHANGED') {
    // Relay to all tabs in the same window (handled per-tab)
    return false;
  }
});

/* On install/update, set defaults */
chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    enabled: true,
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    apiKey: ''
  };
  await chrome.storage.sync.set(defaults);
});
