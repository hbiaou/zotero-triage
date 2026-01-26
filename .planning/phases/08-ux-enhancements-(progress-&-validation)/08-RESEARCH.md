# Phase 8: UX Enhancements (Progress, Validation, Search & Modal UX) - Research

**Researched:** 2026-01-26
**Domain:** Obsidian plugin UX patterns, progress tracking, validation feedback, and search/filtering
**Confidence:** HIGH (leverages existing codebase patterns and well-documented Obsidian APIs)

## Summary

Phase 8 focuses on improving user feedback during batch operations and making interaction workflows smoother. The work spans four distinct domains:

1. **Progress Feedback** — Display granular, throttled updates during batch scoring to prevent UI jank while keeping users informed
2. **Validation Guidance** — Warn users when profiles are empty and explain required fields clearly in override modals
3. **Search & Filtering** — Enable quick item discovery in onboarding (seed papers) and batch processing (full library)
4. **Modal UX** — Ensure modals display content without horizontal scrolling and preserve scroll position during interactions

The codebase already has solid patterns for these features: `ProgressTracker` exists and needs throttling improvements, `ItemSearchModal` uses Obsidian's `FuzzySuggestModal` for fuzzy search, and `OverrideConfirmModal` exists but lacks helpful field explanations. The research identifies what needs enhancement rather than new architecture.

**Primary recommendation:**
- Throttle progress updates to 500ms intervals with batch updates (every 100 items)
- Add search/filter inputs with real-time filtering to seed paper picker and batch view
- Keep override modal help text concise (1-2 sentences + example) using progressive disclosure
- Aggregate validation warnings by type into single notice
- Ensure modals use `max-width: 90vw` or similar to prevent horizontal scroll, preserve scroll with `preserveScrollPosition()` or manual state tracking

## Standard Stack

### Core UI Patterns
| Library/Component | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Obsidian `FuzzySuggestModal` | latest (v1.0+) | Fuzzy search for item selection | Official API, built-in fuzzy matching, proven in plugins |
| Obsidian `Modal` | latest (v1.0+) | Custom modal dialogs | Foundation for all modal interactions |
| Obsidian `Notice` | latest (v1.0+) | Toast notifications for feedback | Standard notification pattern in Obsidian |
| HTML `<input type="text">` | - | Search/filter input fields | Native, responsive, accessible |
| HTML `<details>` element | - | Progressive disclosure for help text | Semantic HTML, built-in accessibility |

### Supporting Components
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `ProgressTracker` (existing) | Persistent progress notice during batch operations | Long-running operations (scoring 100+ items) |
| `NoticeManager` (new) | Queue notices, deduplicate, aggregate warnings | Batch validation to prevent notice spam |
| `SeedPaperPicker` (existing, will enhance) | Modal for selecting seed papers with search | Onboarding workflow |
| `TriageView` (existing, will enhance) | Batch processing view with search | Batch review workflow |

### CSS & Layout Considerations
| Concern | Standard Approach | Rationale |
|---------|------------------|-----------|
| Modal width | `max-width: 90vw; max-height: 90vh` | Leaves breathing room, prevents horizontal scroll on most screens |
| Scroll position | Manual state tracking or native `HTMLElement.scrollTop` | Obsidian modals don't auto-restore position |
| Progress notice | Persistent (`timeout=0`), single instance | User needs to see progress throughout operation |
| Form fields | Single-column layout with full-width inputs | Better accessibility on narrow screens |

## Architecture Patterns

### Pattern 1: Throttled Progress Tracking

**Current State:** `ProgressTracker` calls `Notice.setMessage()` every time `update()` is called (5000 calls for 5000-item batch = potential UI jank)

**Enhanced Pattern:**
```typescript
export class ProgressTracker {
  private lastUpdateTime: number = 0;
  private readonly UPDATE_THROTTLE_MS = 500; // Max 2 updates/second

  update(loaded: number, status?: string): void {
    // Always update internal state
    this.state.loaded = loaded;
    this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

    // Only update Notice (DOM operation) if throttle threshold elapsed
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_THROTTLE_MS) {
      return; // Skip DOM update, but internal state is current
    }

    // Touch DOM only when throttle allows
    if (this.notice) {
      this.notice.setMessage(this.formatMessage());
      this.lastUpdateTime = now;
    }
  }
}
```

