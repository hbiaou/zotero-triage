# Architecture Research: Library Filtering & Preflight Checks (v1.2)

**Domain:** Zotero library scope filtering and duplicate detection in recommendation pipeline
**Researched:** 2026-01-27
**Confidence:** HIGH

## Executive Summary

The v1.2 milestone adds library scope filtering and duplicate detection to the existing Zotero Triage architecture. The core challenge: filter at **query time** (in ZoteroConnector) rather than **post-processing**, to avoid loading thousands of items that will be filtered out anyway.

This requires:
1. **Library filtering** at ZoteroConnector query level (modify ITEMS_QUERY)
2. **Duplicate detection service** (new component) that runs before ProfileInitializer
3. **Preflight check modal** wired into ProfileInitializer (modify existing flow)
4. **Settings persistence** fix (library selection stored in ZoteroTriageSettings)

Integration is clean because filtering happens early in the pipeline, before recommendation scoring.

---

## Current Architecture (v1.1)

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    UI & Settings Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Setup Wizard │  │ Triage View  │  │   Settings   │           │
│  │   Modal      │  │              │  │     Panel    │           │
│  └────────┬─────┘  └───────┬──────┘  └──────┬───────┘           │
│           │                │                 │                   │
├───────────┴────────────────┴─────────────────┴───────────────────┤
│              Profile & Recommendation Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ProfileInitializer │  │ Recommendation │ │ Adaptive     │     │
│  │ (seed selection +  │  │ Engine (scoring)│ │ Learner      │     │
│  │  profile creation) │  │                │  │ (feedback)   │     │
│  └─────────┬──────────┘  └────────┬──────┘  └──────┬───────┘     │
│            │                      │                 │             │
├────────────┴──────────────────────┴─────────────────┴─────────────┤
│                  Batch & Registry Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────────────────────────┐       │
│  │ BatchService │  │ RegistryService (state: unseen →    │       │
│  │ (batch gen)  │  │  proposed → accepted/rejected/      │       │
│  │              │  │  deferred → imported)               │       │
│  └──────┬───────┘  └────────┬────────────────────────────┘       │
│         │                   │                                     │
├─────────┴───────────────────┴─────────────────────────────────────┤
│                    Data Access Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ZoteroConnector (SQLite via sql.js, schema detection)   │    │
│  │ - loadItems(): All papers (cached in memory)            │    │
│  │ - testConnection(): Validate DB access                  │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                     Storage Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Zotero SQLite│  │ Plugin Settings│ │ Plugin Data  │           │
│  │ (zotero.sqlite)  │ (data.json)    │  (data.json)  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## v1.2 Integration Architecture

### Key Integration Points

#### 1. **ZoteroConnector → Library Filtering** (Modify existing)

**Current behavior:** `loadItems()` loads ALL papers from Zotero (excluding attachments/notes)

**v1.2 changes:**
- Add `selectedLibraries: string[]` parameter to `loadItems()`
- Modify `ITEMS_QUERY` to filter by libraryID
- Early filtering at SQL query time (5000 items → maybe 1500 in target library)

**Code pattern:**
```typescript
// Current (v1.1)
await connector.loadItems();  // Loads all items

// v1.2
const libraries = settings.selectedLibraries;
await connector.loadItems({ libraryFilter: libraries });  // Only target libraries
```

**Query modification:**
```sql
-- v1.1: No library filter
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND it.typeName != 'attachment'
  ...

-- v1.2: Add library filter
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND it.typeName != 'attachment'
  AND (? = '' OR i.libraryID IN (...))  -- Add library filter
  ...
```

**Impact on downstream:**
- BatchService receives pre-filtered items (smaller set)
- RecommendationEngine scores fewer items (faster)
- RegistryService tracks smaller state space (less memory)

---

#### 2. **New: DuplicateDetector Service**

**Purpose:** Identify duplicate papers before ProfileInitializer runs

**Invocation point:** Settings panel → "Run Setup Wizard" button

