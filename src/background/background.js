/*
 * IFLL — Background Service Worker
 * Central AI proxy + model listing + connection test
 */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    enabled: true,
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    excludedSites: [],
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com',
    apiModel: 'deepseek-chat'
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFLL_AI_EXAMPLES') {
    handleAiExamples(message.en, message.zh, message.apiKey, message.apiEndpoint, message.apiModel)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'IFLL_TEST_API') {
    testApiConnection(message.apiKey, message.apiEndpoint, message.apiModel)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'IFLL_LIST_MODELS') {
    listModels(message.apiKey, message.apiEndpoint)
      .then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function apiFetch(endpoint, path, headers, body) {
  const baseUrl = (endpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(baseUrl + path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

async function handleAiExamples(en, zh, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a language tutor. Generate 3 natural, everyday English example sentences for the given word. Return ONLY valid JSON with no markdown wrapping: {"examples":[{"en":"sentence","cn":"translation with **word** bolded"}]}' },
        { role: 'user', content: `Word: "${en}" (Chinese: ${zh}). Generate 3 natural example sentences.` }
      ],
      temperature: 0.7,
      max_tokens: 800
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 150)}` };
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'empty response' };

    /* Robust JSON extraction: find first { ... } with "examples" */
    function extractJson(text) {
      /* Strip markdown code fences first */
      text = text.replace(/```[\s\S]*?```/g, m => {
        const inner = m.replace(/```(?:json)?\s*/, '').replace(/\s*```$/, '');
        return inner;
      });
      /* Try parsing the whole thing */
      try { return JSON.parse(text); } catch (_) {}
      /* Find the first { } block that contains "examples" */
      const start = text.indexOf('{');
      if (start < 0) return null;
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > start) {
        try { return JSON.parse(text.slice(start, end)); } catch (_) {}
      }
      return null;
    }

    const parsed = extractJson(content);
    if (!parsed) return { error: 'cannot parse AI response as JSON' };
    if (!parsed.examples || !Array.isArray(parsed.examples)) return { error: 'response missing "examples" array' };
    return { examples: parsed.examples };
  } catch (err) {
    return { error: err.message };
  }
}

async function testApiConnection(apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  try {
    // Quick chat completion with 1 token to verify
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-chat',
      messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      max_tokens: 5
    });
    if (resp.ok) return { success: true };
    const errText = await resp.text().catch(() => 'unknown');
    return { error: `HTTP ${resp.status}: ${errText.substring(0, 120)}` };
  } catch (err) {
    return { error: err.message };
  }
}

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
    const models = (data.data || []).map(m => m.id).sort();
    return { models };
  } catch (err) {
    return { error: err.message };
  }
}
