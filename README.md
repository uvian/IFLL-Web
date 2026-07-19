# IFLL — English Injector for Language Learning

Inject English words into Chinese web pages for immersive learning while you browse.

Click highlighted words to see translations. Mark known words to track your progress.

## Quick Start

1. **Chrome**: go to `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select this folder
2. **Firefox**: go to `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json`

The extension activates automatically on pages with Chinese text. Click the toolbar icon to adjust settings.

## Roadmap

- **P0** ✅ Browser extension MVP — word replacement + click definitions
- **P1** 🚧 Android share receiver — read WeChat/Zhihu articles with injection
- **P2** ⏳ Dictionary integration — Oxford API + AI fallback
- **P3** ⏳ Clipboard floating window — AccessibilityService overlay
- **P4** ⏳ SRS review + vocabulary sync
- **P5** ⏳ Word selection strategy tuning

## Tech Stack

- Manifest V3 (Chrome + Firefox)
- Vanilla JS — no build tools, no npm
- ~320 built-in Chinese→English word pairs (CET-4 level+)
- chrome.storage for settings and progress

## License

GPL v3. See [LICENSE](LICENSE).
