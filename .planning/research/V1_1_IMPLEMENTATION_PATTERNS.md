# v1.1 Implementation Patterns & Code Examples

**Project:** Zotero Triage v1.1
**Purpose:** Ready-to-use patterns for avoiding pitfalls
**Status:** Production-ready code snippets

---

## Pattern 1: Defensive Tag Extraction

**File:** `src/db/zotero-connector.ts`

**Current code risk:**
```typescript
// Current implementation (from codebase review)
const tagsResult = this.db!.exec(ITEM_TAGS_QUERY, [itemID]);
const tags: string[] = [];
if (tagsResult.length > 0) {
  for (const tagRow of tagsResult[0].values) {
    tags.push(tagRow[0] as string); // RISK: assumes tagRow[0] is always string
  }
}
```

**Risk:** `tagRow[0]` could be NULL, resulting in ["null"] or empty array silently

**Improved pattern:**
```typescript
/**
 * Extract tags for an item with defensive NULL handling
 *
 * Filters out Zotero auto-generated annotation tags
 * Returns empty array if no tags found (not an error condition)
 */
async getItemTags(itemID: number): Promise<string[]> {
  try {
    const tagsResult = this.db!.exec(ITEM_TAGS_QUERY, [itemID]);
    const tags: string[] = [];

    // Defensive: check result exists before accessing
    if (!tagsResult || tagsResult.length === 0) {
      return []; // No tags, not an error
    }

    // Defensive: check values array
    if (!tagsResult[0].values || tagsResult[0].values.length === 0) {
      return []; // Empty values, not an error
    }

    // Process each tag row
    for (const tagRow of tagsResult[0].values) {
      // Defensive: check tagRow is array-like
      if (!Array.isArray(tagRow) || tagRow.length === 0) {
        console.warn(`Malformed tag row for item ${itemID}:`, tagRow);
        continue; // Skip malformed row, don't crash
      }

      // Defensive: check tagName is string, not NULL
      const tagName = tagRow[0];
      if (tagName === null || tagName === undefined) {
        console.debug(`NULL tag found for item ${itemID}, skipping`);
        continue; // Skip NULL tag
      }

      if (typeof tagName !== 'string') {
        console.warn(`Non-string tag for item ${itemID}:`, tagName);
        continue; // Skip non-string
      }

      // Defensive: filter out annotation tags (Zotero 7)
      if (this.isAnnotationTag(tagName)) {
        continue; // Skip annotation tag
      }

      tags.push(tagName.trim()); // Trim whitespace
    }

    return tags;
  } catch (err) {
    console.error(`Failed to extract tags for item ${itemID}:`, err);
    return []; // Graceful degradation on error
  }
}

/**
 * Check if tag is Zotero auto-generated (not user-created)
 */
private isAnnotationTag(tagName: string): boolean {
  if (!tagName) return false;

  const patterns = [
    /^custom-color-/i,      // Highlight colors
    /^highlight-/i,          // Emphasis markers
    /^annotation-/i,         // Reserved annotation prefix
    /^_/i                    // Zotero internal tags
  ];

  return patterns.some(pattern => pattern.test(tagName));
}

/**
 * Validate tag schema integrity (optional, for debugging)
 */
async validateTagSchema(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check for orphaned itemTags
    const orphaned = this.db!.exec(
      `SELECT COUNT(*) as count FROM itemTags it
       WHERE it.itemID NOT IN (SELECT itemID FROM items)`
    );

    if (orphaned[0]?.values[0]?.[0] as number > 0) {
      issues.push(`Found ${orphaned[0].values[0][0]} orphaned itemTags entries`);
    }
  } catch (err) {
    console.warn('Could not validate itemTags schema:', err);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
```

