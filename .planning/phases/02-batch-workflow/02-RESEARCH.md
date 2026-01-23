# Phase 2: Batch Workflow - Research

**Researched:** 2026-01-23
**Domain:** Obsidian custom views, card-based UI, triage workflow, batch generation, undo patterns
**Confidence:** HIGH

## Summary

Phase 2 builds a triage dashboard for processing Zotero items in batches. The research validates that Obsidian's `ItemView` class is the correct foundation for the card-based triage interface. Users will generate batches of candidates, review them in cards showing metadata, and take Accept/Reject/Defer actions with immediate effect and undo capability.

Key findings:
- `ItemView` provides a custom view pane that can be registered and activated programmatically
- `createEl`, `createDiv`, and `createFragment` enable building rich HTML interfaces within views
- `Notice` class accepts `DocumentFragment` allowing buttons with click handlers for undo functionality
- Registry service from Phase 1 already provides state tracking and stats infrastructure
- Session stats require in-memory tracking since Obsidian plugins don't persist session-level data automatically

**Primary recommendation:** Extend Phase 1's registry to support batch generation with "proposed" state, build a `TriageView` extending `ItemView` for the card interface, and implement undo via timed `Notice` with `DocumentFragment` containing an undo button.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| obsidian | latest | ItemView, Notice, Setting, ButtonComponent | Official Obsidian plugin framework |
| (existing) sql.js | 1.13.0+ | Already integrated from Phase 1 | Zotero database access |
| (existing) lodash.debounce | 4.0.8 | Already integrated from Phase 1 | Registry save debouncing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | N/A | Phase 2 uses only Obsidian built-ins | All UI from Obsidian API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain HTML/CSS | Svelte components | Svelte adds complexity; Phase 2 UI is simple enough for vanilla |
| Notice for undo | Custom modal | Notice is lighter weight, less disruptive for quick undo |
| ItemView in sidebar | Modal-based triage | ItemView integrates with workspace, supports persistence |

**Installation:**
```bash
# No new dependencies needed for Phase 2
# Existing Phase 1 dependencies are sufficient
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ui/
│   ├── triage-view.ts      # ItemView for triage dashboard
│   ├── triage-card.ts      # Card component for single item
│   ├── stats-panel.ts      # Stats display component
│   └── undo-notice.ts      # Notice with undo button
├── batch/
│   ├── batch-service.ts    # Batch generation logic
│   └── types.ts            # Batch-related types
├── registry/
│   └── registry-service.ts # Extended with batch support
└── main.ts                 # Register view, add commands
```

### Pattern 1: ItemView for Triage Dashboard
**What:** Custom view that displays card-based triage interface
**When to use:** Main triage workflow
**Example:**
```typescript
// Source: Obsidian unofficial docs + official API
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const TRIAGE_VIEW_TYPE = 'zotbridge-triage';

export class TriageView extends ItemView {
  private plugin: ZotBridgePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ZotBridgePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TRIAGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'ZotBridge Triage';
  }

  getIcon(): string {
    return 'inbox'; // Lucide icon name
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('zotbridge-triage-container');

    await this.renderDashboard(container as HTMLElement);
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  private async renderDashboard(container: HTMLElement): Promise<void> {
    // Stats panel at top
    this.renderStatsPanel(container);

    // Batch progress indicator
    this.renderProgressBar(container);

    // Card list
    this.renderCardList(container);
  }
}
```

### Pattern 2: View Registration and Activation
**What:** Register view type and provide activation command
**When to use:** Plugin initialization
**Example:**
```typescript
// Source: Obsidian unofficial docs
import { Plugin } from 'obsidian';

export default class ZotBridgePlugin extends Plugin {
  async onload() {
    // Register the view type
    this.registerView(
      TRIAGE_VIEW_TYPE,
      (leaf) => new TriageView(leaf, this)
    );

    // Command to open triage view
    this.addCommand({
      id: 'open-triage',
      name: 'Open triage dashboard',
      callback: () => this.activateTriageView()
    });

    // Ribbon icon for quick access
    this.addRibbonIcon('inbox', 'ZotBridge Triage', () => {
      this.activateTriageView();
    });
  }

  async onunload() {
    // Detach all triage views on unload
    this.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);
  }

  async activateTriageView(): Promise<void> {
    // Detach existing to avoid duplicates
    this.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);

    // Open in right sidebar (or could use getLeaf for main area)
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
      type: TRIAGE_VIEW_TYPE,
      active: true,
    });

    // Reveal the leaf
    this.app.workspace.revealLeaf(leaf);
  }
}
```

