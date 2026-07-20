/*
 * IFLL — Settings storage wrapper
 */
const IFLL_STORAGE = (() => {
  const DEFAULTS = {
    enabled: true,
    defaultMode: 'replace',     // 'replace' | 'annotate' | 'translate' | 'off'
    siteModes: {},              // { "example.com": "replace" | "annotate" | "translate" | "off" }
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    excludedSites: [],
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    apiModel: 'deepseek-chat',
    voiceName: '',              // '' = browser default
    voiceRate: 0.85,
    reviewQueue: [],
    userWords: [],
    dailyStats: {               // per-day learning stats
      date: '',                 // ISO date string
      replaceCount: 0,
      annotateCount: 0,
      translateChars: 0,
      totalLearned: 0
    }
  };

  async function get() {
    const data = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...data };
  }

  async function set(partial) {
    await chrome.storage.sync.set(partial);
  }

  /* Get the effective mode for a hostname */
  async function getModeForHost(hostname) {
    const { siteModes, defaultMode } = await get();
    return siteModes[hostname] || defaultMode;
  }

  /* Set mode for a specific hostname */
  async function setModeForHost(hostname, mode) {
    const { siteModes } = await get();
    siteModes[hostname] = mode;
    await set({ siteModes });
  }

  async function markKnown(zh) {
    const { knownWords, reviewQueue } = await get();
    if (!knownWords.includes(zh)) { knownWords.push(zh); await set({ knownWords }); }
    const filtered = reviewQueue.filter(w => w.zh !== zh);
    if (filtered.length !== reviewQueue.length) await set({ reviewQueue: filtered });
  }

  async function markUnknown(zh) {
    let { knownWords } = await get();
    knownWords = knownWords.filter(w => w !== zh);
    await set({ knownWords });
  }

  async function addToReview(zh, en) {
    const { reviewQueue } = await get();
    if (reviewQueue.some(w => w.zh === zh)) return;
    reviewQueue.push({
      zh, en,
      addedAt: Date.now(),
      reviewCount: 0,
      nextReview: Date.now() + 86400000,
      ease: 2.5
    });
    await set({ reviewQueue });
  }

  /* SM-2 review scoring */
  async function scoreReview(zh, score) {
    const { reviewQueue } = await get();
    const item = reviewQueue.find(w => w.zh === zh);
    if (!item) return;
    const easeMap = { 4: 2.5, 3: 2.0, 2: 1.2, 1: 0 };
    const intervalMultiplier = easeMap[score] || 2.0;
    item.reviewCount += 1;
    item.ease = Math.max(1.3, (item.ease || 2.5) + (0.1 - (score < 3 ? 0.5 : 0)));
    const baseInterval = score === 1 ? 1 : (item.reviewCount === 1 ? 1 : item.reviewCount === 2 ? 3 : item.reviewCount * item.ease);
    const intervalDays = Math.min(365, Math.max(1, Math.round(baseInterval * intervalMultiplier)));
    item.nextReview = Date.now() + intervalDays * 86400000;
    await set({ reviewQueue });
  }

  async function getReviewCount() {
    const { reviewQueue } = await get();
    return reviewQueue.filter(w => w.nextReview <= Date.now()).length;
  }

  async function addUserWord(entry) {
    const { userWords } = await get();
    if (userWords.some(w => w.zh === entry.zh)) return false;
    userWords.push(entry);
    await set({ userWords });
    return true;
  }

  /* Track daily learning */
  async function trackStat(type, count = 1) {
    const { dailyStats } = await get();
    const today = new Date().toISOString().slice(0, 10);
    if (dailyStats.date !== today) {
      dailyStats.date = today;
      dailyStats.replaceCount = 0;
      dailyStats.annotateCount = 0;
      dailyStats.translateChars = 0;
      dailyStats.totalLearned = 0;
    }
    if (type === 'replace') dailyStats.replaceCount += count;
    else if (type === 'annotate') dailyStats.annotateCount += count;
    else if (type === 'translate') dailyStats.translateChars += count;
    dailyStats.totalLearned = dailyStats.replaceCount + dailyStats.annotateCount;
    await set({ dailyStats });
  }

  function buildFullBank(wordBank, userWords) {
    const map = new Map(WORD_BANK_MAP);
    for (const uw of userWords) {
      if (!map.has(uw.zh)) map.set(uw.zh, uw);
    }
    return map;
  }

  return { get, set, getModeForHost, setModeForHost, markKnown, markUnknown,
           addToReview, scoreReview, getReviewCount, addUserWord, trackStat,
           buildFullBank, DEFAULTS };
})();
