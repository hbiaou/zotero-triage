# Domain Pitfalls: Tag Extraction & UX Polish (v1.1)

**Project:** Zotero Triage Plugin v1.1 Enhancement
**Domain:** Obsidian plugin with Zotero SQLite integration
**Researched:** 2026-01-25
**Focus:** Adding tag extraction and UX polish to existing v1.0 system

---

## Critical Pitfalls (Bugs/Rewrites)

Mistakes that cause feature breakage, data loss, or architectural issues when integrating tags and progress UI.

### Pitfall 1: Null/Empty Tag Results from Schema Variations

**What goes wrong:**
Adding tag extraction causes NotFound errors or empty tag arrays that break recommendation scoring, creating silent failures where items get scored incorrectly or tag-based features produce no results.

**Why it happens:**
- Zotero tag schema varies between versions (itemTags relationship stability not guaranteed)
- LEFT JOIN queries may return NULL values if tags table has schema changes
- NULL tag handling not implemented in existing `ZoteroItem` type (currently assumes tags always populate)
- Many-to-many itemTags table can have orphaned entries or missing foreign keys
- v1.0 schema detection only checks version number, not specific table structure for tags

**Consequences:**
- Tag extraction silently returns empty arrays despite tags existing in database
- Recommendation engine fails to score on tag similarity (silent degradation)
- Tests pass because they use mock data with clean tags, but real user libraries fail
- Users see "empty profile, falling back to date sorting" warning even with tags present
- Difficult to debug: "Tags aren't being used for recommendations" with no error message

**Real-world scenario:**
```
User has 100 papers tagged with "machine-learning"
Plugin loads profile from seed papers, detects tags
Recommendation engine scores based on tag similarity
But LEFT JOIN returns NULL for 30% of items (schema variation)
Result: Incomplete tag data breaks recommendation scoring silently
User reports: "Tags aren't being used even though I tagged everything"
```

**Prevention:**

1. **Implement defensive NULL handling in tag queries:**
   ```typescript
   // Always handle NULL results explicitly
   async getItemTags(itemID: number): Promise<string[]> {
     try {
       const result = this.db!.exec(ITEM_TAGS_QUERY, [itemID]);

       // Defensive: check if result exists before accessing
       if (!result || result.length === 0) {
         return []; // No tags, not an error
       }

       const tags: string[] = [];
       for (const tagRow of result[0].values) {
         // Defensive: verify tagRow[0] is not NULL
         if (tagRow[0] !== null && typeof tagRow[0] === 'string') {
           tags.push(tagRow[0]);
         }
       }
       return tags;
     } catch (err) {
       console.warn(`Failed to extract tags for item ${itemID}:`, err);
       return []; // Graceful degradation
     }
   }
   ```

2. **Verify itemTags foreign key integrity:**
   ```typescript
   async validateTagSchema(): Promise<{ valid: boolean; issues: string[] }> {
     const issues: string[] = [];

     // Check for orphaned itemTags (itemID not in items table)
     const orphaned = this.db!.exec(
       `SELECT COUNT(*) as count FROM itemTags it
        WHERE it.itemID NOT IN (SELECT itemID FROM items)`
     );
     if (orphaned[0]?.values[0]?.[0] > 0) {
       issues.push('Orphaned itemTags entries detected');
     }

     // Check for orphaned tags (tagID not referenced in itemTags)
     const unusedTags = this.db!.exec(
       `SELECT COUNT(*) as count FROM tags t
        WHERE t.tagID NOT IN (SELECT DISTINCT tagID FROM itemTags)`
     );
     if (unusedTags[0]?.values[0]?.[0] > 0) {
       // This is OK (unused tags are allowed)
     }

     return { valid: issues.length === 0, issues };
   }
   ```

3. **Add schema-specific tag extraction logic:**
   ```typescript
   // Check for known variations in Zotero versions
   async getItemTagsSafely(itemID: number, schemaVersion: number): Promise<string[]> {
     if (schemaVersion < 100) {
       // Zotero 5.x might have different schema
       return [];
     }

     if (schemaVersion >= 100 && schemaVersion < 150) {
       // Zotero 6.x: itemTags is stable
       return this.getItemTags(itemID);
     }

     if (schemaVersion >= 150) {
       // Zotero 7.x: verify table exists
       const tableExists = this.db!.exec(
         `SELECT name FROM sqlite_master
          WHERE type='table' AND name='itemTags'`
       );
       if (tableExists.length === 0) {
         console.warn('itemTags table not found');
         return [];
       }
       return this.getItemTags(itemID);
     }

     return [];
   }
   ```

4. **Test with edge cases during loading:**
   - Load items with zero tags (empty result)
   - Load items with 10+ tags (verify all returned)
   - Load items where tagID is orphaned
   - Load items from different Zotero versions (if testing)

5. **Add logging for tag extraction issues:**
   ```typescript
   if (item.tags.length === 0) {
     console.debug(`Item ${item.itemID} has no tags extracted`);
   }
   ```