### Pattern 3: Triage Card Component
**What:** Individual card displaying item metadata with action buttons
**When to use:** Each item in the batch
**Example:**
```typescript
// Source: Obsidian HTML elements API
interface TriageCardOptions {
  item: ZoteroItem;
  onAccept: (item: ZoteroItem) => void;
  onReject: (item: ZoteroItem) => void;
  onDefer: (item: ZoteroItem) => void;
}

function createTriageCard(
  container: HTMLElement,
  options: TriageCardOptions
): HTMLElement {
  const { item, onAccept, onReject, onDefer } = options;

  const card = container.createDiv({ cls: 'zotbridge-triage-card' });

  // Header with item type badge
  const header = card.createDiv({ cls: 'triage-card-header' });
  header.createSpan({ cls: 'item-type-badge', text: item.itemType });

  // Title
  card.createEl('h3', {
    cls: 'triage-card-title',
    text: item.title || 'Untitled'
  });

  // Authors and year
  const meta = card.createDiv({ cls: 'triage-card-meta' });
  const authors = item.authors.length > 0
    ? item.authors.slice(0, 2).join(', ') + (item.authors.length > 2 ? ' et al.' : '')
    : 'Unknown author';
  meta.createSpan({ text: `${authors} (${item.year || 'n.d.'})` });

  // Abstract (truncated)
  if (item.abstract) {
    const abstractText = item.abstract.length > 200
      ? item.abstract.substring(0, 200) + '...'
      : item.abstract;
    card.createDiv({
      cls: 'triage-card-abstract',
      text: abstractText
    });
  }

  // Action buttons
  const actions = card.createDiv({ cls: 'triage-card-actions' });

  const acceptBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-accept',
    text: 'Accept'
  });
  acceptBtn.addEventListener('click', () => onAccept(item));

  const deferBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-defer',
    text: 'Defer'
  });
  deferBtn.addEventListener('click', () => onDefer(item));

  const rejectBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-reject',
    text: 'Reject'
  });
  rejectBtn.addEventListener('click', () => onReject(item));

  return card;
}
```

### Pattern 4: Notice with Undo Button
**What:** Toast notification with clickable undo action
**When to use:** After Accept/Reject/Defer actions (3 second window)
**Example:**
```typescript
// Source: Obsidian API - Notice accepts DocumentFragment
import { Notice } from 'obsidian';

interface UndoNoticeOptions {
  message: string;
  onUndo: () => void;
  timeout?: number; // Default 3000ms
}

function showUndoNotice(options: UndoNoticeOptions): Notice {
  const { message, onUndo, timeout = 3000 } = options;

  // Create DocumentFragment with message and button
  const fragment = createFragment((el) => {
    el.createSpan({ text: message + ' ' });

    const undoBtn = el.createEl('a', {
      text: 'Undo',
      cls: 'zotbridge-undo-link'
    });

    undoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onUndo();
      notice.hide();
    });
  });

  const notice = new Notice(fragment, timeout);
  return notice;
}

// Usage
showUndoNotice({
  message: 'Item rejected.',
  onUndo: () => {
    registry.markState(itemId, previousState);
    refreshCards();
  }
});
```

### Pattern 5: Batch Generation Service
**What:** Generate batch of candidates respecting registry state
**When to use:** When user requests new batch
**Example:**
```typescript
// Source: Phase 1 registry + CONTEXT.md decisions
interface BatchOptions {
  size: number;
  includeDeferred?: boolean;
}

class BatchService {
  constructor(
    private connector: ZoteroConnector,
    private registry: RegistryService
  ) {}

  async generateBatch(options: BatchOptions): Promise<ZoteroItem[]> {
    const { size, includeDeferred = false } = options;

    // Get all items from Zotero (already cached)
    const allItems = this.connector.getCachedItems();

    // Filter to unprocessed items
    const candidates = allItems.filter(item => {
      const state = this.registry.getState(item.itemID);

      // Never include imported or rejected
      if (state === 'imported' || state === 'rejected') {
        return false;
      }

      // Include unseen always
      if (state === 'unseen') {
        return true;
      }

      // Include deferred only if requested
      if (state === 'deferred' && includeDeferred) {
        return true;
      }

      return false;
    });

    // Sort by dateAdded (most recent first per CONTEXT.md)
    candidates.sort((a, b) => {
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
    });

    // Take batch size
    const batch = candidates.slice(0, size);

    // Mark as proposed in registry
    for (const item of batch) {
      this.registry.markState(item.itemID, 'proposed');
    }

    return batch;
  }

  getUnprocessedCount(): number {
    const allItems = this.connector.getCachedItems();
    return allItems.filter(item => {
      const state = this.registry.getState(item.itemID);
      return state === 'unseen';
    }).length;
  }

  getDeferredCount(): number {
    return this.registry.getEntriesByState('deferred').length;
  }
}
```

