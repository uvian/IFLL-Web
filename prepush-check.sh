#!/usr/bin/env bash
# IFLL pre-push check — run before every push
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

fail=0
check() { if ! eval "$1"; then echo "  ❌ $2"; fail=1; else echo "  ✅ $2"; fi; }

echo "=== IFLL pre-push check ==="

# 1. Syntax
for f in src/lib/*.js src/content/*.js src/background/*.js src/popup/*.js; do
  node --check "$f" 2>&1 | grep -q Error && echo "  ❌ $f" && fail=1 || echo "  ✅ $f"
done

# 2. wordbank.js loaded in popup.html
check "grep -q 'wordbank.js' src/popup/popup.html" \
  "popup.html loads wordbank.js"

# 3. Script order correct (wordbank → storage → popup)
check "grep -A2 'script src' src/popup/popup.html | grep 'wordbank' | head -1" \
  "popup.html: wordbank before storage"

# 4. No CSS duplicate blocks
check 'test $(grep -c "^\.ifll-btn-ai {" src/content/content.css) -le 1' \
  "content.css: single .ifll-btn-ai declaration"

# 5. No decorative emoji in tooltip
check '! grep -Pn "\x{1F600}-\x{1F64F}|\x{1F300}-\x{1F5FF}|\x{1F680}-\x{1F6FF}|\x{1F900}-\x{1F9FF}" src/lib/injector.js | grep -v "//" || true' \
  "injector.js: no decorative emoji"

# 6. Key features present
check "grep -q 'IFLL_LIST_MODELS' src/background/background.js" "listModels handler"
check "grep -q 'apiEndpoint' src/popup/popup.html" "API endpoint select"
check "grep -q 'refreshModels' src/popup/popup.js" "refresh models button"
check "grep -q 'modeSelector' src/popup/popup.html" "mode selector"
check "grep -q 'fetchDeepAnalysis' src/lib/injector.js" "deep analysis"
check "grep -q 'fetchAiExamples' src/lib/injector.js" "AI examples"
check "grep -q 'onInstalled' src/background/background.js" "onInstalled handler"

# 7. Default model is deepseek-v4-flash (not deepseek-chat)
check "grep -q \"deepseek-v4-flash\" src/popup/popup.html" \
  "popup.html: default model is deepseek-v4-flash"

# 8. No duplicate function declarations
check '! (grep -Pc "^async function \w+.*" src/background/background.js | sort | uniq -c | awk '\''$1>1'\'' | grep -q . 2>/dev/null)' \
  "background.js: no duplicate function declarations"

echo ""
if [ $fail -eq 0 ]; then
  echo "✅ All checks passed"
  exit 0
else
  echo "❌ $fail check(s) failed — fix before pushing"
  exit 1
fi
