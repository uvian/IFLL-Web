/*
 * IFLL — Background Service Worker
 * AI proxy: examples, deep analysis, model listing, connection test
 */

chrome.runtime.onInstalled.addListener(async () => {
  /* Only backfill missing keys — never overwrite existing user data */
  const s = await chrome.storage.sync.get(null);
  const defaults = {
    frequency: 'medium', level: 'cet4',
    knownWords: [], excludedSites: [],
    reviewQueue: [], userWords: [],
    dailyWordCount: 15, phraseMap: {},
    tooltipTheme: 'auto'
  };
  const patch = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in s)) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  /* One-time migration: upgrade broken default model for existing users */
  if (s.apiModel === 'deepseek-chat') {
    await chrome.storage.sync.set({ apiModel: 'deepseek-v4-flash' });
  }
  /* Move unbounded collections (knownWords/reviewQueue/userWords/phraseMap)
     from sync (100KB quota) to local (10MB) — prevents silent save failures.
     Inlined here because the SW does not load storage.js. Idempotent. */
  const BIG_KEYS = ['knownWords', 'reviewQueue', 'userWords', 'phraseMap'];
  const bigSync = await chrome.storage.sync.get(BIG_KEYS);
  const bigLocal = await chrome.storage.local.get(BIG_KEYS);
  const toLocal = {};
  const toRemove = [];
  for (const k of BIG_KEYS) {
    if (bigSync[k] !== undefined && bigLocal[k] === undefined) {
      toLocal[k] = bigSync[k];
      toRemove.push(k);
    }
  }
  if (Object.keys(toLocal).length) {
    await chrome.storage.local.set(toLocal);
    await chrome.storage.sync.remove(toRemove);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    IFLL_AI_COMBINED: () => handleCombinedAnalysis(message.en, message.zh, message.def, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_AI_TRANSLATE: () => handleAiTranslate(message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_SEL_TOOLBAR: () => handleSelToolbar(message.action, message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_CUSTOM_ACTION: () => handleCustomAction(message.action, message.en, message.zh, message.def, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_BATCH_DEEP: () => handleBatchDeep(message.words, message.apiKey, message.apiEndpoint, message.apiModel, message.requestId),
    IFLL_BATCH_ABORT: () => abortBatch(message.requestId),
    IFLL_AI_DEEP_ANALYSIS: () => handleDeepAnalysis(message.en, message.zh, message.def, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_TEST_API: () => testApiConnection(message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_LIST_MODELS: () => listModels(message.apiKey, message.apiEndpoint),
    IFLL_TRACK_STAT: () => handleTrackStat(message.stat, message.count),
    IFLL_TRANSLATE_CACHE_GET: () => txCacheGet(message.key),
    IFLL_TRANSLATE_CACHE_SET: () => txCacheSet(message.key, message.value),
  };
  const fn = handlers[message.type];
  if (fn) { fn().then(sendResponse).catch(err => sendResponse({ error: err.message })); return true; }
});

/* ── Streaming port for combined analysis ── */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ifll-stream') return;
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'IFLL_AI_COMBINED') return;
    const { en, zh, def, apiKey, apiEndpoint, apiModel } = msg;
    if (!apiKey) { port.postMessage({ error: 'no api key' }); return; }
    const baseUrl = (apiEndpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: apiModel || 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: COMBINED_SYSTEM },
            { role: 'user', content: `Word: "${en}" (${zh}${def ? ', ' + def : ''})` }
          ],
          temperature: 0.5, max_tokens: 1200, stream: true,
          response_format: { type: 'json_object' },
          ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {})
        }),
        signal: controller.signal
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown');
        port.postMessage({ error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` });
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const p = JSON.parse(data);
            const delta = p.choices?.[0]?.delta;
            /* DeepSeek V4 Flash (reasoning model) streams reasoning_content first
               with content=null. Forward BOTH so the UI shows progress and the
               final JSON still arrives. Tag reasoning chunks so the UI can dim them. */
            const rc = delta?.reasoning_content;
            const ct = delta?.content;
            if (rc) port.postMessage({ chunk: rc, reasoning: true });
            if (ct) port.postMessage({ chunk: ct });
          } catch (_) {}
        }
      }
      if (buffer.startsWith('data: ') && buffer.slice(6).trim() !== '[DONE]') {
        try {
          const p = JSON.parse(buffer.slice(6).trim());
          const delta = p.choices?.[0]?.delta;
          const rc = delta?.reasoning_content;
          const ct = delta?.content;
          if (rc) port.postMessage({ chunk: rc, reasoning: true });
          if (ct) port.postMessage({ chunk: ct });
        } catch (_) {}
      }
      port.postMessage({ done: true });
    } catch (err) {
      port.postMessage({ error: err.name === 'AbortError' ? '请求超时' : err.message });
    } finally {
      clearTimeout(timer);
      try { port.disconnect(); } catch (_) {}
    }
  });
});

/* ---- Shared fetch with timeout (default 25s, overridable for batch) ----
   externalSignal lets callers really cancel an in-flight request (batch stop):
   sendMessage has no native cancellation, so the popup relays an out-of-band
   IFLL_BATCH_ABORT with the requestId; the handler aborts this controller and
   the upstream fetch dies instead of burning tokens to completion. */
async function apiFetch(endpoint, path, headers, body, timeout = 25000, externalSignal) {
  const baseUrl = (endpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    return await fetch(baseUrl + path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

/* ---- Batch abort registry: requestId → AbortController ----
   Popup's 停止 fires IFLL_BATCH_ABORT; without this the in-flight merged
   chunk (up to 95s) would run to completion and still write cache. */
const batchControllers = new Map();

function abortBatch(requestId) {
  if (!requestId) return Promise.resolve({ aborted: true });
  const c = batchControllers.get(requestId);
  if (c) { c.abort(); batchControllers.delete(requestId); }
  return Promise.resolve({ aborted: true });
}

/* ── 翻译缓存持久化 (IndexedDB in SW = extension origin) ──
   Content script 的 indexedDB 属于页面 origin，会与页面自身的数据库碰撞；
   SW 的 indexedDB 属于扩展 origin，跨 tab 共享且不与页面库冲突。
   之前翻译缓存只存内存 Map（刷新即丢）→ 翻页/刷新反复调用 AI 翻译烧钱。 */
let txDbPromise = null;
const TX_DB = 'ifll-translate-cache';
const TX_VER = 1;
const TX_STORE = 'entries';
const TX_MAX = 400;   /* 条数上限，超出按 addedAt 删最旧 */

function openTxDb() {
  if (txDbPromise) return txDbPromise;
  txDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(TX_DB, TX_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TX_STORE)) {
        const store = db.createObjectStore(TX_STORE, { keyPath: 'key' });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return txDbPromise;
}

async function txCacheGet(key) {
  try {
    const db = await openTxDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(TX_STORE, 'readonly');
      const req = tx.objectStore(TX_STORE).get(key);
      req.onsuccess = () => resolve(req.result?.translation || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function txCacheSet(key, translation) {
  try {
    const db = await openTxDb();
    await new Promise((resolve) => {
      const tx = db.transaction(TX_STORE, 'readwrite');
      const store = tx.objectStore(TX_STORE);
      store.put({ key, translation, addedAt: Date.now() });
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result <= TX_MAX) return;
        /* 超限：删最旧的 (countReq.result - TX_MAX) 条 */
        const toDelete = countReq.result - TX_MAX;
        const idx = store.index('addedAt');
        const cur = idx.openCursor();
        let deleted = 0;
        cur.onsuccess = () => {
          const cursor = cur.result;
          if (!cursor || deleted >= toDelete) return;
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (_) { /* 缓存写失败不影响翻译本身 */ }
}

/* DeepSeek-family endpoints must disable thinking: V4 Flash is a reasoning
   model — enabled thinking burns the entire token budget with zero content
   output. But strict OpenAI-compatible endpoints reject unknown params with
   HTTP 400, so only attach the param for providers that need it.
   Empty endpoint falls back to the DeepSeek default (same as apiFetch);
   model-name gating covers custom proxies that serve DeepSeek models. */
function isDeepSeekLike(endpoint, model) {
  const e = endpoint || 'https://api.deepseek.com';
  /* Model gating uses the same default as request bodies (apiModel || 'deepseek-v4-flash') */
  const m = model || 'deepseek-v4-flash';
  return /deepseek|opencode/i.test(e) || /deepseek/i.test(m);
}

/* ---- Extract content from API response (handles reasoning models) ---- */
function getContent(data) {
  const msg = data.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '';
}
/* ---- Robust JSON extraction (handles markdown, trailing commas, mixed text) ---- */
function extractJson(text) {
  if (!text) return null;
  /* Strip <think>...</think> blocks (DeepSeek reasoning output) — FluentRead pattern */
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');

  /* If response is wrapped in a markdown code fence, extract the JSON inside */
  const fence = cleaned.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
  if (fence) {
    cleaned = fence[1].trim();
  } else {
    /* Otherwise just strip any stray fence markers */
    cleaned = cleaned.replace(/```\w*\n?/g, '').trim();
  }

  /* Find outermost JSON object */
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0, end = -1, inString = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end <= start) {
    /* Auto-close unmatched braces (up to 3 missing) */
    let json = cleaned.slice(start);
    const missing = (json.match(/{/g) || []).length - (json.match(/}/g) || []).length;
    if (missing > 0 && missing <= 3) {
      json += '}'.repeat(missing);
      json = json.replace(/,(\s*[}\]])/g, '$1');
      try { return JSON.parse(json); } catch (_) {}
    }
    return null;
  }
  let json = cleaned.slice(start, end);
  json = json.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(json); } catch (e1) {
    /* Fix unescaped quotes in string values */
    try { return JSON.parse(json.replace(/(?<=\s):\s*"([^"]*"|(?<=")\s*(?=[,}]))/g, ': "FIXED"')); } catch (_) {}
    /* Fix unescaped newlines in string values */
    try { return JSON.parse(json.replace(/(?<=":\s*"[^"]*)\n(?=[^"]*")/g, ' ')); } catch (_) {}
    return null;
  }
}

/* ── Optimised combined system prompt ──
   Compact on purpose: DeepSeek V4 Flash is a reasoning model — verbose prompts
   trigger long chain-of-thought that consumes the entire token budget and
   leaves content empty. Short explicit schema + "no thinking" keeps reasoning
   minimal (~150 chars) so the JSON actually gets generated. */
const COMBINED_SYSTEM = `You are an English lexicographer. Return ONLY JSON, no thinking, no markdown. Schema:
{"synonyms":["same-meaning word replaceable in >=1 context"],"antonyms":["true opposite, [] if none"],"collocations":["authentic native phrase"],"usage":"Chinese note: formality, register, pitfalls (1-2 sentences)","examples":[{"en":"natural B1-B2 sentence","cn":"地道中文, **词**加粗"}]}
Exactly 3 examples, different contexts. Accuracy > quantity; never fabricate.`;

/* ---- Combined analysis: deep analysis + examples in ONE call ---- */
async function handleCombinedAnalysis(en, zh, def, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: COMBINED_SYSTEM },
        { role: 'user', content: `Word: "${en}" (${zh}${def ? ', ' + def : ''})` }
      ],
      temperature: 0.5, max_tokens: 1200,
      response_format: { type: 'json_object' },
      ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {})
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = getContent(data);
    if (!content) return { error: 'empty response' };
    const parsed = extractJson(content);
    if (!parsed) return { error: 'cannot parse AI response' };
    return parsed;
  } catch (err) { return { error: err.message }; }
}