6. **Document expected behavior:**
   - Tags are optional (many items won't have tags)
   - Empty tags array is valid and expected
   - Tag extraction failure is non-fatal (continue without tags)

**Detection warning signs:**
- Users report "tags aren't in profile" even though tagged items in Zotero
- Recommendation engine scores same regardless of tags
- "Empty profile" warnings trigger when tagged seed papers exist
- Test data works, production data fails
- NULL values in tag extraction logs

**Phase mapping:**
- Phase 1.1 (Implementation): Implement defensive NULL handling immediately
- Phase 1.1 (Testing): Load-test with real user libraries that have complex tag structures
- Phase 1.1 (Documentation): Document expected behavior of empty tags

**Confidence:** MEDIUM-HIGH
- Query pattern is well-known (forums have examples)
- Many-to-many relationships prone to NULL issues
- But actual schema variations not fully documented in current sources
- User testing will reveal edge cases

---

### Pitfall 2: Progress Notice UI Jank and Thread Blocking

**What goes wrong:**
Adding granular progress updates to `ProgressTracker` with `Notice.setMessage()` during batch scoring causes UI stutter/jank as updates pile up faster than rendering can consume them, or Notice.setMessage() blocks the main thread.

**Why it happens:**
- `Notice.setMessage()` updates DOM, which triggers reflows and repaints
- Calling `setMessage()` every item (5000 calls) causes 5000 DOM updates
- Obsidian may queue or batch these updates, creating stuttering
- Notice with timeout=0 (persistent) keeps updating same notice, causing layout recalculations
- ASCII progress bar generation happens on UI thread for every update

**Consequences:**
- UI becomes unresponsive while batch scoring (defeats purpose of progress indicator)
- Users report "freezes while showing progress" paradox
- Heavy CPU usage from excessive DOM updates
- Notice updates out-of-sync with actual progress (lag)
- Obsidian feels slower after plugin enabled

**Real-world scenario:**
```
User starts batch scoring 1000 items
ProgressTracker calls Notice.setMessage() every item
Notice updates cause DOM reflow: "500/1000 (50%) [████░░░░░░░░░░░░░░]"
5000 DOM updates in 2 seconds = 2500 updates/second
Browser rendering can handle ~60fps (60 reflows/second max)
UI becomes unresponsive, users cancel operation
```

**Prevention:**

1. **Throttle progress updates to reasonable frequency:**
   ```typescript
   export class ProgressTracker {
     private notice: Notice | null = null;
     private state: ProgressState;
     private lastUpdateTime: number = 0;
     private updateThreshold: number = 500; // Update at most every 500ms

     update(loaded: number, status?: string): void {
       const now = Date.now();

       // Only update Notice if threshold elapsed
       if (now - this.lastUpdateTime < this.updateThreshold) {
         // Update internal state but don't touch DOM
         this.state.loaded = loaded;
         if (status) this.state.status = status;
         this.state.percentComplete = Math.round((loaded / this.state.total) * 100);
         return;
       }

       // Actually update Notice (DOM operation)
       this.state.loaded = loaded;
       if (status) this.state.status = status;
       this.state.percentComplete = Math.round((loaded / this.state.total) * 100);

       if (this.notice) {
         this.notice.setMessage(this.formatMessage());
       }
       this.lastUpdateTime = now;
     }
   }
   ```

2. **Use batch updates instead of per-item updates:**
   ```typescript
   // BAD: Update every item
   for (const item of items) {
     scoreItem(item);
     progressTracker.update(index); // 5000 updates
   }

   // GOOD: Update every N items
   const BATCH_SIZE = 100;
   for (let i = 0; i < items.length; i++) {
     scoreItem(items[i]);
     if (i % BATCH_SIZE === 0) {
       progressTracker.update(i); // 50 updates
     }
   }
   ```

3. **Move progress bar generation off critical path:**
   ```typescript
   // Don't generate ASCII art every update
   private formatMessage(): string {
     const bar = this.createProgressBar(this.state.percentComplete);
     return `${this.state.status}\n${bar}\n${this.state.loaded}/${this.state.total}`;
   }

   // Instead, cache it for frequent calls
   private cachedBar: string = '';
   private cachedPercent: number = -1;

   private getProgressBar(): string {
     if (this.state.percentComplete !== this.cachedPercent) {
       this.cachedBar = this.createProgressBar(this.state.percentComplete);
       this.cachedPercent = this.state.percentComplete;
     }
     return this.cachedBar;
   }
   ```

4. **Monitor Notice performance:**
   ```typescript
   // Track if updates are actually happening
   update(loaded: number, status?: string): void {
     const now = performance.now();

     // ... actual update logic

     const duration = performance.now() - now;
     if (duration > 50) {
       console.warn(`Progress update took ${duration}ms (slow)`);
     }
   }
   ```

5. **Test with realistically large datasets:**
   ```typescript
   // Test with 5000 items during development
   const progressTracker = new ProgressTracker();
   progressTracker.start('Testing...', 5000);

   for (let i = 0; i < 5000; i++) {
     // Simulate work
     await sleep(0);
     progressTracker.update(i); // See if UI jank occurs
   }
   ```

6. **Consider alternative to persistent notices:**
   - Use modal with progress instead (modals update less frequently)
   - Use status bar if Obsidian supports it
   - Use non-persistent notice that auto-hides and re-appears (less DOM churn)

7. **Document update frequency expectations:**
   - Progress updates throttled to max 2/second
   - Expect 500-1000ms delay between update and display
   - Don't rely on precise progress reporting for real-time feedback

**Detection warning signs:**
- "Progress indicator makes UI sluggish" reports during batch operations
- UI lag during `ProgressTracker.update()` calls
- Notice updates visible but staggered/delayed
- CPU 100% while progress showing
- Users disable progress indicator to speed up processing

**Phase mapping:**
- Phase 1.1 (Implementation): Implement throttling immediately
- Phase 1.1 (Testing): Load-test with 5000 items, monitor frame rate and CPU
- Phase 1.1 (Polish): Consider alternative UI patterns if notice-based approach insufficient

**Confidence:** HIGH
- DOM update performance is well-known issue
- Progress indicator jank is common in Obsidian plugins
- Throttling solution is proven pattern

---

### Pitfall 3: Notice Memory Leak from Persistent Progress Updates

**What goes wrong:**
`ProgressTracker` creating persistent Notice (timeout=0) and calling `setMessage()` continuously creates event listeners, DOM references, or string allocations that aren't garbage collected, causing memory to grow during long batch operations (5000 items).

**Why it happens:**
- `new Notice()` creates DOM element in Obsidian's notice container
- Calling `setMessage()` repeatedly may create new listeners or strings without cleanup
- Timeout=0 (persistent) keeps notice in DOM, preventing cleanup
- String concatenation in `formatMessage()` creates new strings every call
- Progress bar generation creates new strings (100+ characters × 5000 calls = 500KB+ garbage)
- Event listeners on notice might not detach on hide()

**Consequences:**
- Memory usage grows from 50MB to 200MB+ during 5000-item batch
- Plugin disables due to OOM or "Obsidian is using too much memory"
- Subsequent batches slower due to garbage collection pressure
- Users see "slow batch processing" attributed to plugin, not underlying cause

**Real-world scenario:**
```
User has 5000-item library
Starts batch scoring with progress tracking
Each update: new string created, progress bar rendered
After 5000 updates: ~500KB+ garbage strings
After 2-3 batches: Obsidian memory at 500MB+ (was 100MB at start)
User closes and reopens Obsidian to "reset" memory
Reports plugin as memory hog
```

**Prevention:**

1. **Reuse strings instead of creating new ones:**
   ```typescript
   private cachedMessage: string = '';
   private messageCache = new Map<number, string>();

   private formatMessage(): string {
     // Cache messages to avoid string duplication
     if (this.messageCache.has(this.state.percentComplete)) {
       return this.messageCache.get(this.state.percentComplete)!;
     }

     const bar = this.createProgressBar(this.state.percentComplete);
     const message = `${this.state.status}\n${bar}\n${this.state.loaded}/${this.state.total} (${this.state.percentComplete}%)`;

     // Only cache last 10 to avoid memory
     if (this.messageCache.size > 10) {
       const firstKey = this.messageCache.keys().next().value;
       this.messageCache.delete(firstKey);
     }

     this.messageCache.set(this.state.percentComplete, message);
     return message;
   }
   ```

2. **Explicitly cleanup notice in complete/error:**
   ```typescript
   complete(finalMessage?: string): void {
     if (this.notice) {
       // Hide and detach notice from DOM
       this.notice.hide();

       // Clear any listeners that might have been attached
       // (this depends on Obsidian's Notice implementation)
       this.notice = null;
     }

     // Create new notice for final message, don't reuse
     if (finalMessage) {
       new Notice(finalMessage); // Auto-dismisses
     }
   }

   error(message: string): void {
     if (this.notice) {
       this.notice.hide();
       this.notice = null;
     }
     new Notice(message); // Auto-dismisses
   }
   ```

3. **Monitor memory during progress tracking:**
   ```typescript
   private startMemory: number = 0;

   start(message: string, total: number): void {
     this.state = { status: message, loaded: 0, total, percentComplete: 0 };
     this.notice = new Notice(this.formatMessage(), 0);

     // Baseline memory
     if (performance.memory) {
       this.startMemory = performance.memory.usedJSHeapSize;
     }
   }

   update(loaded: number, status?: string): void {
     // ... update logic

     // Check memory growth
     if (performance.memory && loaded % 1000 === 0) {
       const memoryDelta = performance.memory.usedJSHeapSize - this.startMemory;
       if (memoryDelta > 50_000_000) { // 50MB
         console.warn(`Memory usage grew ${memoryDelta / 1_000_000}MB during progress tracking`);
       }
     }
   }
   ```

4. **Limit progress message complexity:**
   ```typescript
   // Simple progress message (fewer allocations)
   private formatMessage(): string {
     return `${this.state.status} ${this.state.percentComplete}% (${this.state.loaded}/${this.state.total})`;
   }

   // Instead of complex bar + formatting
   ```

5. **Consider non-persistent notice approach:**
   ```typescript
   // Instead of timeout=0 (persistent)
   // Use auto-dismissing notice that can be re-shown
   export class ProgressTrackerV2 {
     private lastNoticeTime: number = 0;
     private noticeInterval: number = 500; // Show notice every 500ms

     update(loaded: number, status?: string): void {
       // ... state update

       const now = Date.now();
       if (now - this.lastNoticeTime > this.noticeInterval) {
         // Show new notice (auto-dismiss after 2s)
         new Notice(this.formatMessage(), 2000);
         this.lastNoticeTime = now;
       }
     }
   }
   ```

6. **Audit Notice usage in codebase:**
   - Search for `new Notice()` calls
   - Verify all notices are cleaned up in error/complete paths
   - Check for Notice listeners that might not detach

**Detection warning signs:**
- Memory grows steadily during batch operation
- Memory doesn't recover after operation completes
- DevTools heap snapshot shows strings dominating memory
- Obsidian becomes sluggish after several batch operations
- Users report "plugin slows down Obsidian over time"

**Phase mapping:**
- Phase 1.1 (Implementation): Implement cleanup in complete/error methods immediately
- Phase 1.1 (Testing): Monitor memory during 5000-item batch with DevTools
- Phase 1.1 (Optimization): Switch to non-persistent notice if needed

**Confidence:** MEDIUM-HIGH
- Memory leaks from DOM/strings are well-known pattern
- Obsidian Notice cleanup not well documented
- Actual memory impact depends on Obsidian's Notice implementation

---

## Moderate Pitfalls (Delays/Debt)

Mistakes that cause technical debt, delays, or reduced user experience during normal usage.

### Pitfall 4: Notice Spam from Concurrent Warning Messages

**What goes wrong:**
Multiple warning messages (from tag extraction, progress, field validation) stack up in Obsidian's notification queue, creating 5-10 notices on screen simultaneously, blocking UI access and overwhelming users.

**Why it happens:**
- v1.1 adds new validation warnings (tag schema issues, profile init)
- Override modal can trigger warnings about missing fields
- Progress tracker shows updates as persistent notices
- Batch processing can hit multiple validation errors (one per item)
- No throttling or deduplication of warning messages
- Each warning creates new Notice that persists (timeout=0)

**Consequences:**
- User can't see vault with 5+ notices stacked
- Notices block top bar, making UI inaccessible
- Users disable warnings because they're annoying
- Support: "Obsidian is spamming me with notices"
- Loss of critical warnings buried under minor ones

**Real-world scenario:**
```
User starts onboarding:
1. "Zotero database loaded (234 items)" - Progress notice
2. "Profile initialized with 12 keywords" - Completion notice
3. "Warning: Empty author field in Item #42" - Validation warning
4. "Warning: Item #51 has no journal" - Validation warning
5. "Tag extraction found 45 unique tags" - Info notice
6. "Batch generated: 5 items ready" - Completion notice

Result: 6 notices on screen, user confused, UI blocked
```

**Prevention:**

1. **Aggregate warnings instead of per-item notices:**
   ```typescript
   // BAD: Notice for each validation error
   for (const item of items) {
     const validation = validateItem(item);
     if (!validation.isValid) {
       new Notice(`Warning: ${item.title} missing ${validation.missingField}`);
     }
   }

   // GOOD: Aggregate warnings
   const warnings: Map<string, number> = new Map();
   for (const item of items) {
     const validation = validateItem(item);
     if (!validation.isValid) {
       const key = `Missing ${validation.missingField}`;
       warnings.set(key, (warnings.get(key) || 0) + 1);
     }
   }

   // Show one notice summarizing all issues
   if (warnings.size > 0) {
     const summary = Array.from(warnings)
       .map(([issue, count]) => `${count}x ${issue}`)
       .join(', ');
     new Notice(`Validation issues: ${summary}`, 5000);
   }
   ```

2. **Implement notice queue with deduplication:**
   ```typescript
   export class NoticeManager {
     private noticeQueue: Set<string> = new Set();
     private showingNotice: boolean = false;

     async showNotice(message: string, duration: number = 5000): Promise<void> {
       // Don't show duplicate messages
       if (this.noticeQueue.has(message)) {
         return;
       }

       this.noticeQueue.add(message);

       if (!this.showingNotice) {
         this.showingNotice = true;
         new Notice(message, duration);

         // Wait for notice to auto-dismiss
         await new Promise(resolve => setTimeout(resolve, duration));

         this.noticeQueue.delete(message);
         this.showingNotice = false;
       }
     }
   }
   ```

3. **Categorize notices by severity:**
   ```typescript
   enum NoticeLevel {
     Info = 'info',        // Low importance
     Warning = 'warning',  // User should know
     Error = 'error'       // User must act
   }

   // Only show high-priority notices immediately
   // Queue info/warning notices until batch completes
   ```

4. **Time-limit persistent notices:**
   ```typescript
   // Never use timeout=0 (infinite) for warnings
   // Always auto-dismiss after reasonable time
   new Notice('Warning message', 5000); // 5 seconds

   // Only use persistent (timeout=0) for user prompts that require action
   ```

5. **Provide notice settings:**
   ```
   Settings tab:
   - Show validation warnings (on/off)
   - Show progress updates (on/off)
   - Show info messages (on/off)
   - Auto-hide notices after N seconds
   ```

6. **Batch final notifications:**
   ```typescript
   // Instead of notice per step
   // Collect all info and show one summary notice at end

   const summary = {
     itemsProcessed: 1000,
     tagsExtracted: 45,
     profileInitialized: true,
     validationIssues: 12,
     errors: 2
   };

   new Notice(
     `Batch complete: ${summary.itemsProcessed} items, ` +
     `${summary.tagsExtracted} tags, ${summary.validationIssues} validation issues`,
     5000
   );
   ```

**Detection warning signs:**
- Users report "too many notifications"
- Support requests: "How do I turn off notices?"
- Notices blocking UI during operations
- Users say "disable all warnings to use plugin"

**Phase mapping:**
- Phase 1.1 (Implementation): Implement notice aggregation from start
- Phase 1.1 (Testing): Run through full workflow and count notices
- Phase 1.1 (Polish): Add settings to control notice verbosity

**Confidence:** HIGH
- Notice spam is well-documented issue in Obsidian
- Aggregation pattern proven and straightforward
- Settings integration is standard practice

---

### Pitfall 5: Modal Help Text Creating Cognitive Overload

**What goes wrong:**
Override modal explaining required fields (DOI, Author, Year) with detailed help text causes cognitive overload: users see 500+ characters of explanation per field, making it unclear what action to take.

**Why it happens:**
- v1.1 adds "Override modal explanations" feature to guide users
- Goal is helpful, but implementation adds too much text
- Each field gets explanation: "Why is this required? What should I do?"
- Modal becomes scrollable wall of text instead of actionable form
- Users don't read long explanations, scroll past them

**Consequences:**
- Users click "Skip" without reading explanation
- Users don't understand why fields are required
- Modal loses purpose (supposed to help but confuses)
- Accessibility issue: screen readers read massive wall of text
- Users feel the feature is "feature bloat"

**Real-world scenario:**
```
Override modal for Item #42 "Machine Learning in AI":
┌─────────────────────────────────────────────────────────┐
│ Required fields missing from Zotero                      │
├─────────────────────────────────────────────────────────┤
│ DOI (Digital Object Identifier)                          │
│ The DOI is a unique identifier for published articles.   │
│ It's required because citations without DOIs are harder  │
│ to track and less reliable. You can usually find the     │
│ DOI on the article's publisher page or via              │
│ https://doi.org/. If the article doesn't have a DOI,    │
│ leave this field blank and update the Year field.        │
│ [Text input field]                                       │
│                                                          │
│ Author                                                   │
│ The author or authors of the work. Required because...   │
│ [and so on for 5 more fields]                           │
│                                                          │
│ [ Cancel ]  [ Skip this item ]  [ Continue ]             │
└─────────────────────────────────────────────────────────┘

User scrolls past help text without reading, clicks Skip
Modal didn't help.
```

**Prevention:**

1. **Follow accessibility guidelines for modals:**
   - Keep explanations to 1-2 sentences max
   - Use plain language, avoid jargon
   - Provide single clear call-to-action per field

   ```typescript
   // BAD: Verbose explanation
   const fieldHelp = {
     doi: 'The DOI is a unique identifier for published articles...' // 200+ chars
   };

   // GOOD: Concise, actionable
   const fieldHelp = {
     doi: 'Enter DOI (e.g., 10.1234/example) or leave blank'
   };
   ```

2. **Use progressive disclosure (expandable help):**
   ```typescript
   // Don't show all help at once
   // Show field name + required indicator
   // Optional: click "?" for more info

   <div class="field-group">
     <label>DOI <span class="required">*</span>
       <button class="help-btn" onclick="toggleHelp('doi')">?</button>
     </label>
     <input type="text" placeholder="e.g., 10.1234/example" />
     <details class="help-text" id="help-doi">
       <summary>Why is DOI important?</summary>
       <p>DOI helps track citations and find full articles.</p>
     </details>
   </div>
   ```

3. **Link to external help instead of embedding:**
   ```typescript
   // Instead of lengthy explanation
   const help = `DOI required. Learn more: [Zotero guide](https://...)`;

   // Users can click if they want, won't overwhelm modal
   ```

4. **Show actionable placeholder text:**
   ```typescript
   // Use placeholder to hint at expected format
   <input type="text" placeholder="e.g., 10.1234/example" />

   // Better than explanation field
   ```

5. **Test modal accessibility:**
   - Read modal content aloud with screen reader
   - Verify focus order is logical
   - Ensure all required fields are marked clearly
   - Test with keyboard navigation only

   ```typescript
   // Accessibility checklist:
   // ✓ Each input has associated <label>
   // ✓ Required fields marked with "required" attribute
   // ✓ Error messages clear and specific
   // ✓ Tab order makes sense
   // ✓ All buttons labeled descriptively
   ```

6. **Provide example vs explanation:**
   ```typescript
   // BAD: Explanation
   "Enter the author or authors' names in LastName, FirstName format,
    separated by semicolons for multiple authors..."

   // GOOD: Example
   "Example: Smith, John; Jones, Jane"
   ```

7. **Prioritize which fields get explanations:**
   ```typescript
   // Only show help for least obvious fields
   // DOI, Year, Pages: clear what they mean
   // Journal, Volume, Issue: might need help
   // Author: almost always obvious

   // Omit explanations for obvious fields
   ```

**Detection warning signs:**
- Users skip override modal without reading help
- Accessibility complaints about modal text volume
- Users report "modal is confusing"
- Screen reader users take 5+ minutes to read modal
- Low completion rate for override modal

**Phase mapping:**
- Phase 1.1 (Implementation): Keep help text to 1-2 sentences max
- Phase 1.1 (Testing): Have non-developers read modals and time comprehension
- Phase 1.1 (Polish): Use progressive disclosure for advanced help

**Confidence:** HIGH
- Cognitive overload is well-documented UX issue
- Accessibility guidelines are clear on modal design
- Pattern is proven across industry

---

## Minor Pitfalls (Annoyances)

Mistakes that cause friction or require fixes but don't break core features.

### Pitfall 6: Tag Extraction Incomplete Due to Annotation Tags

**What goes wrong:**
Tag extraction query returns annotation tags (which Zotero 7 added) alongside item tags, polluting the tag array with system tags like "custom-color-red" or auto-generated tags that don't represent user intent.

**Why it happens:**
- v1.1 adds tag extraction without filtering
- Zotero 7 introduced annotation tags (separate from item tags)
- ITEM_TAGS_QUERY doesn't filter by tag type
- Annotation tags have different meaning (highlight color, etc.)
- User didn't create these tags; Zotero did automatically

**Consequences:**
- User's "machine-learning" tag gets polluted with "custom-color-red"
- Recommendation scoring weights annotation tags equally with real tags
- Tag display shows noise: "color-1", "color-2", etc.
- Users complain: "My tags are wrong"
- Profile shows irrelevant tags in editor

**Real-world scenario:**
```
User has item with tags: ["machine-learning", "nlp", "deep-learning"]
User also highlighted annotations in Zotero: colors, emphasis markers
Zotero 7 stores annotation tags: "custom-color-1", "highlight-yellow"
Tag extraction query returns all:
  ["machine-learning", "nlp", "deep-learning", "custom-color-1", "highlight-yellow"]
Recommendation engine weights annotation tags in scoring
Profile shows all 5 tags
User confused: "I didn't tag this with colors"
```

**Prevention:**

1. **Filter annotation tags in SQL query:**
   ```typescript
   // Updated ITEM_TAGS_QUERY to exclude annotation tags
   export const ITEM_TAGS_QUERY = `
     SELECT t.name
     FROM itemTags it
     JOIN tags t ON it.tagID = t.tagID
     WHERE it.itemID = ?
       AND t.name NOT LIKE 'custom-color-%'
       AND t.name NOT LIKE 'highlight-%'
       AND t.name NOT LIKE 'annotation-%'
     ORDER BY t.name
   `;
   ```

2. **Document tag filtering in code:**
   ```typescript
   /**
    * Query to get tags for a specific item.
    * Filters out Zotero auto-generated annotation tags.
    *
    * Excluded patterns:
    * - custom-color-* (annotation highlight colors)
    * - highlight-* (emphasis markers)
    * - annotation-* (reserved annotation prefix)
    *
    * Returns: user-created tags only
    */
   ```

3. **Provide option to include/exclude annotation tags:**
   ```typescript
   interface TagExtractionOptions {
     includeAnnotationTags?: boolean; // Default false
   }

   async getItemTags(itemID: number, options?: TagExtractionOptions): Promise<string[]> {
     const includeAnnotation = options?.includeAnnotationTags ?? false;

     if (includeAnnotation) {
       // Return all tags
       return this.getAllItemTags(itemID);
     } else {
       // Filter out annotation tags
       const allTags = await this.getAllItemTags(itemID);
       return allTags.filter(tag => {
         return !tag.startsWith('custom-color-') &&
                !tag.startsWith('highlight-') &&
                !tag.startsWith('annotation-');
       });
     }
   }
   ```

4. **Add test case for annotation tag filtering:**
   ```typescript
   // Test with mixed user + annotation tags
   const item = {
     tags: [
       'machine-learning',
       'custom-color-1', // Should be filtered
       'nlp',
       'highlight-yellow', // Should be filtered
       'deep-learning'
     ]
   };

   const filtered = filterAnnotationTags(item.tags);
   expect(filtered).toEqual(['machine-learning', 'nlp', 'deep-learning']);
   ```

5. **Document behavior in settings:**
   ```
   Settings:
   ☐ Include annotation tags in recommendations
     (uncheck to use only user-created tags)
   ```

**Detection warning signs:**
- Users report tags like "custom-color-*" showing up
- Profile editor shows annotation tags mixed with real tags
- Recommendation scoring seems off with certain items
- User asks "Where did these tags come from?"

**Phase mapping:**
- Phase 1.1 (Implementation): Implement filtering in ITEM_TAGS_QUERY
- Phase 1.1 (Testing): Test with Zotero 7 database that has annotation tags
- Phase 1.1 (Documentation): Document which tags are included/excluded

**Confidence:** MEDIUM
- Annotation tag pattern likely (Zotero 7 introduced them)
- But specific tag patterns not fully documented
- User testing will reveal if more patterns exist

---

### Pitfall 7: Progress Tracker Not Cleaning Up on Error

**What goes wrong:**
If batch processing errors out (network failure, database lock, validation error), `ProgressTracker` leaves persistent notice on screen or continues updating with stale state, making UI appear broken and leaving system in inconsistent state.

**Why it happens:**
- v1.1 adds progress tracking but error handling incomplete
- Error path doesn't call `progressTracker.complete()` or `progressTracker.error()`
- Try/catch misses some failure modes (async errors, timeouts)
- Notice left on screen indefinitely (timeout=0)
- User doesn't know operation failed

**Consequences:**
- Progress notice stuck on screen until user manually clicks it
- User doesn't know batch processing failed
- Silent failure: background operation abandoned
- Next batch starts while previous one still showing progress
- UI appears frozen/broken

**Real-world scenario:**
```
User starts batch scoring 5000 items
Progress notice appears: "Scoring items... 0/5000"
At item #2000, SQLite database locks (Zotero is syncing)
Error caught but not handled properly:
- Progress notice not hidden
- Still shows "Scoring items... 2000/5000"
- User thinks it's still running
- Retries, creating two concurrent operations
- System becomes confused with two progress notices

User support: "Plugin got stuck, had to reload Obsidian"
```

**Prevention:**

1. **Ensure error() is called in all error paths:**
   ```typescript
   async scoreBatch(items: ZoteroItem[], tracker: ProgressTracker) {
     try {
       tracker.start('Scoring items...', items.length);

       for (let i = 0; i < items.length; i++) {
         try {
           scoreItem(items[i]);
           tracker.update(i);
         } catch (itemErr) {
           console.error('Failed to score item:', itemErr);
           // Continue to next item, but note the error
         }
       }

       tracker.complete('Batch scoring complete');
     } catch (err) {
       // Critical error - stop everything
       tracker.error(`Batch failed: ${err.message}`);
       throw err; // Re-throw so caller knows
     }
   }
   ```

2. **Add timeout protection:**
   ```typescript
   export class ProgressTracker {
     private timeout: NodeJS.Timeout | null = null;

     start(message: string, total: number, maxDuration?: number): void {
       // ... existing start logic

       if (maxDuration) {
         this.timeout = setTimeout(() => {
           this.error(`Operation timed out after ${maxDuration}ms`);
         }, maxDuration);
       }
     }

     complete(finalMessage?: string): void {
       if (this.timeout) {
         clearTimeout(this.timeout);
         this.timeout = null;
       }
       // ... existing complete logic
     }

     error(message: string): void {
       if (this.timeout) {
         clearTimeout(this.timeout);
         this.timeout = null;
       }
       // ... existing error logic
     }

     onunload(): void {
       if (this.timeout) {
         clearTimeout(this.timeout);
       }
       this.complete(); // Ensure notice is hidden
     }
   }
   ```

3. **Implement operation cancellation:**
   ```typescript
   export class ProgressTracker {
     private cancelled: boolean = false;

     cancel(): void {
       this.cancelled = true;
       this.error('Operation cancelled');
     }

     isCancelled(): boolean {
       return this.cancelled;
     }
   }

   // Usage:
   for (const item of items) {
     if (tracker.isCancelled()) {
       break;
     }
     scoreItem(item);
   }
   ```

4. **Test error paths explicitly:**
   ```typescript
   it('should hide notice on error', () => {
     const tracker = new ProgressTracker();
     tracker.start('Test', 100);

     tracker.error('Test error');

     // Verify notice is hidden
     expect(tracker.isActive()).toBe(false);
   });

   it('should handle timeout', (done) => {
     const tracker = new ProgressTracker();
     tracker.start('Slow operation', 100, 100); // 100ms timeout

     // Simulate slow operation
     setTimeout(() => {
       // Verify error was called and notice hidden
       expect(tracker.isActive()).toBe(false);
       done();
     }, 150);
   });
   ```

5. **Add guard in plugin onunload():**
   ```typescript
   export default class ZoteroTriagePlugin extends Plugin {
     private progressTracker: ProgressTracker;

     onunload() {
       // Ensure progress tracker is cleaned up
       if (this.progressTracker) {
         this.progressTracker.complete();
       }
     }
   }
   ```

**Detection warning signs:**
- Progress notice stuck on screen after batch fails
- Multiple progress notices visible (concurrent operations)
- User reloads Obsidian to clear stuck notice
- Operations appear to hang but actually failed silently

**Phase mapping:**
- Phase 1.1 (Implementation): Add error() calls in all batch error handlers
- Phase 1.1 (Testing): Simulate failures and verify notice cleanup
- Phase 1.1 (Polish): Add timeout protection

**Confidence:** HIGH
- Error handling pattern is straightforward
- But easy to miss error paths if not systematic

---

## Phase-Specific Implementation Guidance

| Phase | Feature | Likely Pitfall | Mitigation |
|-------|---------|----------------|-----------|
| **1.1 Tag Extraction** | Query itemTags table | Null/empty results breaking scoring | Implement defensive NULL handling, test with real libraries |
| **1.1 Tag Extraction** | Annotation tags in results | Polluted tag array | Filter annotation-* tags in SQL, test Zotero 7 |
| **1.1 Progress UI** | Notice.setMessage() updates | UI jank from 5000 DOM updates | Throttle to 500ms, batch updates to 100-item chunks |
| **1.1 Progress UI** | Persistent notice (timeout=0) | Memory leaks from repeated updates | Cleanup in complete(), consider non-persistent pattern |
| **1.1 Warnings** | Multiple validation notices | Notice spam blocking UI | Aggregate warnings, show 1 summary notice |
| **1.1 Override Modal** | Help text for fields | Cognitive overload | Keep to 1-2 sentences, use progressive disclosure |

---

## Detection Checklist

Before releasing v1.1, verify:

- [ ] Tag extraction handles empty/NULL results gracefully
- [ ] Annotation tags filtered from user-facing tag arrays
- [ ] Progress tracker throttles updates (max 2/second)
- [ ] Progress notice memory monitored (< 50MB growth in 5000-item batch)
- [ ] Warning notices aggregated (max 3 notices in flight)
- [ ] Override modal help text < 100 characters per field
- [ ] Error paths call `progressTracker.error()` explicitly
- [ ] All progress trackers cleaned up in `onunload()`
- [ ] Tested with 5000-item library with tags
- [ ] Tested with Zotero 7 (annotation tags present)
- [ ] Accessibility tested: modal readable in < 30 seconds
- [ ] No Notice memory leaks after 10 batches

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| **Tag Null Handling** | MEDIUM | Query pattern known, but schema variations not fully documented |
| **Tag Annotation Filtering** | MEDIUM | Zotero 7 annotation tags likely, but specific patterns need verification |
| **Progress Notice Jank** | HIGH | DOM update performance is well-known Obsidian issue |
| **Notice Memory Leaks** | MEDIUM | Generic pattern known, but Obsidian Notice cleanup not documented |
| **Notice Spam** | HIGH | Well-documented Obsidian issue with known solutions |
| **Modal Overload** | HIGH | Accessibility guidelines clear and proven effective |
| **Progress Cleanup** | MEDIUM-HIGH | Standard error handling pattern, but easy to miss paths |

---

## Sources

### Tag Schema & Extraction
- [Zotero Forums: Finding tags in SQLite](https://forums.zotero.org/discussion/62962/finding-the-tags-of-an-item-in-zotero-sqlite)
- [Zotero SQLite Database Access (Official)](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Exploring Zotero Data Model](https://gist.github.com/pchemguy/19fa69fb4e74ef0cca0026aa0dbf5f42)
- [Annotation Tags in Zotero 7](https://forums.zotero.org/discussion/100496/annotation-tags-in-zotero-sqlite-database)
- [Zotero Schema Files (GitHub)](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql)

### Obsidian UI & Performance
- [Obsidian Notice API Documentation](https://docs.obsidian.md/Reference/TypeScript+API/Notice)
- [Obsidian Memory Leak Issues](https://forum.obsidian.md/t/memory-leak-after-turning-off-plugin/48567)
- [Obsidian Notice/Notification Issues](https://forum.obsidian.md/t/obsidian-sync-lots-of-message-notifications-almost-every-5-seconds/79563)
- [Obsidian Forum: Tasks plugin notification warnings](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/2510)

### Accessibility & UX
- [W3C Modal Dialog Accessibility](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
- [Carnegie Museums: Modal Accessibility](http://web-accessibility.carnegiemuseums.org/code/dialogs/)
- [Accessible Modal Dialogs: Content Best Practices](https://www.a11y-collective.com/blog/modal-accessibility/)
- [Mastering Modal UX](https://www.eleken.co/blog-posts/modal-ux)
- [FreeCodeCamp: Building Accessible Modals](https://www.freecodecamp.org/news/how-to-build-an-accessible-modal-with-example-code/)

---

**This research completes the pitfalls domain for v1.1 features. Use with SUMMARY.md for phase planning.**
