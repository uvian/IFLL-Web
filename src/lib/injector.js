/* IFLL — Word injector engine */
const IFLL_INJECTOR = (() => {
  /* ---- Config helpers ---- */
  function getReplaceCount(frequency, textLen) {
    const ratios = { low: 0.005, medium: 0.015, high: 0.03 };
    const ratio = ratios[frequency] || ratios.medium;
    return Math.max(1, Math.min(5, Math.round(textLen * ratio)));
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
          pos: entry.pos || 'noun', pos_cn: entry.pos_cn || '名词',
          example: entry.example || '', example_cn: entry.example_cn || '',
          level: entry.level, idx, end: idx + zh.length
        });
        idx += zh.length;
      }
    }
    matches.sort((a, b) => a.idx - b.idx);
    return matches;
  }

  function getLevelWeight(lvl) {
    const w = { all: 0, daily: 1, cet4: 2, cet6: 3, ielts: 4, graduate: 5 };
    return w[lvl] || 99;
  }

  /* ---- Selection ---- */
  function selectMatches(matches, count) {
    if (matches.length <= count) return matches;
    const selected = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (selected.length >= count) break;
      if (m.idx >= lastEnd + 2) {
        selected.push(m);
        lastEnd = m.end;
      }
    }
    if (selected.length < count) {
      for (const m of matches) {
        if (selected.length >= count) break;
        if (!selected.includes(m)) selected.push(m);
      }
    }
    return selected;
  }

  /* ---- Text node replacement: Chinese word → English word on page ---- */
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
      span.dataset.posCn = m.pos_cn;
      span.dataset.example = m.example || '';
      span.dataset.exampleCn = m.example_cn || '';
      // Replace with ENGLISH word on the page
      span.textContent = m.en;

      const wrapper = document.createElement('span');
      wrapper.appendChild(span);
      if (after) wrapper.appendChild(document.createTextNode(after));

      lastEnd = m.idx;
      text = text.slice(0, m.idx);
      fragment.appendChild(wrapper);
    }
    if (lastEnd > 0) {
      const before = document.createTextNode(text);
      fragment.insertBefore(before, fragment.firstChild);
    }

    node.parentNode.replaceChild(fragment, node);
  }

  /* ---- Skip tags ---- */
  function shouldSkip(node) {
    if (!node.parentElement) return true;
    const tag = node.parentElement.tagName;
    return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
      'IFRAME', 'SVG', 'CODE', 'PRE', 'CANVAS'].includes(tag);
  }

  function shouldSkipAncestor(node) {
    let el = node.parentElement;
    while (el) {
      if (el.classList && el.classList.contains('ifll-word')) return true;
      if (el.closest) {
        if (el.closest('script, style, noscript, textarea, input, select, option, iframe, svg, code, pre, canvas, .ifll-word, [contenteditable="true"]')) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /* ---- Main inject function ---- */
  async function inject(root, settings) {
    const { frequency, level, knownWords } = settings || await IFLL_STORAGE.get();
    if (!settings?.enabled) return;

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

  /* ---- Tooltip system: new design ---- */
  let tooltipEl = null;

  function htmlEncode(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showTooltip(e) {
    const span = e.target.closest('.ifll-word');
    if (!span) return;

    const rect = span.getBoundingClientRect();
    const en = span.dataset.en;
    const zh = htmlEncode(span.dataset.zh);
    const def = htmlEncode(span.dataset.def || en);
    const posCn = htmlEncode(span.dataset.posCn || '');
    const example = htmlEncode(span.dataset.example || '');
    const exampleCn = htmlEncode(span.dataset.exampleCn || '');

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
        }
      });
    }

    tooltipEl.dataset.zh = span.dataset.zh;

    /* Build tooltip HTML */
    let html = `
      <div class="ifll-tt-en">${htmlEncode(en)}</div>
      <div class="ifll-tt-meta">${zh} · ${posCn}</div>
      <div class="ifll-tt-divider"></div>
      <div class="ifll-tt-label">Definition</div>
      <div class="ifll-tt-def">${def}</div>
    `;

    /* Add example section if data available */
    if (example) {
      html += `
        <div class="ifll-tt-divider"></div>
        <div class="ifll-tt-label">Example</div>
        <div class="ifll-tt-example">"${example}"</div>
        <div class="ifll-tt-trans">${exampleCn}</div>
      `;
    }

    html += `
      <div class="ifll-tt-actions">
        <button data-action="known" class="ifll-btn-known">✓ 认识</button>
        <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
      </div>
    `;

    tooltipEl.innerHTML = html;

    /* Bold the Chinese word in example translation */
    if (example) {
      const transDiv = tooltipEl.querySelector('.ifll-tt-trans');
      if (transDiv) {
        const word = span.dataset.zh;
        const regex = new RegExp(htmlEncode(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        transDiv.innerHTML = transDiv.textContent.replace(regex, `<strong class="ifll-tt-bold">${htmlEncode(word)}</strong>`);
      }
    }

    /* Position the tooltip */
    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 360) + 'px';
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
      if (word) {
        word.title = `${word.dataset.en} = ${word.dataset.zh} [click for details]`;
      }
    });
    document.addEventListener('click', hideTooltip, true);
  }

  function removeTooltip() {
    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
      tooltipEl = null;
    }
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
          if (fresh.enabled) {
            await inject(document.body, fresh);
          }
        } catch (err) {
          console.warn('[IFLL] inject error:', err);
        }
      }, 800);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

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