/* ---- Deep analysis: synonyms, collocations, usage ---- */
async function handleDeepAnalysis(en, zh, def, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: `You are an English lexicographer. Return ONLY JSON, no thinking, no markdown. Schema:
{"synonyms":["same-meaning word replaceable in >=1 context"],"antonyms":["true opposite, [] if none"],"collocations":["authentic native phrase"],"usage":"Chinese note: formality, register, pitfalls (1-2 sentences)","examples":[{"en":"natural sentence","cn":"地道中文, **词**加粗"}]}
Accuracy > quantity; never fabricate.` },
        { role: 'user', content: `Word: "${en}" (${zh}, definition: ${def})` }
      ],
      temperature: 0.5, max_tokens: 1200,
      ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {})
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = getContent(data);
    if (!content) return { error: 'empty response' };
    const parsed = extractJson(content);
    if (!parsed) return { error: 'cannot parse AI response' };
    return parsed;
  } catch (err) { return { error: err.message }; }
}

/* ---- Translate text (for translation mode) ---- */
async function handleAiTranslate(text, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  const langPair = /[\u4e00-\u9fff]/.test(text[0]) ? 'Chinese to English' : 'English to Chinese';
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: `Translate the following ${langPair} text naturally. Return ONLY valid JSON: {"translation":"your translation here"}` },
        { role: 'user', content: text }
      ],
      temperature: 0.3, max_tokens: Math.min(4096, Math.max(1024, Math.round(text.length * 1.2))),
      ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {})
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = getContent(data);
    if (!content) return { error: 'empty response' };
    const parsed = extractJson(content);
    if (!parsed || !parsed.translation) return { error: 'cannot parse translation' };
    return { success: true, translation: parsed.translation };
  } catch (err) { return { error: err.message }; }
}

