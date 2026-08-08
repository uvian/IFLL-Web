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
  const EXCLUDED_PREVIEW = 5;   // show this many collapsed, rest behind "展开"
  let excludedExpanded = false;

  function compactHost(s) {
    /* Visual shortening only — full hostname kept in data-site for removal */
    let h = s.replace(/^www\./, '');
    return h.length > 22 ? h.slice(0, 10) + '…' + h.slice(-8) : h;
  }

  async function renderExcluded() {
    const s = await IFLL_STORAGE.get();
    const sites = s.excludedSites || [];
    if (!sites.length) {
      excludedList.innerHTML = '<span class="p-empty">暂无</span>';
      return;
    }
    const shown = excludedExpanded ? sites : sites.slice(0, EXCLUDED_PREVIEW);
    const hidden = sites.length - shown.length;
    excludedList.innerHTML = shown.map(site =>
      `<span class="p-excluded-item" title="${site}">${compactHost(site)}<button class="p-excluded-remove" data-site="${site}">x</button></span>`
    ).join('') + (hidden > 0
      ? `<button class="p-excluded-toggle" id="excludedToggle">共 ${sites.length} 个 · 展开</button>`
      : (excludedExpanded ? `<button class="p-excluded-toggle" id="excludedToggle">收起</button>` : ''));
    const toggle = document.getElementById('excludedToggle');
    if (toggle) toggle.addEventListener('click', () => { excludedExpanded = !excludedExpanded; renderExcluded(); });
    excludedList.querySelectorAll('.p-excluded-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const updated = sites.filter(s => s !== btn.dataset.site);
        await IFLL_STORAGE.set({ excludedSites: updated });
        renderExcluded();
        notifyTabsSettingsChanged();
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
      notifyTabsSettingsChanged();
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

  /* ── Notify all tabs that settings changed (so pages re-apply immediately) ── */
  async function notifyTabsSettingsChanged() {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.id == null) continue;
      chrome.tabs.sendMessage(t.id, { type: 'IFLL_SETTINGS_CHANGED', settings: await IFLL_STORAGE.get() }).catch(() => {});
    }
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
    await notifyTabsSettingsChanged();
  }

  /* ── Toggle ── */
  enabled.addEventListener('change', async () => {
    toggleLabel.textContent = enabled.checked ? '已开启' : '已关闭';
    await saveAll();
  });

  frequency.addEventListener('change', () => saveAll());
  level.addEventListener('change', () => saveAll());

  dailyCount.addEventListener('change', () => savePartial({ dailyWordCount: parseInt(dailyCount.value) || 15, dailyWordDate: '' }));

  /* Theme toggle */
  const tooltipTheme = document.getElementById('tooltipTheme');
  if (tooltipTheme) {
    tooltipTheme.value = settings.tooltipTheme || 'auto';
    tooltipTheme.addEventListener('change', () => savePartial({ tooltipTheme: tooltipTheme.value }));
  }

  /* ── Save API ── */
  saveApiBtn.addEventListener('click', async () => {
    const prev = await IFLL_STORAGE.get();
    const newKey = apiKey.value.trim();
    const newEp = await getEffectiveEndpoint();
    const newMdl = apiModel.value.trim();
    await IFLL_STORAGE.set({
      apiKey: newKey,
      apiEndpoint: newEp,
      apiModel: newMdl
    });
    /* Broadcast only when something actually changed — a redundant save would
       otherwise re-inject every replace page (stat inflation) and re-translate
       every translate page (double billing). */
    const changed = newKey !== (prev.apiKey || '') || newEp !== (prev.apiEndpoint || '') || newMdl !== (prev.apiModel || '');
    if (changed) await notifyTabsSettingsChanged();
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

  /* ── Import / Export ── */
  exportBtn.addEventListener('click', async () => {
    const [syncAll, localBig] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get(['knownWords','reviewQueue','userWords','phraseMap'])
    ]);
    const all = { ...localBig, ...syncAll };  // big collections from local, config from sync
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
      const allowed = ['enabled','defaultMode','siteModes','frequency','level','apiKey','apiEndpoint','apiModel','voiceName','excludedSites','knownWords','reviewQueue','userWords','dailyStats','phraseMap','dailyWords','dailyWordDate','dailyWordCount','tooltipTheme','customActions'];
      const filtered = {};
      for (const k of allowed) if (k in data) filtered[k] = data[k];
      await IFLL_STORAGE.set(filtered);
      importBtn.textContent = '已导入';
      setTimeout(() => { importBtn.textContent = '导入'; }, 2000);
    } catch (e) { importBtn.textContent = '出错'; }
  });

  /* ── Custom AI actions ── */
  const actName = document.getElementById('actName');
  const actAdd = document.getElementById('actAdd');
  const actEditor = document.getElementById('actEditor');
  const actPrompt = document.getElementById('actPrompt');
  const actFields = document.getElementById('actFields');
  const actSave = document.getElementById('actSave');
  const actDel = document.getElementById('actDel');
  const actEditId = document.getElementById('actEditId');
  const customActionsList = document.getElementById('customActionsList');
  let editingActionId = null;

  /* Escape user-supplied names/ids before innerHTML (import chain is outside the trusted boundary) */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function renderCustomActions() {
    const s = await IFLL_STORAGE.get();
    const acts = s.customActions || [];
    if (!acts.length) { customActionsList.innerHTML = '<span class="p-empty">暂无自定义动作</span>'; return; }
    customActionsList.innerHTML = acts.map(a =>
      `<div class="p-action-item"><span>${esc(a.name)}</span><button class="p-btn p-btn-sm p-btn-ghost" data-act-edit="${esc(a.id)}">编辑</button></div>`
    ).join('');
    customActionsList.querySelectorAll('[data-act-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = acts.find(a => a.id === btn.dataset.actEdit);
        if (!act) return;
        editingActionId = act.id;
        actName.value = act.name;
        actPrompt.value = act.prompt || '';
        actFields.value = (act.fields || []).join(', ');
        actDel.style.display = 'inline-block';
        actEditId.textContent = act.id;
        actEditor.style.display = 'block';
      });
    });
  }
  renderCustomActions();

  actAdd.addEventListener('click', () => {
    editingActionId = null;
    actName.value = ''; actPrompt.value = ''; actFields.value = '';
    actDel.style.display = 'none';
    actEditId.textContent = '';
    actEditor.style.display = 'block';
    actName.focus();
  });

  actSave.addEventListener('click', async () => {
    const name = actName.value.trim();
    if (!name) { actName.focus(); return; }
    const s = await IFLL_STORAGE.get();
    const acts = s.customActions || [];
    const fields = actFields.value.split(/[,，]/).map(f => f.trim()).filter(Boolean);
    if (editingActionId) {
      const act = acts.find(a => a.id === editingActionId);
      if (act) { act.name = name; act.prompt = actPrompt.value; act.fields = fields; }
    } else {
      acts.push({ id: 'act_' + Date.now().toString(36), name, prompt: actPrompt.value, fields });
    }
    await IFLL_STORAGE.set({ customActions: acts });
    actEditor.style.display = 'none';
    renderCustomActions();
  });

  actDel.addEventListener('click', async () => {
    if (!editingActionId) return;
    const s = await IFLL_STORAGE.get();
    const acts = (s.customActions || []).filter(a => a.id !== editingActionId);
    await IFLL_STORAGE.set({ customActions: acts });
    actEditor.style.display = 'none';
    renderCustomActions();
  });

  /* ── Batch deep analysis pre-processing ── */
  let batchAbort = false;
  let batchRequestId = null;   /* 当前批次的请求标识，停止时用于带外中止 */
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
    batchRequestId = crypto.randomUUID ? crypto.randomUUID() : 'batch_' + Date.now().toString(36);
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
    const { apiKey: ak, apiEndpoint: ep, apiModel: mdl } = s;
    /* Cache shape MUST match injector's cacheIfUsable (deep without examples
       nested + top-level examples) — otherwise the tooltip hit condition
       `cacheEntry?.deep && cacheEntry?.examples?.length` never matches and
       every prefetched word gets re-fetched (double billing). */
    const cacheEntryFor = (r) => ({
      deep: { synonyms: r.synonyms, antonyms: r.antonyms, collocations: r.collocations, usage: r.usage },
      deepCachedAt: Date.now(),
      examples: r.examples || [],
      examplesCachedAt: Date.now()
    });
    /* ≥10 words → merged batch API (one call per 40-word chunk, 10× fewer requests) */
    const BATCH_CHUNK = 40;
    if (batch.length >= 10) {
      const totalChunks = Math.ceil(batch.length / BATCH_CHUNK);
      for (let i = 0; i < batch.length && !batchAbort; i += BATCH_CHUNK) {
        const chunk = batch.slice(i, i + BATCH_CHUNK);
        const chunkNo = Math.floor(i / BATCH_CHUNK) + 1;
        /* Smooth visual progress while the merged request runs — a 40-word
           batch call takes 10-30s and would otherwise look frozen at 0%. */
        const basePct = i / total * 100;
        const targetPct = Math.min(100, (i + chunk.length) / total * 100);
        let visual = basePct;
        textEl.textContent = `解析中 ${chunkNo}/${totalChunks} 批…`;
        const iv = setInterval(() => {
          if (batchAbort) { clearInterval(iv); return; }   /* 停止 → bar freezes immediately */
          visual += Math.max(0.3, (targetPct - visual) * 0.05);
          if (visual < targetPct - 0.5) fillEl.style.width = visual + '%';
        }, 150);
        try {
          const result = await Promise.race([
            chrome.runtime.sendMessage({ type: 'IFLL_BATCH_DEEP', words: chunk, apiKey: ak, apiEndpoint: ep, apiModel: mdl, requestId: batchRequestId }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 95000))
          ]);
          if (result && !result.error && Array.isArray(result.results)) {
            /* Map by normalized word first; fall back to array index (AI may
               normalize case or pad whitespace — never write to a hallucinated key) */
            const byWord = new Map(result.results.map(r => [(r.word || '').trim().toLowerCase(), r]));
            /* Index fallback ONLY when result count matches chunk count — if the
               AI omitted words, indexes misalign and would write the wrong
               word's data under the wrong key. */
            const idxSafe = result.results.length === chunk.length;
            for (let j = 0; j < chunk.length; j++) {
              const r = byWord.get(chunk[j].en.trim().toLowerCase()) || (idxSafe ? result.results[j] : null);
              if (!r) continue;
              const hasData = (r.synonyms?.length || r.antonyms?.length ||
                              r.collocations?.length || r.usage || r.examples?.length);
              if (!hasData) continue;
              try { await IFLL_STORAGE.setAiCacheEntry(chunk[j].en, cacheEntryFor(r)); }
              catch (_) { /* one word's storage failure must not drop the rest */ }
            }
          }
        } catch (_) { /* skip chunk errors, continue */ }
        clearInterval(iv);
        done = Math.min(batch.length, i + chunk.length);
        fillEl.style.width = (done / total * 100) + '%';
        textEl.textContent = done + '/' + total;
        if (!batchAbort) await new Promise(r => setTimeout(r, 800));
      }
    } else {
      for (const w of batch) {
        if (batchAbort) break;
        try {
          const result = await Promise.race([
            chrome.runtime.sendMessage({ type: 'IFLL_AI_DEEP_ANALYSIS', en: w.en, zh: w.zh, def: w.def, apiKey: ak, apiEndpoint: ep, apiModel: mdl }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000))
          ]);
          if (result && !result.error) {
            const hasData = (result.synonyms?.length || result.antonyms?.length ||
                            result.collocations?.length || result.usage || result.examples?.length);
            if (hasData) {
              await IFLL_STORAGE.setAiCacheEntry(w.en, cacheEntryFor(result));
            }
          }
        } catch (_) { /* skip errors, continue */ }
        done++;
        fillEl.style.width = (done / total * 100) + '%';
        textEl.textContent = done + '/' + total;
        if (done < total && !batchAbort) await new Promise(r => setTimeout(r, 800));
      }
    }

    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    /* Disable briefly so clicking the 完成/已停止 feedback can't restart a run */
    startBtn.disabled = true;
    startBtn.textContent = batchAbort ? '已停止' : '完成';
    setTimeout(() => { startBtn.disabled = false; startBtn.textContent = '开始'; }, 3000);
  });

  document.getElementById('batchStop').addEventListener('click', () => {
    batchAbort = true;
    /* 带外中止：让 SW 真的掐断在途请求，而不是等它跑完（≤95s）再丢弃 */
    if (batchRequestId) {
      chrome.runtime.sendMessage({ type: 'IFLL_BATCH_ABORT', requestId: batchRequestId }).catch(() => {});
    }
  });
});