### Pattern 6: Session Stats Tracking
**What:** Track items processed in current Obsidian session (in-memory)
**When to use:** Stats dashboard display
**Example:**
```typescript
// Source: In-memory tracking pattern
interface SessionStats {
  startTime: number;
  itemsProcessed: number;
  itemsAccepted: number;
  itemsRejected: number;
  itemsDeferred: number;
}

class SessionTracker {
  private stats: SessionStats;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stats = {
      startTime: Date.now(),
      itemsProcessed: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      itemsDeferred: 0
    };
  }

  recordAction(action: 'accepted' | 'rejected' | 'deferred'): void {
    this.stats.itemsProcessed++;
    if (action === 'accepted') this.stats.itemsAccepted++;
    if (action === 'rejected') this.stats.itemsRejected++;
    if (action === 'deferred') this.stats.itemsDeferred++;
  }

  undoAction(action: 'accepted' | 'rejected' | 'deferred'): void {
    this.stats.itemsProcessed--;
    if (action === 'accepted') this.stats.itemsAccepted--;
    if (action === 'rejected') this.stats.itemsRejected--;
    if (action === 'deferred') this.stats.itemsDeferred--;
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  getSessionDuration(): number {
    return Date.now() - this.stats.startTime;
  }
}
```

### Pattern 7: Processing Velocity Calculation
**What:** Calculate items per day/week from registry timestamps
**When to use:** Stats dashboard velocity display
**Example:**
```typescript
// Source: Standard velocity calculation
interface VelocityStats {
  itemsPerDay: number;
  itemsPerWeek: number;
  averagePerSession: number;
}

function calculateVelocity(registry: RegistryService): VelocityStats {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Get all entries with timestamps
  const allEntries = registry.getAllEntries(); // Need to add this method

  // Count items processed in last day
  const lastDayItems = allEntries.filter(e =>
    e.timestamp >= oneDayAgo &&
    (e.state === 'imported' || e.state === 'rejected' || e.state === 'deferred')
  ).length;

  // Count items processed in last week
  const lastWeekItems = allEntries.filter(e =>
    e.timestamp >= oneWeekAgo &&
    (e.state === 'imported' || e.state === 'rejected' || e.state === 'deferred')
  ).length;

  return {
    itemsPerDay: lastDayItems,
    itemsPerWeek: lastWeekItems,
    averagePerSession: lastWeekItems / 7 // Rough estimate
  };
}
```

### Anti-Patterns to Avoid
- **Modal for triage:** ItemView integrates better with workspace, persists position
- **Storing batch items in registry:** Batch is transient; regenerate on demand
- **Auto-generating batch on plugin load:** Let user control when to generate
- **Complex undo stack:** 3-second Notice window is sufficient; don't over-engineer
- **Svelte/React for simple card UI:** Vanilla HTML with Obsidian helpers is cleaner

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom view pane | HTML injection | ItemView class | Proper workspace integration |
| Toast notifications | Custom DOM overlay | Notice class | Obsidian styling, auto-dismiss |
| Button styling | Custom CSS | ButtonComponent or mod-cta class | Consistent with Obsidian theme |
| Icon rendering | SVG embedding | Obsidian icon API | Theme-aware icons |
| Settings UI | Custom form | Setting class | Consistent UX |
| State persistence | localStorage/IndexedDB | plugin.saveData/loadData | Vault-portable |

**Key insight:** Obsidian provides extensive UI primitives. Use them rather than reinventing. The Notice class with DocumentFragment is powerful enough for undo; don't build a custom snackbar.

## Common Pitfalls

### Pitfall 1: View Not Appearing After Registration
**What goes wrong:** View registered but doesn't show when command runs
**Why it happens:** Forgot to call `setViewState` or `revealLeaf`
**How to avoid:**
```typescript
async activateView() {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE); // Clear existing
  const leaf = this.app.workspace.getRightLeaf(false);
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  this.app.workspace.revealLeaf(leaf); // MUST call this
}
```
**Warning signs:** Command runs without error but nothing visible