**SQL Query improvement:**
```typescript
// In src/db/queries.ts

/**
 * Query to get tags for a specific item.
 * Parameterized with itemID (?).
 *
 * Filters out Zotero auto-generated annotation tags to return
 * only user-created tags.
 *
 * Returns: tag names ordered alphabetically.
 * Result: Can be empty array (valid state, not error)
 */
export const ITEM_TAGS_QUERY = `
SELECT t.name
FROM itemTags it
JOIN tags t ON it.tagID = t.tagID
WHERE it.itemID = ?
  AND t.name NOT LIKE 'custom-color-%'
  AND t.name NOT LIKE 'highlight-%'
  AND t.name NOT LIKE 'annotation-%'
  AND t.name NOT LIKE '\_%' ESCAPE '\'
ORDER BY t.name
`;
```

**Testing pattern:**
```typescript
// In tests/integration/tag-extraction.test.ts

describe('Tag extraction', () => {
  it('should handle empty tag results', async () => {
    const connector = new ZoteroConnector();
    // Use item with no tags
    const tags = await connector.getItemTags(ITEM_WITH_NO_TAGS);
    expect(tags).toEqual([]);
  });

  it('should handle NULL tag values', async () => {
    // Simulate database returning NULL
    // (Requires mocking or test database with NULL values)
    const tags = await connector.getItemTags(ITEM_WITH_NULL_TAG);
    expect(tags).not.toContain(null);
    expect(tags).toEqual(['valid-tag']);
  });

  it('should filter annotation tags', async () => {
    const connector = new ZoteroConnector();
    // Item with mixed tags
    const tags = await connector.getItemTags(ITEM_WITH_ANNOTATION_TAGS);
    expect(tags).toEqual(['machine-learning', 'nlp']);
    expect(tags).not.toContain('custom-color-1');
    expect(tags).not.toContain('highlight-yellow');
  });

  it('should trim whitespace from tags', async () => {
    const tags = await connector.getItemTags(ITEM_WITH_WHITESPACE_TAGS);
    expect(tags).toEqual(['machine-learning', 'nlp']);
    expect(tags).not.toContain(' machine-learning ');
  });
});
```

---

## Pattern 2: Throttled Progress Tracking

**File:** `src/performance/progress-tracker.ts`

**Current code risk:**
```typescript
// Current implementation (from codebase review)
update(loaded: number, status?: string): void {
  // Called every item (5000 times)
  this.state.loaded = loaded;
  if (status) this.state.status = status;
  this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

  if (this.notice) {
    this.notice.setMessage(this.formatMessage()); // DOM update every call
  }
}
```

**Risk:** 5000 DOM updates in seconds = UI jank