**Key decision:** Batch progress updates every 100 items instead of per-item:
```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < items.length; i++) {
  scoreItem(items[i]);
  if ((i + 1) % BATCH_SIZE === 0) {
    tracker.update(i + 1); // Update every 100, not every 1
  }
}
```

**Why:** Combines throttling (time-based) with batching (count-based) to reduce DOM updates from 5000 to ~50 for 5000-item operation.

### Pattern 2: Search/Filter in Modals

**Existing:** `ItemSearchModal` uses `FuzzySuggestModal` for single-field fuzzy search

**Enhancement pattern for seed papers and batch view:**
```typescript
// In SeedPaperPicker or TriageView
private renderSearchFilter(container: HTMLElement): void {
  const searchGroup = container.createDiv({ cls: 'search-filter-group' });

  const input = searchGroup.createEl('input', {
    type: 'text',
    cls: 'search-filter-input',
    placeholder: 'Search by author, title, or keyword...'
  });

  const results = searchGroup.createDiv({ cls: 'search-results' });

  // Real-time filtering as user types
  input.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    this.filterItems(query, results);
  });
}

private filterItems(query: string, resultsContainer: HTMLElement): void {
  const matches = this.items.filter(item =>
    item.title.toLowerCase().includes(query) ||
    item.authors.some(a => a.toLowerCase().includes(query)) ||
    (item.tags?.some(t => t.toLowerCase().includes(query)) ?? false)
  );

  // Render matches, preserving scroll position
  const scrollPos = resultsContainer.scrollTop;
  resultsContainer.empty();
  matches.forEach(item => this.renderItem(resultsContainer, item));
  resultsContainer.scrollTop = scrollPos; // Restore scroll
}
```

**Why Obsidian's `FuzzySuggestModal` + custom filter input:**
- `FuzzySuggestModal` handles fuzzy matching (typos, partial words) for modal dialogs
- For inline search within views, implement custom `<input>` with filter
- Obsidian's API doesn't provide built-in modal search, so custom implementation required

### Pattern 3: Validation Warning Aggregation

**Current state:** Each validation error produces individual `Notice()` (potential spam)

**Enhanced pattern:**
```typescript
// Aggregate warnings during batch validation
const warnings = new Map<string, number>(); // "Missing DOI" → count

for (const item of items) {
  const validation = validateItem(item);
  for (const field of validation.missingFields) {
    const key = `Missing ${field}`;
    warnings.set(key, (warnings.get(key) || 0) + 1);
  }
}

// Show ONE notice summarizing all issues
if (warnings.size > 0) {
  const summary = Array.from(warnings)
    .map(([issue, count]) => `${count}x ${issue}`)
    .join(', ');
  new Notice(`Validation: ${summary}`, 5000); // Auto-dismiss after 5s
}
```

**Why:** Reduces 50 notices (one per item) to 1 summary notice, prevents UI blocking.

### Pattern 4: Concise Override Modal with Progressive Disclosure

**Current state:** Override modal lists missing fields but lacks explanation

**Enhanced pattern:**
```typescript
interface FieldHelp {
  label: string;
  example: string;
  whyRequired?: string; // Optional, shown only if user expands
}

const fieldHelp: Record<string, FieldHelp> = {
  title: {
    label: 'Title',
    example: 'Machine Learning in Climate Science',
    whyRequired: 'Used for note filename and identification'
  },
  authors: {
    label: 'Author(s)',
    example: 'Smith, John; Jones, Jane',
    whyRequired: 'Required for proper citation'
  }
};

// In modal rendering:
// Show: Label, Example → "Example: Smith, John; Jones, Jane"
// Optional: Click "?" for expandable "Why required?" → whyRequired text
// DON'T show: Full explanation paragraph
```