**Algorithm:**
- Compare DOI (exact match)
- Compare title similarity (fuzzy match, >95% confidence)
- Compare author + year (exact match)
- Returns list of duplicates with confidence scores

**Integration:**
```
Settings Panel
    ↓
"Run Setup Wizard" button
    ↓
DuplicateDetector.findDuplicates(allItems)
    ↓
Preflight Check Modal (shows duplicates, user resolves)
    ↓
ProfileInitializer.initializeProfile(resolvedSeedPapers, ...)
```

**New component file:**
- `src/db/duplicate-detector.ts`
- Constructor: `DuplicateDetector(connector: ZoteroConnector)`
- Methods:
  - `findDuplicates(items: ZoteroItem[]): DuplicateGroup[]`
  - `calculateSimilarity(item1, item2): number` (0-1)

**Data structure:**
```typescript
interface DuplicateGroup {
  primary: ZoteroItem;
  duplicates: ZoteroItem[];
  confidence: number;  // 0-1
}
```

**Key insight:** Runs AFTER item loading, so it sees the library-filtered set only.

---

#### 3. **ProfileInitializer → Preflight Check Modal** (Modify existing)

**Current flow:**
```
Settings Panel "Run Setup Wizard"
    ↓
SetupWizardModal (user selects seed papers)
    ↓
ProfileInitializer.initializeProfile(seedPaperIds, preferences)
```

**v1.2 flow:**
```
Settings Panel "Run Setup Wizard"
    ↓
SetupWizardModal (user selects seed papers)
    ↓
[NEW] DuplicateDetector.findDuplicates(selectedSeeds)
    ↓
[NEW] PreflightCheckModal (shows duplicates, auto-deduplicates)
    ↓
ProfileInitializer.initializeProfile(resolvedSeedPaperIds, preferences)
```

**New modal file:**
- `src/ui/preflight-check-modal.ts`
- Shows duplicates found in seed selection
- Allows user to keep/remove duplicates
- Returns final seed list to ProfileInitializer

**Modal responsibilities:**
1. Display duplicate groups
2. Show confidence scores
3. Allow user to keep/remove duplicates
4. Pass resolved list to ProfileInitializer

**Code integration point:**
```typescript
// In settings.ts, SetupWizardModal callback:
async (profile) => {
  // NEW: Run duplicate detection
  const detector = new DuplicateDetector(connector);
  const duplicates = await detector.findDuplicates(
    profile.seedPaperIds.map(id => connector.getItem(parseInt(id)))
  );

  if (duplicates.length > 0) {
    // NEW: Show preflight modal
    new PreflightCheckModal(app, duplicates, async (resolved) => {
      await profileInitializer.initializeProfile(resolved, profile.preferences);
      new Notice('Profile created successfully');
    }).open();
  } else {
    // No duplicates, proceed as normal
    await profileInitializer.initializeProfile(profile.seedPaperIds, profile.preferences);
  }
}
```

---

#### 4. **Settings → Library Persistence** (Fix existing)

**Current bug:** Library selection not persisted to settings panel

**Root cause:** Settings panel not loading `selectedLibraries` from plugin.settings

**Fix locations:**

1. **types.ts** - Add field to ZoteroTriageSettings:
```typescript
export interface ZoteroTriageSettings {
  // ... existing fields ...
  selectedLibraries: string[];  // NEW: empty = all libraries
  libraryNames: Record<string, string>;  // NEW: mapping for display
}
```

2. **settings.ts** - Add UI control:
```typescript
// NEW: Library selection section
containerEl.createEl('h2', { text: 'Library Scope' });

new Setting(containerEl)
  .setName('Selected Libraries')
  .setDesc('Limit recommendations to items in selected libraries')
  .addButton(button => button
    .setButtonText('Edit Libraries')
    .onClick(async () => {
      new LibrarySelectionModal(app, this.plugin.connector,
        async (selected) => {
          this.plugin.settings.selectedLibraries = selected;
          await this.plugin.saveSettings();
          this.display();
        }
      ).open();
    }));
```

