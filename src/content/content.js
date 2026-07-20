/*
 * IFLL — Content Script
 * Entry point: runs on every page
 */
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
      const timer = setTimeout(() => dismiss('replace'), 8000);

      function dismiss(mode) {
        clearTimeout(timer);
        bar.classList.remove('ifll-prompt-show');
        bar.classList.add('ifll-prompt-hide');
        setTimeout(async () => {
          bar.remove();
          sessionStorage.setItem('ifll_decision_' + hostname, mode);
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
        btn.addEventListener('click', () => dismiss(btn.dataset.mode));
      });
    });
  }

  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;
    const hostname = window.location.hostname;
    if (settings.excludedSites && settings.excludedSites.some(s => hostname.includes(s))) return;
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
        if (message.settings.excludedSites.some(s => window.location.hostname.includes(s))) {
          IFLL_INJECTOR.destroy(); return;
        }
      }
      IFLL_INJECTOR.destroy();
      IFLL_INJECTOR.init();
    }
    if (message.type === 'IFLL_MODE_CHANGED') {
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