**Why:**
- Examples are more helpful than explanations (shows expected format)
- Progressive disclosure (`<details>`) hides extra text for quick scanning
- Keeps modal compact and scannable in <30 seconds

### Pattern 5: Scroll Position Preservation

**Challenge:** Modal interactions (clicking items, expanding details) can reset scroll position, frustrating batch processing workflows.

**Pattern:**
```typescript
private itemsContainer: HTMLElement;
private scrollPosition: number = 0;

// Before action that might cause re-render
private saveScrollPosition(): void {
  this.scrollPosition = this.itemsContainer.scrollTop;
}

// After action completes
private restoreScrollPosition(): void {
  this.itemsContainer.scrollTop = this.scrollPosition;
}

// Example: Mark item as accepted
onMarkAccepted(item: ZoteroItem): void {
  this.saveScrollPosition();

  this.registry.markState(item.itemID, 'proposed');
  this.updateItemUI(item); // Re-renders item in place

  this.restoreScrollPosition(); // Scroll returns to where user was
}
```

**Why:** Users processing long batches need visual stability to track position.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Item search/fuzzy matching | Custom string matching algorithm | `FuzzySuggestModal` (Obsidian built-in) | Handles typos, ranking, highlighting automatically |
| Progress indication | Custom status bar | `Notice` with throttling | Integrated with Obsidian UI, persistent |
| Notice queue management | Simple array + setTimeout | `NoticeManager` class (implement new) | Handles deduplication, prevents spam |
| Form validation | Manual field checking | Zod schema validation (use existing) | Type-safe, comprehensive error messages |
| CSS layout | Custom flex/grid | Obsidian CSS variables + BEM | Respects user theme, accessible |
| Modal drag/focus | Custom modal handling | Obsidian `Modal` class | Handles z-index, focus trap, accessibility |

**Key insight:** Obsidian provides strong UI primitives (`Notice`, `Modal`, `FuzzySuggestModal`). Custom code should focus on *business logic* (filtering, aggregation, throttling), not UI mechanics.

## Common Pitfalls

### Pitfall 1: Progress Update DOM Jank
**What goes wrong:** Calling `Notice.setMessage()` 5000 times causes UI lag as browser processes 5000 DOM updates.

**How to avoid:**
1. Implement throttle (500ms minimum between updates)
2. Batch updates (every 100 items, not every 1)
3. Test with 5000-item simulated batch during development
4. Monitor Notice update duration; log if > 50ms

**Warning signs:**
- "UI freezes during batch processing" user reports
- CPU at 100% while progress showing
- Notice updates visible but staggered/delayed

### Pitfall 2: Modal Doesn't Fit on Screen
**What goes wrong:** Modal content requires horizontal scrolling on smaller screens or when Obsidian window is narrow.

**How to avoid:**
1. Set modal `max-width: 90vw; max-height: 90vh` in CSS
2. Use flexible layouts (stack inputs vertically on narrow screens)
3. Test with Obsidian window resized to 800px wide
4. Verify seed picker renders without horizontal scroll

**Warning signs:**
- Horizontal scrollbar appears in modal
- Content clips on right edge
- Users can't see all form fields

### Pitfall 3: Scroll Position Lost During Item Interaction
**What goes wrong:** When user clicks to mark an item during batch processing, view re-renders and scroll jumps to top, forcing user to re-scroll.

**How to avoid:**
1. Save scroll position before action: `scrollPos = container.scrollTop`
2. Execute action (update state, re-render item)
3. Restore position after render: `container.scrollTop = scrollPos`
4. Test by: scroll to middle of item list, mark an item, verify scroll hasn't moved

**Warning signs:**
- User feedback: "Scroll keeps resetting when I click items"
- Batch processing feels unresponsive
- Users scroll down, mark item, scroll back down, repeat

### Pitfall 4: Override Modal Help Text Overwhelms Users
**What goes wrong:** Detailed explanations of why fields are required creates cognitive overload; users skip reading and click "Skip" anyway.

**How to avoid:**
1. Show only: field label, required indicator, example
2. Optional: `<details>` expandable "Why required?" (hidden by default)
3. Keep "Why required?" text to 1-2 sentences max
4. Test: Non-developer reads modal in <30 seconds without scrolling