3. **ZoteroConnector** - Wire filtering:
```typescript
// In main.ts initialization:
const settings = await this.loadSettings();
if (settings.selectedLibraries?.length > 0) {
  await connector.loadItems({ libraryFilter: settings.selectedLibraries });
} else {
  await connector.loadItems();  // All libraries
}
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Settings Panel                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ • Zotero Database Configuration                        │    │
│  │ • Library Selection [NEW]                              │    │
│  │ • Output Folder                                        │    │
│  │ • "Run Setup Wizard" / "Re-run Wizard" buttons         │    │
│  └──────────────┬─────────────────────────────────────────┘    │
│                 │                                                │
│                 ↓                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ SetupWizardModal (existing)                            │    │
│  │ • User selects seed papers from library-filtered set   │    │
│  │ • User sets preferences (relevance vs diversity, etc)  │    │
│  └──────────────┬─────────────────────────────────────────┘    │
│                 │                                                │
│                 ↓                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ DuplicateDetector.findDuplicates() [NEW]               │    │
│  │ • Analyzes selected seed papers                        │    │
│  │ • Returns groups of potential duplicates               │    │
│  └──────────────┬─────────────────────────────────────────┘    │
│                 │                                                │
│    ┌────────────┴────────────┐                                  │
│    │                         │                                  │
│    ↓ (if duplicates found)   ↓ (if no duplicates)               │
│  ┌──────────────────┐  ┌─────────────────────┐                 │
│  │ PreflightCheck   │  │ ProfileInitializer  │                 │
│  │ Modal [NEW]      │  │ (proceed directly)  │                 │
│  │                  │  └─────────────────────┘                 │
│  │ • Shows groups   │                                           │
│  │ • User resolves  │                                           │
│  │ • Calls Profile  │                                           │
│  │   Initializer    │                                           │
│  └──────────┬───────┘                                           │
│             │                                                   │
│             ↓                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ ProfileInitializer.initializeProfile()                 │    │
│  │ • Extracts signals (tags, authors, keywords)           │    │
│  │ • Creates user profile with frequency-based weights    │    │
│  │ • Persists to plugin settings                          │    │
│  └──────────────┬─────────────────────────────────────────┘    │
│                 │                                                │
│                 ↓                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ ProfileService                                         │    │
│  │ • Updates plugin.settings.userProfile                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Library Filtering & Duplicate Detection

### Initialization Flow (Single occurrence at plugin load)

```
Plugin Load (main.ts)
    ↓
ZoteroConnector.connect(dbPath)
    ↓
ZoteroConnector.loadItems({libraryFilter: settings.selectedLibraries})
    ├─ Query ITEMS_QUERY with library filter
    ├─ Result: 1500 items (from target library only)
    └─ Cache in memory
    ↓
RegistryService.load()
    └─ Load state for ALL items (historical, not just current library)
    ↓
Recommendation Engine ready (will score only cached items from filtered library)
```

### Preflight Check Flow (Triggered by "Run Setup Wizard")

```
User clicks "Run Setup Wizard"
    ↓
SetupWizardModal opens
    ├─ Displays items from connector.getCachedItems()
    │  (already filtered to selected libraries)
    └─ User selects seed papers
    ↓
DuplicateDetector.findDuplicates(selectedSeedItems)
    ├─ Compare DOI (exact)
    ├─ Compare title (fuzzy, >95%)
    ├─ Compare author + year (exact)
    └─ Return DuplicateGroup[]
    ↓
    └─ If duplicates found:
        ├─ PreflightCheckModal shows groups
        ├─ User resolves (keep/remove)
        └─ Return finalSeedPaperIds
    └─ Else: Continue with original seed IDs
    ↓
ProfileInitializer.initializeProfile(finalSeedIds, preferences)
    ├─ Fetch seed papers from connector
    ├─ Extract signals (tags, authors, keywords)
    ├─ Build frequency-weighted profile
    └─ Persist to profileService
    ↓
