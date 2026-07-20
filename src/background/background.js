/*
 * IFLL — Background Service Worker
 * AI proxy: examples, deep analysis, model listing, connection test
 */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    enabled: true, frequency: 'medium', level: 'cet4',
    knownWords: [], excludedSites: [],
    apiKey: '', apiEndpoint: 'https://api.deepseek.com', apiModel: 'deepseek-chat',
    reviewQueue: [], userWords: []
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    IFLL_AI_EXAMPLES: () => handleAiExamples(message.en, message.zh, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_AI_DEEP_ANALYSIS: () => handleDeepAnalysis(message.en, message.zh, message.def, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_AI_TRANSLATE: () => handleAiTranslate(message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_AI_PDF_TRANSLATE: () => handleAiTranslate(message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_TEST_API: () => testApiConnection(message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_LIST_MODELS: () => listModels(message.apiKey, message.apiEndpoint),
    IFLL_OPEN_PDF: () => {
      const dest = message.url ? `src/pdf/pdf.html?url=${encodeURIComponent(message.url)}` : 'src/pdf/pdf.html';
      chrome.tabs.create({ url: chrome.runtime.getURL(dest) });
      return Promise.resolve({});
    }
  };
  const fn = handlers[message.type];
  if (fn) { fn().then(sendResponse).catch(err => sendResponse({ error: err.message })); return true; }
});

/* ---- Shared fetch with timeout ---- */
async function apiFetch(endpoint, path, headers, body) {
  const baseUrl = (endpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(baseUrl + path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}

/* ---- Robust JSON extraction ---- */
function extractJson(text) {
  text = text.replace(/```[\s\S]*?```/g, m => m.replace(/```(?:json)?\s*/, '').replace(/\s*```$/, ''));
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end > start) { try { return JSON.parse(text.slice(start, end)); } catch (_) {} }
  return null;
}

/* ---- Generate example sentences ---- */
async function handleAiExamples(en, zh, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'You are a language tutor. Generate 3 natural, everyday English example sentences for the given word. Return ONLY valid JSON: {"examples":[{"en":"sentence","cn":"translation with **word** bolded"}]}' },
        { role: 'user', content: `Word: "${en}" (Chinese: ${zh}). Generate 3 example sentences.` }
      ],
      temperature: 0.7, max_tokens: 800
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'empty response' };
    const parsed = extractJson(content);
    if (!parsed) return { error: 'cannot parse AI response' };
    if (!parsed.examples || !Array.isArray(parsed.examples)) return { error: 'missing examples array' };
    return { examples: parsed.examples };
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
        { role: 'system', content: 'Analyze the given English word and return JSON: {"synonyms":["word1","word2"],"antonyms":["word1"],"collocations":["collocation1","collocation2"],"usage":"brief usage note (1-2 sentences)","examples":[{"en":"example sentence","cn":"translation with **word** bolded"}]}' },
        { role: 'user', content: `Word: "${en}" (${zh}, definition: ${def})` }
      ],
      temperature: 0.5, max_tokens: 1000
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
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
      temperature: 0.3, max_tokens: Math.min(4096, Math.max(1024, Math.round(text.length * 1.2)))
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
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
      max_tokens: 5
    });
    if (resp.ok) return { success: true };
    const errText = await resp.text().catch(() => 'unknown');
    return { error: `HTTP ${resp.status}: ${errText.substring(0, 120)}` };
  } catch (err) { return { error: err.message }; }
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