/* ---- Test connection ---- */
async function testApiConnection(apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      max_tokens: 5,
      ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {})
    });
    if (resp.ok) return { success: true };
    const errText = await resp.text().catch(() => 'unknown');
    return { error: `HTTP ${resp.status}: ${errText.substring(0, 120)}` };
  } catch (err) { return { error: err.message }; }
}

/* ---- Track stats (single-writer: SW context) ----
   Content scripts' get→modify→set on chrome.storage races across tabs (each
   context has its own state). The SW is one context, and a promise chain here
   serializes ALL tabs' increments into one atomic read-modify-write. */
let statQueue = Promise.resolve();
async function handleTrackStat(stat, count = 1) {
  statQueue = statQueue.then(async () => {
    try {
      const { dailyStats = {} } = await chrome.storage.sync.get('dailyStats');
      const today = new Date().toISOString().slice(0, 10);
      if (dailyStats.date !== today) {
        dailyStats.date = today;
        dailyStats.replaceCount = 0;
        dailyStats.annotateCount = 0;
        dailyStats.translateChars = 0;
        dailyStats.clickedCount = 0;
        dailyStats.totalLearned = 0;
      }
      if (stat === 'replace') dailyStats.replaceCount += count;
      else if (stat === 'annotate') dailyStats.annotateCount += count;
      else if (stat === 'translate') dailyStats.translateChars += count;
      else if (stat === 'click') dailyStats.clickedCount += count;
      dailyStats.totalLearned = dailyStats.clickedCount;
      await chrome.storage.sync.set({ dailyStats });
    } catch (_) { /* one failed write must not break the chain */ }
  });
  return statQueue;
}