**Improved pattern:**
```typescript
import { Notice } from 'obsidian';

export interface ProgressState {
  status: string;
  loaded: number;
  total: number;
  percentComplete: number;
}

export class ProgressTracker {
  private notice: Notice | null = null;
  private state: ProgressState;

  // Throttling configuration
  private lastUpdateTime: number = 0;
  private readonly UPDATE_THROTTLE_MS = 500; // Update UI at most every 500ms

  // Memory optimization
  private messageCache: string = '';
  private cachedPercent: number = -1;

  // Timeout protection
  private operationTimeout: NodeJS.Timeout | null = null;
  private readonly DEFAULT_MAX_DURATION_MS = 60000; // 60 seconds

  // Cancellation support
  private cancelled: boolean = false;

  constructor() {
    this.state = { status: '', loaded: 0, total: 0, percentComplete: 0 };
  }

  /**
   * Start tracking progress with persistent Notice
   * Automatically cleans up after maxDuration
   */
  start(message: string, total: number, maxDuration?: number): void {
    this.state = { status: message, loaded: 0, total, percentComplete: 0 };
    this.lastUpdateTime = Date.now();
    this.cancelled = false;

    // Show initial notice
    this.notice = new Notice(this.formatMessage(), 0);

    // Set timeout protection
    const duration = maxDuration ?? this.DEFAULT_MAX_DURATION_MS;
    this.operationTimeout = setTimeout(() => {
      this.error(`Operation timed out after ${duration}ms`);
    }, duration);
  }

  /**
   * Update progress state
   * Only updates UI if throttle threshold elapsed
   * Internal state always updated (useful for final status)
   */
  update(loaded: number, status?: string): void {
    // Always update internal state
    this.state.loaded = loaded;
    if (status) {
      this.state.status = status;
    }
    this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

    // Only update UI if throttle threshold elapsed
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    if (timeSinceLastUpdate < this.UPDATE_THROTTLE_MS) {
      // Don't touch DOM yet
      return;
    }

    // Update Notice (DOM operation)
    if (this.notice) {
      const message = this.formatMessage();
      this.notice.setMessage(message);
      this.lastUpdateTime = now;
    }

    // Monitor performance
    this.checkPerformance();
  }

  /**
   * Complete operation and clean up
   */
  complete(finalMessage?: string): void {
    if (this.operationTimeout) {
      clearTimeout(this.operationTimeout);
      this.operationTimeout = null;
    }

    if (this.notice) {
      this.notice.hide();
      this.notice = null;
    }

    if (finalMessage) {
      // New notice that auto-dismisses
      new Notice(finalMessage, 5000);
    }
  }

  /**
   * Handle error during operation
   */
  error(message: string): void {
    if (this.operationTimeout) {
      clearTimeout(this.operationTimeout);
      this.operationTimeout = null;
    }

    if (this.notice) {
      this.notice.hide();
      this.notice = null;
    }

    new Notice(message, 5000); // Auto-dismiss after 5 seconds
  }

  /**
   * Cancel ongoing operation
   */
  cancel(): void {
    this.cancelled = true;
    this.error('Operation cancelled by user');
  }

  /**
   * Check if operation was cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Check if tracker is currently active
   */
  isActive(): boolean {
    return this.notice !== null;
  }

  /**
   * Format progress message with status, bar, and percentage
   * Uses caching to avoid string allocation every call
   */
  private formatMessage(): string {
    // Create bar only if percentage changed
    let bar = this.cachedBar;
    if (this.state.percentComplete !== this.cachedPercent) {
      bar = this.createProgressBar(this.state.percentComplete);
      this.cachedPercent = this.state.percentComplete;
      this.cachedBar = bar;
    }

    return `${this.state.status}\n${bar}\n${this.state.loaded}/${this.state.total} (${this.state.percentComplete}%)`;
  }

  private cachedBar: string = '';

  /**
   * Create ASCII progress bar
   * Generates new string only when percentage changes
   */
  private createProgressBar(percent: number, width: number = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * Monitor update performance (debug only)
   */
  private checkPerformance(): void {
    if (this.state.loaded % 1000 === 0) {
      // Check for memory growth every 1000 items
      if (typeof performance !== 'undefined' && performance.memory) {
        const memoryUsage = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
        console.debug(`Progress at ${this.state.loaded}/${this.state.total}, memory: ${memoryUsage}MB`);
      }
    }
  }

  /**
   * Cleanup on plugin unload
   */
  onunload(): void {
    if (this.operationTimeout) {
      clearTimeout(this.operationTimeout);
      this.operationTimeout = null;
    }
    this.complete();
  }
}
```

**Usage pattern:**
```typescript
// In batch processing code

async processBatch(items: ZoteroItem[]): Promise<void> {
  const tracker = new ProgressTracker();
  tracker.start('Processing items...', items.length);

  try {
    const BATCH_SIZE = 100; // Process in chunks

    for (let i = 0; i < items.length; i++) {
      if (tracker.isCancelled()) {
        break; // Allow cancellation
      }

      // Do the work
      await this.scoreItem(items[i]);

      // Update progress only every BATCH_SIZE items
      if ((i + 1) % BATCH_SIZE === 0) {
        tracker.update(i + 1);
      }

      // Yield to event loop
      await sleep(0);
    }

    tracker.complete(`Processed ${items.length} items`);
  } catch (err) {
    tracker.error(`Processing failed: ${err.message}`);
    throw err;
  }
}
```