Notice: "Profile created successfully"
```

### Batch Generation Flow (Happens every day)

```
User requests batch or timer fires
    ↓
BatchService.generateBatch(options)
    ├─ Get all items: connector.getCachedItems()
    │  └─ Only library-filtered items (from initial load)
    ├─ Filter by registry state
    │  └─ Exclude imported, rejected, deferred (if includeDeferred = false)
    ├─ Score with RecommendationEngine
    │  └─ Uses user profile (tags, authors, keywords)
    └─ Mark as 'proposed'
    ↓
TriageView displays batch
```

---

## Recommended Build Order

### Phase 1: Library Filtering (Foundation)
**Scope:** Modify ZoteroConnector to filter at query time
**Files:**
- `src/db/queries.ts` - Modify ITEMS_QUERY to accept library parameter
- `src/db/zotero-connector.ts` - Add `libraryFilter` option to loadItems()
- `src/types.ts` - Add `selectedLibraries` field to ZoteroTriageSettings

**Why first:** Required for everything else (downstream expects filtered item set)

**Testing:**
- Load Zotero with 2+ libraries, select one
- Verify only items from selected library appear in batch

---

### Phase 2: Duplicate Detection (New Service)
**Scope:** Create DuplicateDetector service
**Files:**
- `src/db/duplicate-detector.ts` - New file
- `src/db/duplicate-detector.test.ts` - Unit tests

**Why second:** Service is standalone, doesn't depend on UI yet

**Algorithm:**
```
For each pair of items in input:
  1. Check DOI match (exact, high confidence)
  2. Check title similarity (fuzzy, >95%)
  3. Check author + year (exact, medium confidence)

