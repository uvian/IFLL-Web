#!/usr/bin/env python3
"""Final bug fixes for IFLL v0.1"""
import os

BASE = os.path.expanduser('~/IFLL-Web')

def fix_injector():
    path = f'{BASE}/src/lib/injector.js'
    with open(path) as f: c = f.read()

    fixes = 0

    # 1. Fix destroy() — use dataset.zh for accurate original text restoration
    old = """  function destroy() {
    stopObserver(); removeTooltip();
    document.querySelectorAll('.ifll-word, .ifll-replaced, .ifll-annotated, .ifll-trans-panel').forEach(el => {
      if (!el.parentNode) return;
      const t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    })
  }"""

    new = """  function restoreText(el) {
    if (el.classList.contains('ifll-word')) return el.dataset.zh || el.textContent;
    if (el.classList.contains('ifll-annotated')) return el.textContent;
    if (el.classList.contains('ifll-trans-panel')) return '';
    if (el.classList.contains('ifll-replaced')) {
      let t = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) t += child.textContent;
        else if (child.classList?.contains('ifll-word')) t += child.dataset.zh || child.textContent;
        else t += child.textContent || '';
      }
      return t;
    }
    return el.textContent;
  }

  function destroy() {
    stopObserver(); removeTooltip();
    document.querySelectorAll('.ifll-replaced, .ifll-trans-panel, .ifll-annotated, .ifll-word').forEach(el => {
      if (!el.parentNode) return;
      const t = document.createTextNode(restoreText(el));
      el.parentNode.replaceChild(t, el);
    })
  }"""

    if old in c:
        c = c.replace(old, new)
        fixes += 1
        print(f'  ✅ Fix 1: destroy() uses dataset.zh for accurate restore')

    with open(path, 'w') as f: f.write(c)
    return fixes

def fix_content():
    path = f'{BASE}/src/content/content.js'
    with open(path) as f: c = f.read()

    fixes = 0

    # 2. Update sessionStorage on IFLL_MODE_CHANGED
    old = """    if (message.type === 'IFLL_MODE_CHANGED') {
      IFLL_INJECTOR.destroy();
      const mode = message.mode;
      if (mode === 'off') return;
      IFLL_INJECTOR.start(mode);
    }"""

    new = """    if (message.type === 'IFLL_MODE_CHANGED') {
      sessionStorage.setItem('ifll_decision_' + window.location.hostname, message.mode);
      IFLL_INJECTOR.destroy();
      const mode = message.mode;
      if (mode === 'off') return;
      IFLL_INJECTOR.start(mode);
    }"""

    if old in c:
        c = c.replace(old, new)
        fixes += 1
        print(f'  ✅ Fix 2: sessionStorage updated on mode change')

    # 3. Fix domain matching for excludedSites
    old_domain = """    if (settings.excludedSites && settings.excludedSites.some(s => hostname.includes(s))) return;"""

    new_domain = """    if (settings.excludedSites && settings.excludedSites.some(s => hostname === s || hostname.endsWith('.' + s))) return;"""

    if old_domain in c:
        c = c.replace(old_domain, new_domain)
        fixes += 1
        print(f'  ✅ Fix 3: exact domain matching for excludedSites')

    # Also fix the IFLL_SETTINGS_CHANGED handler domain check
    old_domain2 = """        if (message.settings.excludedSites.some(s => window.location.hostname.includes(s))) {"""

    new_domain2 = """        if (message.settings.excludedSites.some(s => window.location.hostname === s || window.location.hostname.endsWith('.' + s))) {"""

    if old_domain2 in c:
        c = c.replace(old_domain2, new_domain2)
        fixes += 1
        print(f'  ✅ Fix 3b: exact domain matching in message handler')

    with open(path, 'w') as f: f.write(c)
    return fixes

def fix_injector_domains():
    path = f'{BASE}/src/lib/injector.js'
    with open(path) as f: c = f.read()

    fixes = 0

    # Fix domain matching in injectReplace, injectAnnotate, injectTranslate
    old = "s => hostname.includes(s) || s.includes(hostname)"
    new = "s => hostname === s || hostname.endsWith('.' + s)"

    count = c.count(old)
    if count > 0:
        c = c.replace(old, new, count)
        fixes += count
        print(f'  ✅ Fix 4: {count} domain matching fixes in injector.js')

    with open(path, 'w') as f: f.write(c)
    return fixes

def fix_background():
    path = f'{BASE}/src/background/background.js'
    with open(path) as f: c = f.read()

    fixes = 0

    # Increase PDF translation max_tokens
    old = """async function handleAiTranslate(text, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  const langPair = /[\\u4e00-\\u9fff]/.test(text[0]) ? 'Chinese to English' : 'English to Chinese';
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-chat',
      messages: [
        { role: 'system', content: `Translate the following ${langPair} text naturally. Return ONLY valid JSON: {\\\"translation\\\":\\\"your translation here\\\"}` },
        { role: 'user', content: text }
      ],
      temperature: 0.3, max_tokens: 1024
    });"""

    new = """async function handleAiTranslate(text, apiKey, apiEndpoint, apiModel) {
  if (!apiKey) return { error: 'no api key' };
  const langPair = /[\\u4e00-\\u9fff]/.test(text[0]) ? 'Chinese to English' : 'English to Chinese';
  /* Longer texts (PDF pages) need more tokens */
  const tokenBudget = Math.min(4096, Math.max(1024, Math.round(text.length * 1.5)));
  try {
    const resp = await apiFetch(apiEndpoint, '/chat/completions', {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    }, {
      model: apiModel || 'deepseek-chat',
      messages: [
        { role: 'system', content: `Translate the following ${langPair} text naturally. Return ONLY valid JSON: {\\\"translation\\\":\\\"your translation here\\\"}` },
        { role: 'user', content: text }
      ],
      temperature: 0.3, max_tokens: tokenBudget
    });"""

    if old in c:
        c = c.replace(old, new)
        fixes += 1
        print(f'  ✅ Fix 5: dynamic max_tokens for translation (up to 4096 for PDF)')

    with open(path, 'w') as f: f.write(c)
    return fixes

# Run all
print('Applying fixes...')
total = 0
total += fix_injector()
total += fix_content()
total += fix_injector_domains()
total += fix_background()
print(f'\n✅ {total} fixes applied')

# Verify
print('Verifying syntax...')
for f in ['src/lib/injector.js', 'src/content/content.js', 'src/background/background.js']:
    rc = os.system(f'cd {BASE} && node --check {f}')
    print(f'  {"✅" if rc==0 else "❌"} {f}')
