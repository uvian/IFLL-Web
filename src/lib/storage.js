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
    apiModel: 'deepseek-chat',
    voiceName: '',         // '' = browser default
    voiceRate: 0.85,       // speech rate
    /* Review queue */
    reviewQueue: [],     // { zh, en, addedAt, reviewCount, nextReview }
    /* User-added words (web discovery) */
    userWords: []        // { zh, en, def, cat, pos, pos_cn, example, example_cn }
  };

  async function get() {
    const data = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...data };
  }

  async function set(partial) {
    await chrome.storage.sync.set(partial);
  }

  async function markKnown(zh) {
    const { knownWords, reviewQueue } = await get();
    if (!knownWords.includes(zh)) { knownWords.push(zh); await set({ knownWords }); }
    // Remove from review queue if present
    const filtered = reviewQueue.filter(w => w.zh !== zh);
    if (filtered.length !== reviewQueue.length) await set({ reviewQueue: filtered });
  }

  async function markUnknown(zh) {
    let { knownWords } = await get();
    knownWords = knownWords.filter(w => w !== zh);
    await set({ knownWords });
  }

  /* Add to review queue */
  async function addToReview(zh, en) {
    const { reviewQueue } = await get();
    if (reviewQueue.some(w => w.zh === zh)) return;
    reviewQueue.push({
      zh, en,
      addedAt: Date.now(),
      reviewCount: 0,
      nextReview: Date.now() + 86400000  // next day
    });
    await set({ reviewQueue });
  }

  async function getReviewCount() {
    const { reviewQueue } = await get();
    return reviewQueue.filter(w => w.nextReview <= Date.now()).length;
  }

  /* Add user-discovered word */
  async function addUserWord(entry) {
    const { userWords } = await get();
    if (userWords.some(w => w.zh === entry.zh)) return false;
    userWords.push(entry);
    await set({ userWords });
    return true;
  }

  /* Merge user words into the runtime word bank map */
  function buildFullBank(wordBank, userWords) {
    const map = new Map(WORD_BANK_MAP);
    for (const uw of userWords) {
      if (!map.has(uw.zh)) map.set(uw.zh, uw);
    }
    return map;
  }

  return { get, set, markKnown, markUnknown, addToReview, getReviewCount, addUserWord, buildFullBank, DEFAULTS };
})();