Return groups with confidence scores
```

**Testing:**
- Known duplicate pairs (e.g., preprint + published)
- False positives (similar titles, same author/year)

---

### Phase 3: Preflight Modal (UI)
**Scope:** Create and wire PreflightCheckModal
**Files:**
- `src/ui/preflight-check-modal.ts` - New file
- `src/settings.ts` - Integrate modal into wizard flow

**Why third:** Depends on DuplicateDetector (service must exist first)

**Modal flow:**
1. Display duplicate groups
2. Allow user to keep/remove each duplicate
3. Return final seed list
4. Proceed to ProfileInitializer

**Testing:**
- User selects duplicate seeds
- Modal appears and shows groups
- User keeps/removes and confirms
- Profile initializes with resolved list

---

### Phase 4: Settings Persistence (UI)
**Scope:** Add library selection to settings panel
**Files:**
- `src/types.ts` - Add selectedLibraries field (done in Phase 1)
- `src/settings.ts` - Add UI controls
- `src/ui/library-selection-modal.ts` - New file (optional, reuse existing modal patterns)

**Why last:** Cosmetic, doesn't block core functionality

**Settings section to add:**
```typescript
// Library Scope section
- Display current selection
- Button: "Edit Libraries"
- (clicking launches LibrarySelectionModal)
```

**Testing:**
- Settings panel loads current selection
- User changes selection
- Selection persists after reload
- Batch generation respects new selection

---

## Performance Implications

### Item Loading (ZoteroConnector.loadItems)

**Before v1.2:**
```
Full Zotero library: 5000 items
SQL query: 5000 items → load creators, tags, attachments → 5000 items cached
Memory: ~50-100 MB (assuming ~10-20 KB per item)
Time: ~5-10 seconds
```

**After v1.2 (single library selected):**
```
Target library: 1500 items (30% of total)
SQL query: 1500 items (library filter reduces result set)
Memory: ~15-30 MB (proportional to result set)
Time: ~2-3 seconds (faster query + less processing)
```

**Impact:** Settings loading is 3-5x faster when library filter is applied.

### Duplicate Detection

**Algorithm complexity:** O(n²) for n seed papers (usually 5-20)
```
10 seed papers → 45 comparisons (DOI, title fuzzy, author+year)
20 seed papers → 190 comparisons
```

**Latency:** ~100-200ms for typical seed selection (negligible)

### RegistryService State Space

**Before v1.2:**
```
Total items in Zotero: 5000
Registry entries: 5000 (one per item, even if not in selected library)
Disk: ~50-100 KB (JSON entries)
```

**After v1.2:**
```
Total items (historical): 5000
Registry entries: 5000 (unchanged — history persists)
Active items (batch generation): 1500 (filtered at runtime)
Disk: ~50-100 KB (unchanged)
```

**Why unchanged:** RegistryService tracks ALL historical items (necessary for "which items have I already triaged?"). Filtering happens at query time, not in registry.

---

## Integration Checklist

### ZoteroConnector Changes
- [ ] Modify ITEMS_QUERY to accept `libraryID IN (...)` filter
- [ ] Add `libraryFilter?: string[]` parameter to loadItems()
- [ ] Conditionally apply filter (empty array = all libraries)
- [ ] Verify query performance with filter applied
- [ ] Test with multi-library Zotero instance

### DuplicateDetector Service
- [ ] Create duplicate-detector.ts
- [ ] Implement DOI matching (exact)
- [ ] Implement title similarity (fuzzy, threshold 0.95)
- [ ] Implement author + year matching (exact)
- [ ] Handle edge cases (missing DOI, missing authors, etc.)
- [ ] Unit tests with known duplicates

### PreflightCheckModal
- [ ] Create preflight-check-modal.ts
- [ ] Display duplicate groups with confidence
- [ ] Allow keep/remove per duplicate
- [ ] Return finalSeedPaperIds to callback
- [ ] Wire into settings.ts wizard flow
- [ ] Test with various duplicate scenarios

### Settings Updates
- [ ] Add selectedLibraries field to ZoteroTriageSettings
- [ ] Add libraryNames mapping for display
- [ ] Create library selection UI (modal or dropdown)
- [ ] Persist selection to settings
- [ ] Pass selection to ZoteroConnector.loadItems()

### Registry Considerations
- [ ] Verify RegistryService loads historical entries correctly
- [ ] Test filtering: "show items in selected library"
- [ ] Ensure deferred/rejected items persist across library changes
- [ ] Document: RegistryService is library-agnostic (stores history)

---

## Boundary Conditions & Edge Cases

### Library Filtering

**Empty library selected:**
```
User selects library with 0 papers
→ BatchService.generateBatch() returns empty batch
→ Notice: "No items in selected library"
→ Recommend: Add items to library or select different library
```

**Multiple libraries selected:**
```
User selects 3 libraries: "Main", "Inbox", "Temp"
→ ITEMS_QUERY filters: libraryID IN (123, 456, 789)
→ Combined item count processed
→ Works as expected (union of libraries)
```

**Library deleted in Zotero:**
```
User selects library "Archived"
Later, user deletes "Archived" in Zotero
→ SQL query: libraryID IN (789) — returns 0 items
→ Next batch: empty
→ Fix: UI should show "selected library not found"
```

### Duplicate Detection

**Same item in multiple libraries:**
```
Item #1 (libraryID=123): "Machine Learning Survey"
Item #2 (libraryID=456): "Machine Learning Survey" (same paper, different copy)
→ DuplicateDetector.findDuplicates() identifies as duplicates (title match)
→ User resolves (usually keeps the one with more metadata)
→ ProfileInitializer uses resolved set
```

**Fuzzy matching edge case:**
```
"Machine Learning: A Probabilistic Perspective"
"Machine Learning: A Probabilistic Perspective (2012)"
→ Title similarity: ~0.98 (likely duplicate)
→ Modal shows both, user confirms duplicate
```

**No duplicates found:**
```
Detector returns empty array
→ Modal skipped
→ ProfileInitializer proceeds directly with original seeds
```

### Preflight Modal

**User cancels modal:**
```
PreflightCheckModal.onCancel()
→ Wizard closed without saving profile
→ User can try again later
```

**User resolves but creates empty seed set:**
```
User removes all duplicates, leaving 0 seeds
→ Modal validation: require at least 3 seeds
→ Notice: "Please keep at least 3 papers"
→ Return to modal for resolution
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Filtering Post-Hoc

