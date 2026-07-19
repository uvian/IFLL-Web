/* IFLL — Settings storage wrapper */
const IFLL_STORAGE = (() => {
  const DEFAULTS = {
    enabled: true,
    frequency: 'medium',   // low | medium | high
    level: 'cet4',         // cet4 | cet6 | ielts | graduate
    knownWords: [],        // array of Chinese strings user marked "known"
    apiKey: ''             // optional OpenAI-compatible API key
  };

  async function get() {
    const data = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...data };
  }

  async function set(partial) {
    await chrome.storage.sync.set(partial);
  }

  /* Mark a word as known → it won't be replaced again */
  async function markKnown(zh) {
    const { knownWords } = await get();
    if (!knownWords.includes(zh)) {
      knownWords.push(zh);
      await set({ knownWords });
    }
  }

  async function markUnknown(zh) {
    let { knownWords } = await get();
    knownWords = knownWords.filter(w => w !== zh);
    await set({ knownWords });
  }

  return { get, set, markKnown, markUnknown, DEFAULTS };
})();
