/* IFLL — Word injector engine */
const IFLL_INJECTOR = (() => {
  const POS_LABEL = { verb: 'v.', noun: 'n.', adjective: 'adj.', adverb: 'adv.', conjunction: 'conj.' };
  function posLabel(pos) { return POS_LABEL[pos] || pos + '.'; }
  const SKIP_SINGLE = new Set([
    '的','了','是','在','和','就','都','而','及','等','与','或','被','把',
    '对','从','向','到','让','上','下','中','也','不','这','那','人','我','他','她','们',
    '一','二','三','四','五','六','七','八','九','十','百','千','万','亿',
    '个','只','条','种','些','点','几','何','吗','呢','吧','啊','哦','嗯',
    '又','再','还','已','曾','刚','才','正','在','将','要','会','能','可',
    '以','为','之','其','所','者','被','于','与','因','但','若','虽','然'
  ]);


  /* ── Theme detection ── */
  async function applyTooltipTheme(el) {
    const s = await IFLL_STORAGE.get();
    let theme = s.tooltipTheme || 'auto';
    if (theme === 'auto') {
      /* Check page background darkness */
      const bg = getComputedStyle(document.body).backgroundColor;
      const isPageDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        || document.documentElement.getAttribute('data-theme') === 'dark'
        || document.documentElement.classList.contains('dark')
        || isDarkColor(bg);
      theme = isPageDark ? 'dark' : 'light';
    }
    el.classList.toggle('ifll-dark', theme === 'dark');
  }

  function isDarkColor(rgb) {
    const m = rgb.match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }

  /* ---- Config ---- */
  function getReplaceCount(frequency, textLen) {
    const ratios = { low: 0.001, medium: 0.003, high: 0.008 };
    const raw = Math.round(textLen * (ratios[frequency] || ratios.medium));
    return Math.max(frequency === 'high' ? 2 : 1, Math.min(3, raw));
  }

  function getLevelWeight(lvl) {
    const w = { all: 0, daily: 1, cet4: 2, cet6: 3, ielts: 4, graduate: 5 };
    return w[lvl] || 99;
  }

  /* ---- Aho-Corasick Automaton ---- */
  class AhoCorasick {
    constructor() { this.nodes = [{ children: {}, output: [], fail: 0 }]; }
    addWord(zh, entry) {
      let idx = 0;
      for (const ch of zh) {
        if (!this.nodes[idx].children[ch]) {
          this.nodes[idx].children[ch] = this.nodes.length;
          this.nodes.push({ children: {}, output: [], fail: 0 });
        }
        idx = this.nodes[idx].children[ch];
      }
      this.nodes[idx].output.push(entry);
    }
    build() {
      const q = [];
      for (const ch in this.nodes[0].children) {
        const child = this.nodes[0].children[ch];
        this.nodes[child].fail = 0;
        q.push(child);
      }
      while (q.length) {
        const r = q.shift();
        for (const ch in this.nodes[r].children) {
          const child = this.nodes[r].children[ch];
          let f = this.nodes[r].fail;
          while (f !== 0 && !this.nodes[f].children[ch]) f = this.nodes[f].fail;
          this.nodes[child].fail = this.nodes[f].children[ch] || 0;
          this.nodes[child].output = [...this.nodes[child].output, ...this.nodes[this.nodes[child].fail].output];
          q.push(child);
        }
      }
    }
    search(text, knownSet, level, skipSet) {
      const matches = [];
      let nodeIdx = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        while (nodeIdx !== 0 && !this.nodes[nodeIdx].children[ch]) nodeIdx = this.nodes[nodeIdx].fail;
        if (this.nodes[nodeIdx].children[ch]) nodeIdx = this.nodes[nodeIdx].children[ch];
        if (this.nodes[nodeIdx].output.length) {
          for (const entry of this.nodes[nodeIdx].output) {
            if (knownSet.has(entry.zh)) continue;
            if (entry.level !== 'all' && getLevelWeight(entry.level) > getLevelWeight(level)) continue;
            if (entry.zh.length === 1) {
              if (skipSet.has(entry.zh)) continue;
              const prev = i - entry.zh.length + 1 > 0 ? text[i - entry.zh.length] : ' ';
              const next = i + 1 < text.length ? text[i + 1] : ' ';
              if (/[\u4e00-\u9fff]/.test(prev) && /[\u4e00-\u9fff]/.test(next)) continue;
            }
            const idx = i - entry.zh.length + 1;
            const end = i + 1;
            if (matches.length && matches[matches.length - 1].zh.length > entry.zh.length &&
                matches[matches.length - 1].idx <= idx && matches[matches.length - 1].end >= end) continue;
            matches.push({
              zh: entry.zh, en: entry.en, def: entry.def || entry.en,
              pos: entry.pos || 'noun', posCn: entry.pos_cn || '名词',
              examples: entry.examples || (entry.example ? [entry.example] : []),
              examplesCn: entry.examplesCn || (entry.example_cn ? [entry.example_cn] : []),
              ipa: entry.ipa || '', level: entry.level, cat: entry.cat || '',
              idx, end, len: entry.zh.length
            });
          }
        }
      }
      const filtered = [];
      matches.sort((a, b) => a.idx - b.idx || b.len - a.len);
      for (const m of matches) {
        if (filtered.length > 0) {
          const last = filtered[filtered.length - 1];
          if (last.idx <= m.idx && last.end >= m.end && last.len >= m.len) continue;
          if (last.idx === m.idx) continue;
        }
        filtered.push(m);
      }
      return filtered;
    }
  }

  let ahoCache = null;
  function getAutomaton(settings) {
    if (ahoCache) return ahoCache;
    const ac = new AhoCorasick();
    const bankMap = IFLL_STORAGE.buildFullBank(WORD_BANK, settings?.userWords || []);
    for (const [zh, entry] of bankMap) { ac.addWord(zh, entry); }
    ac.build();
    ahoCache = ac;
    return ac;
  }
  function invalidateAhoCache() { ahoCache = null; }

  /* ── Review queue memory cache (avoids chrome.storage read on every tooltip click) ── */
  let reviewQueueCache = null;
  async function getReviewQueueCached() {
    if (reviewQueueCache) return reviewQueueCache;
    const { reviewQueue } = await IFLL_STORAGE.get();
    reviewQueueCache = reviewQueue;
    return reviewQueueCache;
  }
  function invalidateReviewCache() { reviewQueueCache = null; }

  /* ---- Matching ---- */
  function findMatches(text, bankMap, knownSet, level) {
    const ac = ahoCache || getAutomaton();
    return ac.search(text, knownSet, level, SKIP_SINGLE);
  }

  /* ---- Scene detection ---- */
  const SCENE_KEYS = {
    social:   ['daily', 'verb', 'adj', 'adv', 'emotion'],
    academic: ['abstract', 'academic', 'graduate', 'noun', 'cet6'],
    tech:     ['tech', 'cet6', 'verb', 'noun'],
    general:  []
  };
  function detectScene() {
    const host = window.location.hostname;
    if (/zhihu|weibo|bilibili|douban|xiaohongshu|tieba|reddit|quora/i.test(host)) return 'social';
    if (/github|stackoverflow|stackexchange|npmjs|pypi|docs\.\w+\.|developer\./i.test(host)) return 'tech';
    if (/arxiv|scholar\.google|cnki|researchgate|acm|ieee/i.test(host)) return 'academic';
    if (/news\.|\.news|sina\.com\.cn|163\.com|thepaper|bbc|cnn/i.test(host)) return 'general';
    const type = document.querySelector('meta[property="og:type"]')?.content || '';
    if (/article|news/.test(type)) return 'general';
    if (/website|blog/.test(type)) return 'social';
    if (document.body) {
      const s = (document.body.textContent || '').slice(0, 6000);
      const tech = (s.match(/algorithm|function|class|import|export|api|git|代码|编程|程序/gi) || []).length;
      const acad = (s.match(/research|study|analysis|theory|equation|实验|研究|论文|理论/gi) || []).length;
      if (tech > 5) return 'tech';
      if (acad > 5) return 'academic';
    }
    return 'general';
  }

  /* ---- Selection ---- */
  function selectMatches(matches, count, scene) {
    if (matches.length <= count) return matches;
    const sceneCats = SCENE_KEYS[scene] || [];
    /* Score on parallel array, sort indices — avoids deep-copying all match objects */
    const scores = matches.map(m => (m.len >= 2 ? 10 : 0) + (sceneCats.includes(m.cat) ? 5 : 0) + (sceneCats.includes(m.pos) ? 2 : 0));
    const idx = Array.from({ length: matches.length }, (_, i) => i);
    idx.sort((a, b) => scores[b] - scores[a]);
    const selected = [];
    let lastEnd = -1;
    for (const i of idx) {
      if (selected.length >= count) break;
      const m = matches[i];
      if (m.idx >= lastEnd + 5) { selected.push(m); lastEnd = m.end; }
    }
    if (selected.length < count) {
      for (const i of idx) {
        if (selected.length >= count) break;
        const m = matches[i];
        if (!selected.includes(m)) selected.push(m);
      }
    }
    return selected;
  }

  /* ---- Replace text node ---- */
  function replaceInTextNode(node, matches, dailyWordSet) {
    if (!matches.length || !node.parentNode) return;
    const sorted = [...matches].sort((a, b) => b.idx - a.idx);
    let text = node.textContent;
    const fragment = document.createDocumentFragment();
    let lastEnd = text.length;
    for (const m of sorted) {
      const after = text.slice(m.end, lastEnd);
      const span = document.createElement('span');
      span.className = dailyWordSet && dailyWordSet.has(m.zh) ? 'ifll-word ifll-word-daily' : 'ifll-word';
      span.dataset.en = m.en; span.dataset.zh = m.zh; span.dataset.def = m.def;
      span.dataset.pos = m.pos; span.dataset.posCn = m.posCn;
      span.dataset.examples = JSON.stringify(m.examples);
      span.dataset.examplesCn = JSON.stringify(m.examplesCn);
      span.dataset.ipa = m.ipa || '';
      span.textContent = m.en;
      const wrapper = document.createElement('span');
      wrapper.className = 'ifll-replaced';
      wrapper.appendChild(span);
      if (after) wrapper.appendChild(document.createTextNode(after));
      lastEnd = m.idx;
      text = text.slice(0, m.idx);
      fragment.appendChild(wrapper);
    }
    if (lastEnd > 0) fragment.insertBefore(document.createTextNode(text), fragment.firstChild);
    node.parentNode.replaceChild(fragment, node);
  }

  /* ---- Annotate mode: word-based lookup (English→Chinese) ---- */
  let enWordBank = null;
  function getEnWordBank() {
    if (enWordBank) return enWordBank;
    enWordBank = new Map();
    const dict = IFLL_STORAGE.buildFullBank(WORD_BANK, []);
    for (const [zh, entry] of dict) {
      const en = entry.en?.toLowerCase();
      if (en && !enWordBank.has(en)) enWordBank.set(en, { ...entry, zh });
    }
    return enWordBank;
  }

  function injectAnnotate(settings) {
    const hostname = window.location.hostname;
    if (!document.body) return;
    if (settings?.excludedSites?.some(s => hostname === s || hostname.endsWith('.' + s))) return;
    const bank = getEnWordBank();
    if (!bank.size) return; // word bank not loaded
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest?.('.ifll-annotated,.ifll-word,.ifll-tooltip,script,style,noscript,code,pre,[contenteditable]')) continue;
      if (node.parentElement?.closest?.('a')) continue;
      const text = node.textContent;
      /* Only process nodes with English words (≥2 letters) */
      if (!/[a-zA-Z]{3,}/.test(text)) continue;
      nodes.push(node);
    }

    let annotateCount = 0;
    for (const tn of nodes) {
      const text = tn.textContent;
      const words = text.split(/\b/);
      if (words.length < 3) continue;
      let modified = false;
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[^a-z-]/g, '');
        const entry = word.length >= 3 ? bank.get(word) : null;
        if (entry && annotateCount < 80) {
          const span = document.createElement('span');
          span.className = 'ifll-annotated';
          span.dataset.en = entry.en;
          span.dataset.zh = entry.zh;
          span.dataset.def = entry.def || entry.en;
          span.dataset.pos = entry.pos || 'noun';
          span.dataset.posCn = entry.pos_cn || '名词';
          span.dataset.examples = '[]';
          span.dataset.examplesCn = '[]';
          span.dataset.ipa = entry.ipa || '';
          span.textContent = words[i];
          span.title = entry.zh;
          fragment.appendChild(span);
          annotateCount++;
          modified = true;
        } else {
          fragment.appendChild(document.createTextNode(words[i]));
        }
      }
      if (modified) tn.parentNode.replaceChild(fragment, tn);
    }
    IFLL_STORAGE.trackStat('annotate', annotateCount).catch(() => {});
  }

  /* ---- Translate mode: paragraph-level AI translation ---- */
  let translateCache = new Map();
  const TRANSLATE_CACHE_MAX = 200;
  const AI_EXAMPLES_CACHE_TTL = 30 * 86400000; // 30 days
  function injectTranslate(settings) {
    const hostname = window.location.hostname;
    if (settings?.excludedSites?.some(s => hostname === s || hostname.endsWith('.' + s))) return;
    if (!settings.apiKey) {
      /* Show hint once if no API key */
      if (!document.querySelector('.ifll-tt-hint')) {
        const hint = document.createElement('div');
        hint.className = 'ifll-tt-hint';
        hint.textContent = '对比翻译需要配置 AI API Key (IFLL 弹窗 → AI 增强)';
        hint.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#fff3cd;color:#856404;padding:10px 16px;border-radius:8px;font-size:13px;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:300px;';
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 8000);
      }
      return;
    }
    /* Find paragraphs */
    const paragraphs = document.querySelectorAll('p, li, blockquote, .article-content > div, [class*="content"] > p, [class*="article"] > p');
    let translated = 0;
    paragraphs.forEach(async (p) => {
      if (p.querySelector('.ifll-trans-panel') || p.textContent.trim().length < 20) return;
      const text = p.textContent.trim();
      const key = text.slice(0, 80);
      if (translateCache.has(key)) {
        const panel = createTranslatePanel(translateCache.get(key));
        p.after(panel);
        translated++;
        IFLL_STORAGE.trackStat('translate', text.length).catch(() => {});
        return;
      }
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'IFLL_AI_TRANSLATE',
          text,
          apiKey: settings.apiKey,
          apiEndpoint: settings.apiEndpoint,
          apiModel: settings.apiModel
        });
        if (result?.success && result.translation) {
          translateCache.set(key, result.translation);
          if (translateCache.size > TRANSLATE_CACHE_MAX) {
            translateCache.delete(translateCache.keys().next().value);
          }
          const panel = createTranslatePanel(result.translation);
          p.after(panel);
          translated++;
          IFLL_STORAGE.trackStat('translate', text.length).catch(() => {});
        }
      } catch (_) {}
    });
  }

  function createTranslatePanel(text) {
    const div = document.createElement('div');
    div.className = 'ifll-tt-sentence';
    div.textContent = text;
    return div;
  }

  /* ── Annotate individual words within a text string (for sentence translation) ── */
  function annotateWords(container, text, bank) {
    const words = text.split(/\b/);
    for (const chunk of words) {
      const cleaned = chunk.toLowerCase().replace(/[^a-z-]/g, '');
      const entry = cleaned.length >= 2 ? bank.get(cleaned) : null;
      if (entry) {
        const s = document.createElement('span');
        s.className = 'ifll-annotated';
        s.dataset.en = entry.en; s.dataset.zh = entry.zh; s.dataset.def = entry.def || entry.en;
        s.dataset.pos = entry.pos || 'noun'; s.dataset.posCn = entry.pos_cn || '名词';
        s.dataset.ipa = entry.ipa || ''; s.dataset.examples = '[]'; s.dataset.examplesCn = '[]';
        s.textContent = chunk; s.title = entry.zh;
        container.appendChild(s);
      } else {
        container.appendChild(document.createTextNode(chunk));
      }
    }
  }

  /* ── Translate a single text node (A: sentence-level fallback) ── */
  async function translateTextNode(node, text, settings) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'IFLL_AI_TRANSLATE',
        text,
        apiKey: settings.apiKey,
        apiEndpoint: settings.apiEndpoint,
        apiModel: settings.apiModel
      });
      if (result?.success && result.translation) {
        const wrapper = document.createElement('span');
        wrapper.className = 'ifll-replaced ifll-replaced-smooth';
        const inner = document.createElement('span');
        inner.className = 'ifll-word';
        /* Annotate individual words from the translated sentence */
        annotateWords(inner, result.translation, getEnWordBank());
        wrapper.appendChild(inner);
        node.parentNode.replaceChild(wrapper, node);
      }
    } catch (_) {}
  }

  /* ---- Skip helpers ---- */
  function shouldSkip(node) {
    if (!node.parentElement) return true;
    return ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION',
      'IFRAME','SVG','CODE','PRE','CANVAS'].includes(node.parentElement.tagName);
  }
  function shouldSkipAncestor(node) {
    let el = node.parentElement;
    while (el) {
      if (el.classList?.contains('ifll-word') || el.classList?.contains('ifll-replaced')) return true;
      if (el.closest?.('script,style,noscript,textarea,input,select,option,iframe,svg,code,pre,canvas,.ifll-word,.ifll-replaced,.ifll-tooltip,[contenteditable]')) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* ---- Main inject (replace mode) ---- */
  async function injectReplace(root, settings) {
    if (!settings?.enabled) return;
    const { frequency, level, knownWords, excludedSites } = settings;
    const hostname = window.location.hostname;
    if (excludedSites?.some(s => hostname === s || hostname.endsWith('.' + s))) return;
    const knownSet = new Set(knownWords);
    getAutomaton(settings);
    const scene = detectScene();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest?.('.ifll-replaced')) continue;
      if (!/[\u4e00-\u9fff]/.test(node.textContent)) continue;
      if (shouldSkip(node) || shouldSkipAncestor(node)) continue;
      textNodes.push(node);
    }
    let totalReplaced = 0;

    /* ── Phrase matching (collocation priority) ── */
    const phraseMap = await IFLL_STORAGE.getPhraseMap();
    const dailyWordSet = new Set((await IFLL_STORAGE.ensureDailyWords()).map(w => w.zh));

    for (const tn of textNodes) {
      let text = tn.textContent;

      /* 1. Phrase-level replacement first */
      let phraseReplaced = false;
      for (const [zhPhrase, enPhrase] of Object.entries(phraseMap)) {
        if (text.includes(zhPhrase)) {
          const idx = text.indexOf(zhPhrase);
          const before = text.slice(0, idx);
          const after = text.slice(idx + zhPhrase.length);
          const span = document.createElement('span');
          span.className = 'ifll-word ifll-word-phrase';
          span.dataset.en = enPhrase;
          span.dataset.zh = zhPhrase;
          span.dataset.def = enPhrase;
          span.dataset.pos = 'phrase';
          span.dataset.posCn = '搭配';
          span.dataset.ipa = '';
          span.dataset.examples = '[]';
          span.dataset.examplesCn = '[]';
          span.textContent = enPhrase;
          const frag = document.createDocumentFragment();
          if (before) frag.appendChild(document.createTextNode(before));
          const wrapper = document.createElement('span');
          wrapper.className = 'ifll-replaced';
          wrapper.appendChild(span);
          if (after) wrapper.appendChild(document.createTextNode(after));
          frag.appendChild(wrapper);
          tn.parentNode.replaceChild(frag, tn);
          phraseReplaced = true;
          totalReplaced++;
          break; // one phrase per node to avoid complexity
        }
      }
      if (phraseReplaced) continue;

      /* 2. Word-level replacement */
      if (!/[\u4e00-\u9fff]/.test(text)) continue;
      const matches = findMatches(text, null, knownSet, level);
      if (!matches.length) continue;
      const count = getReplaceCount(frequency, text.length);
      const selected = selectMatches(matches, count, scene);
      if (!selected.length) continue;

      /* ── Fragment detection: if multiple replacements would fracture the sentence,
             fall back to full-sentence translation (A) or phrase-first (C) ── */
      if (selected.length >= 2) {
        let fragments = 0;
        for (let i = 1; i < selected.length; i++) {
          const gap = text.slice(selected[i-1].end, selected[i].idx);
          if (gap.length < 5 && /[的地得了着过和与在就是都也]/ .test(gap)) fragments++;
        }
        /* If ≥2 short gaps with function words → would read like "today的 weather很好" */
        if (fragments >= 2 && settings.apiKey) {
          await translateTextNode(tn, text, settings);
          totalReplaced++;
          continue;
        }
      }
      replaceInTextNode(tn, selected, dailyWordSet); totalReplaced += selected.length;
    }
    if (totalReplaced > 0) IFLL_STORAGE.trackStat('replace', totalReplaced).catch(() => {});
  }

  /* ---- Tooltip ---- */
  let tooltipEl = null;
  function htmlEncode(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function speakWord(word) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US'; utterance.rate = 0.85; utterance.pitch = 1;
    (async () => {
      const { voiceName } = await IFLL_STORAGE.get();
      if (voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const found = voices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      }
      window.speechSynthesis.speak(utterance);
    })();
  }

  function renderBoldHtml(text) {
    if (!text) return '';
    let result = '', lastIdx = 0, m;
    const regex = /\*\*(.+?)\*\*/g;
    while ((m = regex.exec(text)) !== null) {
      result += htmlEncode(text.slice(lastIdx, m.index));
      result += '<strong class="ifll-tt-bold">' + htmlEncode(m[1]) + '</strong>';
      lastIdx = regex.lastIndex;
    }
    result += htmlEncode(text.slice(lastIdx));
    return result;
  }

  /* ── Combined analysis: streaming via Port, fallback to non-streaming ── */
  async function fetchCombinedAnalysis(en, zh, def) {
    const cacheEntry = await IFLL_STORAGE.getAiCacheEntry(en);
    if (cacheEntry?.deep && cacheEntry?.examples?.length) {
      return { success: true, data: cacheEntry.deep, examples: cacheEntry.examples, cached: true };
    }
    const s = await IFLL_STORAGE.get();
    if (!s.apiKey) return { error: 'no api key' };

    /* Try streaming first (Read Frog pattern: show text as it arrives) */
    try { const r = await fetchStreamViaPort(en, zh, def, s); if (r?.success) return r; } catch (_) {}

    /* Non-streaming fallback with retry (FluentRead pattern) */
    let result = null;
    const retryDelays = [0, 1000, 2000];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, retryDelays[attempt]));
      try {
        result = await Promise.race([
          chrome.runtime.sendMessage({
            type: 'IFLL_AI_COMBINED', en, zh, def,
            apiKey: s.apiKey, apiEndpoint: s.apiEndpoint, apiModel: s.apiModel
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (20s)')), 20000))
        ]);
        if (result && !result.error) break;
      } catch (err) {
        result = { error: err.message };
        if (!err.message?.includes('timeout') && !err.message?.includes('Extension context')) break;
      }
    }
    if (!result || result.error) return { error: (result && result.error) || 'no response' };

    const hasData = result.synonyms?.length || result.antonyms?.length ||
                    result.collocations?.length || result.usage || result.examples?.length;
    if (hasData) {
      const entry = cacheEntry || {};
      entry.deep = { synonyms: result.synonyms, antonyms: result.antonyms, collocations: result.collocations, usage: result.usage };
      entry.deepCachedAt = Date.now();
      entry.examples = result.examples || [];
      entry.examplesCachedAt = Date.now();
      await IFLL_STORAGE.setAiCacheEntry(en, entry);
    }
    return { success: true, data: result, examples: result.examples || [] };
  }

  /* ── Streaming via Port (SW pushes chunks → typing effect → parse at end) ── */
  function fetchStreamViaPort(en, zh, def, s) {
    return new Promise((resolve, reject) => {
      let port;
      try { port = chrome.runtime.connect({ name: 'ifll-stream' }); } catch (e) { return reject(e); }
      let accumulated = '', resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; try { port.disconnect(); } catch (_) {} reject(new Error('stream timeout')); }
      }, 22000);
      port.onMessage.addListener(msg => {
        if (resolved) return;
        if (msg.chunk) {
          accumulated += msg.chunk;
          renderStreamPreview(accumulated);
        } else if (msg.done) {
          clearTimeout(timer); resolved = true;
          try { port.disconnect(); } catch (_) {}
          const parsed = parseJsonClient(accumulated);
          if (parsed) resolve({ success: true, data: parsed, examples: parsed.examples || [], streaming: true });
          else reject(new Error('cannot parse stream'));
        } else if (msg.error) {
          clearTimeout(timer); resolved = true;
          try { port.disconnect(); } catch (_) {}
          reject(new Error(msg.error));
        }
      });
      port.onDisconnect.addListener(() => {
        if (!resolved) { clearTimeout(timer); resolved = true; reject(new Error('port closed')); }
      });
      port.postMessage({ type: 'IFLL_AI_COMBINED', en, zh, def, apiKey: s.apiKey, apiEndpoint: s.apiEndpoint, apiModel: s.apiModel });
    });
  }

  /* Client-side JSON parse (same logic as background.js extractJson) */
  function parseJsonClient(text) {
    if (!text) return null;
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    const fence = cleaned.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
    cleaned = fence ? fence[1].trim() : cleaned.replace(/```\w*\n?/g, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    let depth = 0, end = -1, inString = false, escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end <= start) {
      let json = cleaned.slice(start);
      const missing = (json.match(/{/g) || []).length - (json.match(/}/g) || []).length;
      if (missing > 0 && missing <= 3) { json += '}'.repeat(missing); json = json.replace(/,(\s*[}\]])/g, '$1'); try { return JSON.parse(json); } catch (_) {} }
      return null;
    }
    let json = cleaned.slice(start, end).replace(/,(\s*[}\]])/g, '$1');
    try { return JSON.parse(json); } catch (_) { return null; }
  }

  /* Typing effect: show last ~200 chars of stream as it arrives */
  function renderStreamPreview(text) {
    const area = document.getElementById('ifll-deep-area');
    if (!area) return;
    const preview = text.length > 200 ? text.slice(-200) : text;
    area.innerHTML = `<div class="ifll-tt-deep-streaming">${htmlEncode(preview).replace(/\n/g, '<br>')}<span class="ifll-tt-cursor">▌</span></div>`;
  }

  async function showTooltip(e) {
    const span = e.target.closest('.ifll-word, .ifll-annotated');
    if (!span) return;
    /* If the replacement word is inside a link, prevent navigation so the tooltip can display */
    if (span.closest('a')) { e.preventDefault(); e.stopPropagation(); }
    const rect = span.getBoundingClientRect();
    const en = span.dataset.en, zh = span.dataset.zh;
    const def = htmlEncode(span.dataset.def || en);
    const pos = span.dataset.pos || 'noun', posCn = span.dataset.posCn || '名词';
    const posLatin = posLabel(pos);
    let examples = [], examplesCn = [];
    try { if (span.dataset.examples) examples = JSON.parse(span.dataset.examples); } catch (_) {}
    try { if (span.dataset.examplesCn) examplesCn = JSON.parse(span.dataset.examplesCn); } catch (_) {}
    if (!examples.length && span.dataset.example) { examples = [span.dataset.example]; examplesCn = [span.dataset.exampleCn || '']; }

    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'ifll-tooltip';
      document.body.appendChild(tooltipEl);
      /* Auto-detect page theme for tooltip */
      applyTooltipTheme(tooltipEl);
      tooltipEl.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || btn.disabled) return;
        const wzh = tooltipEl.dataset.zh;
        if (btn.dataset.action === 'known') {
          await IFLL_STORAGE.markKnown(wzh); btn.textContent = '已掌握'; btn.disabled = true;
          document.querySelectorAll(`.ifll-word[data-zh="${wzh}"], .ifll-annotated[data-zh="${wzh}"]`).forEach(el => el.classList.add('ifll-known'));
        } else if (btn.dataset.action === 'unknown') {
          await IFLL_STORAGE.markUnknown(wzh);
          await IFLL_STORAGE.addToReview(wzh, tooltipEl.dataset.en);
          invalidateReviewCache();
          btn.textContent = '加入复习'; btn.disabled = true;
        } else if (btn.dataset.action === 'exclude-site') {
          const h = window.location.hostname;
          const s = await IFLL_STORAGE.get();
          const es = s.excludedSites || [];
          if (!es.includes(h)) { es.push(h); await IFLL_STORAGE.set({ excludedSites: es }); }
          btn.textContent = '✓ 已排除'; btn.disabled = true; IFLL_INJECTOR.destroy();
        } else if (btn.dataset.action === 'add-word') {
          const s = await IFLL_STORAGE.get();
          const added = await IFLL_STORAGE.addUserWord({
            zh: wzh, en: tooltipEl.dataset.en, def: span.dataset.def || tooltipEl.dataset.en,
            pos, pos_cn: posCn, cat: 'user', level: s.level,
            examples, examplesCn
          });
          btn.textContent = added ? '✓ 已添加' : '已存在'; btn.disabled = true;
          if (added) invalidateAhoCache();
        } else if (btn.dataset.action === 'speak') {
          speakWord(tooltipEl.dataset.en);
        }
        /* SM-2 review scoring */
        if (btn.dataset.action === 'review-4' || btn.dataset.action === 'review-3' ||
            btn.dataset.action === 'review-2' || btn.dataset.action === 'review-1') {
          const score = parseInt(btn.dataset.action.split('-')[1]);
          await IFLL_STORAGE.scoreReview(wzh, score);
          invalidateReviewCache();
          btn.parentElement.innerHTML = '<span style="color:#6b7280;font-size:12px">评分已记录</span>';
        }
      });
    }

    tooltipEl.dataset.zh = zh; tooltipEl.dataset.en = en;
    applyTooltipTheme(tooltipEl);
    let html = `<div class="ifll-tt-handle"></div>
      <div class="ifll-tt-header">
        <div class="ifll-tt-en">${htmlEncode(en)}<button data-action="speak" class="ifll-btn-speak" title="朗读发音"></button></div>
        <div class="ifll-tt-level">${htmlEncode(span.dataset.level || '')}</div>
      </div>
      <div class="ifll-tt-meta">${htmlEncode(zh)}${span.dataset.ipa ? ' · <span class="ifll-tt-ipa">' + htmlEncode(span.dataset.ipa) + '</span>' : ''} · <span class="ifll-tt-pos">${posLatin}</span> ${htmlEncode(posCn)}</div>
      <div class="ifll-tt-divider"></div>
      <div class="ifll-tt-def">${def}</div>`;

    if (examples.length) {
      html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">例句</div>`;
      const maxShow = Math.min(3, examples.length);
      for (let i = 0; i < maxShow; i++) {
        html += `<div class="ifll-tt-example">"${htmlEncode(examples[i])}"</div>`;
        if (examplesCn[i]) html += `<div class="ifll-tt-trans">${renderBoldHtml(examplesCn[i])}</div>`;
      }
    }

    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">AI 解析</div>`;
    html += `<div class="ifll-tt-deep" id="ifll-deep-area"><button data-action="deep-analyze" class="ifll-btn-ai" id="ifll-deep-btn">全面解析</button></div>`;
    /* Custom AI action buttons */
    const sCfg = await IFLL_STORAGE.get();
    const acts = sCfg.customActions || [];
    if (acts.length) {
      html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">自定义</div><div class="ifll-tt-custom" id="ifll-custom-area">`;
      acts.forEach(a => html += `<button class="ifll-btn-custom" data-action-id="${a.id}">${a.name}</button>`);
      html += `</div>`;
    }
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-actions">
      <button data-action="known" class="ifll-btn-known">✓ 认识</button>
      <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
      <button data-action="exclude-site" class="ifll-btn-exclude">排除此站</button>
    </div>
    <div class="ifll-tt-actions ifll-tt-actions-secondary">
      <button data-action="add-word" class="ifll-btn-addword">加入词库</button>
    </div>`;

    /* SM-2 review scoring buttons (only for items in review queue) */
    (async () => {
      const reviewQueue = await getReviewQueueCached();
      if (reviewQueue.some(w => w.zh === zh)) {
        html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">复习评分</div>`;
        html += `<div class="ifll-tt-actions ifll-tt-actions-review">
          <button data-action="review-4" class="ifll-btn-review ifll-btn-r4">轻松</button>
          <button data-action="review-3" class="ifll-btn-review ifll-btn-r3">正确</button>
          <button data-action="review-2" class="ifll-btn-review ifll-btn-r2">模糊</button>
          <button data-action="review-1" class="ifll-btn-review ifll-btn-r1">忘记</button>
        </div>`;
      }
      tooltipEl.innerHTML = html;
      setupAiButtons();
      /* Measure AFTER content is rendered, before final positioning */
      tooltipEl.style.display = 'block';
      const ttH = tooltipEl.offsetHeight;
      const margin = 8;
      /* Tooltip is position:fixed — viewport coordinates, clamp all 4 edges */
      const ttW = 300;
      let left = rect.left;
      if (left + ttW > window.innerWidth - margin) left = window.innerWidth - ttW - margin;
      if (left < margin) left = margin;
      tooltipEl.style.left = left + 'px';
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      let top = (ttH <= spaceBelow) ? rect.bottom + 4 : rect.top - ttH - 8;
      if (top < margin) top = margin;
      if (top + ttH > window.innerHeight - margin) top = window.innerHeight - ttH - margin;
      tooltipEl.style.top = top + 'px';
    })();
    /* Bind drag on handle */
    setupDragHandle(tooltipEl);
  }

  /* ── Drag handle ── */
  let _dragState = null; // { tt, offX, offY }
  let _dragListenersBound = false;
  function onDragMove(e) {
    if (!_dragState) return;
    const { tt, offX, offY } = _dragState;
    tt.style.left = Math.max(0, Math.min(e.clientX - offX, window.innerWidth - tt.offsetWidth)) + 'px';
    tt.style.top = Math.max(0, Math.min(e.clientY - offY, window.innerHeight - tt.offsetHeight)) + 'px';
    tt.style.transition = 'none';
  }
  function onDragUp() {
    if (_dragState) { _dragState.tt.style.transition = ''; _dragState = null; }
  }
  function setupDragHandle(tt) {
    const handle = tt.querySelector('.ifll-tt-handle');
    if (!handle || handle.dataset.dragBound) return;
    handle.dataset.dragBound = '1';
    handle.addEventListener('mousedown', (e) => {
      _dragState = { tt, offX: e.clientX - tt.offsetLeft, offY: e.clientY - tt.offsetTop };
      e.preventDefault();
    });
    if (!_dragListenersBound) {
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragUp);
      _dragListenersBound = true;
    }
  }

  function hideTooltip(e) {
    if (tooltipEl && !e.target.closest('.ifll-tooltip') && !e.target.closest('.ifll-word') && !e.target.closest('.ifll-annotated')) {
      tooltipEl.style.display = 'none';
    }
  }

  let _tlsDone = false;
  function setupTooltipListeners() {
    if (_tlsDone) return;
    document.addEventListener('click', showTooltip);
    document.addEventListener('click', hideTooltip, true);
    _tlsDone = true;
  }

  function removeTooltip() {
    if (tooltipEl?.parentNode) { tooltipEl.parentNode.removeChild(tooltipEl); tooltipEl = null; }
  }

  /* ---- Observer ---- */
  let observer = null;
  function startObserver(settings) {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver((mutations) => {
      /* Quick pre-filter: skip mutations from scripts, ads, style injectors */
      const hasContent = mutations.some(m => {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (/^(SCRIPT|STYLE|IFRAME|IMG|SVG|CANVAS|LINK|META|NOSCRIPT|INPUT)$/i.test(tag)) continue;
            if (/[\u4e00-\u9fff]/.test((node.textContent || '').slice(0, 200))) return true;
          }
        }
        return false;
      });
      if (!hasContent) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const f = await IFLL_STORAGE.get();
          if (!f.enabled) return;
          const mode = await IFLL_STORAGE.getModeForHost(window.location.hostname);
          if (mode === 'replace') await injectReplace(document.body, f);
        } catch (err) { console.warn('[IFLL]', err); }
      }, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  /* ---- AI button handlers ---- */
  function setupAiButtons() {
    /* Custom action buttons */
    document.querySelectorAll('.ifll-btn-custom').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const acts = (await IFLL_STORAGE.get()).customActions || [];
        const act = acts.find(a => a.id === btn.dataset.actionId);
        if (!act) return;
        btn.textContent = '...'; btn.disabled = true;
        try {
          const r = await chrome.runtime.sendMessage({
            type: 'IFLL_CUSTOM_ACTION',
            action: { prompt: act.prompt, fields: act.fields },
            en: tooltipEl.dataset.en, zh: tooltipEl.dataset.zh, def: '',
            apiKey: (await IFLL_STORAGE.get()).apiKey,
            apiEndpoint: (await IFLL_STORAGE.get()).apiEndpoint,
            apiModel: (await IFLL_STORAGE.get()).apiModel
          });
          if (!r || r.error) { btn.textContent = r?.error || '失败'; setTimeout(() => btn.textContent = act.name, 2000); btn.disabled = false; return; }
          /* Render result in tooltip */
          const area = document.getElementById('ifll-custom-area');
          if (area) {
            let h = '';
            if (r.text) h += `<div class="ifll-tt-deep-usage">${htmlEncode(r.text)}</div>`;
            for (const [key, val] of Object.entries(r)) {
              if (key === 'text') continue;
              if (Array.isArray(val) && val.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">${key}</span> ${val.join(', ')}</div>`;
              else if (typeof val === 'string' && val) h += `<div class="ifll-tt-deep-usage">${htmlEncode(val)}</div>`;
            }
            area.innerHTML = h || '<div class="ifll-tt-deep-empty">无结果</div>';
          }
        } catch (e) { btn.textContent = '错误'; setTimeout(() => btn.textContent = act.name, 2000); }
        btn.disabled = false;
      });
    });

    /* Copy buttons on AI/Deep examples */
    document.querySelectorAll('.ifll-tt-example').forEach(el => {
      if (!el.querySelector('.ifll-btn-copy')) {
        const btn = document.createElement('button');
        btn.className = 'ifll-btn-copy';
        btn.textContent = '▢';
        btn.title = '复制';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const text = el.textContent.replace(/▢/g, '').trim();
          await navigator.clipboard.writeText(text);
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = '▢', 1500);
        });
        el.style.position = 'relative';
        el.appendChild(btn);
      }
    });
    /* ── Combined analysis runner ── */
    async function runCombinedAnalysis(regen = false) {
      if (!tooltipEl) return;
      const s = await IFLL_STORAGE.get();
      const btn = document.getElementById('ifll-deep-btn');
      if (!btn) return;
      if (!s.apiKey) { btn.textContent = '无 API Key'; return; }
      const en = tooltipEl.dataset.en, zh = tooltipEl.dataset.zh;
      if (regen) await IFLL_STORAGE.clearAiCache(en);
      /* Start spinning animation, clear text */
      btn.textContent = ''; btn.disabled = true;
      btn.classList.add('ifll-btn-regen-spinning');

      const r = await fetchCombinedAnalysis(en, zh, '');
      /* Stop spinning */
      btn.classList.remove('ifll-btn-regen-spinning');
      btn.disabled = false;

      if (!r.success) {
        btn.textContent = '↻'; btn.title = '重试';
        return;
      }
      const d = r.data;
      let h = '';
      if (d.synonyms?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">同义</span> ${d.synonyms.join(', ')}</div>`;
      if (d.antonyms?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">反义</span> ${d.antonyms.join(', ')}</div>`;
      if (d.collocations?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">搭配</span> ${d.collocations.join(', ')}</div>`;
      if (d.usage) h += `<div class="ifll-tt-deep-usage">${htmlEncode(d.usage)}</div>`;
      const ex = r.examples || d.examples || [];
      if (ex.length) {
        h += '<div class="ifll-tt-divider"></div><div class="ifll-tt-label">例句</div>';
        h += ex.map(e => '<div class="ifll-tt-example ifll-tt-ai-example">' + htmlEncode(e.en || '') + '</div>' + (e.cn ? '<div class="ifll-tt-trans">' + renderBoldHtml(e.cn) + '</div>' : '')).join('');
      }
      const area = document.getElementById('ifll-deep-area');
      const cachedNote = r.cached ? '<span class="ifll-tt-cached">cached</span>' : '';
      const regenBtnHtml = `<button class="ifll-btn-regen" id="ifll-deep-btn" title="重新生成">↻</button>`;
      if (area) area.innerHTML = '<div class="ifll-tt-deep-header">' + cachedNote + regenBtnHtml + '</div>' + (h || '<div class="ifll-tt-deep-empty">暂无数据</div>');
      document.getElementById('ifll-deep-btn')?.addEventListener('click', () => runCombinedAnalysis(true));
    }
    const deepBtn = document.getElementById('ifll-deep-btn');
    if (deepBtn) deepBtn.addEventListener('click', () => runCombinedAnalysis(false));
  }

  /* ---- Public API ---- */
  /* Floating ball for quick mode toggle */
  let floatBall = null;
  let _currentMode = 'replace';
  async function switchMode(next) {
    _currentMode = next;
    destroy();
    updateFloatBall(next);
    await IFLL_STORAGE.setModeForHost(window.location.hostname, next);
    start(next);
  }
  function createFloatBall() {
    if (floatBall) return;
    floatBall = document.createElement('div');
    floatBall.className = 'ifll-float';
    floatBall.title = 'IFLL 模式切换';
    floatBall.innerHTML = '<span class="ifll-float-icon"></span>';
    floatBall.addEventListener('click', () => {
      const modes = ['replace', 'annotate', 'translate', 'off'];
      const idx = modes.indexOf(_currentMode);
      const next = modes[(idx + 1) % 4];
      switchMode(next);
    });
    document.body.appendChild(floatBall);
  }
  function updateFloatBall(mode) {
    _currentMode = mode;
    if (!floatBall) return;
    floatBall.className = 'ifll-float ifll-float-' + mode;
  }

  async function start(mode) {
    createFloatBall();
    updateFloatBall(mode);
    translateCache.clear();
    enWordBank = null;
    try {
      const s = await IFLL_STORAGE.get();
      if (!s.enabled) return;
      if (mode === 'replace') {
        await injectReplace(document.body, s);
        setupTooltipListeners();
        startObserver(s);
      } else if (mode === 'annotate') {
        injectAnnotate(s);
        setupTooltipListeners();
      } else if (mode === 'translate') {
        injectTranslate(s);
        setupTooltipListeners();
      }
      /* AI buttons set up inside showTooltip */
      /* Pre-cache combined analysis for today's daily words (idle) */
      if (mode === 'replace' && s.apiKey) {
        setTimeout(() => prefetchDailyWords(s), 3000);
      }
    } catch (err) { console.warn('[IFLL] start error:', err); }
  }

  /* ── Pre-cache combined analysis for daily words ── */
  async function prefetchDailyWords(s) {
    try {
      const dailyWords = await IFLL_STORAGE.ensureDailyWords();
      if (!dailyWords?.length) return;
      /* Pick up to 4 words that aren't cached yet */
      const toFetch = [];
      for (const w of dailyWords) {
        if (toFetch.length >= 4) break;
        const cached = await IFLL_STORAGE.getAiCacheEntry(w.en);
        if (!cached?.deep || !cached?.examples?.length) toFetch.push(w);
      }
      for (const w of toFetch) {
        try {
          await fetchCombinedAnalysis(w.en, w.zh, '');
          /* Small delay between requests to avoid rate limiting */
          await new Promise(r => setTimeout(r, 600));
        } catch (_) {}
      }
    } catch (_) {}
  }

  function destroy() {
    stopObserver(); removeTooltip();
    /* Restore original text using dataset.zh for accurate reversal */
    document.querySelectorAll('.ifll-replaced, .ifll-trans-panel, .ifll-annotated, .ifll-word').forEach(el => {
      if (!el.parentNode) return;
      let txt = '';
      if (el.classList.contains('ifll-word')) txt = el.dataset.zh || el.textContent;
      else if (el.classList.contains('ifll-annotated')) txt = el.textContent;
      else if (el.classList.contains('ifll-trans-panel')) { el.parentNode.removeChild(el); return; }
      else if (el.classList.contains('ifll-replaced')) {
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) txt += child.textContent;
          else if (child.classList?.contains?.('ifll-word')) txt += child.dataset.zh || child.textContent;
          else txt += child.textContent || '';
        }
      } else { txt = el.textContent; }
      const t = document.createTextNode(txt);
      el.parentNode.replaceChild(t, el);
    });
  }

  /* init() for backward compat (defaults to replace mode) */
  async function init() { await start('replace'); }

  return { init, start, destroy, inject: injectReplace };
})();