### Pitfall 2: Stale View After Data Changes
**What goes wrong:** Cards show old data after registry update
**Why it happens:** View doesn't re-render automatically
**How to avoid:**
- Keep reference to view instance via `getLeavesOfType`
- Add `refresh()` method to view that re-renders cards
- Call refresh after any action that changes data
**Warning signs:** UI shows item already processed, or wrong counts

### Pitfall 3: Undo Button Not Working
**What goes wrong:** Click on undo link does nothing
**Why it happens:** Event listener not attached or notice already dismissed
**How to avoid:**
- Use `createFragment` to build Notice content
- Attach listener inside fragment callback
- Store previous state BEFORE changing it
**Warning signs:** Console errors on click, or silent failure

### Pitfall 4: Batch Contains Already-Processed Items
**What goes wrong:** User sees items they already rejected/imported
**Why it happens:** Registry state not checked, or race condition
**How to avoid:**
- Always filter by registry state before presenting batch
- Mark items as "proposed" immediately when generating batch
- Re-filter on view open in case state changed
**Warning signs:** Duplicate items appearing, user confusion

### Pitfall 5: Session Stats Lost on View Close
**What goes wrong:** Session stats reset when triage view closed
**Why it happens:** Stats stored in view instance, not plugin
**How to avoid:**
- Store SessionTracker in plugin instance, not view
- View reads from plugin's tracker
- Reset only on explicit user action or plugin reload
**Warning signs:** Stats go to zero when switching tabs

### Pitfall 6: CSS Conflicts with Obsidian Theme
**What goes wrong:** Cards look wrong in dark/light mode
**Why it happens:** Hardcoded colors instead of CSS variables
**How to avoid:**
- Use Obsidian CSS variables: `var(--text-normal)`, `var(--background-secondary)`
- Test in both light and dark themes
- Avoid absolute colors except for semantic (green accept, red reject)
**Warning signs:** Invisible text, harsh contrast, inconsistent styling

## Code Examples

### Complete Stats Panel Component
```typescript
// Source: Combining registry stats with session stats
interface StatsPanelOptions {
  registry: RegistryService;
  sessionTracker: SessionTracker;
  totalZoteroItems: number;
}

function renderStatsPanel(
  container: HTMLElement,
  options: StatsPanelOptions
): HTMLElement {
  const { registry, sessionTracker, totalZoteroItems } = options;
  const registryStats = registry.getStats();
  const sessionStats = sessionTracker.getStats();

  const panel = container.createDiv({ cls: 'zotbridge-stats-panel' });

  // Total breakdown
  const totalSection = panel.createDiv({ cls: 'stats-section' });
  totalSection.createEl('h4', { text: 'Library Overview' });

  const totalGrid = totalSection.createDiv({ cls: 'stats-grid' });
  createStatItem(totalGrid, 'Total in Zotero', totalZoteroItems);
  createStatItem(totalGrid, 'Imported', registryStats.imported, 'stat-success');
  createStatItem(totalGrid, 'Rejected', registryStats.rejected, 'stat-muted');
  createStatItem(totalGrid, 'Deferred', registryStats.deferred || 0);
  createStatItem(totalGrid, 'Pending', totalZoteroItems - registryStats.total);

  // Session section
  const sessionSection = panel.createDiv({ cls: 'stats-section' });
  sessionSection.createEl('h4', { text: 'This Session' });

  const sessionGrid = sessionSection.createDiv({ cls: 'stats-grid' });
  createStatItem(sessionGrid, 'Processed', sessionStats.itemsProcessed);
  createStatItem(sessionGrid, 'Accepted', sessionStats.itemsAccepted, 'stat-success');
  createStatItem(sessionGrid, 'Rejected', sessionStats.itemsRejected, 'stat-muted');

  return panel;
}

function createStatItem(
  container: HTMLElement,
  label: string,
  value: number,
  cls?: string
): void {
  const item = container.createDiv({ cls: 'stat-item' });
  item.createDiv({ cls: 'stat-value ' + (cls || ''), text: String(value) });
  item.createDiv({ cls: 'stat-label', text: label });
}
```

### Batch Progress Indicator
```typescript
// Source: Simple progress component
function renderProgressBar(
  container: HTMLElement,
  processed: number,
  total: number
): HTMLElement {
  const wrapper = container.createDiv({ cls: 'zotbridge-progress' });

  const text = wrapper.createDiv({
    cls: 'progress-text',
    text: `${processed}/${total} processed`
  });

  const bar = wrapper.createDiv({ cls: 'progress-bar' });
  const fill = bar.createDiv({ cls: 'progress-fill' });
  fill.style.width = `${(processed / total) * 100}%`;

  return wrapper;
}
```

