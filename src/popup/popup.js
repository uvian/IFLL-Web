/*
 * IFLL — Popup script
 */
document.addEventListener('DOMContentLoaded', async () => {
  const enabled = document.getElementById('enabled');
  const toggleLabel = document.getElementById('toggleLabel');
  const frequency = document.getElementById('frequency');
  const level = document.getElementById('level');
  const wordCount = document.getElementById('wordCount');
  const knownCount = document.getElementById('knownCount');
  const apiKey = document.getElementById('apiKey');
  const saveApi = document.getElementById('saveApi');
  const refreshBtn = document.getElementById('refreshPage');
  const excludedList = document.getElementById('excludedList');
  const clearExcluded = document.getElementById('clearExcluded');

  const settings = await IFLL_STORAGE.get();
  enabled.checked = settings.enabled;
  toggleLabel.textContent = settings.enabled ? '已开启' : '已关闭';
  frequency.value = settings.frequency;
  level.value = settings.level;
  apiKey.value = settings.apiKey || '';
  wordCount.textContent = WORD_BANK.length;
  knownCount.textContent = (settings.knownWords || []).length;

  renderExcludedSites(settings.excludedSites || []);

  async function savePartial(partial) {
    await IFLL_STORAGE.set(partial);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'IFLL_SETTINGS_CHANGED', settings: partial }).catch(() => {});
    }
  }

  function renderExcludedSites(sites) {
    if (!excludedList) return;
    if (!sites || !sites.length) {
      excludedList.innerHTML = '<span class="p-empty">暂无排除的网站</span>';
      return;
    }
    excludedList.innerHTML = sites.map(s =>
      `<span class="p-excluded-item">
        <span>${s}</span>
        <button class="p-excluded-remove" data-site="${s}">✕</button>
      </span>`
    ).join('');

    excludedList.querySelectorAll('.p-excluded-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const site = btn.dataset.site;
        const cur = await IFLL_STORAGE.get();
        const sites = (cur.excludedSites || []).filter(s => s !== site);
        await savePartial({ excludedSites: sites });
        renderExcludedSites(sites);
      });
    });
  }

  enabled.addEventListener('change', async () => {
    const val = enabled.checked;
    toggleLabel.textContent = val ? '已开启' : '已关闭';
    await savePartial({ enabled: val });
  });

  frequency.addEventListener('change', () => savePartial({ frequency: frequency.value }));
  level.addEventListener('change', () => savePartial({ level: level.value }));

  saveApi.addEventListener('click', async () => {
    await savePartial({ apiKey: apiKey.value.trim() });
    saveApi.textContent = '已保存';
    setTimeout(() => { saveApi.textContent = '保存'; }, 2000);
  });

  refreshBtn.addEventListener('click', () => { chrome.tabs.reload(); });

  if (clearExcluded) {
    clearExcluded.addEventListener('click', async () => {
      await savePartial({ excludedSites: [] });
      renderExcludedSites([]);
    });
  }
});
