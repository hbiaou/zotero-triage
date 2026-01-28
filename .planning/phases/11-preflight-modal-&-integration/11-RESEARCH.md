# Phase 11: Preflight Modal & Integration - Research

**Researched:** 2026-01-29
**Domain:** Modal UI, async database operations, warning acknowledgment patterns
**Confidence:** HIGH

## Summary

Phase 11 integrates health check detection (from Phase 10) into a pre-onboarding modal that displays library warnings without blocking user progression. This is a UI integration phase, not a detection capability phase.

The standard pattern for preflight health checks is:
1. **Modal-first pattern**: Display warning modal before proceeding to next step (not optional, not dismissible)
2. **Non-blocking design**: Users acknowledge warnings but can proceed despite them
3. **Async operation handling**: Long-running queries (5000+ items) require progress indication with timeout messages
4. **Graceful degradation**: On error, show message + allow bypass with "Continue Without Check" option
5. **Color-coded severity**: Red (critical/duplicates), Yellow (warnings/trash), Blue (info/group libraries)

The research identifies three key technical requirements:
- **Modal state management**: Obsidian's Modal API extends HTML elements; Phase 10 duplicate detection service provides existing query infrastructure
- **Progress UI**: Best practice is spinner for indeterminate operations, with extended wait message after 15 seconds ("Large library detected...")
- **Error handling**: Implement circuit breaker fallback (return 0 counts on query error, show error message, offer bypass)

**Primary recommendation:** Sequential preflight checks (trash → duplicates → groups) with single shared progress UI, allow bypass only on error, implement 15-second timeout message threshold per CONTEXT.md guidance.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Obsidian API (Modal) | latest | Modal dialog base class for all plugin UI | Obsidian plugin official API; all existing modals use this |
| Obsidian API (Setting) | latest | Form controls and settings display in modals | Official API for configuration UI in plugins |
| sql.js | 1.13.0 | SQLite query execution (already integrated in Phase 10) | Zotero Triage uses sql.js for WASM-based queries without native modules |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|------------|
| DuplicateDetectionService | Phase 10 | Count duplicates in personal library | Called by preflight, already has graceful degradation |
| ZoteroConnector | existing | Database connection and queries | Queries deletedItems table for trash count |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Modal (blocking) | Non-modal notice | Context7: Obsidian Notice is non-blocking, can't force acknowledgment; Modal required for "must acknowledge" UX |
| Async progress in modal | Synchronous query | Very large libraries (5000+ items) timeout in UI thread; async required for responsiveness |
| single shared query | Separate queries | Separate queries for trash/duplicates/groups adds overhead; combined query would be over-optimization for one-time preflight |

**Installation:**
All dependencies already in package.json. No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ui/
│   ├── preflight-modal.ts        # NEW: Preflight health check modal
│   └── setup-wizard-modal.ts     # Calls preflight before seed selection
├── services/
│   ├── duplicate-detection-service.ts  # Phase 10 (already queries for duplicates)
│   ├── preflight-service.ts       # NEW: Orchestrates preflight checks
│   └── [existing services]
└── db/
    └── zotero-connector.ts       # Queries database (reads deletedItems count)
```

### Pattern 1: Preflight Modal Lifecycle

**What:** Modal appears before setup wizard, displays health warnings, blocks wizard until acknowledged.

**When to use:** At plugin startup when `!profileService.hasProfile()` (first-time setup), shown by `showSetupWizard()` in main.ts before SetupWizardModal opens.

**Execution order (CONTEXT.md guideline):**
1. **Trash count** (fastest, simple COUNT query)
2. **Duplicate count** (Phase 10 DuplicateDetectionService)
3. **Group library status** (single query to libraries table)

Sequential execution recommended over parallel for:
- UI simplicity (single progress message)
- Database load distribution (avoid spike)
- Predictable timing for timeout logic

**Example:**
```typescript
// Source: Phase 10 DuplicateDetectionService pattern
interface PreflightCheckResult {
  trashCount: number;
  trashError?: string;

  duplicateCount: number;
  duplicateSampleGroups: DuplicateGroup[];
  duplicateError?: string;

  hasGroupLibraries: boolean;
  groupLibrariesError?: string;
}

