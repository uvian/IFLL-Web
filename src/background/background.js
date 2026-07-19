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
      .then(sendResponse);
    return true;
  }
  if (message.type === 'IFLL_TEST_API') {
    testApiConnection(message.apiKey, message.apiEndpoint, message.apiModel)
      .then(sendResponse);
    return true;
  }
  if (message.type === 'IFLL_LIST_MODELS') {
    listModels(message.apiKey, message.apiEndpoint)
      .then(sendResponse);
    return true;
  }
});

async function apiFetch(endpoint, path, headers, body) {
  const baseUrl = (endpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
  return fetch(baseUrl + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
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
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);
    return { examples: parsed.examples || [] };
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
