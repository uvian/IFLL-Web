#!/usr/bin/env python3
"""Fix 4 bugs + popup width"""
import re

with open('src/lib/injector.js') as f: c = f.read()
with open('src/popup/popup.html') as f: html = f.read()
with open('src/popup/popup.js') as f: js = f.read()
with open('src/content/content.css') as f: css = f.read()

fixes = 0

# ---- 1. Fix tooltip positioning: flip up when near bottom ----
old_pos = 'tooltipEl.style.left = Math.min(x, window.innerWidth - 400) + \'px\';\n      tooltipEl.style.top = y + \'px\';'
new_pos = '''const ttW = 300;
      tooltipEl.style.left = Math.min(x, window.innerWidth - ttW - 8) + 'px';
      const ttH = tooltipEl.offsetHeight || 180;
      const showBelow = y + ttH + 8 < window.innerHeight;
      tooltipEl.style.top = showBelow ? y + 'px' : (rect.top + window.scrollY - ttH - 8) + 'px';'''
if old_pos in c:
    c = c.replace(old_pos, new_pos); fixes += 1; print('1. Tooltip positioning fixed')

# ---- 2. Fix theme: reapply on every showTooltip ----
# Add applyTooltipTheme call before positioning
old_theme = 'tooltipEl.dataset.en = en;\n    tooltipEl.dataset.zh = zh;\n'
new_theme = 'tooltipEl.dataset.en = en;\n    tooltipEl.dataset.zh = zh;\n    applyTooltipTheme(tooltipEl);\n'
if old_theme in c:
    c = c.replace(old_theme, new_theme); fixes += 1; print('2. Theme reapply on each show')

# ---- 3. Remove emoji from tooltip HTML template ----
emoji_map = {
    '🤖 AI 例句': 'AI 例句',
    '🔍 AI 深度解析': '深度解析',
    '🤖 ': '',
    '🔍 ': '',
}
for old_e, new_e in emoji_map.items():
    if old_e in c:
        c = c.replace(old_e, new_e); fixes += 1
print(f'3. Emoji removed')

# ---- 4. Fix HTTP 400: model select fallback + testApi sends model ----
# Add saved model as option on load
old_restore = "apiModel.value = settings.apiModel || 'deepseek-chat';"
new_restore = '''// Ensure saved model is in the dropdown
  const savedModel = settings.apiModel || 'deepseek-chat';
  if (savedModel && !Array.from(apiModel.options).some(o => o.value === savedModel)) {
    const opt = document.createElement('option');
    opt.value = savedModel;
    opt.textContent = savedModel;
    apiModel.appendChild(opt);
  }
  apiModel.value = savedModel;'''
if old_restore in js:
    js = js.replace(old_restore, new_restore); fixes += 1
    print('4. Model restore with fallback')

# Fix testApi to include model
old_test = "apiEndpoint: await getEffectiveEndpoint()\n      });"
new_test = '''apiEndpoint: await getEffectiveEndpoint(),
        apiModel: apiModel.value.trim()
      });'''
if old_test in js:
    js = js.replace(old_test, new_test); fixes += 1
    print('4b. Test API sends model name')

# ---- 5. Wider popup ----
html = html.replace('width: 320px', 'width: 380px')
fixes += 1; print('5. Popup width 320→380px')

# Write back
with open('src/lib/injector.js','w') as f: f.write(c)
with open('src/popup/popup.html','w') as f: f.write(html)
with open('src/popup/popup.js','w') as f: f.write(js)

print(f'\nTotal fixes applied: {fixes}')
print('--- Syntax check ---')
import os
for f in ['src/lib/injector.js','src/popup/popup.js']:
    rc = os.system(f'node --check {f}' if not os.path.exists('node_modules') else f'node --check ../{f}')
    print(f"  {'✅' if rc==0 else '❌'} {f}")