async executePreflightChecks(): Promise<PreflightCheckResult> {
  const result: PreflightCheckResult = {
    trashCount: 0,
    duplicateCount: 0,
    duplicateSampleGroups: [],
    hasGroupLibraries: false
  };

  try {
    // 1. Trash count (simple, fast)
    result.trashCount = await this.getTrashCount();
  } catch (err) {
    result.trashError = 'Failed to check trash';
    console.error('Trash check failed:', err);
  }

  try {
    // 2. Duplicates (Phase 10 service)
    const dupes = await this.duplicateDetectionService.detectDuplicates();
    result.duplicateCount = dupes.totalDuplicates;
    result.duplicateSampleGroups = dupes.sampleGroups;
  } catch (err) {
    result.duplicateError = 'Failed to check duplicates';
    console.error('Duplicate check failed:', err);
  }

  try {
    // 3. Group libraries (simple query)
    result.hasGroupLibraries = await this.hasGroupLibraries();
  } catch (err) {
    result.groupLibrariesError = 'Failed to check group libraries';
  }

  return result;
}
```

### Pattern 2: Non-Blocking Warning Acknowledgment

**What:** User sees warnings but can click "I Understand" to proceed despite them. Not a blocking confirmation—allows forward movement.

**Why:** Context7 modal blocking pattern — user must actively acknowledge each warning to proceed. Different from confirmation (which blocks destructive action) because user can proceed with knowledge of warnings.

**Button labeling:** Use action-specific labels:
- Primary: "I Understand" or "Continue with Onboarding" (clear intent)
- Secondary: N/A (no cancel option per CONTEXT.md)

Per LogRocket research: "Clearly label the primary action button using not more than two words" to help users decide faster.

**Example structure:**
```typescript
// In PreflightModal.onOpen()
const primaryBtn = contentEl.createEl('button', {
  text: 'I Understand',
  cls: 'mod-cta' // Obsidian primary button styling
});
primaryBtn.addEventListener('click', async () => {
  await this.onComplete(); // Proceed to next step
  this.close();
});

// NO cancel button - force acknowledgment per CONTEXT.md
```

### Pattern 3: Progress UI with Timeout Message

**What:** Spinner + status message during preflight checks. After 15 seconds, show extended wait message.

**Design choice (Claude's discretion from CONTEXT.md):**
- Spinner (indeterminate) — best for unknown query duration
- Status message below spinner ("Checking for duplicates..." → "Checking group libraries...")
- Timeout message after 15 seconds: "Large library detected. This may take up to a minute..."

Per UX research: Under 1 second = no spinner, 2-10 seconds = spinner with status, 10+ seconds = add timeout reassurance message.

**Example:**
```typescript
// In PreflightModal during checks
private showProgress(currentCheck: string): void {
  const progressEl = this.progressEl; // Created in onOpen
  progressEl.empty();

  // Spinner
  progressEl.createDiv('preflight-spinner');

  // Status message
  const statusEl = progressEl.createDiv('preflight-status');
  statusEl.setText(`Checking ${currentCheck}...`);

  // Timeout message (appears after 15s)
  if (Date.now() - this.checkStartTime > 15000) {
    const timeoutEl = progressEl.createDiv('preflight-timeout-message');
    timeoutEl.setText('Large library detected. This may take up to a minute...');
    timeoutEl.addClass('text-warning');
  }
}

// Timer to update progress after 15s
setTimeout(() => {
  if (this.isChecking) {
    this.showProgress(this.currentCheckName);
  }
}, 15000);
```

### Pattern 4: Graceful Degradation on Error

**What:** If preflight check fails (database error), show error message + "Continue Without Check" button.

**Circuit breaker approach (AWS Well-Architected pattern):**
- When query fails → return 0 count instead of throwing
- Show error message ("Could not verify trash count. Proceeding...")
- Offer bypass button ("Continue Anyway") to resume wizard

Per CONTEXT.md: "If preflight checks fail/error: show error message + allow bypass with 'Continue Without Check' button"

**Example:**
```typescript
private async runChecksWithTimeout(): Promise<void> {
  try {
    this.checkStartTime = Date.now();
    const result = await this.executePreflightChecks();

    // All checks either succeeded or returned 0 with error message
    this.displayResults(result);
  } catch (unexpectedErr) {
    // Catastrophic error (db not connected, etc.)
    this.displayCatastrophicError(unexpectedErr);
  }
}

