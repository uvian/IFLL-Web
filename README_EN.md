# IFLL — Immersive Foreign Language Learning

A Chrome MV3 browser extension that replaces Chinese words with English equivalents on any webpage, creating an immersive language learning experience.

[中文 README](README.md) | English

## Features

- **4 Modes**: Replace (Chinese→English), Annotate (hover tooltip), Translate (sentence-level), Off
- **3,626-word Bank**: Curated bilingual vocabulary with IPA phonetics (90% coverage)
- **Smart Tooltip**: Click any replaced word for definition, examples, AI deep analysis, custom actions
- **AI-Powered**: Synonym/antonym/collocation analysis and example sentence generation via DeepSeek API
- **Spaced Repetition**: SM-2 algorithm with daily review scheduling
- **Daily New Words**: Soft-capped daily word discovery to avoid overwhelm
- **PDF Translation**: Full-document translation support
- **Export/Import**: Learning progress, word lists, and settings
- **Custom AI Actions**: Define your own prompts with `{word}`, `{zh}`, `{def}` placeholders
- **Batch Preprocessing**: Pre-fetch AI analysis for N words ahead of time
- **Notebase**: IndexedDB-powered searchable vocabulary knowledge base
- **Floating Ball**: Quick mode toggle without opening the popup

## Installation

1. Clone or download the repository
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `src` folder

## API Configuration

IFLL supports multiple AI providers:
- **DeepSeek** — `https://api.deepseek.com` (native, supports `/models` endpoint)
- **OpenAI** — `https://api.openai.com/v1`
- **OpenRouter** — `https://openrouter.ai/api/v1`
- **OpenCode Go** — `https://opencode.ai/zen/go/v1` (proxy, no `/models`)
- **Custom** — any OpenAI-compatible endpoint

Get your API key from your provider's dashboard.

## Project Structure

```
src/
├── lib/
│   ├── injector.js    — DOM injection engine, Aho-Corasick matching
│   ├── storage.js     — chrome.storage wrapper with defaults
│   ├── wordbank.js    — 3,626-word bilingual vocabulary bank
│   ├── notebase.js    — IndexedDB knowledge base
│   └── ...
├── content/
│   ├── content.js     — Page script: mode detection, selection toolbar
│   └── content.css    — In-page styles: tooltip, toolbar, floating ball
├── background/
│   └── background.js  — Service worker: AI API calls, model management
├── popup/
│   ├── popup.html     — Extension popup: settings, stats, batch processing
│   ├── popup.js       — Popup logic: mode switching, API config, import/export
│   └── popup.css      — Popup styles: literary minimalism design
└── manifest.json      — Chrome MV3 manifest
```

## License

GPL v3. See [LICENSE](LICENSE) for details.

All user data is stored locally on the device. No data is ever sent to external servers except the user-configured AI API endpoint.
