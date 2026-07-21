/*
 * IFLL — Content Script
 * Entry point: runs on every page
 */
(() => {
  /* ── Selection Toolbar ── */
  let selBar = null, selTimer = null;

  function createSelBar() {
    if (selBar) return;
    selBar = document.createElement('div');
    selBar.id = 'ifll-sel-bar';
    selBar.className = 'ifll-sel-bar';
    selBar.innerHTML = `<button data-sel-action="translate" title="翻译">译</button><button data-sel-action="explain" title="AI 解释">解</button><button data-sel-action="speak" title="朗读">音</button><button data-sel-action="copy" title="复制">抄</button>`;
    selBar.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.selAction;
      const text = window.getSelection().toString().trim();
      if (!text) return;
      if (action === 'copy') { await navigator.clipboard.writeText(text); btn.textContent = '已复制'; setTimeout(() => btn.textContent = '抄', 1500); return; }
      if (action === 'speak') { window.speechSynthesis?.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = text.match(/[\u4e00-\u9fff]/) ? 'zh-CN' : 'en-US'; u.rate = 0.9; window.speechSynthesis?.speak(u); return; }
      try {
        btn.textContent = '...';
        const result = await chrome.runtime.sendMessage({ type: 'IFLL_SEL_TOOLBAR', action, text });
        if (result?.text) { const tip = document.createElement('div'); tip.className = 'ifll-sel-tip'; tip.textContent = result.text.slice(0, 200); selBar.appendChild(tip); setTimeout(() => tip.remove(), 5000); }
      } catch (_) { btn.textContent = '⚠'; setTimeout(() => btn.textContent = action === 'translate' ? '译' : '解', 2000); }
    });
    document.body.appendChild(selBar);
  }

  document.addEventListener('mouseup', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
      const sel = window.getSelection(); const text = sel.toString().trim();
      if (!text || text.length < 2 || text.length > 500) { if (selBar) selBar.style.display = 'none'; return; }
      createSelBar(); const rect = sel.getRangeAt(0).getBoundingClientRect();
      selBar.style.display = 'flex'; selBar.style.left = Math.min(rect.right, window.innerWidth - 180) + 'px'; selBar.style.top = (rect.top + window.scrollY - 36) + 'px';
    }, 300);
  });

  document.addEventListener('mousedown', (e) => { if (selBar && !selBar.contains(e.target)) selBar.style.display = 'none'; });
})();

(async () => {
  async function showWelcomePrompt(hostname) {
    return new Promise((resolve) => {
      const cached = sessionStorage.getItem('ifll_decision_' + hostname);
      if (cached === 'accepted') { resolve('replace'); return; }
      if (cached === 'rejected') { resolve('off'); return; }
      if (cached && ['replace','annotate','translate'].includes(cached)) { resolve(cached); return; }

      const bar = document.createElement('div');
      bar.className = 'ifll-prompt';
      bar.innerHTML = `
        <div class="ifll-prompt-body">
          <span class="ifll-prompt-icon">📘</span>
          <span class="ifll-prompt-text">
            <span class="ifll-prompt-title">当前页面的学习方式？</span>
            <span class="ifll-prompt-desc">选择一种模式开始学习</span>
          </span>
          <span class="ifll-prompt-actions">
            <button data-mode="replace" class="ifll-prompt-btn ifll-prompt-btn-primary">🔄 替换</button>
            <button data-mode="annotate" class="ifll-prompt-btn ifll-prompt-btn-secondary">✏️ 标注</button>
            <button data-mode="translate" class="ifll-prompt-btn ifll-prompt-btn-secondary">📑 翻译</button>
            <button data-mode="off" class="ifll-prompt-btn ifll-prompt-btn-skip">跳过</button>
          </span>
        </div>
        <div class="ifll-prompt-progress"><div class="ifll-prompt-bar"></div></div>`;
      document.body.prepend(bar);
      requestAnimationFrame(() => bar.classList.add('ifll-prompt-show'));
      const pbar = bar.querySelector('.ifll-prompt-bar');
      requestAnimationFrame(() => { pbar.style.transition = 'width 8s linear'; pbar.style.width = '0%'; });
      const timer = setTimeout(() => dismiss('off'), 8000);

      function dismiss(mode, clicked = false) {
        clearTimeout(timer);
        bar.classList.remove('ifll-prompt-show');
        bar.classList.add('ifll-prompt-hide');
        setTimeout(async () => {
          bar.remove();
          sessionStorage.setItem('ifll_decision_' + hostname, mode);
          /* Only persist if the user actively clicked — timeout default is transient */
          if (!clicked && mode === 'off') { resolve('off'); return; }
          if (mode === 'off') {
            const { excludedSites = [] } = await IFLL_STORAGE.get();
            if (!excludedSites.includes(hostname)) {
              excludedSites.push(hostname);
              await IFLL_STORAGE.set({ excludedSites });
            }
          } else {
            await IFLL_STORAGE.setModeForHost(hostname, mode);
          }
          resolve(mode);
        }, 400);
      }
      bar.querySelectorAll('.ifll-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => dismiss(btn.dataset.mode, true));
      });
    });
  }

  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;
    const hostname = window.location.hostname;
    if (settings.excludedSites && settings.excludedSites.some(s => hostname === s || hostname.endsWith('.' + s))) return;
    /* Check stored mode */
    let mode = await IFLL_STORAGE.getModeForHost(hostname);
    if (mode === 'off') return;
    /* Show prompt if on first visit */
    mode = await showWelcomePrompt(hostname);
    if (mode === 'off') return;
    IFLL_INJECTOR.start(mode);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'IFLL_SETTINGS_CHANGED') {
      if (message.settings.enabled === false) { IFLL_INJECTOR.destroy(); return; }
      if (message.settings.excludedSites) {
        if (message.settings.excludedSites.some(s => window.location.hostname === s || window.location.hostname.endsWith('.' + s))) {
          IFLL_INJECTOR.destroy(); return;
        }
      }
      IFLL_INJECTOR.destroy();
      IFLL_INJECTOR.init();
    }
    if (message.type === 'IFLL_MODE_CHANGED') {
      sessionStorage.setItem('ifll_decision_' + window.location.hostname, message.mode);
      IFLL_INJECTOR.destroy();
      const mode = message.mode;
      if (mode === 'off') return;
      IFLL_INJECTOR.start(mode);
    }
  });

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }

  /* ── PDF detection ── */
  if (window.location.pathname.endsWith('.pdf') || document.contentType === 'application/pdf') {
    const btn = document.createElement('div');
    btn.className = 'ifll-pdf-float';
    btn.textContent = '📑 用 IFLL 翻译此 PDF';
    btn.title = '在新页面打开 PDF 对照翻译';
    btn.addEventListener('click', () => {
      const pdfUrl = window.location.href;
      chrome.runtime.sendMessage({ type: 'IFLL_OPEN_PDF', url: pdfUrl });
    });
    document.body?.appendChild(btn);
  }
})();
