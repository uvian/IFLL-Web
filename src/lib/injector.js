/* IFLL — Word injector engine */
const IFLL_INJECTOR = (() => {
  /* ---- Config helpers ---- */
  function getReplaceCount(frequency, textLen) {
    // How many words to replace per segment
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
        matches.push({ zh, en: entry.en, def: entry.def || entry.en, level: entry.level, idx, end: idx + zh.length });
        idx += zh.length;
      }
    }
    // Sort by position
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
    // Prefer words at different positions, not clustered
    const selected = [];
    let lastEnd = -1;
    for (const m of matches) {
      if (selected.length >= count) break;
      if (m.idx >= lastEnd + 2) {
        selected.push(m);
        lastEnd = m.end;
      }
    }
    // If we couldn't get enough, relax and pack more
    if (selected.length < count) {
      for (const m of matches) {
        if (selected.length >= count) break;
        if (!selected.includes(m)) selected.push(m);
      }
    }
    return selected;
  }

  /* ---- Text node replacement ---- */
  function replaceInTextNode(node, matches) {
    if (!matches.length || !node.parentNode) return;

    // Sort by position descending so we can split without offset chaos
    const sorted = [...matches].sort((a, b) => b.idx - a.idx);
    let text = node.textContent;
    const fragment = document.createDocumentFragment();

    // Build replacement from last match to first
    let lastEnd = text.length;
    for (const m of sorted) {
      const after = text.slice(m.end, lastEnd);
      const span = document.createElement('span');
      span.className = 'ifll-word';
      span.dataset.en = m.en;
      span.dataset.zh = m.zh;
      span.dataset.def = m.def;
      span.textContent = m.zh;

      const wrapper = document.createElement('span');
      wrapper.appendChild(span);
      if (after) wrapper.appendChild(document.createTextNode(after));

      lastEnd = m.idx;
      text = text.slice(0, m.idx);
      fragment.appendChild(wrapper);
    }
    // Whatever is left before all matches
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
      if (el.closest) {
        if (el.closest('script, style, noscript, textarea, input, select, option, iframe, svg, code, pre, canvas, [contenteditable="true"]')) {
          return true;
        }
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
      // Must have Chinese chars
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

  /* ---- Tooltip system ---- */
  let tooltipEl = null;

  function showTooltip(e) {
    const span = e.target.closest('.ifll-word');
    if (!span) return;

    const rect = span.getContext('boundingClientRect') || span.getBoundingClientRect();
    const en = span.dataset.en;
    const zh = span.dataset.zh;
    const def = span.dataset.def || en;

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
          // Remove this word's highlighting
          document.querySelectorAll(`.ifll-word[data-zh="${zhWord}"]`).forEach(el => el.classList.add('ifll-known'));
        } else if (btn.dataset.action === 'unknown') {
          await IFLL_STORAGE.markUnknown(zhWord);
          btn.textContent = '✗ 已移除';
          btn.disabled = true;
        }
      });
    }

    tooltipEl.dataset.zh = zh;
    tooltipEl.innerHTML = `
      <div class="ifll-tooltip-en">${en}</div>
      <div class="ifll-tooltip-def">${def}</div>
      <div class="ifll-tooltip-actions">
        <button data-action="known" class="ifll-btn-known">✓ 认识</button>
        <button data-action="unknown" class="ifll-btn-unknown">✗ 不认识</button>
      </div>
    `;

    // Position
    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 260) + 'px';
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
      // Show on hover as quick preview
      const word = e.target.closest('.ifll-word');
      if (word) {
        word.title = `${word.dataset.en} — ${word.dataset.def || ''} [click for more]`;
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

  /* ---- MutationObserver for dynamic content ---- */
  let observer = null;

  function startObserver(settings) {
    if (observer) observer.disconnect();

    let timer = null;
    observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        inject(document.body, settings);
      }, 800); // debounce 800ms
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
    // Remove injected spans
    document.querySelectorAll('.ifll-word').forEach(el => {
      const text = document.createTextNode(el.dataset.zh || el.textContent);
      el.parentNode.replaceChild(text, el);
    });
  }

  return { init, destroy, inject };
})();
