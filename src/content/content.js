/*
 * IFLL — Content Script
 * Entry point: runs on every page
 */
(async () => {
  async function showWelcomePrompt() {
    return new Promise((resolve) => {
      const hostname = window.location.hostname;
      const cached = sessionStorage.getItem('ifll_decision_' + hostname);
      if (cached === 'accepted') { resolve(true); return; }
      if (cached === 'rejected') { resolve(false); return; }

      const bar = document.createElement('div');
      bar.className = 'ifll-prompt';
      bar.innerHTML = `
        <div class="ifll-prompt-body">
          <span class="ifll-prompt-icon">📘</span>
          <span class="ifll-prompt-text">
            <span class="ifll-prompt-title">当前页面是否进行沉浸式外语学习？</span>
            <span class="ifll-prompt-desc">点击「开始」将把中文词汇替换为英文</span>
          </span>
          <span class="ifll-prompt-actions">
            <button class="ifll-prompt-btn ifll-prompt-btn-yes">开始</button>
            <button class="ifll-prompt-btn ifll-prompt-btn-no">跳过</button>
          </span>
        </div>
        <div class="ifll-prompt-progress"><div class="ifll-prompt-bar"></div></div>`;
      document.body.prepend(bar);
      requestAnimationFrame(() => bar.classList.add('ifll-prompt-show'));
      const pbar = bar.querySelector('.ifll-prompt-bar');
      requestAnimationFrame(() => { pbar.style.transition = 'width 8s linear'; pbar.style.width = '0%'; });
      const timer = setTimeout(() => dismiss(false), 8000);
      function dismiss(accepted) {
        clearTimeout(timer);
        bar.classList.remove('ifll-prompt-show');
        bar.classList.add('ifll-prompt-hide');
        setTimeout(async () => {
          bar.remove();
          sessionStorage.setItem('ifll_decision_' + hostname, accepted ? 'accepted' : 'rejected');
          if (!accepted) {
            const { excludedSites = [] } = await IFLL_STORAGE.get();
            if (!excludedSites.includes(hostname)) { excludedSites.push(hostname); await IFLL_STORAGE.set({ excludedSites }); }
          }
          resolve(accepted);
        }, 400);
      }
      bar.querySelector('.ifll-prompt-btn-yes').addEventListener('click', () => dismiss(true));
      bar.querySelector('.ifll-prompt-btn-no').addEventListener('click', () => dismiss(false));
    });
  }

  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;
    const hostname = window.location.hostname;
    if (settings.excludedSites && settings.excludedSites.some(s => hostname.includes(s))) return;
    const accepted = await showWelcomePrompt();
    if (!accepted) return;
    const delay = document.readyState === 'complete' ? 100 : 500;
    setTimeout(() => { IFLL_INJECTOR.init(); }, delay);
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
  });

  if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();
