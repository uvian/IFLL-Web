/*
 * IFLL — Settings storage wrapper
 */
const IFLL_STORAGE = (() => {
  const DEFAULTS = {
    enabled: true,
    defaultMode: 'replace',
    siteModes: {},
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    excludedSites: [],
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    apiModel: 'deepseek-chat',
    voiceName: '',
    voiceRate: 0.85,
    reviewQueue: [],
    userWords: [],
    phraseMap: {},               // { "做出决定": "make a decision", ... }
    tooltipTheme: 'auto',        // 'auto' | 'light' | 'dark'
    dailyWordCount: 15,          // new words per day (user-settable)
    dailyWords: [],              // today's selected words: [{ zh, en, addedAt }]
    dailyWordDate: '',           // ISO date when daily words were selected
    dailyStats: {
      date: '',
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

  async function getModeForHost(hostname) {
    const { siteModes, defaultMode } = await get();
    return siteModes[hostname] || defaultMode;
  }

  async function setModeForHost(hostname, mode) {
    const { siteModes } = await get();
    siteModes[hostname] = mode;
    await set({ siteModes });
  }

  /* ── Daily word selection ── */
  /* Get today's target words. If date changed, selects new batch. */
  async function getDailyWords() {
    const s = await get();
    const today = new Date().toISOString().slice(0, 10);
    const knownSet = new Set(s.knownWords || []);

    if (s.dailyWordDate === today && s.dailyWords?.length) {
      /* Filter out words that were marked as known today */
      return s.dailyWords.filter(w => !knownSet.has(w.zh) && w.zh.length >= 2);
    }

    /* New day — select fresh batch */
    const count = s.dailyWordCount || 15;
    const allWords = buildFullBank(WORD_BANK, s.userWords || []);

    /* Scoring: prefer level-matched, avoid known, prefer longer words */
    const candidates = [];
    for (const [zh, entry] of allWords) {
      if (knownSet.has(zh)) continue;
      if (zh.length < 2) continue;
      let score = 0;
      if (entry.level === s.level || entry.level === 'all') score += 10;
      if (entry.cat && ['verb', 'noun', 'adj'].includes(entry.cat)) score += 8;
      if (zh.length >= 3) score += 5;
      score += Math.random() * 5; // some randomness for variety
      candidates.push({ zh, en: entry.en, entry, score });
    }
    candidates.sort((a, b) => b.score - a.score);

    const selected = candidates.slice(0, count).map(c => ({
      zh: c.zh, en: c.en, addedAt: Date.now()
    }));

    await set({ dailyWords: selected, dailyWordDate: today });
    return selected;
  }

  /* Reload daily words if they were already loaded for today */
  async function ensureDailyWords() {
    const s = await get();
    const today = new Date().toISOString().slice(0, 10);
    if (s.dailyWordDate !== today) {
      return await getDailyWords();
    }
    const knownSet = new Set(s.knownWords || []);
    return (s.dailyWords || []).filter(w => !knownSet.has(w.zh) && w.zh.length >= 2);
  }

  /* ── Phrase map ── */
  async function addPhrase(zh, en) {
    const { phraseMap } = await get();
    phraseMap[zh] = en;
    await set({ phraseMap });
  }

  async function getPhraseMap() {
    const { phraseMap } = await get();
    return phraseMap || {};
  }

  /* ── Review ── */
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
      zh, en, addedAt: Date.now(), reviewCount: 0,
      nextReview: Date.now() + 86400000, ease: 2.5
    });
    await set({ reviewQueue });
  }

  async function scoreReview(zh, score) {
    const { reviewQueue } = await get();
    const item = reviewQueue.find(w => w.zh === zh);
    if (!item) return;
    const easeAdj = { 4: 0.3, 3: 0.1, 2: -0.2, 1: -0.3 }[score] || 0;
    item.ease = Math.max(1.3, (item.ease || 2.5) + easeAdj);
    if (score < 3) {
      item.reviewCount = 0;
      item.nextReview = Date.now() + 86400000;
    } else {
      item.reviewCount += 1;
      const intervals = [1, 3, 7, 14, 30, 90, 180, 365];
      const idx = Math.min(item.reviewCount, intervals.length - 1);
      const intervalDays = Math.round(intervals[idx] * item.ease / 2.5);
      item.nextReview = Date.now() + Math.min(365, Math.max(1, intervalDays)) * 86400000;
    }
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

  /* ── AI cache (chrome.storage.local — 10MB, no sync quota impact) ── */
  async function getAiCache() {
    const data = await chrome.storage.local.get('aiCache');
    return data.aiCache || {};
  }

  async function getAiCacheEntry(en) {
    const cache = await getAiCache();
    return cache[en] || null;
  }

  async function setAiCacheEntry(en, data) {
    const cache = await getAiCache();
    cache[en] = data;
    await chrome.storage.local.set({ aiCache: cache });
  }

  /* ── Stats ── */
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

  return {
    get, set, getModeForHost, setModeForHost,
    getDailyWords, ensureDailyWords, addPhrase, getPhraseMap,
    markKnown, markUnknown, addToReview, scoreReview, getReviewCount, addUserWord,
    getAiCache, getAiCacheEntry, setAiCacheEntry,
    trackStat, buildFullBank, DEFAULTS
  };
})();