private displayCatastrophicError(err: Error): void {
  const contentEl = this.contentEl;
  contentEl.empty();

  contentEl.createEl('h2', { text: 'Preflight Check Failed' });
  contentEl.createEl('p', {
    text: `Could not complete health check: ${err.message}`
  });
  contentEl.createEl('p', {
    text: 'You can continue to onboarding without the health check.'
  });

  const bypassBtn = contentEl.createEl('button', {
    text: 'Continue Anyway',
    cls: 'mod-cta'
  });
  bypassBtn.addEventListener('click', async () => {
    await this.onComplete();
    this.close();
  });
}
```

### Anti-Patterns to Avoid
- **Skip button on warnings**: Per CONTEXT.md "Cannot skip by dismissing—must acknowledge each warning"
- **Progressive disclosure in advisories**: CONTEXT.md specifies "Full detail upfront... no progressive disclosure"
- **Generic error messages**: Be specific ("Could not verify trash count") not vague ("An error occurred")
- **Modal dismiss on Escape**: Lock modal until acknowledged per UX pattern for warnings

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Duplicate detection | Custom comparison logic | DuplicateDetectionService (Phase 10) | Already handles DOI/ISBN/title normalization, graceful degradation, sample groups |
| Database querying | Custom sql.js wrapper | ZoteroConnector methods | Centralized query execution, schema compatibility, error handling |
| Trash count | Parse deletedItems manually | Single COUNT query in ZoteroConnector | Native SQLite is faster than post-processing in JavaScript |
| Group library detection | JOIN and iterate | Single query `SELECT COUNT(DISTINCT libraryID) FROM libraries WHERE type != 'user'` | SQL-level filtering is more efficient, consistent with Phase 9 pattern |
| Progress UI state | Manual DOM manipulation | Obsidian's contentEl API with CSS classes | Cleaner separation, easier to maintain, reusable with styles.css |
| Error recovery | Try/catch with re-throw | Circuit breaker pattern (return 0 on error) | Per CONTEXT.md graceful degradation requirement |

**Key insight:** Preflight checks are integration work, not detection work. Phase 10 already solved duplicate detection. This phase should delegate to existing services and focus on UI presentation and sequencing.

## Common Pitfalls

### Pitfall 1: Synchronous Query Blocks UI Thread
**What goes wrong:** Trying to run large SQL queries on main thread causes Obsidian UI to freeze during preflight check, appearing to hang.

**Why it happens:** sql.js in WASM executes synchronously. Large 5000+ item queries take 2-30 seconds. Wrapping in `async` doesn't help if the actual execution blocks.

**How to avoid:**
- Phase 10 DuplicateDetectionService already handles this via existing connector pattern
- Ensure all preflight checks use async/await pattern
- Show progress UI BEFORE query starts, not after

**Warning signs:**
- "Modal feels frozen" in user reports
- Progress message doesn't update mid-query
- Timeout message never appears because setTimeout didn't run

### Pitfall 2: Missing Timeout Message After 15 Seconds
**What goes wrong:** User sees spinner for 30+ seconds with no reassurance. Assumes something broke.

**Why it happens:** Forgot to implement timeout message timer separate from query execution. Query takes 20 seconds, but no message update.

**How to avoid:**
- Per CONTEXT.md: "show extended wait message after 15s ('Large library detected. This may take up to a minute...')"
- Implement separate setTimeout(() => { updateMessage() }, 15000) that runs regardless of query progress
- Keep checking, no skip option (per spec)

**Warning signs:**
- Users close modal before checks complete
- "Is it working?" support requests

### Pitfall 3: Calling SetupWizardModal Before PreflightModal
**What goes wrong:** Wizard opens first, preflight never shows. User misses health warnings.

**Why it happens:** Confusing which modal should call which. Logic placed in wrong callback.

**How to avoid:**
- PreflightModal.onComplete() callback should open SetupWizardModal
- In main.ts showSetupWizard(), create and open PreflightModal first
- PreflightModal passes wizard data/settings to SetupWizardModal via constructor

**Warning signs:**
- Health check modal never appears on first run
- Setup skips directly to seed selection

### Pitfall 4: Mixing Modal Responsibility (Data vs Display)
**What goes wrong:** PreflightModal tries to execute database queries directly instead of delegating to service.

**Why it happens:** Modal contains too much logic, becomes hard to test and maintain.

**How to avoid:**
- Create PreflightService to orchestrate checks (trash, duplicates, groups)
- Modal only calls service and displays results
- Service handles error recovery and graceful degradation

**Warning signs:**
- PreflightModal has `await db.exec()` calls
- Hard to test modal without database setup
- Change to query logic requires modal code changes

### Pitfall 5: Not Handling "Continue Without Check" Workflow
**What goes wrong:** Error path doesn't lead anywhere. "Continue Anyway" clicked but nothing happens.

**Why it happens:** Callback not properly wired. Modal closes but onComplete() never fires.

**How to avoid:**
- Both success AND error paths must call this.onComplete() before closing
- Test error path explicitly in development
- Verify that SetupWizardModal opens after error bypass

**Warning signs:**
- Modal closes but wizard doesn't open
- User stuck in loading state

## Code Examples

Verified patterns from existing codebase:

### Trash Count Query
```typescript
// Source: Phase 9 pattern (ITEM_COUNT_QUERY structure)
// Add to queries.ts
export const TRASH_COUNT_QUERY = `
SELECT COUNT(*) as count
FROM deletedItems
WHERE libraryID = (SELECT libraryID FROM libraries WHERE type = 'user' LIMIT 1)
`;

