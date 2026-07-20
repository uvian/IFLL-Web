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

  const MODE = { current: 'replace', hostname: '' };
  let currentMode = 'replace';
  let lastHostname = '';

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
              ipa: entry.ipa || '', level: entry.level,
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
    const scored = matches.map(m => ({ ...m, score: 0 + (m.len >= 2 ? 10 : 0) + (sceneCats.includes(m.cat) ? 5 : 0) + (sceneCats.includes(m.pos) ? 2 : 0) }));
    scored.sort((a, b) => b.score - a.score);
    const selected = [];
    let lastEnd = -1;
    for (const m of scored) {
      if (selected.length >= count) break;
      if (m.idx >= lastEnd + 5) { selected.push(m); lastEnd = m.end; }
    }
    if (selected.length < count) {
      for (const m of scored) { if (selected.length >= count) break; if (!selected.includes(m)) selected.push(m); }
    }
    return selected;
  }

  /* ---- Replace text node ---- */
  function replaceInTextNode(node, matches) {
    if (!matches.length || !node.parentNode) return;
    const sorted = [...matches].sort((a, b) => b.idx - a.idx);
    let text = node.textContent;
    const fragment = document.createDocumentFragment();
    let lastEnd = text.length;
    for (const m of sorted) {
      const after = text.slice(m.end, lastEnd);
      const span = document.createElement('span');
      span.className = 'ifll-word';
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

  function injectAnnotate(level) {
    const bank = getEnWordBank();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest?.('.ifll-annotated,.ifll-word,.ifll-tooltip,script,style,noscript,code,pre')) continue;
      if (node.parentElement?.closest?.('a')) continue;
      const text = node.textContent;
      /* Only process nodes with English words */
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
        const clean = word.replace(/[^a-z-]/g, '');
        const entry = clean.length >= 3 ? bank.get(clean) : null;
        if (entry && annotateCount < 15) {
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
  let translateCache = {};
  function injectTranslate(settings) {
    if (!settings.apiKey) {
      /* Show hint once if no API key */
      if (!document.querySelector('.ifll-tt-hint')) {
        const hint = document.createElement('div');
        hint.className = 'ifll-tt-hint';
        hint.textContent = '🔑 对比翻译需要配置 AI API Key (IFLL 弹窗 → AI 增强)';
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
      if (translateCache[key]) {
        const panel = createTranslatePanel(translateCache[key]);
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
          translateCache[key] = result.translation;
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
    div.className = 'ifll-trans-panel';
    div.textContent = text;
    return div;
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
    if (excludedSites?.some(s => hostname.includes(s) || s.includes(hostname))) return;
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
    for (const tn of textNodes) {
      const text = tn.textContent;
      if (!/[\u4e00-\u9fff]/.test(text)) continue;
      const matches = findMatches(text, null, knownSet, level);
      if (!matches.length) continue;
      const count = getReplaceCount(frequency, text.length);
      const selected = selectMatches(matches, count, scene);
      if (selected.length) { replaceInTextNode(tn, selected); totalReplaced += selected.length; }
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

  async function fetchAiExamples(en, zh) {
    const s = await IFLL_STORAGE.get();
    if (!s.apiKey) return { error: 'no api key' };
    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({ type: 'IFLL_AI_EXAMPLES', en, zh, apiKey: s.apiKey, apiEndpoint: s.apiEndpoint, apiModel: s.apiModel }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (15s)')), 15000))
      ]);
      if (!result || result.error) return { error: (result && result.error) || 'no response' };
      return { success: true, examples: result.examples || [] };
    } catch (err) { return { error: err.message }; }
  }

  async function fetchDeepAnalysis(en, zh, def) {
    const s = await IFLL_STORAGE.get();
    if (!s.apiKey) return { error: 'no api key' };
    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({ type: 'IFLL_AI_DEEP_ANALYSIS', en, zh, def, apiKey: s.apiKey, apiEndpoint: s.apiEndpoint, apiModel: s.apiModel }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (20s)')), 20000))
      ]);
      if (!result || result.error) return { error: (result && result.error) || 'no response' };
      return { success: true, data: result };
    } catch (err) { return { error: err.message }; }
  }

  async function showTooltip(e) {
    e.preventDefault(); e.stopPropagation();
    const span = e.target.closest('.ifll-word, .ifll-annotated');
    if (!span) return;
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
      tooltipEl.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || btn.disabled) return;
        const wzh = tooltipEl.dataset.zh;
        if (btn.dataset.action === 'known') {
          await IFLL_STORAGE.markKnown(wzh); btn.textContent = '✓ 已掌握'; btn.disabled = true;
          document.querySelectorAll(`.ifll-word[data-zh="${wzh}"], .ifll-annotated[data-zh="${wzh}"]`).forEach(el => el.classList.add('ifll-known'));
        } else if (btn.dataset.action === 'unknown') {
          await IFLL_STORAGE.markUnknown(wzh);
          await IFLL_STORAGE.addToReview(wzh, tooltipEl.dataset.en);
          btn.textContent = '✗ 加入复习'; btn.disabled = true;
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
          btn.parentElement.innerHTML = '<span style="color:#6b7280;font-size:12px">评分已记录</span>';
        }
      });
    }

    tooltipEl.dataset.zh = zh; tooltipEl.dataset.en = en;
    let html = `
      <div class="ifll-tt-header">
        <div class="ifll-tt-en">${htmlEncode(en)}<button data-action="speak" class="ifll-btn-speak" title="朗读发音">🔊</button></div>
        <div class="ifll-tt-level">${htmlEncode(span.dataset.level || '')}</div>
      </div>
      <div class="ifll-tt-meta">${htmlEncode(zh)}${span.dataset.ipa ? ' · <span class="ifll-tt-ipa">' + htmlEncode(span.dataset.ipa) + '</span>' : ''} · <span class="ifll-tt-pos">${posLatin}</span> ${htmlEncode(posCn)}</div>
      <div class="ifll-tt-divider"></div>
      <div class="ifll-tt-def">${def}</div>`;

    if (examples.length) {
      html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">📖 例句</div>`;
      const maxShow = Math.min(3, examples.length);
      for (let i = 0; i < maxShow; i++) {
        html += `<div class="ifll-tt-example">"${htmlEncode(examples[i])}"</div>`;
        if (examplesCn[i]) html += `<div class="ifll-tt-trans">${renderBoldHtml(examplesCn[i])}</div>`;
      }
    }

    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">🔍 AI 深度解析</div>`;
    html += `<div class="ifll-tt-deep" id="ifll-deep-area"><button data-action="deep-analyze" class="ifll-btn-ai" id="ifll-deep-btn">点击生成</button></div>`;
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">🤖 AI 例句</div>`;
    html += `<div class="ifll-tt-ai" id="ifll-ai-area"><button data-action="ai-examples" class="ifll-btn-ai" id="ifll-ai-btn">生成更多例句</button></div>`;
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-actions">
      <button data-action="known" class="ifll-btn-known">✓ 认识</button>
      <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
      <button data-action="exclude-site" class="ifll-btn-exclude">⛔ 排除此站</button>
    </div>
    <div class="ifll-tt-actions ifll-tt-actions-secondary">
      <button data-action="add-word" class="ifll-btn-addword">📝 加入词库</button>
    </div>`;

    /* SM-2 review scoring buttons (only for items in review queue) */
    (async () => {
      const { reviewQueue } = await IFLL_STORAGE.get();
      if (reviewQueue.some(w => w.zh === zh)) {
        html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">📝 复习评分</div>`;
        html += `<div class="ifll-tt-actions ifll-tt-actions-review">
          <button data-action="review-4" class="ifll-btn-review ifll-btn-r4">😊 轻松</button>
          <button data-action="review-3" class="ifll-btn-review ifll-btn-r3">🙂 正确</button>
          <button data-action="review-2" class="ifll-btn-review ifll-btn-r2">🤔 模糊</button>
          <button data-action="review-1" class="ifll-btn-review ifll-btn-r1">😰 忘记</button>
        </div>`;
      }
      tooltipEl.innerHTML = html;
    })();

    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 400) + 'px';
    tooltipEl.style.top = y + 'px';
    tooltipEl.style.display = 'block';
  }

  function hideTooltip(e) {
    if (tooltipEl && !e.target.closest('.ifll-tooltip') && !e.target.closest('.ifll-word') && !e.target.closest('.ifll-annotated')) {
      tooltipEl.style.display = 'none';
    }
  }

  function setupTooltipListeners() {
    document.addEventListener('click', showTooltip);
    document.addEventListener('click', hideTooltip, true);
  }

  function removeTooltip() {
    if (tooltipEl?.parentNode) { tooltipEl.parentNode.removeChild(tooltipEl); tooltipEl = null; }
  }

  /* ---- Observer ---- */
  let observer = null;
  function startObserver(settings) {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver(() => {
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
    const aiBtn = document.getElementById('ifll-ai-btn');
    if (aiBtn) aiBtn.addEventListener('click', async () => {
      if (!tooltipEl) return;
      const s = await IFLL_STORAGE.get();
      if (!s.apiKey) { aiBtn.textContent = '⚠️ 无 API Key'; return; }
      aiBtn.textContent = '⏳ 生成中...'; aiBtn.disabled = true;
      const r = await fetchAiExamples(tooltipEl.dataset.en, tooltipEl.dataset.zh);
      if (!r.success) { aiBtn.textContent = '⚠️ ' + (r.error || '失败'); aiBtn.disabled = false; return; }
      if (!r.examples?.length) { aiBtn.textContent = '⚠️ 返回为空'; aiBtn.disabled = false; return; }
      const area = document.getElementById('ifll-ai-area');
      if (area) area.innerHTML = r.examples.map(ex =>
        `<div class="ifll-tt-example ifll-tt-ai-example">"${htmlEncode(ex.en || '')}"</div>` +
        (ex.cn ? `<div class="ifll-tt-trans">${renderBoldHtml(ex.cn)}</div>` : '')
      ).join('');
    });

    const deepBtn = document.getElementById('ifll-deep-btn');
    if (deepBtn) deepBtn.addEventListener('click', async () => {
      if (!tooltipEl) return;
      const s = await IFLL_STORAGE.get();
      if (!s.apiKey) { deepBtn.textContent = '⚠️ 无 API Key'; return; }
      deepBtn.textContent = '⏳ 分析中...'; deepBtn.disabled = true;
      const r = await fetchDeepAnalysis(tooltipEl.dataset.en, tooltipEl.dataset.zh, '');
      if (!r.success) { deepBtn.textContent = '⚠️ ' + (r.error || '失败'); deepBtn.disabled = false; return; }
      const d = r.data;
      let h = '';
      if (d.synonyms?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">同义</span> ${d.synonyms.join(', ')}</div>`;
      if (d.antonyms?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">反义</span> ${d.antonyms.join(', ')}</div>`;
      if (d.collocations?.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">搭配</span> ${d.collocations.join(', ')}</div>`;
      if (d.usage) h += `<div class="ifll-tt-deep-usage">${htmlEncode(d.usage)}</div>`;
      const area = document.getElementById('ifll-deep-area');
      if (area) area.innerHTML = h || '<div class="ifll-tt-deep-empty">暂无数据</div>';
    });
  }

  /* ---- Public API ---- */
  async function start(mode) {
    currentMode = mode;
    lastHostname = window.location.hostname;
    try {
      const s = await IFLL_STORAGE.get();
      if (!s.enabled) return;
      if (mode === 'replace') {
        await injectReplace(document.body, s);
        setupTooltipListeners();
        startObserver(s);
      } else if (mode === 'annotate') {
        injectAnnotate(s.level);
        setupTooltipListeners();
      } else if (mode === 'translate') {
        injectTranslate(s);
        setupTooltipListeners();
      }
      setupAiButtons();
    } catch (err) { console.warn('[IFLL] start error:', err); }
  }

  function destroy() {
    stopObserver(); removeTooltip();
    document.querySelectorAll('.ifll-word, .ifll-replaced, .ifll-annotated, .ifll-trans-panel').forEach(el => {
      const t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    });
  }

  /* init() for backward compat (defaults to replace mode) */
  async function init() { await start('replace'); }

  return { init, start, destroy, inject: injectReplace };
})();
