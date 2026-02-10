# Zotero Triage

**Turn your Zotero library into rich, AI-enhanced literature notes in Obsidian.**

## What It Does

Zotero Triage bridges the gap between your reference manager and your knowledge base. Instead of manually copying metadata and writing summaries, this plugin:

1. **Connects directly to your Zotero database** — no CSV exports needed
2. **Extracts content** from PDFs, video transcripts, and notes
3. **Generates AI-powered literature notes** with key findings, methodology, and themes
4. **Validates output** to catch hallucinations and metadata errors
5. **Auto-repairs** issues using your actual source content

The result: structured, trustworthy notes ready for your second brain.

> [!NOTE]
> I built Zotero Triage primarily to solve my own problem of accumulating Zotero items without processing them. While it's designed for my workflow, I'm sharing it in case others find it helpful. Feel free to use it, adapt it, or build upon it to suit your needs.

---

## 🤝 The Perfect Companion

For the complete workflow, I recommend using Zotero Triage alongside its sister project, **[ZettelForge](https://github.com/hbiaou/zettelforge)**.

- **Zotero Triage**: Creates rich literature notes from your sources.
- **ZettelForge**: Helps you distill those literature notes into atomic, permanent notes.

Together, they form a robust system for knowledge ingestion and synthesis.

---

## Features

### 📚 Smart Content Extraction
- **PDF fulltext** — extracts and analyzes complete documents
- **Video transcripts** — automatic YouTube transcript fetching with manual input fallback
- **Zotero notes** — includes your annotations and highlights
- **Search & Add** — manually search your full library and trigger AI enrichment for specific items
- **Graceful fallbacks** — works with abstracts or metadata when content isn't available

### 🤖 AI-Powered Enrichment
- Generates structured literature notes with configurable templates
- Identifies key findings, methodology, limitations, and themes
- Supports multiple AI providers (OpenAI, Google, Anthropic, OpenRouter)

### ✅ Quality Assurance
- **Hallucination detection** — flags claims not supported by source content
- **Metadata validation** — ensures authors, dates, and citations are correct
- **Auto-correction** — fixes issues automatically using source truth
- **Dry run mode** — preview changes before writing to your vault

### ⚡ Performance Optimized
- Bulk database queries (50x fewer database calls)
- Smart page caching for responsive loading
- Memory-mapped I/O for large libraries

---

## Quick Start

1. **Install the plugin** (see Installation below)
2. **Set your Zotero database path** in Settings → Zotero Triage
3. **Configure an AI provider** with your API key
4. **Run triage** from the command palette: `Zotero Triage: Open`

---

## Installation

### From Community Plugins (Coming Soon)

_This plugin has been submitted to the community plugins list and is pending approval. In the meantime, please use the manual installation method below or install from a release._

### From Release
1. Download the latest release from the [Releases page](https://github.com/hbiaou/zotero-triage/releases)
2. Extract to `.obsidian/plugins/zotero-triage/` in your vault
3. Reload Obsidian and enable the plugin

### Manual Build
```bash
git clone https://github.com/hbiaou/zotero-triage.git
cd zotero-triage
npm install
npm run build
```
Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder.

---

## Requirements

- **Obsidian** v1.0.0 or later
- **Zotero** with an accessible `zotero.sqlite` database
- **AI Provider** API key (OpenAI, Google, Anthropic, or OpenRouter)

---

## Development

```bash
npm install      # Install dependencies
npm run dev      # Watch mode for development
npm run build    # Production build
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**BIAOU Samadori S. Honoré**

---

## Contributing

Contributions welcome! Feel free to open issues or submit pull requests.
