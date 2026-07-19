/*
 * IFLL — Background Service Worker
 * Handles: settings defaults, AI API calls for examples
 */

/* ---- Defaults on install ---- */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    enabled: true,
    frequency: 'medium',
    level: 'cet4',
    knownWords: [],
    excludedSites: [],
    apiKey: ''
  });
});

/* ---- Message relay & AI proxy ---- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFLL_AI_EXAMPLES') {
    handleAiExamples(message.word, message.zh, message.apiKey)
      .then(sendResponse);
    return true; // Keep channel open for async response
  }
  if (message.type === 'IFLL_AI_ENHANCE_REPLACEMENT') {
    handleAiEnhancement(message.text, message.apiKey, message.level)
      .then(sendResponse);
    return true;
  }
});

/* ---- AI: generate example sentences ---- */
async function handleAiExamples(en, zh, apiKey) {
  if (!apiKey) return { error: 'no api key' };

  const baseUrl = apiKey.startsWith('sk-')
    ? 'https://api.openai.com/v1'
    : 'https://api.deepseek.com';

  try {
    const resp = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a language tutor. Generate 3 natural, everyday English example sentences for the given word. Return ONLY valid JSON like: {"examples":[{"en":"sentence","cn":"translation with **word** bolded"}]}'
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
      return { error: `API ${resp.status}: ${errText.substring(0, 100)}` };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'empty response' };

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);
    return { examples: parsed.examples || [] };
  } catch (err) {
    return { error: err.message };
  }
}

/* ---- AI: enhance word replacement (future) ---- */
async function handleAiEnhancement(text, apiKey, level) {
  /* Placeholder: this will be used for AI-powered word selection */
  if (!apiKey) return { suggestions: [] };
  return { suggestions: [] };
}
