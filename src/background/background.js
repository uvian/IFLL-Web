/*
 * IFLL — Background Service Worker
 * Central AI proxy: content script sends messages, worker makes API calls
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

/* ---- Handle AI requests from content script ---- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFLL_AI_EXAMPLES') {
    handleAiExamples(message.en, message.zh, message.apiKey, message.apiEndpoint, message.apiModel)
      .then(sendResponse);
    return true; // keep channel open for async
  }
});

async function handleAiExamples(en, zh, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };

  const baseUrl = (apiEndpoint || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = apiModel || 'deepseek-chat';

  try {
    const resp = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a language tutor. Generate 3 natural, everyday English example sentences for the given word. Return ONLY valid JSON with no markdown wrapping: {"examples":[{"en":"sentence","cn":"translation with **word** bolded"}]}'
          },
          {
            role: 'user',
            content: `Word: "${en}" (Chinese: ${zh}). Generate 3 natural example sentences.`
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      return { error: `HTTP ${resp.status}: ${errText.substring(0, 120)}` };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'empty response' };

    // Handle both bare JSON and markdown-wrapped JSON
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr);
    return { examples: parsed.examples || [] };
  } catch (err) {
    return { error: err.message };
  }
}