**Warning signs:**
- Users report modal "is confusing" or "too long"
- Low completion rate on override modal
- Accessibility: screen reader takes 2+ minutes to read modal

### Pitfall 5: Notice Spam from Batch Validation
**What goes wrong:** Validation check on 100 items with 3 possible missing fields creates 10-50 notices stacked on screen.

**How to avoid:**
1. Aggregate warnings: collect all issues, show 1 summary notice
2. Format as: `"Validation: 15x Missing DOI, 8x Missing authors, 3x Missing year"`
3. Only show at batch completion (no interruption during workflow)
4. Test: Run validation on 100 items, verify < 3 notices show

**Warning signs:**
- 5+ notices visible on screen
- Users close Obsidian due to notice spam
- Support requests: "How do I turn off warnings?"

### Pitfall 6: Search Filter Doesn't Update When Items Change
**What goes wrong:** User filters items, then completes an action (marks item accepted), view re-renders but search filter doesn't apply to new state.

**How to avoid:**
1. When filtering: always apply filter to current items
2. When items change: re-apply active filter automatically
3. Preserve search query string, re-filter after batch action
4. Test: Type search, mark items, verify search still active and matches new state

**Warning signs:**
- After marking items, all items visible again (filter lost)
- User must re-type search to see filtered results
- Search appears "broken" after first action

## Code Examples

### Throttled Progress Update
Source: Existing `src/performance/progress-tracker.ts` (to be enhanced)

```typescript
export class ProgressTracker {
  private lastUpdateTime: number = 0;
  private readonly UPDATE_THROTTLE_MS = 500;
  private cachedPercent: number = -1;
  private cachedBar: string = '';

  update(loaded: number, status?: string): void {
    // Always update internal state
    this.state.loaded = loaded;
    this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

    // Only update Notice if throttle threshold elapsed
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_THROTTLE_MS) {
      return; // Don't touch DOM
    }

    // Update Notice (DOM operation)
    if (this.notice) {
      const message = this.formatMessage(); // Uses cached bar
      this.notice.setMessage(message);
      this.lastUpdateTime = now;
    }
  }

  private formatMessage(): string {
    // Cache bar to avoid string allocation every call
    if (this.state.percentComplete !== this.cachedPercent) {
      this.cachedBar = this.createProgressBar(this.state.percentComplete);
      this.cachedPercent = this.state.percentComplete;
    }
    return `${this.state.status}\n${this.cachedBar}\n${this.state.loaded}/${this.state.total} (${this.state.percentComplete}%)`;
  }
}
```

### Search Filter in Seed Paper Picker
Pattern for `src/ui/seed-paper-picker.ts` (to be enhanced)

```typescript
export class SeedPaperPicker extends Modal {
  private items: ZoteroItem[] = [];
  private filteredItems: ZoteroItem[] = [];
  private currentQuery: string = '';
  private itemsContainer: HTMLElement;
  private scrollPosition: number = 0;

  private renderWithSearch(contentEl: HTMLElement): void {
    // Search input
    const searchGroup = contentEl.createDiv({ cls: 'search-filter-group' });
    const input = searchGroup.createEl('input', {
      type: 'text',
      cls: 'search-filter-input',
      placeholder: 'Search by author, title, or keyword...'
    });

    // Items list (will be filtered)
    this.itemsContainer = contentEl.createDiv({ cls: 'items-list' });

    // Real-time filtering
    input.addEventListener('input', (e) => {
      this.currentQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.applyFilter();
    });

    // Initial render
    this.applyFilter();
  }

  private applyFilter(): void {
    // Save scroll before re-rendering
    this.scrollPosition = this.itemsContainer.scrollTop;

    // Filter items
    if (this.currentQuery.length === 0) {
      this.filteredItems = this.items;
    } else {
      this.filteredItems = this.items.filter(item => {
        const query = this.currentQuery;
        return (
          item.title.toLowerCase().includes(query) ||
          item.authors.some(a => a.toLowerCase().includes(query)) ||
          (item.tags?.some(t => t.toLowerCase().includes(query)) ?? false)
        );
      });
    }

    // Re-render list
    this.itemsContainer.empty();
    this.filteredItems.forEach(item => this.renderItem(item));

    // Restore scroll position
    this.itemsContainer.scrollTop = this.scrollPosition;
  }

  private renderItem(item: ZoteroItem): void {
    const itemEl = this.itemsContainer.createDiv({ cls: 'seed-item' });
    itemEl.createDiv({ cls: 'item-title', text: item.title });
    itemEl.createDiv({
      cls: 'item-meta',
      text: `${item.authors[0] || 'Unknown'} (${item.year || 'n.d.'})`
    });

    itemEl.addEventListener('click', () => this.onSelectItem(item));
  }
}
```

