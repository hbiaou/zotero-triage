# Architecture Research: Progressive Zotero-Obsidian Bridge

**Domain:** Obsidian Plugin with Zotero Integration
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

Obsidian plugins follow a component-based architecture where a central Plugin class manages lifecycle, registers extensions (commands, views, ribbon items), and accesses platform APIs through the `app` object. For a data-intensive plugin processing 5000+ Zotero items, the architecture must balance:

1. **Main thread responsiveness** (Obsidian runs single-threaded, UI blocks easily)
2. **State persistence** (across restarts using JSON storage)
3. **External data access** (SQLite database reading via native modules)
4. **Incremental processing** (batch operations to avoid freezing)
5. **UI modularity** (settings tabs, modals, custom views)

**Critical architectural constraint:** Obsidian's Chromium renderer environment makes native module bundling complex. Better-sqlite3 requires platform-specific `.node` binaries that cannot be bundled with standard esbuild workflows.

---

## Obsidian Plugin Structure

### Standard File Layout

```
your-plugin/
├── manifest.json          # Plugin metadata (id, name, version, minAppVersion)
├── main.ts               # Plugin entry point (extends Plugin class)
├── styles.css            # Optional UI styling
├── package.json          # npm dependencies
├── tsconfig.json         # TypeScript configuration
├── esbuild.config.mjs    # Build bundler (compiles to main.js)
└── src/                  # Source code (if using subdirectories)
    ├── settings.ts
    ├── modals/
    ├── views/
    └── services/
```

**Build output:** Compiled into `main.js` + `manifest.json` + `styles.css` for distribution.

