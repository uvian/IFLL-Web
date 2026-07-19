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
  const apiEndpoint = document.getElementById('apiEndpoint');
  const apiEndpointCustom = document.getElementById('apiEndpointCustom');
  const apiEndpointCustomRow = document.getElementById('apiEndpointCustomRow');
  const apiModel = document.getElementById('apiModel');
  const saveApi = document.getElementById('saveApi');
  const testApi = document.getElementById('testApi');
  const refreshModels = document.getElementById('refreshModels');
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

  /* Restore API endpoint + model */
  const defaultEndpoints = ['https://api.deepseek.com', 'https://opencode.ai/zen/go/v1', 'https://api.openai.com/v1', 'https://openrouter.ai/api/v1'];
  if (defaultEndpoints.includes(settings.apiEndpoint)) {
    apiEndpoint.value = settings.apiEndpoint;
  } else {
    apiEndpoint.value = '__custom__';
    apiEndpointCustom.value = settings.apiEndpoint || '';
    apiEndpointCustomRow.style.display = 'flex';
  }
  if (settings.apiModel) {
    // Check if it's in the dropdown already
    if ([...apiModel.options].some(o => o.value === settings.apiModel)) {
      apiModel.value = settings.apiModel;
    } else {
      // Add a custom option
      const opt = document.createElement('option');
      opt.value = settings.apiModel;
      opt.textContent = settings.apiModel;
      opt.selected = true;
      apiModel.appendChild(opt);
    }
  }

  apiEndpoint.addEventListener('change', () => {
    const show = apiEndpoint.value === '__custom__';
    apiEndpointCustomRow.style.display = show ? 'flex' : 'none';
  });

  /* ── Save API settings ── */
  async function getEffectiveEndpoint() {
    return apiEndpoint.value === '__custom__' ? apiEndpointCustom.value.trim() : apiEndpoint.value;
  }

  saveApi.addEventListener('click', async () => {
    await savePartial({
      apiKey: apiKey.value.trim(),
      apiEndpoint: await getEffectiveEndpoint(),
      apiModel: apiModel.value
    });
    saveApi.textContent = '已保存';
    setTimeout(() => { saveApi.textContent = '保存'; }, 2000);
  });

  /* ── Test API connection ── */
  testApi.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) { testApi.textContent = '⚠️ 请先填入 API Key'; return; }
    testApi.textContent = '⏳ 测试中...';
    testApi.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'IFLL_TEST_API',
        apiKey: key,
        apiEndpoint: await getEffectiveEndpoint(),
        apiModel: apiModel.value
      });
      if (result && result.success) {
        testApi.textContent = '✅ 连接成功';
      } else {
        testApi.textContent = '⚠️ ' + ((result && result.error) || '连接失败');
      }
    } catch (err) {
      testApi.textContent = '⚠️ ' + err.message;
    }
    testApi.disabled = false;
    setTimeout(() => { testApi.textContent = '🔌 测试连接'; }, 3500);
  });

  /* ── Refresh model list ── */
  let refreshing = false;
  refreshModels.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) { refreshModels.textContent = '⚠️'; return; }
    if (refreshing) return;
    refreshing = true;
    refreshModels.textContent = '⟳';
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'IFLL_LIST_MODELS',
        apiKey: key,
        apiEndpoint: await getEffectiveEndpoint()
      });
      if (result && result.models && result.models.length) {
        const currentVal = apiModel.value;
        apiModel.innerHTML = '';
        for (const m of result.models) {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (m === currentVal) opt.selected = true;
          apiModel.appendChild(opt);
        }
        refreshModels.textContent = `✓ ${result.models.length}`;
      } else {
        refreshModels.textContent = '⚠️';
      }
    } catch (_) {
      refreshModels.textContent = '⚠️';
    }
    refreshing = false;
    setTimeout(() => { refreshModels.textContent = '↻'; }, 3000);
  });

  /* ── Excluded sites rendering ── */
  renderExcludedSites(settings.excludedSites || []);
  const excludedCountEl = document.getElementById('excludedCount');
  if (excludedCountEl) excludedCountEl.textContent = (settings.excludedSites || []).length;

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

  /* ── Exclude current page ── */
  const excludeCurrent = document.getElementById('excludeCurrent');
  if (excludeCurrent) {
    excludeCurrent.addEventListener('click', async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;
      const hostname = new URL(tabs[0].url).hostname;
      const { excludedSites = [] } = await IFLL_STORAGE.get();
      if (!excludedSites.includes(hostname)) {
        excludedSites.push(hostname);
        await savePartial({ excludedSites });
      }
      renderExcludedSites(excludedSites);
      if (excludedCountEl) excludedCountEl.textContent = excludedSites.length;
      excludeCurrent.textContent = '✅ 已排除 ' + hostname;
      setTimeout(() => { excludeCurrent.textContent = '⛔ 排除当前页面'; }, 2000);
    });
  }

  if (clearExcluded) {
    clearExcluded.addEventListener('click', async () => {
      await savePartial({ excludedSites: [] });
      renderExcludedSites([]);
    });
  }

  /* ── Refresh page ── */
  refreshBtn.addEventListener('click', () => { chrome.tabs.reload(); });

  /* ── Import / Export ── */
  const exportBtn = document.getElementById('exportConfig');
  const importBtn = document.getElementById('importConfig');
  const importInput = document.getElementById('importFileInput');

  exportBtn.addEventListener('click', async () => {
    const all = await chrome.storage.sync.get(null);
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ifll-config.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => { importInput.click(); });

  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const allowed = ['enabled','frequency','level','knownWords','excludedSites','apiKey','apiEndpoint','apiModel'];
      const clean = {};
      for (const k of allowed) if (k in data) clean[k] = data[k];
      await chrome.storage.sync.set(clean);
      importBtn.textContent = '✅ 已导入';
      setTimeout(() => { location.reload(); }, 1200);
    } catch (_) {
      importBtn.textContent = '❌ 文件无效';
      setTimeout(() => { importBtn.textContent = '📥 导入配置'; }, 2500);
    }
    importInput.value = '';
  });
});
