/*
 * IFLL — Popup script
 */
document.addEventListener('DOMContentLoaded', async () => {
  /* Elements */
  const enabled = document.getElementById('enabled');
  const toggleLabel = document.getElementById('toggleLabel');
  const frequency = document.getElementById('frequency');
  const level = document.getElementById('level');
  const wordCount = document.getElementById('wordCount');
  const knownCount = document.getElementById('knownCount');
  const apiKey = document.getElementById('apiKey');
  const saveApi = document.getElementById('saveApi');
  const refreshBtn = document.getElementById('refreshPage');

  /* Load settings */
  const settings = await IFLL_STORAGE.get();
  enabled.checked = settings.enabled;
  toggleLabel.textContent = settings.enabled ? '已开启' : '已关闭';
  frequency.value = settings.frequency;
  level.value = settings.level;
  apiKey.value = settings.apiKey || '';
  wordCount.textContent = WORD_BANK.length;
  knownCount.textContent = (settings.knownWords || []).length;

  /* Auto-save on change */
  async function savePartial(partial) {
    await IFLL_STORAGE.set(partial);
    /* Notify active tabs of settings change */
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'IFLL_SETTINGS_CHANGED', settings: partial }).catch(() => {});
    }
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

  refreshBtn.addEventListener('click', () => {
    chrome.tabs.reload();
  });
});
