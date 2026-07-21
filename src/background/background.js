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
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    IFLL_AI_TRANSLATE: () => handleAiTranslate(message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_SEL_TOOLBAR: () => handleSelToolbar(message.action, message.text, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_CUSTOM_ACTION: () => handleCustomAction(message.action, message.en, message.zh, message.def, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_BATCH_DEEP: () => handleBatchDeep(message.words, message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_TEST_API: () => testApiConnection(message.apiKey, message.apiEndpoint, message.apiModel),
    IFLL_LIST_MODELS: () => listModels(message.apiKey, message.apiEndpoint),
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

/* ---- Extract content from API response (handles reasoning models) ---- */
function getContent(data) {
  const msg = data.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '';
}

/* ---- Robust JSON extraction (handles markdown, trailing commas, mixed text) ---- */
function extractJson(text) {
  if (!text) return null;
  let cleaned = text;

  /* Strategy 1: try extracting from markdown code blocks first (model sometimes wraps JSON in ```json) */
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1];

  /* Strategy 2: strip stray fence markers, blank lines, leading/trailing whitespace */
  cleaned = cleaned.replace(/```\w*\n?/g, '').trim();

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
    /* Strategy 3: unmatched braces — try auto-closing */
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
  /* Remove trailing commas (invalid JSON, model artifact) */
  json = json.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(json); } catch (e1) {
    /* Strategy 4: fix unescaped quotes inside string values */
    try { return JSON.parse(json.replace(/(?<=\s):\s*"([^"]*"|(?<=")\s*(?=[,}]))/g, ': "FIXED"')); } catch (_) {}
    /* Strategy 5: fix unescaped newlines in strings (replace with space) */
    try { return JSON.parse(json.replace(/(?<=":\s*"[^"]*)\n(?=[^"]*")/g, ' ')); } catch (_) {}
    return null;
  }
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
        { role: 'system', content: `You are an English teacher for Chinese-speaking learners (intermediate level). Your job is to generate example sentences that help the learner internalize a specific English word.

Requirements:
- Generate 3 example sentences using the given word in DIFFERENT contexts (different meanings or collocations if applicable).
- Each sentence must sound NATURAL — something a native speaker would actually say in daily conversation, not a dictionary-style fabricated sentence.
- Keep sentence difficulty at intermediate level (B1-B2). Avoid overly complex structures or rare vocabulary.
- Chinese translations must be natural, idiomatic Chinese (地道中文), NOT word-for-word literal translation.
- In the Chinese translation, wrap the translated target word in **double asterisks** so the learner can see where it appears.
- Return ONLY a valid JSON object. No markdown fences, no explanation.

Format: {"examples":[{"en":"natural English sentence","cn":"用**目标词**的中文自然翻译"}]}` },
        { role: 'user', content: `Word: "${en}" (Chinese: ${zh}). Generate 3 example sentences.` }
      ],
      temperature: 0.7, max_tokens: 800
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
        { role: 'system', content: `You are a professional English lexicographer. Analyze the given word and return structured lexical data. Accuracy over quantity — never fabricate; empty arrays are better than wrong data.

- Synonyms: must replace the target in ≥1 common context WITHOUT changing meaning.
- Antonyms: genuine, commonly understood opposites. Use [] for words without antonyms (e.g. concrete nouns like "table").
- Collocations: authentic phrases native speakers actually use.
- Usage: 1-2 sentences in Chinese on formality, register, or common learner pitfalls.

Return ONLY valid JSON, no markdown:
{
  "synonyms": ["true synonym", ...],
  "antonyms": ["true antonym", ...],
  "collocations": ["authentic phrase", ...],
  "usage": "Chinese note (1-2 sentences)",
  "examples": [{"en": "natural sentence", "cn": "中文翻译，**目标词**加粗"}]
}

Rare words: 1-2 good synonyms beat 3-4 bad ones.` },
        { role: 'user', content: `Word: "${en}" (${zh}, definition: ${def})` }
      ],
      temperature: 0.5, max_tokens: 600
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
      temperature: 0.3, max_tokens: Math.min(4096, Math.max(1024, Math.round(text.length * 1.2)))
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
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt + fmt }, { role: "user", content: en + (zh ? " (" + zh + ")" : "") }], max_tokens: 600, temperature: 0.5 });
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
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt }, { role: "user", content: text }], max_tokens: 180, temperature: 0.3 });
    if (!resp.ok) return { error: "HTTP " + resp.status };
    const data = await resp.json();
    return { text: getContent(data) || "no response" };
  } catch (err) { return { error: err.message }; }
}

/* Batch deep analysis: N words in one API call */
async function handleBatchDeep(words, apiKey, apiEndpoint, apiModel) {
  if (!apiKey || !words?.length) return { error: words ? "no api key" : "no words" };
  try {
    const wordList = words.map(w => '"' + w.en + '" (' + w.zh + ")").join(", ");
    const prompt = 'Lexicographer analysis. Accuracy > quantity — empty arrays are better than wrong data. Return ONLY JSON: {"results":[{"word":"...","synonyms":["s"],"antonyms":[],"collocations":[],"usage":"Chinese note"}]}.';
    const resp = await apiFetch(apiEndpoint, "/chat/completions", {
      "Content-Type": "application/json", "Authorization": "Bearer " + apiKey
    }, { model: apiModel || "deepseek-v4-flash", messages: [{ role: "system", content: prompt }, { role: "user", content: "Words: " + wordList }], max_tokens: 3000, temperature: 0.4 });
    if (!resp.ok) return { error: "HTTP " + resp.status };
    const dt = await resp.json(); const ct = getContent(dt);
    if (!ct) return { error: "empty response" };
    const p = extractJson(ct);
    return p?.results ? { results: p.results } : { error: "cannot parse" };
  } catch (e) { return { error: e.message }; }
}