### Aggregated Validation Notice
Pattern for batch service validation (replaces per-item notices)

```typescript
async validateBatchItems(items: ZoteroItem[]): Promise<void> {
  const warnings = new Map<string, number>();

  for (const item of items) {
    const validation = validateItem(item);
    for (const field of validation.missingFields) {
      const key = `Missing ${field}`;
      warnings.set(key, (warnings.get(key) ?? 0) + 1);
    }
  }

  // Show ONE aggregated notice
  if (warnings.size > 0) {
    const summary = Array.from(warnings)
      .map(([issue, count]) => `${count}x ${issue}`)
      .join(', ');
    new Notice(`Validation: ${summary}`, 5000); // Auto-dismiss
  }
}
```

### Progressive Disclosure in Override Modal
Pattern for enhanced `src/ui/override-modal.ts`

```html
<!-- Concise help text with progressive disclosure -->
<div class="override-field">
  <label>Title <span class="required">*</span></label>

  <!-- Always visible: example -->
  <p class="field-help-example">
    Example: "Machine Learning in Climate Science"
  </p>

  <!-- Optional: expandable explanation -->
  <details class="field-help-details">
    <summary>Why is this required?</summary>
    <p>Used for note filenames and identification in your vault.</p>
  </details>

  <input type="text" placeholder="Enter title..." />
</div>

<!-- CSS -->
<style>
.field-help-example {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0.25rem 0;
}

.field-help-details {
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.field-help-details summary {
  cursor: pointer;
  color: var(--text-link);
  user-select: none;
}

.field-help-details p {
  margin-top: 0.5rem;
  margin-left: 1rem;
  color: var(--text-muted);
}
</style>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Update progress every item | Throttle (500ms) + batch updates (100-item chunks) | Phase 8 | Reduces DOM updates 5000→50, eliminates jank |
| Per-item validation notices | Aggregate warnings by type into 1 summary | Phase 8 | Eliminates notice spam, improves UX |
| Long help explanations in modals | Examples + progressive disclosure | Phase 8 | Faster comprehension, better accessibility |
| Modal with fixed width | `max-width: 90vw` responsive layout | Phase 8 | Works on narrow screens, no horizontal scroll |
| Manual scroll position tracking | Save/restore `scrollTop` on item actions | Phase 8 | Batch processing feels responsive |

**Current (Phase 8) advancements:**
- Progress tracking moved from per-item to throttled + batched
- Validation warnings aggregated instead of scattered
- Modal UX improved with responsive sizing and concise help
- Search functionality enhanced in modal workflows
- Scroll position preserved to prevent user disorientation

## Open Questions

1. **Progress Cancellation UI**
   - Decision: Should progress notice include a "Cancel" button?
   - What we know: Phase 8 requirements don't specify cancellation, but long operations (5000+ items) might benefit
   - What's unclear: Implementation complexity, UX pattern in Obsidian
   - Recommendation: Skip for Phase 8, add in Phase 9 if user requests

2. **Search Filtering in Batch View**
   - Decision: Inline search input vs. command palette vs. modal?
   - What we know: Seed picker uses modal; batch view is persistent sidebar
   - What's unclear: Best pattern for persistent view search
   - Recommendation: Inline search input at top of batch view (consistent with browser UX)

3. **Empty Profile Warning Timing**
   - Decision: Show warning during onboarding profile initialization, during batch generation, or both?
   - What we know: CONTEXT.md says "both"
   - What's unclear: Whether warning is dismissible, persists across sessions
   - Recommendation: Show warning in both places, allow per-session dismissal (pref not remembered)

4. **Validation Aggregation Granularity**
   - Decision: Aggregate all warnings into 1 notice, or group by type?
   - What we know: Current decision is deep link to Zotero for user to fix at source
   - What's unclear: Whether "5x Missing DOI, 3x Missing authors" is helpful or needs grouping
   - Recommendation: Show summary notice with grouped counts, provide "Learn more" link to guidance

## Sources

### Primary (HIGH confidence)

**Obsidian API Documentation:**
- [FuzzySuggestModal - Developer Documentation](https://docs.obsidian.md/Reference/TypeScript+API/FuzzySuggestModal)
- [Modals - Developer Documentation](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [SuggestModal - Developer Documentation](https://docs.obsidian.md/Reference/TypeScript+API/SuggestModal)

**Existing Codebase:**
- `src/performance/progress-tracker.ts` — Current implementation requiring throttling enhancements
- `src/ui/search-modal.ts` — FuzzySuggestModal implementation pattern
- `src/ui/override-modal.ts` — Override confirmation modal (needs help text enhancement)
- `src/batch/batch-service.ts` — Batch processing where progress tracking and validation occurs
- `.planning/research/PITFALLS_V1_1.md` — Detailed analysis of progress and notice management pitfalls
- `.planning/research/V1_1_IMPLEMENTATION_PATTERNS.md` — Production-ready code patterns for throttling and aggregation

### Secondary (MEDIUM confidence)

**Web Resources:**
- [Building an Obsidian Plugin - rwblickhan.org](https://rwblickhan.org/technical/obsidian-plugin/)
- [ModalForm and Dataview – Dynamically filter queries - Obsidian Forum](https://forum.obsidian.md/t/modalform-and-dataview-dynamically-filter-queries-based-on-previous-input/98644)
- [GitHub: obsidian-search-filter-suggest](https://github.com/jmilldotdev/obsidian-search-filter-suggest)
- [Remember Restore scroll position - Obsidian Feature Request](https://forum.obsidian.md/t/remember-restore-document-position-scroll-position-cursor-note-position/962)

**TypeScript Patterns:**
- [Angular Forms in 2026 — Validation Patterns - DEV Community](https://dev.to/cristiansifuentes/angular-forms-in-2026-reactive-vs-template-driven-validation-testing-and-the-signal-era-3oo6)
- [Data Validation in TypeScript Using the Either Pattern - DEV Community](https://dev.to/polyov_dev/data-validation-in-typescript-using-the-either-pattern-4omk)

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — Obsidian APIs well-documented, existing codebase patterns proven
- **Architecture patterns:** HIGH — Throttling and aggregation are established patterns, implementation straightforward
- **Pitfalls:** HIGH — Already identified in Phase 7 research; causes well-understood
- **Code examples:** HIGH — Patterns drawn from existing codebase + research documents
- **Search implementation:** MEDIUM-HIGH — FuzzySuggestModal stable, custom filtering pattern requires integration testing

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (stable domain; Obsidian API changes infrequently)

**Key assumptions:**
1. Obsidian `Notice` API remains stable (no major breaking changes expected)
2. FuzzySuggestModal will continue as primary search pattern in Obsidian plugins
3. CSS support for `max-width: 90vw` and `details` elements (standard web features)
4. ProgressTracker can be enhanced without refactoring batch service (backward compatible)

**Testing strategy for Phase 8:**
- Manual: Simulate 5000-item batch, verify progress updates don't cause UI jank
- Manual: Test seed picker with 100+ items, verify search filters without horizontal scroll
- Manual: Run batch validation, verify single aggregated notice (not multiple)
- Manual: Mark items during batch processing, verify scroll position preserved
- Accessibility: Read override modal with screen reader, verify completes in <30 seconds
- Performance: Monitor memory during 5000-item progress tracking, verify no leaks after completion
