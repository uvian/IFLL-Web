/* IFLL — Word injector engine */
const IFLL_INJECTOR = (() => {
  /* Latin POS labels */
  const POS_LABEL = {
    verb: 'v.', noun: 'n.', adjective: 'adj.',
    adverb: 'adv.', conjunction: 'conj.'
  };

  function posLabel(pos) {
    return POS_LABEL[pos] || pos + '.';
  }

  /* ---- Config helpers ---- */
  function getReplaceCount(frequency, textLen) {
    const ratios = { low: 0.005, medium: 0.015, high: 0.03 };
    const ratio = ratios[frequency] || ratios.medium;
    return Math.max(1, Math.min(5, Math.round(textLen * ratio)));
  }

  function getLevelWeight(lvl) {
    const w = { all: 0, daily: 1, cet4: 2, cet6: 3, ielts: 4, graduate: 5 };
    return w[lvl] || 99;
  }

  /* ---- Matching ---- */
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
          level: entry.level, idx, end: idx + zh.length
        });
        idx += zh.length;
      }
    }
    matches.sort((a, b) => a.idx - b.idx);
    return matches;
  }

  /* ---- Selection ---- */
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

  /* ---- Text node replacement: Chinese word → English word ---- */
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
      span.textContent = m.en;
      const wrapper = document.createElement('span');
      wrapper.appendChild(span);
      if (after) wrapper.appendChild(document.createTextNode(after));
      lastEnd = m.idx;
      text = text.slice(0, m.idx);
      fragment.appendChild(wrapper);
    }
    if (lastEnd > 0) {
      fragment.insertBefore(document.createTextNode(text), fragment.firstChild);
    }
    node.parentNode.replaceChild(fragment, node);
  }

  /* ---- Skip tags ---- */
  function shouldSkip(node) {
    if (!node.parentElement) return true;
    return ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION',
      'IFRAME','SVG','CODE','PRE','CANVAS'].includes(node.parentElement.tagName);
  }

  function shouldSkipAncestor(node) {
    let el = node.parentElement;
    while (el) {
      if (el.classList && el.classList.contains('ifll-word')) return true;
      if (el.closest && el.closest('script, style, noscript, textarea, input, select, option, iframe, svg, code, pre, canvas, .ifll-word, .ifll-tooltip, [contenteditable="true"]')) return true;
      el = el.parentElement;
    }
    return false;
  }

  /* ---- Main inject ---- */
  async function inject(root, settings) {
    const { frequency, level, knownWords, excludedSites } = settings || await IFLL_STORAGE.get();
    if (!settings?.enabled) return;

    /* Skip excluded sites */
    const hostname = window.location.hostname;
    if (excludedSites && excludedSites.some(s => hostname.includes(s) || s.includes(hostname))) return;

    const knownSet = new Set(knownWords);
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
      const matches = findMatches(text, WORD_BANK_MAP, knownSet, level);
      if (!matches.length) continue;
      const count = getReplaceCount(frequency, text.length);
      const selected = selectMatches(matches, count);
      if (selected.length) replaceInTextNode(tn, selected);
    }
  }

  /* ---- Tooltip helpers ---- */
  let tooltipEl = null;

  function htmlEncode(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Parse **word** markers → bold HTML, htmlEncode everything else */
  function renderBoldHtml(text) {
    if (!text) return '';
    const regex = /\*\*(.+?)\*\*/g;
    let result = '';
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      result += htmlEncode(text.slice(lastIdx, m.index));
      result += '<strong class="ifll-tt-bold">' + htmlEncode(m[1]) + '</strong>';
      lastIdx = regex.lastIndex;
    }
    result += htmlEncode(text.slice(lastIdx));
    return result;
  }

  /* ---- AI example fetch — routes through background worker ---- */
  async function fetchAiExamples(en, zh) {
    const settings = await IFLL_STORAGE.get();
    if (!settings.apiKey) return { error: 'no api key' };
    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'IFLL_AI_EXAMPLES',
          en, zh,
          apiKey: settings.apiKey,
          apiEndpoint: settings.apiEndpoint,
          apiModel: settings.apiModel
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (15s)')), 15000))
      ]);
      if (!result) return { error: 'no response from background' };
      if (result.error) return { error: result.error };
      return { success: true, examples: result.examples || [] };
    } catch (err) {
      return { error: err.message };
    }
  }

  /* ---- Show tooltip ---- */
  async function showTooltip(e) {
    /* Prevent link navigation when clicking a replaced word inside <a> */
    e.preventDefault();
    e.stopPropagation();
    const span = e.target.closest('.ifll-word');
    if (!span) return;

    const rect = span.getBoundingClientRect();
    const en = span.dataset.en;
    const zh = span.dataset.zh;
    const def = htmlEncode(span.dataset.def || en);
    const pos = span.dataset.pos || 'noun';
    const posCn = span.dataset.posCn || '名词';
    const posLatin = posLabel(pos);

    /* Parse examples from JSON dataset */
    let examples = [];
    let examplesCn = [];
    try {
      const raw = span.dataset.examples;
      if (raw) examples = JSON.parse(raw);
    } catch (_) {}
    try {
      const raw = span.dataset.examplesCn;
      if (raw) examplesCn = JSON.parse(raw);
    } catch (_) {}

    /* Fallback for old single-string example format */
    if (!examples.length && span.dataset.example) {
      examples = [span.dataset.example];
      examplesCn = [span.dataset.exampleCn || ''];
    }

    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'ifll-tooltip';
      document.body.appendChild(tooltipEl);

      tooltipEl.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const zhWord = tooltipEl.dataset.zh;
        if (btn.dataset.action === 'known') {
          await IFLL_STORAGE.markKnown(zhWord);
          btn.textContent = '✓ 已掌握';
          btn.disabled = true;
          document.querySelectorAll(`.ifll-word[data-zh="${zhWord}"]`).forEach(el => el.classList.add('ifll-known'));
        } else if (btn.dataset.action === 'unknown') {
          await IFLL_STORAGE.markUnknown(zhWord);
          btn.textContent = '✗ 已移除';
          btn.disabled = true;
        } else if (btn.dataset.action === 'exclude-site') {
          const hostname = window.location.hostname;
          const settings = await IFLL_STORAGE.get();
          const excludedSites = settings.excludedSites || [];
          if (!excludedSites.includes(hostname)) {
            excludedSites.push(hostname);
            await IFLL_STORAGE.set({ excludedSites });
          }
          btn.textContent = '✓ 已排除';
          btn.disabled = true;
          IFLL_INJECTOR.destroy();
        }
      });
    }

    tooltipEl.dataset.zh = zh;

    /* Build tooltip HTML */
    let html = `
      <div class="ifll-tt-en">${htmlEncode(en)}</div>
      <div class="ifll-tt-meta">${htmlEncode(zh)} · <span class="ifll-tt-pos">${posLatin}</span> ${htmlEncode(posCn)}</div>
      <div class="ifll-tt-divider"></div>
      <div class="ifll-tt-label">Definition</div>
      <div class="ifll-tt-def">${def}</div>
    `;

    /* Built-in examples (up to 3) */
    if (examples.length) {
      html += `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">Examples</div>`;
      const maxShow = Math.min(3, examples.length);
      for (let i = 0; i < maxShow; i++) {
        const ex = htmlEncode(examples[i]);
        const tcn = examplesCn[i] || '';
        html += `<div class="ifll-tt-example">"${ex}"</div>`;
        if (tcn) {
          html += `<div class="ifll-tt-trans">${renderBoldHtml(tcn)}</div>`;
        }
      }
    }

    /* AI examples placeholder (will be filled asynchronously) */
    html += `<div class="ifll-tt-divider"></div>`;
    html += `<div class="ifll-tt-ai" id="ifll-ai-area">
      <button data-action="ai-examples" class="ifll-btn-ai" id="ifll-ai-btn">AI 生成更多例句</button>
    </div>`;

    html += `<div class="ifll-tt-divider"></div>`;
    html += `
      <div class="ifll-tt-actions">
        <button data-action="known" class="ifll-btn-known">✓ 认识</button>
        <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
        <button data-action="exclude-site" class="ifll-btn-exclude">⛔ 排除此站</button>
      </div>
    `;

    tooltipEl.innerHTML = html;

    /* ---- AI button handler ---- */
    const aiBtn = document.getElementById('ifll-ai-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', async () => {
        const settings = await IFLL_STORAGE.get();
        if (!settings.apiKey) {
          aiBtn.textContent = '⚠️ 请在扩展设置中填入 API Key';
          return;
        }
        aiBtn.textContent = '⏳ 生成中...';
        aiBtn.disabled = true;
        const result = await fetchAiExamples(en, zh);
        if (!result.success) {
          aiBtn.textContent = '⚠️ ' + (result.error || '生成失败');
          aiBtn.disabled = false;
          return;
        }
        if (!result.examples || !result.examples.length) {
          aiBtn.textContent = '⚠️ AI 返回为空';
          aiBtn.disabled = false;
          return;
        }
        /* Replace AI area with results */
        const aiArea = document.getElementById('ifll-ai-area');
        if (aiArea) {
          let aiHtml = `<div class="ifll-tt-divider"></div><div class="ifll-tt-label">AI Examples</div>`;
          for (const r of result.examples) {
            const ex = htmlEncode(r.en || '');
            const tcn = renderBoldHtml(r.cn || '');
            aiHtml += `<div class="ifll-tt-example ifll-tt-ai-example">"${ex}"</div>`;
            if (tcn) {
              aiHtml += `<div class="ifll-tt-trans">${tcn}</div>`;
            }
          }
          aiArea.innerHTML = aiHtml;
        }
      });
    }

    /* Position */
    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 380) + 'px';
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
      const word = e.target.closest('.ifll-word');
      if (word) word.title = `${word.dataset.en} = ${word.dataset.zh} [click for details]`;
    });
    document.addEventListener('click', hideTooltip, true);
  }

  function removeTooltip() {
    if (tooltipEl && tooltipEl.parentNode) { tooltipEl.parentNode.removeChild(tooltipEl); tooltipEl = null; }
  }

  /* ---- MutationObserver ---- */
  let observer = null;

  function startObserver(settings) {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const fresh = await IFLL_STORAGE.get();
          if (fresh.enabled) await inject(document.body, fresh);
        } catch (err) { console.warn('[IFLL] inject error:', err); }
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  /* ---- Public API ---- */
  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;
    await inject(document.body, settings);
    setupTooltipListeners();
    startObserver(settings);
  }

  function destroy() {
    stopObserver();
    removeTooltip();
    document.querySelectorAll('.ifll-word').forEach(el => {
      const text = document.createTextNode(el.dataset.zh || el.textContent);
      el.parentNode.replaceChild(text, el);
    });
  }

  return { init, destroy, inject };
})();