**Source:** [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

### Plugin Class Lifecycle

```typescript
import { Plugin, WorkspaceLeaf } from 'obsidian';

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        // 1. Load persisted settings/state
        await this.loadSettings();

        // 2. Register extensions
        this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));
        this.addCommand({
            id: 'my-command',
            name: 'My Command',
            callback: () => { /* ... */ }
        });
        this.addRibbonIcon('dice', 'Sample Plugin', () => { /* ... */ });

        // 3. Add settings tab
        this.addSettingTab(new MySettingTab(this.app, this));

        // 4. Register event handlers
        this.registerEvent(
            this.app.workspace.on('file-open', this.handleFileOpen)
        );

        // 5. Initialize background services
        // (must be async/non-blocking)
    }

    onunload() {
        // Cleanup: detach views, clear intervals, close connections
        this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
```

**Key methods:**
- `onload()`: Called when plugin activates (initialization logic here)
- `onunload()`: Called when plugin deactivates (cleanup logic here)
- `loadData()` / `saveData(data)`: Persist plugin state as JSON in `.obsidian/plugins/[plugin-id]/data.json`
- `app`: Access to Obsidian API (vault, workspace, metadata cache, etc.)

**Sources:**
- [Obsidian Plugin Class](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Sample Plugin Structure](https://github.com/obsidianmd/obsidian-sample-plugin)

---

## Component Architecture for Zotero Bridge

Based on your requirements and Obsidian patterns, here's the recommended component structure:

```
┌─────────────────────────────────────────────────────────┐
│                    Plugin Main Class                     │
│  (Lifecycle orchestrator, dependency injection root)    │
└───────────┬─────────────────────────────────────────────┘
            │
    ┌───────┴────────┬──────────┬───────────┬──────────┐
    │                │          │           │          │
┌───▼────┐  ┌───────▼──────┐  ┌▼────────┐ ┌▼────────┐ ┌▼────────┐
│Settings│  │Zotero        │  │Registry │ │Generator│ │UI Layer │
│Manager │  │Connector     │  │Service  │ │Service  │ │         │
└────────┘  │(SQLite Read) │  │(JSON    │ │(Note    │ │-Onboard │
            └──────┬───────┘  │ State)  │ │ Writer) │ │ Wizard  │
                   │          └────┬────┘ └────┬────┘ │-Triage  │
                   │               │           │      │ View    │
                   │               │           │      └─────────┘
                   │          ┌────▼───────────▼────┐
                   └─────────►│ Processing Engine   │
                              │ (Batch, Recommend,  │
                              │  Quality Gate)      │
                              └─────────────────────┘
```

### Component 1: Settings Manager

**Responsibility:** Persist and expose plugin configuration.

**Interfaces:**
```typescript
interface ZotBridgeSettings {
    zoteroDbPath: string;           // Path to zotero.sqlite
    outputFolder: string;           // Where to create notes
    batchSize: number;              // Daily recommendation limit
    processedItemIds: Set<string>;  // Lightweight in-memory cache
    lastSyncTime: number;
}
```

**Implementation pattern:**
- Use `loadData()` / `saveData()` for persistence
- Expose via singleton or dependency injection
- Settings UI uses `PluginSettingTab` class

**Sources:** [Obsidian Plugin Settings](https://forum.obsidian.md/t/best-method-to-access-the-latest-plugin-setting-values/89396)

### Component 2: Zotero Connector (SQLite Reader)

**Responsibility:** Read Zotero database without modifying it.

**Critical decision:** How to bundle better-sqlite3?

**Option A: Depend on obsidian-sqlite3 plugin**
- **Pro:** Handles platform-specific binaries for you
- **Pro:** User installs dependency plugin once
- **Con:** External dependency (user must install two plugins)
- **Implementation:**
  ```typescript
  const sqlitePlugin = this.app.plugins.getPlugin('obsidian-sqlite3');
  if (!sqlitePlugin) {
      new Notice('Please install obsidian-sqlite3 plugin first');
      return;
  }
  const db = sqlitePlugin.initDatabase(this.settings.zoteroDbPath, { readonly: true });
  ```

**Option B: Bundle better-sqlite3 directly**
- **Pro:** Self-contained plugin
- **Con:** Complex build process (prebuild-install + bindings for cross-platform)
- **Con:** Must ship `.node` binaries for Windows/Mac/Linux
- **Implementation:** Requires custom esbuild config + asset copying

**Recommendation:** Start with **Option A** (dependency approach) for MVP, migrate to Option B post-1.0 if users request standalone distribution.

**Data access pattern:**
```typescript
class ZoteroConnector {
    private db: Database;

    async connect(dbPath: string) {
        this.db = sqlitePlugin.initDatabase(dbPath, { readonly: true });
    }

    queryItems(filters: ItemFilter): ZoteroItem[] {
        const stmt = this.db.prepare(`
            SELECT * FROM items
            WHERE itemTypeID = ? AND dateAdded > ?
        `);
        return stmt.all(filters.typeId, filters.minDate);
    }

    close() {
        this.db.close();
    }
}
```

**Sources:**
- [obsidian-sqlite3 Plugin](https://github.com/windily-cloud/obsidian-sqlite3)
- [Adding SQLite to Obsidian Plugin](https://forum.obsidian.md/t/adding-sqlite-database-integration-to-an-obsidian-plugin/88272)
- [better-sqlite3 Electron Issues](https://github.com/WiseLibs/better-sqlite3/issues/1321)

### Component 3: Registry Service (State Persistence)

**Responsibility:** Track processing state across restarts (what's processed, queued, rejected).

**Storage strategy:**
```typescript
interface ProcessingRegistry {
    processed: Record<string, ProcessedItemState>;  // itemId -> state
    queue: string[];                                 // itemIds pending triage
    lastBatchDate: string;
}

class RegistryService {
    private registry: ProcessingRegistry;

    async load() {
        const data = await plugin.loadData();
        this.registry = data.registry || this.getDefaultRegistry();
    }

    async save() {
        await plugin.saveData({ registry: this.registry });
    }

    markProcessed(itemId: string, state: ProcessedItemState) {
        this.registry.processed[itemId] = state;
        await this.save();  // Debounce in production
    }
}
```

**Performance consideration:** For 5000+ items, storing full registry in `data.json` may cause slow saves. Consider:
- Debouncing saves (batch writes every 5 seconds)
- Storing only essential state (IDs + status, not full item metadata)
- Using separate JSON file via `app.vault.adapter.write()` if exceeding 1MB

**Sources:**
- [Plugin saveData/loadData](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData)
- [How Plugin Persists Data](https://forum.obsidian.md/t/how-could-plugin-persist-data/55959)

### Component 4: Processing Engine

**Responsibility:** Batch generator, recommendation logic, quality gate validation.

**Critical pattern:** Avoid blocking UI thread during heavy computation.

**Anti-pattern (blocks UI):**
```typescript
// BAD: Processes all 5000 items synchronously
async generateBatch() {
    const items = connector.queryItems({ limit: 5000 });
    const filtered = items.filter(complexFilter);      // BLOCKS
    const sorted = filtered.sort(complexComparator);   // BLOCKS
    return sorted.slice(0, 10);
}
```

**Recommended pattern (chunked processing):**
```typescript
// GOOD: Process in chunks with yield points
async generateBatch(): Promise<ZoteroItem[]> {
    const CHUNK_SIZE = 100;
    const items = connector.queryItems({ limit: 5000 });
    const results: ZoteroItem[] = [];

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const filtered = chunk.filter(complexFilter);
        results.push(...filtered);

        // Yield to UI thread every chunk
        await sleep(0);  // Or setImmediate equivalent
    }

    return results.sort(complexComparator).slice(0, 10);
}
```

**Alternative: Web Workers (experimental)**
- Obsidian technically supports Web Workers but requires custom esbuild config
- Example: [obsidian-web-worker-example](https://github.com/RyotaUshio/obsidian-web-worker-example)
- **Caution:** Limited community adoption; may have compatibility issues
- **Recommendation:** Use chunked async pattern first, investigate workers if still too slow

**Sources:**
- [Web Workers in Obsidian](https://github.com/RyotaUshio/obsidian-web-worker-example)
- [CPU-Intensive Tasks Discussion](https://forum.obsidian.md/t/how-to-speed-up-cpu-intensive-tasks-in-an-obsidian-plugin-workers-not-supported/103392)

### Component 5: Generator Service (Note Creation)

**Responsibility:** Write markdown files to vault with proper frontmatter.

**API pattern:**
```typescript
class NoteGenerator {
    async createNote(item: ZoteroItem, targetFolder: string): Promise<TFile> {
        const filename = this.sanitizeFilename(item.title) + '.md';
        const path = `${targetFolder}/${filename}`;
        const content = this.generateMarkdown(item);

        // Check if file exists
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile) {
            // Handle duplicate: append timestamp or skip
        }

        // Create file via Vault API (NOT fs.writeFile)
        const file = await this.app.vault.create(path, content);
        return file;
    }

    private generateMarkdown(item: ZoteroItem): string {
        return `---
zotero-id: ${item.id}
title: ${item.title}
authors: ${item.creators.join(', ')}
---

# ${item.title}

## Notes
[Your notes here]
`;
    }
}
```

**Critical:** Always use `app.vault` API, not Node.js `fs` module. Vault API triggers Obsidian's indexing and syncing.

**Sources:**
- [Vault API File Operations](https://docs.obsidian.md/Plugins/Vault)
- [Why fs.writeFile Doesn't Work](https://forum.obsidian.md/t/why-does-fs-writefile-not-save-file/31972)

### Component 6: UI Layer

**6a. Onboarding Wizard (Modal)**

```typescript
import { Modal, Setting } from 'obsidian';

class OnboardingModal extends Modal {
    private step: number = 0;

    onOpen() {
        this.renderStep();
    }

    renderStep() {
        const { contentEl } = this;
        contentEl.empty();

        if (this.step === 0) {
            contentEl.createEl('h2', { text: 'Welcome to Zotero Bridge' });
            new Setting(contentEl)
                .setName('Zotero Database Path')
                .addText(text => text.setValue(this.settings.zoteroDbPath));

            new Setting(contentEl)
                .addButton(btn => btn
                    .setButtonText('Next')
                    .onClick(() => {
                        this.step++;
                        this.renderStep();
                    }));
        }
        // ... more steps
    }
}
```

**Sources:**
- [Obsidian Modals](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [Modal Refresh Patterns](https://designdebt.club/refreshing-your-modal-or-settings-tab-in-obsidian/)

**6b. Triage Dashboard (Custom View)**

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE_TRIAGE = 'zotbridge-triage';

class TriageView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_TRIAGE; }
    getDisplayText() { return 'Zotero Triage'; }
    getIcon() { return 'checkmark'; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl('h2', { text: 'Triage Dashboard' });

        // Render card UI for batch items
        const items = await this.plugin.processingEngine.getCurrentBatch();
        items.forEach(item => this.renderCard(container, item));
    }

    renderCard(parent: HTMLElement, item: ZoteroItem) {
        const card = parent.createDiv({ cls: 'triage-card' });
        card.createEl('h3', { text: item.title });

        const actions = card.createDiv({ cls: 'triage-actions' });
        actions.createEl('button', { text: 'Accept' })
               .addEventListener('click', () => this.handleAccept(item));
        actions.createEl('button', { text: 'Skip' })
               .addEventListener('click', () => this.handleSkip(item));
    }
}

// Register in main plugin
this.registerView(VIEW_TYPE_TRIAGE, (leaf) => new TriageView(leaf));
```

**Opening the view:**
```typescript
this.addCommand({
    id: 'open-triage',
    name: 'Open Triage Dashboard',
    callback: () => {
        this.app.workspace.getRightLeaf(false).setViewState({
            type: VIEW_TYPE_TRIAGE,
            active: true
        });
    }
});
```

**Sources:**
- [Custom Views Documentation](https://docs.obsidian.md/Plugins/User+interface/Views)
- [ItemView Examples](https://forum.obsidian.md/t/how-to-correctly-open-an-itemview/60871)
- [Workspace API](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/workspace)

---

## Data Flow Architecture

```
┌─────────────┐
│   Zotero    │
│  Database   │ (read-only)
│ (SQLite)    │
└──────┬──────┘
       │
       │ SQL Query (via better-sqlite3)
       ▼
┌─────────────────┐
│ Zotero Connector│ ──► Returns ZoteroItem[]
└────────┬────────┘
         │
         │ Raw items
         ▼
┌──────────────────┐
│Processing Engine │
│ - Filter         │
│ - Recommend      │ ──► Checks Registry for processed IDs
│ - Quality Gate   │ ◄── Updates Registry with state
└────────┬─────────┘
         │
         │ Approved items
         ▼
┌───────────────┐          ┌────────────┐
│Note Generator │ ────────►│Obsidian    │
│               │  writes  │Vault       │
└───────────────┘          └────────────┘
         │
         │ Created file paths
         ▼
┌────────────────┐
│ Registry       │
│ (persists via  │
│  saveData)     │
└────────────────┘
```

**Key flows:**

1. **Daily Batch Generation:**
   - User triggers command → Processing Engine queries Zotero Connector
   - Engine filters based on Registry (skip already processed)
   - Engine ranks items → Returns top N → Displays in Triage View

2. **Item Triage:**
   - User clicks Accept/Skip in Triage View
   - Accept → Note Generator creates file → Registry marks processed
   - Skip → Registry marks skipped → Next item shows

3. **State Persistence:**
   - Every Registry update calls `plugin.saveData()`
   - On plugin load, Registry calls `plugin.loadData()`
   - Survives Obsidian restarts

---

## UI Patterns in Obsidian

### Settings Tab

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';

class ZotBridgeSettingTab extends PluginSettingTab {
    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Zotero Database Path')
            .setDesc('Path to zotero.sqlite (usually in Zotero data directory)')
            .addText(text => text
                .setPlaceholder('/path/to/zotero.sqlite')
                .setValue(this.plugin.settings.zoteroDbPath)
                .onChange(async (value) => {
                    this.plugin.settings.zoteroDbPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily Batch Size')
            .addSlider(slider => slider
                .setLimits(5, 50, 5)
                .setValue(this.plugin.settings.batchSize)
                .onChange(async (value) => {
                    this.plugin.settings.batchSize = value;
                    await this.plugin.saveSettings();
                }));
    }
}
```

### Modal Types

| Pattern | Use Case | Example |
|---------|----------|---------|
| Simple Modal | Confirmations, alerts | "Are you sure?" |
| Multi-step Modal | Onboarding wizard | Step 1: Path → Step 2: Preferences |
| Suggest Modal | Autocomplete selection | File picker, item search |
| Custom Modal | Complex forms | Triage decision UI |

### View Placement

```typescript
// Right sidebar (recommended for dashboards)
this.app.workspace.getRightLeaf(false).setViewState({ type: VIEW_TYPE });

// Left sidebar
this.app.workspace.getLeftLeaf(false).setViewState({ type: VIEW_TYPE });

// Main area (new tab)
this.app.workspace.getLeaf(true).setViewState({ type: VIEW_TYPE });
```

---

## Performance Architecture

### Challenge: 5000+ Items Without Freezing UI

**Obsidian runs single-threaded.** Heavy computation blocks user interaction.

### Strategy 1: Chunked Async Processing

```typescript
async function processBatch(items: ZoteroItem[], chunkSize = 100) {
    const results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const processed = chunk.map(heavyOperation);
        results.push(...processed);

        // Yield to event loop
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return results;
}
```

**Benefit:** UI remains responsive; progress indicator possible.

### Strategy 2: Incremental Indexing (Dataview Pattern)

**Inspiration:** Dataview maintains in-memory index, updates incrementally.

**Application to Zotero Bridge:**
- On first load: Index all Zotero items (show progress modal)
- Cache index in memory + persist lightweight version
- On subsequent runs: Only query items added since `lastSyncTime`

```typescript
class ItemCache {
    private index: Map<string, ZoteroItemMetadata>;

    async buildInitialIndex() {
        const items = connector.queryAllItems();
        const CHUNK_SIZE = 500;

        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            const chunk = items.slice(i, i + CHUNK_SIZE);
            chunk.forEach(item => {
                this.index.set(item.id, this.extractMetadata(item));
            });
            await sleep(0);  // Yield to UI
        }

        await this.persistIndex();
    }

    async updateIndex() {
        const lastSync = this.getLastSyncTime();
        const newItems = connector.queryItems({ since: lastSync });
        newItems.forEach(item => {
            this.index.set(item.id, this.extractMetadata(item));
        });
    }
}
```

**Trade-off:** Memory usage for 5000 items (~2-5MB typically acceptable).

### Strategy 3: Lazy Loading in UI

**For Triage View:**
- Don't render all batch items at once
- Render first 3 cards, load more on scroll or button click
- Use virtual scrolling for large lists (e.g., [react-virtual](https://github.com/TanStack/virtual) if using React)

### Strategy 4: Debounced Saves

**Problem:** Saving Registry on every item update causes jank.

**Solution:**
```typescript
class RegistryService {
    private saveTimeout: NodeJS.Timeout;

    markProcessed(itemId: string, state: ProcessedItemState) {
        this.registry.processed[itemId] = state;

        // Debounce save
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.save();
        }, 2000);  // Save 2 seconds after last update
    }
}
```

### Performance Benchmarks (Reference: Dataview)

- **Indexing:** ~1000 files/second (Dataview on modern hardware)
- **Query execution:** Sub-100ms for most queries on 10K+ notes
- **Startup cost:** 1-2 seconds for large vaults

**Target for Zotero Bridge:**
- Initial index of 5000 items: <5 seconds (with progress indicator)
- Incremental updates: <500ms
- Batch generation: <2 seconds
- Note creation: <100ms per file

**Sources:**
- [Dataview Performance Discussion](https://github.com/blacksmithgu/obsidian-dataview/discussions/2116)
- [Dataview Indexing Architecture](https://blacksmithgu.github.io/obsidian-dataview/)
- [Datacore (Performance Successor)](https://deepwiki.com/blacksmithgu/datacore)

---

## Build Order Recommendations

Based on component dependencies and risk mitigation:

### Phase 1: Core Infrastructure (Foundation)
**Goal:** Validate SQLite access and basic plugin structure.

1. **Settings Manager** (low risk, foundational)
   - Implement `loadData()` / `saveData()`
   - Create settings tab UI
   - Test persistence across restarts

2. **Zotero Connector** (high risk, critical path)
   - Choose SQLite strategy (obsidian-sqlite3 dependency vs bundled)
   - Implement read-only database queries
   - Test with real Zotero database
   - **Validation gate:** Can we reliably read Zotero items?

3. **Registry Service** (medium risk, foundational)
   - Implement state persistence
   - Design schema for processed items
   - Test with mock data (5000+ items)
   - **Validation gate:** Can we persist large state efficiently?

**Deliverable:** Plugin that connects to Zotero DB, reads items, persists state.

---

### Phase 2: Processing Logic (Business Rules)
**Goal:** Implement batch generation and recommendation algorithms.

4. **Processing Engine - Batch Generator**
   - Implement filtering logic
   - Implement ranking/recommendation
   - Test chunked async processing with 5000 items
   - **Validation gate:** Does UI remain responsive?

5. **Processing Engine - Quality Gate**
   - Implement validation rules
   - Test edge cases (missing fields, malformed data)

**Deliverable:** Command that generates batch of recommended items (logged to console).

---

### Phase 3: Note Generation (Output)
**Goal:** Create actual notes in vault.

6. **Generator Service**
   - Implement markdown templating
   - Implement file creation via Vault API
   - Handle duplicates and filename sanitization
   - **Validation gate:** Do created notes have proper frontmatter and trigger Obsidian indexing?

**Deliverable:** Command that creates notes for test batch.

---

### Phase 4: User Interface (Interactions)
**Goal:** Build wizard and triage UI.

7. **Onboarding Modal**
   - Multi-step wizard for initial setup
   - Path validation and user guidance

8. **Triage View (Custom ItemView)**
   - Card-based UI for batch items
   - Accept/Skip actions
   - Integration with Registry and Generator

**Deliverable:** Full user flow from setup to note creation.

---

### Phase 5: Polish & Performance
**Goal:** Optimize for production use.

9. **Performance Optimization**
   - Implement incremental indexing
   - Add progress indicators
   - Optimize Registry saves (debouncing)

10. **Error Handling & Edge Cases**
    - Database connection failures
    - Invalid Zotero data
    - Disk space issues
    - User cancellation flows

**Deliverable:** Production-ready plugin.

---

## Dependency Graph

```
Settings Manager ──┐
                   ├──► Zotero Connector ──► Processing Engine ──► Generator Service
Registry Service ──┘                              │                      │
                                                  │                      │
                                             Triage View ◄───────────────┘
                                                  │
                                           Onboarding Modal
```

**Critical path:** Settings → Zotero Connector → Processing Engine → Generator
**Parallel development possible:** UI components (Modal, View) can be built with mock data while core logic is stabilizing.

---

## Anti-Patterns to Avoid

### 1. Synchronous Heavy Operations
**Don't:**
```typescript
// Blocks UI for seconds
const items = connector.queryAllItems();  // 5000 items
const filtered = items.filter(complexFilter);
```

**Do:**
```typescript
// Yields to UI every 100 items
const items = await connector.queryAllItems();
const filtered = await chunkProcess(items, 100, complexFilter);
```

### 2. Using Node.js fs Module
**Don't:**
```typescript
import * as fs from 'fs';
fs.writeFileSync(path, content);  // Breaks Obsidian indexing
```

**Do:**
```typescript
await this.app.vault.create(path, content);  // Triggers indexing
```

### 3. Ignoring Cleanup in onunload
**Don't:**
```typescript
onunload() {
    // Empty - leaks memory, leaves views open
}
```

**Do:**
```typescript
onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TRIAGE);
    this.connector.close();  // Close database connections
}
```

### 4. Saving Large Objects Directly
**Don't:**
```typescript
await this.saveData({
    allItems: this.allZoteroItems,  // 5000 items × full metadata = huge file
});
```

**Do:**
```typescript
await this.saveData({
    processedIds: Array.from(this.processedIds),  // Just IDs, not full objects
    lastSyncTime: this.lastSyncTime,
});
```

### 5. Assuming SQLite Path
**Don't:**
```typescript
const dbPath = 'C:\\Users\\User\\Zotero\\zotero.sqlite';  // Hardcoded Windows path
```

**Do:**
```typescript
// Let user configure in settings
const dbPath = this.settings.zoteroDbPath;
if (!await this.app.vault.adapter.exists(dbPath)) {
    new Notice('Zotero database not found. Please check settings.');
}
```

---

## Sources

### Official Documentation
- [Obsidian Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Vault API](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian Modals](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)
- [Obsidian Workspace](https://docs.obsidian.md/Plugins/User+interface/Workspace)

### Plugin Examples
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) - Official template
- [Obsidian Zotero Integration](https://github.com/mgmeyers/obsidian-zotero-integration) - Existing Zotero plugin
- [ZotLit](https://github.com/PKM-er/obsidian-zotlit) - Alternative Zotero integration
- [obsidian-sqlite3](https://github.com/windily-cloud/obsidian-sqlite3) - SQLite wrapper for plugins

### Performance & Architecture
- [Obsidian Dataview](https://github.com/blacksmithgu/obsidian-dataview) - Reference for large-scale indexing
- [Dataview Performance Discussion](https://github.com/blacksmithgu/obsidian-dataview/discussions/2116)
- [Web Workers in Obsidian](https://github.com/RyotaUshio/obsidian-web-worker-example)

### Community Resources
- [Obsidian Plugin Developer Docs](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/workspace)
- [Adding SQLite to Plugin](https://forum.obsidian.md/t/adding-sqlite-database-integration-to-an-obsidian-plugin/88272)
- [Plugin Data Persistence](https://forum.obsidian.md/t/how-could-plugin-persist-data/55959)
- [Custom View Examples](https://forum.obsidian.md/t/how-to-correctly-open-an-itemview/60871)

---

## Confidence Assessment

| Area | Confidence | Justification |
|------|------------|---------------|
| Plugin Lifecycle | HIGH | Official docs + sample plugin verified |
| Settings/State Persistence | HIGH | Documented API patterns + forum examples |
| Vault File Operations | HIGH | Official Vault API + verified anti-patterns |
| SQLite Integration | MEDIUM | Working examples exist, but build complexity acknowledged |
| Performance Patterns | MEDIUM | Dataview reference + community reports, but no official guidance |
| Web Workers | LOW | Limited adoption, compatibility concerns noted |

**Overall Confidence: HIGH** for core architecture decisions. Performance optimizations may require iteration based on real-world testing with user's 5000-item library.

---

## Open Questions for Phase-Specific Research

1. **Zotero Schema:** What exact SQLite queries return items with all needed metadata? (Research during Phase 1)
2. **Recommendation Algorithm:** What ranking logic best surfaces relevant items? (Research during Phase 2)
3. **Template Flexibility:** Should users customize note templates? (Research during Phase 4)
4. **Progress Indicators:** Best UX pattern for long-running operations in Obsidian? (Research during Phase 5)