### Batch Completion Handler
```typescript
// Source: CONTEXT.md - show completion + prompt for next batch
async function handleBatchComplete(
  plugin: ZotBridgePlugin,
  view: TriageView
): Promise<void> {
  const container = view.getContentContainer();
  container.empty();

  const message = container.createDiv({ cls: 'batch-complete' });
  message.createEl('h3', { text: 'Batch Complete!' });
  message.createDiv({
    cls: 'batch-complete-text',
    text: 'Great progress! Ready for another batch?'
  });

  const actions = message.createDiv({ cls: 'batch-complete-actions' });

  const nextBtn = actions.createEl('button', {
    cls: 'mod-cta',
    text: 'Generate Next Batch'
  });
  nextBtn.addEventListener('click', async () => {
    await view.generateAndShowBatch();
  });

  const laterBtn = actions.createEl('button', {
    text: 'Take a Break'
  });
  laterBtn.addEventListener('click', () => {
    // Just close the view
    plugin.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);
  });
}
```

### Settings Extension for Batch Size
```typescript
// Source: Phase 1 settings pattern
// In settings.ts, add to display():

containerEl.createEl('h2', { text: 'Batch Settings' });

new Setting(containerEl)
  .setName('Batch Size')
  .setDesc('Number of items per batch (default: 5)')
  .addSlider(slider => slider
    .setLimits(1, 20, 1)
    .setValue(this.plugin.settings.batchSize ?? 5)
    .setDynamicTooltip()
    .onChange(async (value) => {
      this.plugin.settings.batchSize = value;
      await this.plugin.saveSettings();
    }));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal-based triage | ItemView in workspace | N/A | Better workspace integration |
| Text-only Notice | Notice with DocumentFragment | Obsidian API feature | Enables clickable undo |
| Manual CSS | Obsidian CSS variables | N/A | Theme compatibility |
| Polling for updates | Direct method calls | N/A | Real-time UI updates |

**Deprecated/outdated:**
- Custom snackbar implementations: Use Notice with DocumentFragment
- Direct DOM manipulation outside containerEl: Use Obsidian's createEl helpers

## Open Questions

1. **Deferred state timing**
   - What we know: Deferred items can reappear in future batches
   - What's unclear: Should there be a cooldown before deferred items reappear?
   - Recommendation: Allow immediately in "include deferred" mode; no cooldown for MVP

2. **View placement preference**
   - What we know: ItemView can go in sidebar or main area
   - What's unclear: User preference for where triage view opens
   - Recommendation: Default to right sidebar; could add setting in future

3. **Keyboard shortcuts for actions**
   - What we know: CONTEXT.md says "Buttons only for actions (no keyboard shortcuts in Phase 2)"
   - What's unclear: Should we prepare the architecture for future keyboard shortcuts?
   - Recommendation: Structure action handlers to be callable from any trigger source

## Sources

### Primary (HIGH confidence)
- [Obsidian Plugin Developer Docs - Views](https://marcusolsson.github.io/obsidian-plugin-docs/user-interface/views) - ItemView registration and activation patterns
- [Obsidian API obsidian.d.ts](https://github.com/obsidianmd/obsidian-api) - Notice, ButtonComponent, createEl definitions
- Phase 1 codebase - Existing registry, connector, and UI patterns

### Secondary (MEDIUM confidence)
- [Obsidian Forum - ItemView discussions](https://forum.obsidian.md/t/how-to-correctly-open-an-itemview/60871) - Community patterns
- [Obsidian Kanban Plugin](https://github.com/mgmeyers/obsidian-kanban) - Reference for card-based ItemView
- [Obsidian Spaced Repetition Plugin](https://github.com/st3v3nmw/obsidian-spaced-repetition) - Reference for review workflow

### Tertiary (LOW confidence)
- Generic web patterns for undo notifications - Adapted for Obsidian Notice API

## Metadata

**Confidence breakdown:**
- ItemView patterns: HIGH - Official docs + successful community plugins
- Notice with undo: HIGH - API confirms DocumentFragment support
- Batch generation: HIGH - Extends proven Phase 1 registry
- Session tracking: MEDIUM - Standard pattern, needs validation
- CSS styling: HIGH - Obsidian variables well documented

**Research date:** 2026-01-23
**Valid until:** 60 days (Obsidian API is stable; core patterns unlikely to change)