/* ---- List models ---- */
async function listModels(apiKey, apiEndpoint) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/models', {
      'Authorization': 'Bearer ' + apiKey
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 120)}` };
    }
    const data = await resp.json();
    return { models: (data.data || []).map(m => m.id).sort() };
  } catch (err) { return { error: err.message }; }
}


/* ── V0.2 NEW HANDLERS ── */

/* Custom AI action (user-defined prompt) */
async function handleCustomAction(action, en, zh, def, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: "no api key" };
  try {
    let prompt = action.prompt || "{word}";
    prompt = prompt.replace(/{word}/g, en).replace(/{zh}/g, zh).replace(/{def}/g, def);
    const fields = action.fields || [];
    const fmt = fields.length
      ? " Return ONLY JSON: {" + fields.map(f => '"' + f + '": "..."').join(", ") + "}. No markdown."
      : " Return the result as concise plain text. No markdown.";
    const resp = await apiFetch(apiEndpoint, "/chat/completions", {
      "Content-Type": "application/json", "Authorization": "Bearer " + apiKey
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt + fmt }, { role: "user", content: en + (zh ? " (" + zh + ")" : "") }], max_tokens: 600, temperature: 0.5, ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {}) });
    if (!resp.ok) return { error: "HTTP " + resp.status };
    const data = await resp.json(); const content = getContent(data);
    if (!content) return { error: "empty response" };
    const parsed = extractJson(content);
    return parsed ? parsed : { text: content };
  } catch (e) { return { error: e.message }; }
}

/* Selection toolbar: translate or explain selected text */
async function handleSelToolbar(action, text, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: "no api key" };
  const isChinese = /[\u4e00-\u9fff]/.test(text);
  try {
    const prompt = action === "explain"
      ? "Explain this briefly in Chinese, max 100 chars."
      : (isChinese ? "Translate to English. Return ONLY the translation." : "Translate to natural Chinese. Return ONLY the translation.");
    const resp = await apiFetch(apiEndpoint, "/chat/completions", {
      "Content-Type": "application/json", "Authorization": "Bearer " + apiKey
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt }, { role: "user", content: text }], max_tokens: 180, temperature: 0.3, ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {}) });
    if (!resp.ok) return { error: "HTTP " + resp.status };
    const data = await resp.json();
    return { text: getContent(data) || "no response" };
  } catch (err) { return { error: err.message }; }
}

/* Batch deep analysis: N words in one API call */
async function handleBatchDeep(words, apiKey, apiEndpoint, apiModel, requestId) {
  if (!apiKey || !words?.length) return { error: words ? "no api key" : "no words" };
  /* Register the abort controller so 停止 can really cancel this request */
  const controller = new AbortController();
  if (requestId) batchControllers.set(requestId, controller);
  try {
    const wordList = words.map(w => '"' + w.en + '" (' + w.zh + ")").join(", ");
    const prompt = 'Lexicographer analysis. Accuracy > quantity — empty arrays are better than wrong data. Return ONLY JSON: {"results":[{"word":"...","synonyms":["s"],"antonyms":[],"collocations":[],"usage":"Chinese note","examples":[{"en":"short natural sentence","cn":"地道中文, **词**加粗"}]}]}. Exactly 1 short example per word.';
    const resp = await apiFetch(apiEndpoint, "/chat/completions", {
      "Content-Type": "application/json", "Authorization": "Bearer " + apiKey
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt }, { role: "user", content: "Words: " + wordList }], max_tokens: 5000, temperature: 0.4, ...(isDeepSeekLike(apiEndpoint, apiModel) ? { thinking: { type: 'disabled' } } : {}) }, 90000, controller.signal);
    if (!resp.ok) return { error: "HTTP " + resp.status };
    const dt = await resp.json(); const ct = getContent(dt);
    if (!ct) return { error: "empty response" };
    const p = extractJson(ct);
    return p?.results ? { results: p.results } : { error: "cannot parse" };
  } catch (e) {
    /* 停止/超时：abort 后返回明确错误，popup 侧 batchAbort 已置位，不再发起下一块 */
    return { error: e.name === 'AbortError' ? '已停止' : e.message };
  } finally {
    if (requestId) batchControllers.delete(requestId);
  }
}
