/*
 * IFLL — Content Script
 * Entry point: runs on every page
 * Handles: welcome prompt, initial injection, settings-change re-injection
 */
(async () => {
  /* ---- Welcome prompt bar ---- */
  async function showWelcomePrompt() {
    const hostname = window.location.hostname;

    /* Already decided for this session? */
    const decision = sessionStorage.getItem('ifll_decision_' + hostname);
    if (decision === 'accepted') return true;
    if (decision === 'rejected') return false;

    return new Promise((resolve) => {
      const bar = document.createElement('div');
      bar.className = 'ifll-prompt';
      bar.innerHTML = `
        <div class="ifll-prompt-body">
          <div class="ifll-prompt-icon">🌐</div>
          <div class="ifll-prompt-text">
            <span class="ifll-prompt-title">发现新的语言学习页面</span>
            <span class="ifll-prompt-desc">是否在此页面开启沉浸式外语学习？</span>
          </div>
          <div class="ifll-prompt-actions">
            <button class="ifll-prompt-btn ifll-prompt-btn-yes">开始学习</button>
            <button class="ifll-prompt-btn ifll-prompt-btn-no">暂不需要</button>
          </div>
        </div>
        <div class="ifll-prompt-progress">
          <div class="ifll-prompt-bar"></div>
        </div>
      `;

      /* Append and trigger animation */
      document.body.prepend(bar);
      requestAnimationFrame(() => bar.classList.add('ifll-prompt-show'));

      /* Progress bar animation: shrink from 100% to 0% over 8s */
      const progressBar = bar.querySelector('.ifll-prompt-bar');
      requestAnimationFrame(() => { progressBar.style.transition = 'width 8s linear'; progressBar.style.width = '0%'; });

      /* Timeout: 8 seconds → reject */
      const timer = setTimeout(() => dismiss(false), 8000);

      function dismiss(accepted) {
        clearTimeout(timer);
        bar.classList.remove('ifll-prompt-show');
        bar.classList.add('ifll-prompt-hide');
        setTimeout(() => {
          bar.remove();
          sessionStorage.setItem('ifll_decision_' + hostname, accepted ? 'accepted' : 'rejected');
          resolve(accepted);
        }, 400);
      }

      bar.querySelector('.ifll-prompt-btn-yes').addEventListener('click', () => dismiss(true));
      bar.querySelector('.ifll-prompt-btn-no').addEventListener('click', () => dismiss(false));
    });
  }

  /* ---- Initial injection ---- */
  async function init() {
    const settings = await IFLL_STORAGE.get();
    if (!settings.enabled) return;

    const hostname = window.location.hostname;
    if (settings.excludedSites && settings.excludedSites.some(s => hostname.includes(s))) return;

    /* Show the welcome prompt and wait for user decision */
    const accepted = await showWelcomePrompt();
    if (!accepted) return;

    const delay = document.readyState === 'complete' ? 100 : 500;
    setTimeout(() => { IFLL_INJECTOR.init(); }, delay);
  }

  /* ---- Listen for settings changes ---- */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IFLL_SETTINGS_CHANGED') {
      if (message.settings.enabled === false) { IFLL_INJECTOR.destroy(); return; }
      if (message.settings.excludedSites) {
        const hostname = window.location.hostname;
        if (message.settings.excludedSites.some(s => hostname.includes(s))) {
          IFLL_INJECTOR.destroy(); return;
        }
      }
      IFLL_INJECTOR.destroy();
      IFLL_INJECTOR.init();
    }
  });

  /* ---- Go ---- */
  /* Wait for body to exist before showing prompt */
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
