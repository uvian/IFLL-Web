/* IFLL — Word injector engine */
const IFLL_INJECTOR = (() => {
  const POS_LABEL = { verb: 'v.', noun: 'n.', adjective: 'adj.', adverb: 'adv.', conjunction: 'conj.' };
  function posLabel(pos) { return POS_LABEL[pos] || pos + '.'; }

  /* ---- Config ---- */
  function getReplaceCount(frequency, textLen) {
    const ratios = { low: 0.005, medium: 0.015, high: 0.03 };
    return Math.max(1, Math.min(5, Math.round(textLen * (ratios[frequency] || ratios.medium))));
  }
  function getLevelWeight(lvl) {
    const w = { all: 0, daily: 1, cet4: 2, cet6: 3, ielts: 4, graduate: 5 };
    return w[lvl] || 99;
  }

  /* ---- Smart matching ---- */
  function findMatches(text, bankMap, knownSet, level) {
    const matches = [];
    for (const [zh, entry] of bankMap) {
      if (knownSet.has(zh)) continue;
      if (entry.level !== 'all' && getLevelWeight(entry.level) > getLevelWeight(level)) continue;
      let idx = 0;
      while ((idx = text.indexOf(zh, idx)) !== -1) {
        matches.push({
          zh, en: entry.en, def: entry.def || entry.en,
          pos: entry.pos || 'noun', posCn: entry.pos_cn || '名词',
          examples: entry.examples || (entry.example ? [entry.example] : []),
          examplesCn: entry.examplesCn || (entry.example_cn ? [entry.example_cn] : []),
          ipa: entry.ipa || '',
          level: entry.level, idx, end: idx + zh.length
        });
        idx += zh.length;
      }
    }
    matches.sort((a, b) => a.idx - b.idx);
    return matches;
  }

  function selectMatches(matches, count) {
    if (matches.length <= count) return matches;
    const selected = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (selected.length >= count) break;
      if (m.idx >= lastEnd + 2) { selected.push(m); lastEnd = m.end; }
    }
    if (selected.length < count) {
      for (const m of matches) {
        if (selected.length >= count) break;
        if (!selected.includes(m)) selected.push(m);
      }
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
      span.dataset.en = m.en;
      span.dataset.zh = m.zh;
      span.dataset.def = m.def;
      span.dataset.pos = m.pos;
      span.dataset.posCn = m.posCn;
      span.dataset.examples = JSON.stringify(m.examples);
      span.dataset.examplesCn = JSON.stringify(m.examplesCn);
      span.dataset.ipa = m.ipa || '';
      span.textContent = m.en;
      const wrapper = document.createElement('span');
      wrapper.appendChild(span);
      if (after) wrapper.appendChild(document.createTextNode(after));
      lastEnd = m.idx;
      text = text.slice(0, m.idx);
      fragment.appendChild(wrapper);
    }
    if (lastEnd > 0) fragment.insertBefore(document.createTextNode(text), fragment.firstChild);
    node.parentNode.replaceChild(fragment, node);
  }

  /* ---- Skip ---- */
  function shouldSkip(node) {
    if (!node.parentElement) return true;
    return ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION',
      'IFRAME','SVG','CODE','PRE','CANVAS'].includes(node.parentElement.tagName);
  }
  function shouldSkipAncestor(node) {
    let el = node.parentElement;
    while (el) {
      if (el.classList && el.classList.contains('ifll-word')) return true;
      if (el.closest && el.closest('script,style,noscript,textarea,input,select,option,iframe,svg,code,pre,canvas,.ifll-word,.ifll-tooltip,[contenteditable]')) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* ---- Main inject ---- */
  async function inject(root, settings) {
    const { frequency, level, knownWords, excludedSites, userWords } = settings || await IFLL_STORAGE.get();
    if (!settings?.enabled) return;
    const hostname = window.location.hostname;
    if (excludedSites && excludedSites.some(s => hostname.includes(s) || s.includes(hostname))) return;
    const knownSet = new Set(knownWords);
    const bankMap = IFLL_STORAGE.buildFullBank(WORD_BANK, userWords || []);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!/[\u4e00-\u9fff]/.test(node.textContent)) continue;
      if (shouldSkip(node) || shouldSkipAncestor(node)) continue;
      textNodes.push(node);
    }
    for (const tn of textNodes) {
      const text = tn.textContent;
      if (!/[\u4e00-\u9fff]/.test(text)) continue;
      const matches = findMatches(text, bankMap, knownSet, level);
      if (!matches.length) continue;
      const count = getReplaceCount(frequency, text.length);
      const selected = selectMatches(matches, count);
      if (selected.length) replaceInTextNode(tn, selected);
    }
  }

  /* ---- Tooltip helpers ---- */
  let tooltipEl = null;

  function htmlEncode(s) {
    return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Speak word using browser's speech synthesis */
  function speakWord(word) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    utterance.pitch = 1;
    /* Use configured voice if available */
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
    const regex = /\*\*(.+?)\*\*/g;
    let result = '', lastIdx = 0, m;
    while ((m = regex.exec(text)) !== null) {
      result += htmlEncode(text.slice(lastIdx, m.index));
      result += '<strong class="ifll-tt-bold">' + htmlEncode(m[1]) + '</strong>';
      lastIdx = regex.lastIndex;
    }
    result += htmlEncode(text.slice(lastIdx));
    return result;
  }

  /* ---- AI fetches ---- */
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

  /* ---- Tooltip ---- */
  async function showTooltip(e) {
    e.preventDefault(); e.stopPropagation();
    const span = e.target.closest('.ifll-word');
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
          document.querySelectorAll(`.ifll-word[data-zh="${wzh}"]`).forEach(el => el.classList.add('ifll-known'));
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
            pos: pos, pos_cn: posCn, cat: 'user', level: s.level,
            examples: examples, examplesCn: examplesCn
          });
          btn.textContent = added ? '✓ 已添加' : '已存在'; btn.disabled = true;
        } else if (btn.dataset.action === 'speak') {
          speakWord(tooltipEl.dataset.en);
        }
      });
    }

    tooltipEl.dataset.zh = zh;
    tooltipEl.dataset.en = en;

    /* Build HTML */
    let html = `
      <div class="ifll-tt-header">
        <div class="ifll-tt-en">
          ${htmlEncode(en)}
          <button data-action="speak" class="ifll-btn-speak" title="朗读发音">🔊</button>
        </div>
        <div class="ifll-tt-level">${htmlEncode(span.dataset.level || '')}</div>
      </div>
      <div class="ifll-tt-meta">${htmlEncode(zh)}${span.dataset.ipa ? ' · <span class="ifll-tt-ipa">' + htmlEncode(span.dataset.ipa) + '</span>' : ''} · <span class="ifll-tt-pos">${posLatin}</span> ${htmlEncode(posCn)}</div>
      <div class="ifll-tt-divider"></div>
      <div class="ifll-tt-def">${def}</div>`;

    /* Built-in examples */
    if (examples.length) {
      html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">📖 例句</div>`;
      const maxShow = Math.min(3, examples.length);
      for (let i = 0; i < maxShow; i++) {
        html += `<div class="ifll-tt-example">"${htmlEncode(examples[i])}"</div>`;
        if (examplesCn[i]) html += `<div class="ifll-tt-trans">${renderBoldHtml(examplesCn[i])}</div>`;
      }
    }

    /* AI Deep Analysis section */
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">🔍 AI 深度解析</div>`;
    html += `<div class="ifll-tt-deep" id="ifll-deep-area"><button data-action="deep-analyze" class="ifll-btn-ai" id="ifll-deep-btn">点击生成</button></div>`;

    /* AI Examples placeholder */
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">🤖 AI 例句</div>`;
    html += `<div class="ifll-tt-ai" id="ifll-ai-area"><button data-action="ai-examples" class="ifll-btn-ai" id="ifll-ai-btn">生成更多例句</button></div>`;

    /* Actions */
    html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-actions">
      <button data-action="known" class="ifll-btn-known">✓ 认识</button>
      <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
      <button data-action="exclude-site" class="ifll-btn-exclude">⛔ 排除此站</button>
    </div>
    <div class="ifll-tt-actions ifll-tt-actions-secondary">
      <button data-action="add-word" class="ifll-btn-addword">📝 加入词库</button>
    </div>`;

    tooltipEl.innerHTML = html;

    /* ---- AI button: examples ---- */
    const aiBtn = document.getElementById('ifll-ai-btn');
    if (aiBtn) aiBtn.addEventListener('click', async () => {
      const s = await IFLL_STORAGE.get();
      if (!s.apiKey) { aiBtn.textContent = '⚠️ 无 API Key'; return; }
      aiBtn.textContent = '⏳ 生成中...'; aiBtn.disabled = true;
      const r = await fetchAiExamples(en, zh);
      if (!r.success) { aiBtn.textContent = '⚠️ ' + (r.error || '失败'); aiBtn.disabled = false; return; }
      if (!r.examples || !r.examples.length) { aiBtn.textContent = '⚠️ 返回为空'; aiBtn.disabled = false; return; }
      const area = document.getElementById('ifll-ai-area');
      if (area) {
        let h = '';
        for (const ex of r.examples) {
          h += `<div class="ifll-tt-example ifll-tt-ai-example">"${htmlEncode(ex.en || '')}"</div>`;
          if (ex.cn) h += `<div class="ifll-tt-trans">${renderBoldHtml(ex.cn)}</div>`;
        }
        area.innerHTML = h;
      }
    });

    /* ---- AI button: deep analysis ---- */
    const deepBtn = document.getElementById('ifll-deep-btn');
    if (deepBtn) deepBtn.addEventListener('click', async () => {
      const s = await IFLL_STORAGE.get();
      if (!s.apiKey) { deepBtn.textContent = '⚠️ 无 API Key'; return; }
      deepBtn.textContent = '⏳ 分析中...'; deepBtn.disabled = true;
      const r = await fetchDeepAnalysis(en, zh, span.dataset.def || en);
      if (!r.success) { deepBtn.textContent = '⚠️ ' + (r.error || '失败'); deepBtn.disabled = false; return; }
      const d = r.data;
      let h = '';
      if (d.synonyms && d.synonyms.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">同义</span> ${d.synonyms.join(', ')}</div>`;
      if (d.antonyms && d.antonyms.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">反义</span> ${d.antonyms.join(', ')}</div>`;
      if (d.collocations && d.collocations.length) h += `<div class="ifll-tt-deep-row"><span class="ifll-tt-deep-tag">搭配</span> ${d.collocations.join(', ')}</div>`;
      if (d.usage) h += `<div class="ifll-tt-deep-usage">${htmlEncode(d.usage)}</div>`;
      if (d.examples && d.examples.length) {
        h += `<div class="ifll-tt-divider"></div>`;
        for (const ex of d.examples) {
          h += `<div class="ifll-tt-example">"${htmlEncode(ex.en || '')}"</div>`;
          if (ex.cn) h += `<div class="ifll-tt-trans">${renderBoldHtml(ex.cn)}</div>`;
        }
      }
      const area = document.getElementById('ifll-deep-area');
      if (area) { area.innerHTML = h || '<div class="ifll-tt-deep-empty">暂无数据</div>'; }
    });

    /* Position */
    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 400) + 'px';
    tooltipEl.style.top = y + 'px';
    tooltipEl.style.display = 'block';
  }

  function hideTooltip(e) {
    if (tooltipEl && !e.target.closest('.ifll-tooltip') && !e.target.closest('.ifll-word')) {
      tooltipEl.style.display = 'none';
    }
  }

  function setupTooltipListeners() {
    document.addEventListener('click', showTooltip);
    document.addEventListener('mouseover', (e) => {
      const w = e.target.closest('.ifll-word');
      if (w) w.title = `${w.dataset.en} = ${w.dataset.zh} [click]`;
    });
    document.addEventListener('click', hideTooltip, true);
  }

  function removeTooltip() {
    if (tooltipEl && tooltipEl.parentNode) { tooltipEl.parentNode.removeChild(tooltipEl); tooltipEl = null; }
  }

  /* ---- Observer ---- */
  let observer = null;
  function startObserver(settings) {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try { const f = await IFLL_STORAGE.get(); if (f.enabled) await inject(document.body, f); } catch (err) { console.warn('[IFLL]', err); }
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  /* ---- Public API ---- */
  async function init() {
    try {
      const s = await IFLL_STORAGE.get();
      if (!s.enabled) return;
      await inject(document.body, s);
      setupTooltipListeners();
      startObserver(s);
    } catch (err) { console.warn('[IFLL] init error:', err); }
  }
  function destroy() {
    stopObserver(); removeTooltip();
    document.querySelectorAll('.ifll-word').forEach(el => {
      const t = document.createTextNode(el.dataset.zh || el.textContent);
      el.parentNode.replaceChild(t, el);
    });
  }
  return { init, destroy, inject };
})();
