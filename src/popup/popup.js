/*
 * IFLL — Popup script
 */
document.addEventListener('DOMContentLoaded', async () => {
  const enabled = document.getElementById('enabled');
  const toggleLabel = document.getElementById('toggleLabel');
  const modeSelector = document.getElementById('modeSelector');
  const frequency = document.getElementById('frequency');
  const level = document.getElementById('level');
  const dailyCount = document.getElementById('dailyCount');
  const excludedList = document.getElementById('excludedList');
  const excludeBtn = document.getElementById('excludeCurrent');
  const apiKey = document.getElementById('apiKey');
  const apiEndpoint = document.getElementById('apiEndpoint');
  const apiEndpointCustom = document.getElementById('apiEndpointCustom');
  const apiEndpointCustomRow = document.getElementById('apiEndpointCustomRow');
  const apiModel = document.getElementById('apiModel');
  const refreshModels = document.getElementById('refreshModels');
  const saveApiBtn = document.getElementById('saveApi');
  const testApiBtn = document.getElementById('testApi');
  const exportBtn = document.getElementById('exportConfig');
  const importBtn = document.getElementById('importConfig');
  const importFile = document.getElementById('importFileInput');
  const refreshPageBtn = document.getElementById('refreshPage');
  const voiceSelect = document.getElementById('voiceSelect');

  /* ── Init settings ── */
  const settings = await IFLL_STORAGE.get();
  enabled.checked = settings.enabled;
  toggleLabel.textContent = settings.enabled ? '已开启' : '已关闭';
  frequency.value = settings.frequency;
  level.value = settings.level;
  dailyCount.value = String(settings.dailyWordCount || 15);
  apiKey.value = settings.apiKey || '';
  // Ensure saved model is in the dropdown
  const savedModel = settings.apiModel || 'deepseek-v4-flash';
  if (savedModel && !Array.from(apiModel.options).some(o => o.value === savedModel)) {
    const opt = document.createElement('option');
    opt.value = savedModel;
    opt.textContent = savedModel;
    apiModel.appendChild(opt);
  }
  apiModel.value = savedModel;

  /* Restore API endpoint */
  const presetEndpoints = ['https://api.deepseek.com','https://opencode.ai/zen/go/v1','https://api.openai.com/v1','https://openrouter.ai/api/v1'];
  if (presetEndpoints.includes(settings.apiEndpoint)) {
    apiEndpoint.value = settings.apiEndpoint;
  } else if (settings.apiEndpoint) {
    apiEndpoint.value = '__custom__';
    apiEndpointCustom.value = settings.apiEndpoint;
    apiEndpointCustomRow.style.display = 'block';
  }

  /* Custom endpoint toggle */
  apiEndpoint.addEventListener('change', () => {
    const show = apiEndpoint.value === '__custom__';
    apiEndpointCustomRow.style.display = show ? 'block' : 'none';
  });

  /* ── Stats ── */
  const ds = settings.dailyStats || {};
  document.getElementById('statReplace').textContent = ds.replaceCount || 0;
  document.getElementById('statAnnotate').textContent = ds.annotateCount || 0;
  document.getElementById('statTranslate').textContent = Math.round((ds.translateChars || 0) / 100) || 0;
  document.getElementById('statMinutes').textContent = ds.totalLearned || 0;
  /* Word bank stats */
  document.getElementById('statWordbank').textContent = WORD_BANK.length;
  document.getElementById('statIpa').textContent = Math.round(WORD_BANK.filter(w => w.ipa).length / WORD_BANK.length * 100) + '%';
  document.getElementById('statKnown').textContent = (settings.knownWords || []).length;
  document.getElementById('statReview').textContent = (settings.reviewQueue || []).length;

  /* ── Excluded sites ── */
  async function renderExcluded() {
    const s = await IFLL_STORAGE.get();
    const sites = s.excludedSites || [];
    excludedList.innerHTML = sites.length ? sites.map(s =>
      `<span class="p-excluded-item">${s}<button class="p-excluded-remove" data-site="${s}">x</button></span>`
    ).join('') : '<span class="p-empty">暂无</span>';
    excludedList.querySelectorAll('.p-excluded-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const updated = sites.filter(s => s !== btn.dataset.site);
        await IFLL_STORAGE.set({ excludedSites: updated });
        renderExcluded();
      });
    });
  }
  renderExcluded();

  excludeBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.url) return;
    let hostname;
    try { hostname = new URL(tabs[0].url).hostname; } catch (_) { return; }
    const s = await IFLL_STORAGE.get();
    const sites = s.excludedSites || [];
    if (!sites.includes(hostname)) {
      sites.push(hostname);
      await IFLL_STORAGE.set({ excludedSites: sites });
      renderExcluded();
    }
  });

  /* ── Review count ── */
  const rc = await IFLL_STORAGE.getReviewCount();
  if (rc > 0) {
    document.getElementById('reviewCount').style.display = 'inline-flex';
    document.getElementById('reviewBadge').textContent = rc;
  }

  /* ── Mode selector ── */
  async function updateModeUI() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.url) return;
    let hostname;
    try { hostname = new URL(tabs[0].url).hostname; } catch (_) { return; }
    const mode = await IFLL_STORAGE.getModeForHost(hostname);
    modeSelector.querySelectorAll('.p-mode-btn').forEach(btn => {
      btn.classList.toggle('p-mode-active', btn.dataset.mode === mode);
    });
  }
  updateModeUI();

  modeSelector.querySelectorAll('.p-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      modeSelector.querySelectorAll('.p-mode-btn').forEach(b => b.classList.remove('p-mode-active'));
      btn.classList.add('p-mode-active');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        let hostname;
        try { hostname = new URL(tabs[0].url).hostname; } catch (_) { return; }
        await IFLL_STORAGE.setModeForHost(hostname, mode);
        chrome.tabs.sendMessage(tabs[0].id, { type: 'IFLL_MODE_CHANGED', mode }).catch(() => {});
      }
    });
  });

  /* ── Voice ── */
  function populateVoices() {
    const voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '<option value="">系统默认</option>';
    for (const v of voices) {
      if (v.lang.startsWith('en')) {
        voiceSelect.innerHTML += `<option value="${v.name}">${v.name} (${v.lang})</option>`;
      }
    }
  }
  speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
  voiceSelect.value = settings.voiceName || '';

  voiceSelect.addEventListener('change', () => savePartial({ voiceName: voiceSelect.value }));

  /* ── Quick-save helpers ── */
  async function savePartial(obj) { await IFLL_STORAGE.set(obj); }

  async function getEffectiveEndpoint() {
    return apiEndpoint.value === '__custom__' ? apiEndpointCustom.value.trim() : apiEndpoint.value;
  }

  /* ── Save full config ── */
  async function saveAll() {
    await IFLL_STORAGE.set({
      enabled: enabled.checked,
      frequency: frequency.value,
      level: level.value,
      dailyWordCount: parseInt(dailyCount.value) || 15,
      apiKey: apiKey.value.trim(),
      apiEndpoint: await getEffectiveEndpoint(),
      apiModel: apiModel.value.trim(),
      voiceName: voiceSelect.value
    });
  }

  /* ── Toggle ── */
  enabled.addEventListener('change', async () => {
    toggleLabel.textContent = enabled.checked ? '已开启' : '已关闭';
    await saveAll();
  });

  frequency.addEventListener('change', () => saveAll());
  level.addEventListener('change', () => saveAll());

  dailyCount.addEventListener('change', () => savePartial({ dailyWordCount: parseInt(dailyCount.value) || 15 }));

  /* Theme toggle */
  const tooltipTheme = document.getElementById('tooltipTheme');
  if (tooltipTheme) {
    tooltipTheme.value = settings.tooltipTheme || 'auto';
    tooltipTheme.addEventListener('change', () => savePartial({ tooltipTheme: tooltipTheme.value }));
  }

  /* ── Save API ── */
  saveApiBtn.addEventListener('click', async () => {
    await IFLL_STORAGE.set({
      apiKey: apiKey.value.trim(),
      apiEndpoint: await getEffectiveEndpoint(),
      apiModel: apiModel.value.trim()
    });
    saveApiBtn.textContent = '已保存';
    setTimeout(() => { saveApiBtn.textContent = '保存'; }, 1500);
  });

  testApiBtn.addEventListener('click', async () => {
    testApiBtn.textContent = '测试中...'; testApiBtn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'IFLL_TEST_API',
        apiKey: apiKey.value.trim(),
        apiEndpoint: await getEffectiveEndpoint(),
        apiModel: apiModel.value.trim()
      });
      testApiBtn.textContent = result?.success ? '连接成功' : (result?.error || '失败');
    } catch (e) { testApiBtn.textContent = '无响应'; }
    testApiBtn.disabled = false;
    setTimeout(() => { testApiBtn.textContent = '测试连接'; }, 2000);
  });

  /* ── Refresh models ── */
  refreshModels.addEventListener('click', async () => {
    refreshModels.textContent = '...'; refreshModels.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'IFLL_LIST_MODELS',
        apiKey: apiKey.value.trim(),
        apiEndpoint: await getEffectiveEndpoint(),
        apiModel: apiModel.value.trim()
      });
      if (result?.models?.length) {
        apiModel.innerHTML = '';
        for (const m of result.models) {
          apiModel.innerHTML += `<option value="${m}">${m}</option>`;
        }
        refreshModels.textContent = `已刷新`;
      } else {
        refreshModels.textContent = '无权限';
      }
    } catch (e) { refreshModels.textContent = '出错'; }
    refreshModels.disabled = false;
    setTimeout(() => { refreshModels.textContent = '刷新'; }, 2000);
  });

  /* ── Refresh page ── */
  refreshPageBtn.addEventListener('click', () => { chrome.tabs.reload(); });

  const openPdfBtn = document.getElementById('openPdfViewer');
  if (openPdfBtn) openPdfBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'IFLL_OPEN_PDF', url: '' });
  });

  /* ── Import / Export ── */
  exportBtn.addEventListener('click', async () => {
    const all = await chrome.storage.sync.get(null);
    all.__ifll_export_version = 1;
    all.__ifll_export_date = new Date().toISOString();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ifll-config-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const allowed = ['enabled','defaultMode','siteModes','frequency','level','apiKey','apiEndpoint','apiModel','voiceName','excludedSites','knownWords','reviewQueue','userWords','dailyStats','phraseMap','dailyWords','dailyWordDate','dailyWordCount'];
      const filtered = {};
      for (const k of allowed) if (k in data) filtered[k] = data[k];
      await IFLL_STORAGE.set(filtered);
      importBtn.textContent = '已导入';
      setTimeout(() => { importBtn.textContent = '导入'; }, 2000);
    } catch (e) { importBtn.textContent = '出错'; }
  });

  /* ── Batch deep analysis pre-processing ── */
  let batchAbort = false;
  document.getElementById('batchStart').addEventListener('click', async () => {
    const count = Math.max(10, Math.min(1000, parseInt(document.getElementById('batchCount').value) || 100));
    const startBtn = document.getElementById('batchStart');
    const stopBtn = document.getElementById('batchStop');
    const progEl = document.getElementById('batchProgress');
    const fillEl = document.getElementById('batchFill');
    const textEl = document.getElementById('batchText');

    const s = await IFLL_STORAGE.get();
    if (!s.apiKey) { startBtn.textContent = '请先配置 API Key'; setTimeout(() => { startBtn.textContent = '开始'; }, 2000); return; }

    batchAbort = false;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    progEl.style.display = 'flex';

    /* Build candidate list: WORD_BANK entries not yet in AI cache */
    const cache = await IFLL_STORAGE.getAiCache();
    const candidates = [];
    for (const w of WORD_BANK) {
      const en = (w.en || '').trim();
      if (en && !cache[en]?.deep) candidates.push({ en, zh: w.zh, def: w.def || '' });
    }
    /* Shuffle and take count */
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const batch = candidates.slice(0, count);
    const total = batch.length;

    let done = 0;
    for (const w of batch) {
      if (batchAbort) break;
      try {
        const result = await Promise.race([
          chrome.runtime.sendMessage({ type: 'IFLL_AI_DEEP_ANALYSIS', en: w.en, zh: w.zh, def: w.def, apiKey: s.apiKey, apiEndpoint: s.apiEndpoint, apiModel: s.apiModel }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000))
        ]);
        if (result && !result.error) {
          const hasData = (result.synonyms?.length || result.antonyms?.length ||
                          result.collocations?.length || result.usage || result.examples?.length);
          if (hasData) {
            await IFLL_STORAGE.setAiCacheEntry(w.en, { deep: result, deepCachedAt: Date.now() });
          }
        }
      } catch (_) { /* skip errors, continue */ }
      done++;
      fillEl.style.width = (done / total * 100) + '%';
      textEl.textContent = done + '/' + total;
      /* Small delay between requests to avoid rate limiting */
      if (done < total && !batchAbort) await new Promise(r => setTimeout(r, 800));
    }

    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    startBtn.textContent = batchAbort ? '已停止' : '完成';
    setTimeout(() => { startBtn.textContent = '开始'; }, 3000);
  });

  document.getElementById('batchStop').addEventListener('click', () => {
    batchAbort = true;
  });
});