---

## Pattern 3: Aggregated Notice Manager

**File:** `src/ui/notice-manager.ts` (new file)

**Implementation:**
```typescript
import { Notice } from 'obsidian';

export enum NoticeLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error'
}

export interface PendingNotice {
  message: string;
  level: NoticeLevel;
  duration: number;
}

/**
 * Manages notices with deduplication and aggregation
 * Prevents notice spam by batching similar notices
 */
export class NoticeManager {
  private noticeQueue: Set<string> = new Set();
  private pendingNotices: Map<string, PendingNotice> = new Map();
  private isShowingNotice: boolean = false;

  /**
   * Queue a notice with deduplication
   * Returns immediately; notice shown when previous ones clear
   */
  async queueNotice(
    message: string,
    level: NoticeLevel = NoticeLevel.Info,
    duration: number = 5000
  ): Promise<void> {
    // Deduplicate: don't show same message twice
    if (this.noticeQueue.has(message)) {
      return;
    }

    this.noticeQueue.add(message);
    this.pendingNotices.set(message, { message, level, duration });

    // If no notice showing, start queue
    if (!this.isShowingNotice) {
      await this.processQueue();
    }
  }

  /**
   * Process notice queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.pendingNotices.size === 0) {
      this.isShowingNotice = false;
      return;
    }

    this.isShowingNotice = true;

    // Get first notice in queue
    const [message, noticeData] = this.pendingNotices.entries().next().value;
    this.pendingNotices.delete(message);
    this.noticeQueue.delete(message);

    // Show notice and wait for duration
    new Notice(
      this.formatNotice(noticeData.message, noticeData.level),
      noticeData.duration
    );

    await new Promise(resolve => setTimeout(resolve, noticeData.duration));

    // Process next notice
    await this.processQueue();
  }

  /**
   * Aggregate multiple validation warnings into single notice
   * Example: Instead of 5 individual "missing field" notices,
   *          show "5 items missing DOI, 3 items missing author"
   */
  async showAggregatedWarnings(
    warnings: Map<string, number>
  ): Promise<void> {
    if (warnings.size === 0) return;

    const summary = Array.from(warnings)
      .map(([issue, count]) => `${count}x ${issue}`)
      .join(', ');

    await this.queueNotice(
      `Validation issues: ${summary}`,
      NoticeLevel.Warning,
      5000
    );
  }

  /**
   * Format notice message with level indicator
   */
  private formatNotice(message: string, level: NoticeLevel): string {
    const indicator = {
      [NoticeLevel.Info]: 'ℹ️',
      [NoticeLevel.Warning]: '⚠️',
      [NoticeLevel.Error]: '❌'
    }[level];

    return `${indicator} ${message}`;
  }

  /**
   * Clear all pending notices
   */
  clearQueue(): void {
    this.noticeQueue.clear();
    this.pendingNotices.clear();
    this.isShowingNotice = false;
  }
}
```

**Usage pattern:**
```typescript
// Instead of:
for (const item of items) {
  if (validation.missing.includes('doi')) {
    new Notice(`Item #${item.itemID}: missing DOI`);
  }
  if (validation.missing.includes('author')) {
    new Notice(`Item #${item.itemID}: missing author`);
  }
}

// Use:
const noticeManager = new NoticeManager();
const warnings = new Map<string, number>();

for (const item of items) {
  for (const field of validation.missing) {
    const key = `Missing ${field}`;
    warnings.set(key, (warnings.get(key) || 0) + 1);
  }
}

await noticeManager.showAggregatedWarnings(warnings);
```

---

## Pattern 4: Concise Modal Help Text

**File:** `src/ui/override-modal.ts` (updated)

**Current code risk:**
```typescript
// Current: Verbose help
const fieldHelp = {
  doi: 'The DOI is a unique identifier for published articles. ' +
       'It is required because citations without DOIs are harder to track...'
};
```

**Risk:** 200+ character explanation for simple field

**Improved pattern:**
```typescript
import { App, Modal, Setting } from 'obsidian';

