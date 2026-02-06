# Zotero Triage

A progressive Zotero-Obsidian bridge for sustainable literature processing.

## Overview

Zotero Triage is an Obsidian plugin that helps you progressively triage and process literature from your Zotero library. It provides a workflow for managing research papers and references in a sustainable, organized way.

## Features

- **Progressive Literature Processing**: A structured workflow for moving references from inbox to permanent notes.
- **YouTube Transcript Fetching**: Automatically fetches transcripts for YouTube videos, supporting both manual and auto-looping modes.
- **Metadata Validation & Auto-correction**: diverse checks for metadata quality with an auto-fix capability for common issues.
- **Dry Run / Simulation Mode**: Test your workflow configurations safely without modifying your actual data.
- **Direct Zotero Integration**: Seamlessly connect with your Zotero database.
- **Clean Interface**: A minimal, focused UI for efficient triage work.

## Installation

### From Release

1. Download the latest release from the [Releases page](https://github.com/hbiaou/zotero-triage/releases)
2. Extract the files to your Obsidian vault's `.obsidian/plugins/zotero-triage/` directory
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Manual Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/zotero-triage/` directory

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run dev
```

## Requirements

- Obsidian v1.0.0+
- Zotero (with accessible database)

## License

MIT License - see [LICENSE](LICENSE) file for details

## Author

BIAOU Samadori S. Honoré

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
