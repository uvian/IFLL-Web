/*
 * IFLL — Settings storage wrapper
 */
const IFLL_STORAGE = (() => {
  const DEFAULTS = {
    enabled: true,
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    excludedSites: [],
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    apiModel: 'deepseek-chat'
  };

  async function get() {
    const data = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...data };
  }

  async function set(partial) {
    await chrome.storage.sync.set(partial);
  }

  async function markKnown(zh) {
    const { knownWords } = await get();
    if (!knownWords.includes(zh)) { knownWords.push(zh); await set({ knownWords }); }
  }

  async function markUnknown(zh) {
    let { knownWords } = await get();
    knownWords = knownWords.filter(w => w !== zh);
    await set({ knownWords });
  }

  return { get, set, markKnown, markUnknown, DEFAULTS };
})();