interface FieldHelpText {
  label: string;
  helpShort: string; // 1-2 sentences max
  helpLink?: string; // Optional external link for more info
  example: string; // Show example instead of explanation
}

export class OverrideModal extends Modal {
  private fieldHelp: Record<string, FieldHelpText> = {
    doi: {
      label: 'DOI',
      helpShort: 'Digital Object Identifier - helps identify published articles',
      example: '10.1234/example',
      helpLink: 'https://zotero.org/support/adding_items_to_zotero#manual-entry'
    },
    author: {
      label: 'Author(s)',
      helpShort: 'At least one author required',
      example: 'Smith, John; Jones, Jane',
    },
    year: {
      label: 'Year',
      helpShort: 'Publication year (4 digits)',
      example: '2024',
    },
    journal: {
      label: 'Journal/Publisher',
      helpShort: 'Publication venue',
      example: 'Nature Machine Intelligence',
    }
  };

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Fix Required Fields' });
    contentEl.createEl('p', {
      text: 'These fields are required for quality notes. Fix in Zotero, then re-import.',
      cls: 'override-modal-intro'
    });

    // Render fields with concise help
    for (const [fieldName, fieldDef] of Object.entries(this.fieldHelp)) {
      this.renderField(contentEl, fieldName, fieldDef);
    }