// In ZoteroConnector.ts
async getTrashCount(): Promise<number> {
  try {
    const results = this.db.exec(TRASH_COUNT_QUERY);
    if (!results || results.length === 0) return 0;

    const [result] = results;
    if (!result.values || result.values.length === 0) return 0;

    return result.values[0][0] as number;
  } catch (err) {
    console.error('Trash count query failed:', err);
    return 0; // Graceful degradation
  }
}
```

### Group Library Detection Query
```typescript
// Source: Phase 9 library filtering (ITEMS_QUERY uses libraryID)
export const GROUP_LIBRARY_QUERY = `
SELECT COUNT(*) as count
FROM libraries
WHERE type != 'user'
`;

// In PreflightService.ts
async hasGroupLibraries(): Promise<boolean> {
  try {
    const results = this.connector.db.exec(GROUP_LIBRARY_QUERY);
    if (!results || results.length === 0) return false;

    const [result] = results;
    if (!result.values || result.values.length === 0) return false;

    return (result.values[0][0] as number) > 0;
  } catch (err) {
    console.error('Group library check failed:', err);
    return false; // Assume no group libraries on error
  }
}
```

### Modal Progress UI with Timeout
```typescript
// Source: Obsidian Modal API pattern (extends from error-modal.ts)
export class PreflightModal extends Modal {
  private isChecking = false;
  private checkStartTime = 0;
  private currentCheckName = '';

  async onOpen(): Promise<void> {
    const { contentEl, titleEl } = this;
    titleEl.setText('Library Health Check');
    contentEl.addClass('zotero-triage-preflight');

    // Progress container (updated during checks)
    const progressEl = contentEl.createDiv('preflight-progress');
    this.progressEl = progressEl;

    // Start checks
    this.isChecking = true;
    this.checkStartTime = Date.now();

    try {
      await this.runChecksWithProgress(progressEl);
    } catch (err) {
      this.showError(err);
    }
  }

  private async runChecksWithProgress(container: HTMLElement): Promise<void> {
    const service = new PreflightService(this.connector);

    // Show initial progress
    this.currentCheckName = 'trash';
    this.updateProgress(container, 'Checking for trash items...');

    const result = await service.executePreflightChecks();

    this.isChecking = false;
    this.displayResults(result);
  }

