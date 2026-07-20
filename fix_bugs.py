#!/usr/bin/env python3
"""Apply all bug fixes to injector.js — exact string matching"""

with open('/home/hermes/IFLL-Web/src/lib/injector.js', 'r') as f:
    code = f.read()

fixes_applied = 0

# 1. Remove dead vars (lines 14-16)
old = '\n  const MODE = { current: \'replace\', hostname: \'\' };\n  let currentMode = \'replace\';\n  let lastHostname = \'\';\n'
new = '\n'
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('1. Removed dead MODE/currentMode/lastHostname')

# 2. Fix start() — replace currentMode/lastHostname with cache clear
old = '  async function start(mode) {\n    currentMode = mode;\n    lastHostname = window.location.hostname;\n    try {'
new = '  async function start(mode) {\n    translateCache = {};\n    enWordBank = null;\n    try {'
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('2. Fixed start() — clear caches, removed dead refs')

# 3. Fix destroy() — add parentNode guard
old = """    document.querySelectorAll('.ifll-word, .ifll-replaced, .ifll-annotated, .ifll-trans-panel').forEach(el => {
      const t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    })"""
new = """    document.querySelectorAll('.ifll-word, .ifll-replaced, .ifll-annotated, .ifll-trans-panel').forEach(el => {
      if (!el.parentNode) return;
      const t = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(t, el);
    })"""
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('3. Fixed destroy() — parentNode null check')

# 4. Fix showTooltip — move positioning inside async IIFE
old = """      tooltipEl.innerHTML = html;
    })();

    const x = rect.left + window.scrollX;
    const y = rect.bottom + window.scrollY + 4;
    tooltipEl.style.left = Math.min(x, window.innerWidth - 400) + 'px';
    tooltipEl.style.top = y + 'px';
    tooltipEl.style.display = 'block';"""
new = """      tooltipEl.innerHTML = html;
      setupAiButtons();
      const x = rect.left + window.scrollX;
      const y = rect.bottom + window.scrollY + 4;
      tooltipEl.style.left = Math.min(x, window.innerWidth - 400) + 'px';
      tooltipEl.style.top = y + 'px';
      tooltipEl.style.display = 'block';
    })();"""
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('4. Fixed showTooltip — positioning inside async')

# 5. Fix setupTooltipListeners — only add once
old = """  function setupTooltipListeners() {
    document.addEventListener('click', showTooltip);
    document.addEventListener('click', hideTooltip, true);
  }"""
new = """  let _tlsDone = false;
  function setupTooltipListeners() {
    if (_tlsDone) return;
    document.addEventListener('click', showTooltip);
    document.addEventListener('click', hideTooltip, true);
    _tlsDone = true;
  }"""
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('5. Fixed setupTooltipListeners — guard against duplicates')

# 6. Fix annotate — remove duplicate word/clean
old = "        const word = words[i].toLowerCase().replace(/[^a-z-]/g, '');\n        const clean = word.replace(/[^a-z-]/g, '');\n        const entry = clean.length >= 3 ? bank.get(clean) : null;"
new = "        const word = words[i].toLowerCase().replace(/[^a-z-]/g, '');\n        const entry = word.length >= 3 ? bank.get(word) : null;"
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('6. Fixed injectAnnotate — removed duplicate word/clean')

# 7. Fix annotate — add excludedSites check
old = '  function injectAnnotate(level) {'
new = '  function injectAnnotate(settings) {'
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('7a. Fixed injectAnnotate — settings param')

old = '    const bank = getEnWordBank();'
new = '    const hostname = window.location.hostname;\n    if (settings?.excludedSites?.some(s => hostname.includes(s) || s.includes(hostname))) return;\n    const bank = getEnWordBank();'
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('7b. Fixed injectAnnotate — excludedSites check')

# Update start() call
old = "        injectAnnotate(s.level);"
new = "        injectAnnotate(s);"
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('7c. Fixed start() annotate call')

# 8. Fix translate — add excludedSites check
old = '  function injectTranslate(settings) {'
new = '  function injectTranslate(settings) {\n    const hostname = window.location.hostname;\n    if (settings?.excludedSites?.some(s => hostname.includes(s) || s.includes(hostname))) return;'
if old in code and old not in new:  # ensure unique replace
    code = code.replace(old, new)
    fixes_applied += 1
    print('8. Fixed injectTranslate — excludedSites check')

# 9. Remove setupAiButtons from start (now called from showTooltip)
old = '      setupAiButtons();\n    } catch (err) { console.warn(\'[IFLL] start error:\', err); }'
new = '      /* AI buttons set up inside showTooltip */\n    } catch (err) { console.warn(\'[IFLL] start error:\', err); }'
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('9. Removed setupAiButtons from start()')

# 10. SM-2 simplification
old = "    const easeMap = { 4: 2.5, 3: 2.0, 2: 1.2, 1: 0 };\n    const intervalMultiplier = easeMap[score] || 2.0;\n    item.reviewCount += 1;\n    item.ease = Math.max(1.3, (item.ease || 2.5) + (0.1 - (score < 3 ? 0.5 : 0)));\n    const baseInterval = score === 1 ? 1 : (item.reviewCount === 1 ? 1 : item.reviewCount === 2 ? 3 : item.reviewCount * item.ease);\n    const intervalDays = Math.min(365, Math.max(1, Math.round(baseInterval * intervalMultiplier)));\n    item.nextReview = Date.now() + intervalDays * 86400000;"
new = "    const easeAdj = { 4: 0.3, 3: 0.1, 2: -0.2, 1: -0.3 }[score] || 0;\n    item.ease = Math.max(1.3, (item.ease || 2.5) + easeAdj);\n    if (score < 3) {\n      item.reviewCount = 0;\n      item.nextReview = Date.now() + 86400000;\n    } else {\n      item.reviewCount += 1;\n      const intervals = [1, 3, 7, 14, 30, 90, 180, 365];\n      const idx = Math.min(item.reviewCount, intervals.length - 1);\n      const intervalDays = Math.round(intervals[idx] * item.ease / 2.5);\n      item.nextReview = Date.now() + Math.min(365, Math.max(1, intervalDays)) * 86400000;\n    }"
if old in code:
    code = code.replace(old, new)
    fixes_applied += 1
    print('10. Simplified SM-2 algorithm')

with open('/home/hermes/IFLL-Web/src/lib/injector.js', 'w') as f:
    f.write(code)

print(f'\n✅ {fixes_applied} fixes applied')