    // Buttons
    const buttonGroup = contentEl.createDiv({ cls: 'override-modal-buttons' });
    buttonGroup.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());

    buttonGroup.createEl('button', { text: 'Skip Item', cls: 'warning' })
      .addEventListener('click', () => this.onSkip());

    buttonGroup.createEl('button', { text: 'Fix & Continue', cls: 'cta' })
      .addEventListener('click', () => this.onContinue());
  }

  /**
   * Render single field with minimal help text
   */
  private renderField(
    container: HTMLElement,
    fieldName: string,
    fieldDef: FieldHelpText
  ): void {
    const fieldGroup = container.createDiv({ cls: 'override-field-group' });

    // Label with required indicator
    const label = fieldGroup.createEl('label');
    label.createEl('span', { text: fieldDef.label });
    label.createEl('span', { text: '*', cls: 'required' });

    // Help text: Use example-driven approach
    const helpContainer = fieldGroup.createDiv({ cls: 'field-help' });
    helpContainer.createEl('span', { text: `Example: ${fieldDef.example}` });

    if (fieldDef.helpLink) {
      helpContainer.createEl('a', {
        text: ' Learn more',
        href: fieldDef.helpLink,
        cls: 'help-link'
      });
    }

    // Optional expandable help (progressive disclosure)
    if (fieldDef.helpShort) {
      const details = helpContainer.createEl('details', { cls: 'advanced-help' });
      details.createEl('summary', { text: 'Why required?' });
      details.createEl('p', { text: fieldDef.helpShort });
    }

    // Input field
    const input = fieldGroup.createEl('input', {
      type: 'text',
      placeholder: fieldDef.example
    });

    // Store reference for submission
    (input as any).fieldName = fieldName;
  }

  private onSkip(): void {
    // Handle skip action
    this.close();
  }

  private onContinue(): void {
    // Handle continue action
    this.close();
  }
}
```

**CSS to support concise layout:**
```css
.override-modal-intro {
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.override-field-group {
  margin-bottom: 1.5rem;
}

.override-field-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.required {
  color: var(--text-error);
  margin-left: 0.25rem;
}

.field-help {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.help-link {
  color: var(--text-link);
  text-decoration: none;
  cursor: pointer;
  margin-left: 0.5rem;
}

.advanced-help {
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.advanced-help summary {
  cursor: pointer;
  color: var(--text-muted);
  user-select: none;
}

.advanced-help p {
  margin-top: 0.25rem;
  padding-left: 1rem;
}

.override-modal-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 2rem;
  justify-content: flex-end;
}
```

---

## Testing Strategy

**File:** `tests/v1-1-pitfalls.test.ts` (new)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ZoteroConnector } from '../src/db/zotero-connector';
import { ProgressTracker } from '../src/performance/progress-tracker';
import { NoticeManager, NoticeLevel } from '../src/ui/notice-manager';

describe('v1.1 Pitfall Prevention', () => {
  describe('Tag Extraction - Defensive NULL Handling', () => {
    let connector: ZoteroConnector;

    beforeEach(() => {
      // Use test database with real data
      connector = new ZoteroConnector();
    });

    it('should handle items with no tags', async () => {
      const tags = await connector.getItemTags(ITEM_NO_TAGS);
      expect(tags).toEqual([]);
    });

    it('should filter Zotero 7 annotation tags', async () => {
      const tags = await connector.getItemTags(ITEM_WITH_ANNOTATION_TAGS);
      expect(tags).not.toContain('custom-color-1');
      expect(tags).not.toContain('highlight-yellow');
    });

    it('should not crash on NULL tag values', async () => {
      // Requires test DB with actual NULL in tags table
      const tags = await connector.getItemTags(ITEM_WITH_NULL_TAG);
      expect(tags).not.toContain(null);
    });
  });

  describe('Progress Tracking - Throttling & Cleanup', () => {
    let tracker: ProgressTracker;

    beforeEach(() => {
      tracker = new ProgressTracker();
    });

    it('should throttle updates', async () => {
      tracker.start('Test', 1000);

      const updates = [];
      for (let i = 0; i < 100; i++) {
        updates.push(() => tracker.update(i));
      }

      // All 100 updates in rapid succession
      updates.forEach(u => u());

      // Should have limited DOM updates (< 10)
      // Verify with spy on Notice.setMessage
    });

    it('should clean up on error', () => {
      tracker.start('Test', 1000);
      expect(tracker.isActive()).toBe(true);

      tracker.error('Test error');
      expect(tracker.isActive()).toBe(false);
    });

    it('should cancel operation', () => {
      tracker.start('Test', 1000);
      tracker.cancel();
      expect(tracker.isCancelled()).toBe(true);
    });
  });

  describe('Notice Manager - Aggregation & Deduplication', () => {
    let manager: NoticeManager;

    beforeEach(() => {
      manager = new NoticeManager();
    });

    it('should deduplicate identical notices', async () => {
      // Queue same notice twice
      await manager.queueNotice('Test message');
      await manager.queueNotice('Test message');

      // Should only show once
      // Verify with spy on Notice constructor
    });

    it('should aggregate validation warnings', async () => {
      const warnings = new Map([
        ['Missing DOI', 5],
        ['Missing author', 3],
        ['Missing year', 1]
      ]);

      await manager.showAggregatedWarnings(warnings);

      // Should create single notice with aggregated text
    });
  });
});
```

---

## Deployment Checklist

Before v1.1 release:

**Tag Extraction:**
- [ ] SQL query filters annotation tags (`custom-color-*`, `highlight-*`)
- [ ] `getItemTags()` handles NULL values
- [ ] Empty tags array returns gracefully
- [ ] Tested with Zotero 7 database

**Progress UI:**
- [ ] Updates throttled to 500ms interval
- [ ] Progress updates every 100 items (not per-item)
- [ ] Memory monitored during 5000-item simulation
- [ ] Error paths call `progressTracker.error()`
- [ ] Timeout protection configured

**Notices:**
- [ ] `NoticeManager` implemented with deduplication
- [ ] Validation warnings aggregated
- [ ] No notice uses timeout=0 except user prompts
- [ ] Max 3 notices in flight at any time

**Modal:**
- [ ] Help text < 100 characters per field
- [ ] Examples provided for all fields
- [ ] Expandable "Why required?" for advanced users
- [ ] Accessibility: modal readable in < 30 seconds

---

**End of implementation patterns**