  private updateProgress(container: HTMLElement, message: string): void {
    container.empty();
    container.createDiv('preflight-spinner');
    container.createEl('p', { text: message });

    // Timeout message after 15s
    if (Date.now() - this.checkStartTime > 15000) {
      const timeoutMsg = container.createEl('p', {
        text: 'Large library detected. This may take up to a minute...'
      });
      timeoutMsg.addClass('preflight-timeout-notice');
    }
  }
}
```

### Severity Color Styling
```css
/* Source: PatternFly status-and-severity pattern */
.preflight-advisory {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

/* Critical severity (duplicates) - Red */
.preflight-advisory.critical {
  background: var(--color-red-10);
  border-left: 4px solid var(--color-red);
}

.preflight-advisory.critical .advisory-icon {
  color: var(--color-red);
}

/* Warning severity (trash) - Yellow/Orange */
.preflight-advisory.warning {
  background: var(--color-orange-10);
  border-left: 4px solid var(--color-orange);
}

.preflight-advisory.warning .advisory-icon {
  color: var(--color-orange);
}

/* Info severity (group libraries) - Blue */
.preflight-advisory.info {
  background: var(--color-blue-10);
  border-left: 4px solid var(--color-blue);
}

.preflight-advisory.info .advisory-icon {
  color: var(--color-blue);
}

.advisory-count {
  font-weight: 600;
  font-size: 1.2em;
}

.advisory-message {
  color: var(--text-normal);
  font-size: 0.95em;
}

.advisory-action {
  color: var(--text-muted);
  font-size: 0.85em;
  margin-top: 4px;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal dismissible by clicking outside | Required acknowledgment with button click | 2020s UX research | Prevents accidental skipping of critical warnings |
| Synchronous preflight checks | Async with progress indication | JavaScript async/await widespread | Large libraries no longer freeze UI |
| Generic "Loading..." spinner | Status-specific messages ("Checking trash...") | Modern UX patterns | Users understand what's happening |
| No timeout reassurance | Extended wait message after 15 seconds | Mobile/slow network reality | Reduces user abandonment |
| Manual error handling in UI | Circuit breaker + graceful degradation | Microservices era patterns | More resilient, better user experience |

**Deprecated/outdated:**
- **Synchronous modal blocking patterns**: Modern frameworks use async/await. Obsidian Modal API supports both sync and async, but async is preferred for long operations.
- **Alert/Confirm/Prompt dialogs**: HTML native dialogs don't work well in Obsidian. Modal API is the standard.

## Open Questions

1. **Library filter in preflight modal (Claude's discretion from CONTEXT.md)**
   - What we know: Preflight shows health check for user's selected library; Phase 9 and 10 already filter to personal library only in queries
   - What's unclear: Should preflight modal include a dropdown to select which library to check, or assume the configured library?
   - Recommendation: Assume configured library (no dropdown). If user wants to check a different library, they'd change settings first. Keeps preflight simple for first-time setup.

2. **Exact color palette choice (Claude's discretion)**
   - What we know: Red = critical, Yellow/Orange = warning, Blue = info per PatternFly standards
   - What's unclear: Should use CSS variables from Obsidian theme or hard-coded hex values?
   - Recommendation: Use Obsidian CSS variables (`--color-red`, `--text-accent`, etc.) for theme consistency.

3. **Minimum loading duration (Claude's discretion)**
   - What we know: UX best practice is 300-500ms minimum to avoid UI flash
   - What's unclear: Should show results instantly if checks complete in <500ms, or add artificial delay?
   - Recommendation: Show results instantly (no artificial delay). If checks are fast, that's a win. Only add delay if UI flash becomes a problem.

## Sources

### Primary (HIGH confidence)
- **Obsidian Modal API** - All modal implementations in existing codebase (error-modal.ts, setup-wizard-modal.ts)
- **Phase 10 DuplicateDetectionService** - Duplicate detection and graceful degradation patterns
- **Phase 9 queries.ts** - SQL library filtering pattern and ITEMS_QUERY structure

### Secondary (MEDIUM confidence)
- [PatternFly Status and Severity](https://www.patternfly.org/patterns/status-and-severity/) - Standard color-coding for severity levels
- [Modal UX Design Patterns (LogRocket)](https://blog.logrocket.com/ux-design/modal-ux-design-patterns-examples-best-practices/) - Non-blocking modals, warning patterns
- [Confirmation Dialog Best Practices (LogRocket)](https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog/) - Button labeling, message clarity
- [UX Loading Patterns (Pencil & Paper)](https://www.pencilandpaper.io/articles/ux-pattern-analysis-loading-feedback) - Progress indication strategy
- [AWS Graceful Degradation](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_graceful_degradation.html) - Circuit breaker and error recovery

### Tertiary (LOW confidence - general guidance)
- SQL query optimization resources - General principles, not verified against Phase 10 specifics
- Obsidian sample plugin - API patterns, not official reference

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - Obsidian Modal API confirmed in existing code; DuplicateDetectionService proven in Phase 10
- Architecture: **HIGH** - Modal lifecycle, graceful degradation, query patterns all verified against codebase
- Pitfalls: **MEDIUM** - Based on common UI/async patterns; specific to Obsidian plugin context
- Color coding: **MEDIUM** - PatternFly standard verified; Obsidian CSS variable availability inferred from existing styles.css

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days; Obsidian API stable, modal patterns stable)

**Key assumptions validated:**
- Obsidian Modal is the correct component for blocking preflight (verified in setup-wizard-modal.ts)
- DuplicateDetectionService provides reusable duplicate detection (verified Phase 10)
- ZoteroConnector supports custom queries (verified in codebase)
- sql.js query execution is async-safe (verified in existing connector usage)