**What people do:** Load all 5000 items, then filter to 1500 in memory

**Why it's wrong:**
- Memory inefficiency (50-100 MB when could be 15-30 MB)
- Slower initialization (5-10s when could be 2-3s)
- Recommendation scoring wastes cycles on filtered-out items

**Do this instead:** Filter at SQL query time (library WHERE clause)

---

### Anti-Pattern 2: Storing Duplicates Without User Consent

**What people do:** Auto-remove duplicates silently, user discovers later

**Why it's wrong:**
- User may have reason to keep both (different metadata quality)
- Breaks reproducibility (user can't explain why seed papers changed)
- Can silently change profile initialization

**Do this instead:** Show preflight modal, let user decide per duplicate

---

### Anti-Pattern 3: Losing Registry History on Library Change

**What people do:** Clear registry entries when library selection changes

**Why it's wrong:**
- User loses triage history ("which items have I already accepted?")
- Impossible to change library selection without losing progress
- Makes library filtering feel fragile

**Do this instead:** Keep registry history, filter at query time only

---

### Anti-Pattern 4: Complex Duplicate Detection Algorithm

**What people do:** Try to detect all possible duplicates (multi-language, OCR errors, etc.)

**Why it's wrong:**
- Diminishing returns (>95% accuracy requires complex ML)
- Slow (O(n²) becomes problematic at scale)
- False positives confuse users

**Do this instead:** Simple rules (DOI, exact title, author+year), let user resolve

---

## Scaling Notes

### At 100 Zotero items
- All components work as-is
- Duplicate detection: <10ms
- RegistryService: negligible memory
- No optimization needed

### At 1000 items (single library)
- Library filtering essential for performance (limits to ~300)
- Duplicate detection: ~50ms (still fast)
- Recommend: Limit to 5-10 seed papers for initial profile
- No further optimization needed

### At 5000+ items (typical power user)
- Library filtering **required** (essential, not optional)
- Multiple libraries recommended for organization
- Duplicate detection: ~200ms per duplicate check
- Consider: Batch duplicate detection in background?
- Profiling: Measure item loading time, optimize if >5s

---

## Data Structures Reference

### DuplicateDetector Input/Output

```typescript
// Input
interface DuplicateDetectionRequest {
  items: ZoteroItem[];
  options?: {
    titleSimilarityThreshold?: number;  // default 0.95
    includeLowConfidence?: boolean;     // default false
  };
}

// Output
interface DuplicateGroup {
  items: ZoteroItem[];
  confidence: number;  // 0-1, based on match type
  matchType: 'doi' | 'title' | 'author_year';  // primary match
  explanation: string;  // "Same DOI", "Title match (98%)", etc.
}
```

### PreflightCheckModal State

```typescript
interface PreflightCheckState {
  duplicateGroups: DuplicateGroup[];
  userResolutions: Map<ZoteroItem, 'keep' | 'remove'>;  // per item
  finalSeedPaperIds: string[];  // resolved list
}
```

### Settings Additions

```typescript
interface ZoteroTriageSettings {
  // ... existing fields ...
  selectedLibraries: string[];  // libraryID strings, empty = all
  libraryNames: Record<string, string>;  // libraryID → name for display
}
```

---

## Testing Strategy

### Unit Tests (duplicate-detector.ts)

```typescript
describe('DuplicateDetector', () => {
  describe('DOI matching', () => {
    it('should match identical DOIs', () => {
      // item1.doi = "10.1234/example"
      // item2.doi = "10.1234/example"
      // → confidence = 1.0
    });
  });

  describe('Title matching', () => {
    it('should match similar titles above threshold', () => {
      // item1.title = "Machine Learning Survey"
      // item2.title = "Machine Learning Survey (2024)"
      // → similarity ~0.98, confidence = 0.95
    });

    it('should not match dissimilar titles', () => {
      // item1.title = "Machine Learning"
      // item2.title = "Deep Learning Basics"
      // → similarity ~0.3, not matched
    });
  });

  describe('Author + Year matching', () => {
    it('should match same author and year', () => {
      // item1.authors = ["Smith, J."], item1.year = "2024"
      // item2.authors = ["Smith, J."], item2.year = "2024"
      // → confidence = 0.8
    });
  });

  describe('Edge cases', () => {
    it('should handle missing DOI gracefully', () => {
      // Falls back to title/author matching
    });

    it('should return empty array for no duplicates', () => {});
  });
});
```

### Integration Tests (settings.ts + ZoteroConnector)

```typescript
describe('Library Filtering Integration', () => {
  it('should load only items from selected library', async () => {
    // Setup: 2 libraries in Zotero (1000 items each)
    // Select: Library 1 only
    // → connector.getCachedItems().length === 1000
    // → All items have libraryID matching Library 1
  });

  it('should persist library selection across restarts', async () => {
    // Set: selectedLibraries = ['lib123']
    // Plugin reload
    // → Settings loaded
    // → ZoteroConnector filters automatically
  });
});
```

### UI Tests (PreflightCheckModal)

```typescript
describe('PreflightCheckModal', () => {
  it('should display duplicate groups', () => {
    // Modal shows: [Primary item | Duplicate 1 | Duplicate 2]
  });

  it('should allow user to resolve duplicates', () => {
    // User clicks "Keep primary, remove duplicate"
    // Modal updates state
  });

  it('should return resolved seed list', () => {
    // User confirms
    // Modal calls onResolve(finalSeedIds)
    // finalSeedIds excludes removed items
  });

  it('should require at least 3 seeds', () => {
    // User tries to remove all duplicates
    // Modal validation: "Need at least 3 papers"
    // Prevent completion
  });
});
```

---

## Sources & References

### Zotero Architecture
- **Zotero SQLite Schema:** Internal (examined via sql.js queries)
- **Existing Research:** `.planning/research/STACK.md` (database layer)

### Duplicate Detection
- **Concept:** Fuzzy matching (standard string similarity algorithm)
- **Implementation:** Levenshtein distance or Jaro-Winkler similarity
- **Threshold:** 0.95 standard for "high confidence match"

### Obsidian Plugin Development
- **Modal patterns:** Existing SetupWizardModal (reference implementation)
- **Settings persistence:** Obsidian Plugin API (loadData/saveData)
- **UI controls:** Obsidian SettingTab and Modal components

---

## Key Decisions Summary

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| **Filter at SQL query time** | Avoid loading 5000 items when only 1500 needed | Post-hoc filtering in memory |
| **New DuplicateDetector service** | Reusable across UI contexts (batch, seed selection, etc.) | Inline detection in modal |
| **Simple duplicate rules (DOI, title, author+year)** | Fast, understandable, user resolvable | Complex ML-based matching |
| **Preflight modal, not auto-dedup** | Transparent to user, preserves choice | Silent removal (loses history) |
| **Keep RegistryService library-agnostic** | Preserves triage history across library changes | Clear registry on library change |
| **Build in phases (filtering → detector → UI)** | Each phase independently testable | Monolithic implementation |

---

## Confidence Notes

**HIGH confidence** because:
- v1.1 architecture is mature and well-documented
- Library filtering is standard SQL WHERE clause (no surprises)
- DuplicateDetector is self-contained with clear algorithm
- Preflight modal follows existing SetupWizardModal pattern
- No new external dependencies required

**Potential surprises:**
- Zotero library schema variations (rare, handled via error checks)
- Fuzzy matching threshold tuning (may need adjustment based on user feedback)
- Performance with 10K+ items (untested, but filtering should scale)

---

*Architecture research for: Zotero Triage v1.2 (library filtering & duplicate detection)*
*Researched: 2026-01-27*
*Confidence: HIGH*
