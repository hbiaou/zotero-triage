# Architecture: Tag Extraction + UX Polish Integration (v1.1)

**Project:** Zotero Triage (v1.1 Milestone)
**Focus:** How tag extraction and UX enhancements integrate with existing v1.0 architecture
**Researched:** 2026-01-25
**Confidence:** HIGH (existing architecture documented in codebase, integration points explicit)

## Executive Summary

The v1.1 milestone adds tag extraction and UX enhancements to the existing v1.0 architecture through **minimal, surgical changes** rather than restructuring. Tag extraction reuses existing infrastructure (ZoteroConnector's `ITEM_TAGS_QUERY` already implemented), integrates into the RecommendationEngine's multi-signal scoring, and updates Profile initialization. UX enhancements layer on top without structural changes: progress tracking uses the existing ProgressTracker API, warning notices use Obsidian's Notice API, and override modal explanations are templated text. The architecture supports these changes through established patterns: dependency injection for scoring signals, debounced state persistence for registry updates, and chunked async processing. **No new architectural patterns needed.**

## Existing v1.0 Architecture (Foundation)

### Component Map

```
┌──────────────────────────────────────────────────┐
│ PLUGIN LIFECYCLE (main.ts)                       │
│ - onload() → initialize services, setup UI       │
│ - onLayoutReady() → lazy load database           │
│ - onunload() → cleanup, save state               │
└─────────────────┬────────────────────────────────┘
                  │
      ┌───────────┼───────────┬─────────────┐
      │           │           │             │
      v           v           v             v
  SETTINGS    ZOTERO      REGISTRY      PROFILE &
  Manager    Connector   Service       SCORING
  - JSON     - sql.js    - State       - Profile
    storage  - WASM      - Debounce    - Reco
  - loadData - ITEM_     - Persist     - Adaptive
  - saveData   TAGS_QUERY             - Learning

              ┌────────────────────────────────┐
              │ PROCESSING PIPELINE            │
              │                                │
              │ BatchService                   │
              │ - Generate batches             │
              │ - Apply scoring                │
              │ - Filter by registry state     │
              │ - Chunked async (50 items)     │
              │                                │
              │ RecommendationEngine           │
              │ - Multi-signal scoring         │
              │ - Tag/Author/Keyword signals   │
              │ - Recency boost                │
              │ - Diversity penalty            │
              │                                │
              │ ValidationService              │
              │ - Quality gates                │
              │ - Per-item-type schemas        │
              └────────────┬───────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        v                  v                  v
    NOTE GEN            UI LAYER          PERFORMANCE
  - YAML FM            - Wizard           - Progress
  - Markdown           - Triage View        Tracker
  - Vault API          - Override           - Notice
  - File create          Modal              - Updates
                       - Profile           - Memory
                         Editor            - Retry

```

### Data Flow (v1.0 → v1.1)

```
LOADING PHASE (unchanged, except progress callback):
  ZoteroConnector.loadItems()
  ├─ Execute ITEMS_QUERY (main metadata)
  ├─ For each item in chunks (50 at a time):
  │  ├─ Execute CREATORS_QUERY
  │  ├─ Execute ATTACHMENTS_QUERY
  │  ├─ Execute ITEM_TAGS_QUERY ← ALREADY EXTRACTS TAGS
  │  └─ Execute ITEM_COLLECTIONS_QUERY
  ├─ Emit onProgress callback ← ENHANCED in v1.1
  └─ Return items with tags populated

PROFILE INITIALIZATION (new in v1.1):
  ProfileInitializer.initializeProfile()
  ├─ Fetch seed papers from connector
  ├─ Extract signals (NEW: tags + existing authors + keywords)
  │  ├─ Count tag frequency across seeds ← NEW
  │  ├─ Count author frequency (existing)
  │  └─ Count keyword frequency (existing)
  ├─ Create Profile with weighted signals
  ├─ Validate profile (NEW: warn if empty) ← NEW
  └─ Persist to settings

BATCH GENERATION (enhanced in v1.1):
  BatchService.generateBatch()
  ├─ Progress.start() ← NEW: Visual feedback
  ├─ Filter items by registry state
  ├─ Check if profile exists
  │  ├─ If yes: RecommendationEngine.scoreItems()
  │  │  └─ Calculate signals: tags (NEW) + authors + keywords + recency
  │  └─ If no: Sort by dateAdded
  ├─ Progress.update() ← NEW: Mid-operation feedback
  ├─ Slice to batch size
  ├─ Mark items as 'proposed'
  └─ Progress.complete() ← NEW: Done feedback

FEEDBACK LOOP (existing pattern, NEW signal):
  BatchService.recordAccept/recordReject()
  ├─ Update registry state
  ├─ Trigger AdaptiveLearner
  │  ├─ Learn from accepted item tags (NEW)
  │  ├─ Learn from accepted item authors (existing)
  │  └─ Learn from accepted item keywords (existing)
  └─ Debounced RegistryService.save()

VALIDATION (enhanced with explanations):
  ValidationService.validate()
  ├─ Check if quality gates enabled
  ├─ Get schema for item type
  ├─ Validate item
  └─ Return errors + missing field names

OverrideModal (enhanced in v1.1):
  ├─ Show validation errors (existing)
  └─ Add field explanations (NEW) ← Help text for each field
```

### Key Architectural Patterns Used

| Pattern | Location | Purpose | Used in v1.1 |
|---------|----------|---------|--------------|
| **Dependency Injection** | Services receive deps in constructor | Loose coupling | Yes, unchanged |
| **Chunked Async** | processInChunks(items, fn, 50) | Non-blocking UI | Yes, unchanged |
| **Lazy Loading** | main.ts onLayoutReady() | Defer init until UI ready | Yes, unchanged |
| **Debounced State** | RegistryService.save() (2000ms) | Batch I/O writes | Yes, unchanged |
| **Progress Callbacks** | ZoteroConnector.loadItems(onProgress?) | Optional tracking | Yes, enhanced |
| **Retry with Backoff** | retryWithBackoff() | SQLITE_BUSY handling | Yes, unchanged |
| **Schema Version Detection** | checkSchemaVersion() | Zotero 6.x/7.x compat | Yes, unchanged |
| **Read-Only Database** | sql.js in-memory copy | Never modify Zotero | Yes, unchanged |
| **Multi-Signal Scoring** | RecommendationEngine | Combine multiple ranking signals | Yes, **new signal: tags** |

## v1.1 Integration Points: Minimal Changes

### 1. Tag Extraction ✓ Already Implemented

**Status:** Tags field already in `ZoteroItem` schema. `ITEM_TAGS_QUERY` already executes for each item during load.

**Code locations:**
- ZoteroItem interface: `src/db/zotero-connector.ts:69` — `tags: string[]` field
- Tag query execution: `src/db/zotero-connector.ts:336-342` — Already loads tags per item
- No changes needed to database layer

**v1.1 changes (minimal):**
- **RecommendationEngine**: Add `calculateTagScore()` method
- **ProfileInitializer**: Extract tags from seed papers (same frequency-counting pattern as authors/keywords)
- **AdaptiveLearner**: Learn tag weights when user accepts/rejects items

### 2. Progress Tracking for Batch Scoring

**Component exists:** ProgressTracker (`src/performance/progress-tracker.ts`) already implemented

**Current usage:** Referenced at BatchService line 72, called during batch generation

**Implementation pattern already in code:**
```typescript
// From BatchService line 72 (ALREADY THERE)
async generateBatch(options: BatchOptions): Promise<Batch> {
  const progress = new ProgressTracker();
  // ...
}
```

**v1.1 enhancement:** Wire progress callbacks throughout batch generation:
```typescript
progress.start('Filtering candidates...', allItems.length);
// ... filtering ...
progress.update(33, 'Scoring candidates...');
// ... scoring ...
progress.update(66, 'Selecting batch...');
// ... selection ...
progress.complete('Batch ready!');
```

**Integration approach:** Existing ProgressTracker already uses Obsidian Notice API (src/performance/progress-tracker.ts:24), no new dependencies

### 3. Warning Notices (Empty Profile Edge Case)

**Trigger:** ProfileInitializer.initializeProfile() when seed papers yield empty profile

**v1.1 addition:**
```typescript
async initializeProfile(seedPaperIds, preferences) {
  const profile = this.profileService.createProfile(...);
  // ... extract tags, authors, keywords ...

  // NEW: Warn if profile is empty
  if (this.isProfileEmpty(profile)) {
    new Notice('⚠️ Profile from selected papers is empty.');
  }

  return profile;
}
```

**Integration approach:** Uses Obsidian's native Notice API (already used in codebase)

### 4. Override Modal Field Explanations

**Existing component:** OverrideModal (src/ui/override-modal.ts)

**Current behavior:** Shows validation errors as list

**v1.1 enhancement:** Add inline field explanations for each required field

**Implementation pattern:**
```typescript
// Create mapping of field → explanation
const fieldExplanations: Record<string, string> = {
  title: 'Required for note title. Edit in Zotero: Info tab → Title field',
  doi: 'Digital Object Identifier. Edit in Zotero: Info tab → DOI field',
  year: 'Publication year. Edit in Zotero: Info tab → Date field',
  author: 'At least one author. Edit in Zotero: Info tab → Creators section',
};

// When rendering validation errors
const missingFields = validation.missingFields;
for (const field of missingFields) {
  modal.contentEl.createEl('p', { text: `${field}: ${fieldExplanations[field]}` });
}
```

**Integration approach:** String templating in existing modal, no new components

## Modified Components (v1.1)

### 1. RecommendationEngine

**File:** `src/recommendations/recommendation-engine.ts`

**Changes:**
- Add `calculateTagScore()` method alongside existing `calculateAuthorScore()`, `calculateKeywordScore()`
- Weight tags with `DEFAULT_PROFILE_WEIGHTS.tagWeight = 1.0` (same as author weight = 0.8)
- Integrate into `scoreItem()` multi-signal calculation

**Existing pattern for other signals (to copy):**
```typescript
private scoreItem(item: ZoteroItem, profile: UserProfile, config: RecommendationConfig): ScoredItem {
  const authorScore = this.calculateAuthorScore(item, profile);   // existing
  const keywordScore = this.calculateKeywordScore(item, profile); // existing
  const recencyScore = this.calculateRecencyScore(item, config);  // existing

  // Combine signals
  const combinedScore = (
    authorScore * DEFAULT_PROFILE_WEIGHTS.authorWeight +
    keywordScore * DEFAULT_PROFILE_WEIGHTS.keywordWeight +
    recencyScore
  );

  return { item, score: combinedScore };
}
```

**New code (apply identical pattern for tags):**
```typescript
private scoreItem(item: ZoteroItem, profile: UserProfile, config: RecommendationConfig): ScoredItem {
  const tagScore = this.calculateTagScore(item, profile);        // ← NEW
  const authorScore = this.calculateAuthorScore(item, profile);   // existing
  const keywordScore = this.calculateKeywordScore(item, profile); // existing
  const recencyScore = this.calculateRecencyScore(item, config);  // existing

  const combinedScore = (
    tagScore * DEFAULT_PROFILE_WEIGHTS.tagWeight +               // ← NEW
    authorScore * DEFAULT_PROFILE_WEIGHTS.authorWeight +
    keywordScore * DEFAULT_PROFILE_WEIGHTS.keywordWeight +
    recencyScore
  );

  return { item, score: combinedScore };
}

// NEW method (following pattern of calculateAuthorScore, etc.)
private calculateTagScore(item: ZoteroItem, profile: UserProfile): number {
  if (!item.tags || item.tags.length === 0) {
    return 0;
  }

  let score = 0;
  for (const tag of item.tags) {
    const weight = profile.tags.get(tag) || 0;
    score += weight;
  }

  return score / item.tags.length; // Average score
}
```

**Why minimal change:** Identical pattern to existing author/keyword scoring, no new algorithms

### 2. ProfileInitializer

**File:** `src/profile/profile-initializer.ts`

**Changes:**
- Extract tags during signal extraction (same frequency-counting pattern as authors/keywords)
- Store in Profile.tags Map before persistence

**Existing pattern for authors/keywords (to copy):**
```typescript
private extractSignalsWithFrequency(seedPapers: ZoteroItem[]): SignalFrequencies {
  const authorFreq = new Map<string, number>();
  const keywordFreq = new Map<string, number>();

  for (const paper of seedPapers) {
    for (const author of paper.authors) {
      authorFreq.set(author, (authorFreq.get(author) || 0) + 1);
    }
    const keywords = extractKeywords(paper.title, paper.abstract);
    for (const keyword of keywords) {
      keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
    }
  }

  return { authors: authorFreq, keywords: keywordFreq };
}
```

**New code (apply identical pattern for tags):**
```typescript
private extractSignalsWithFrequency(seedPapers: ZoteroItem[]): SignalFrequencies {
  const tagFreq = new Map<string, number>();      // ← NEW
  const authorFreq = new Map<string, number>();
  const keywordFreq = new Map<string, number>();

  for (const paper of seedPapers) {
    // NEW: Extract tags
    for (const tag of paper.tags) {
      tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
    }

    // Existing: authors
    for (const author of paper.authors) {
      authorFreq.set(author, (authorFreq.get(author) || 0) + 1);
    }

    // Existing: keywords
    const keywords = extractKeywords(paper.title, paper.abstract);
    for (const keyword of keywords) {
      keywordFreq.set(keyword, (keywordFreq.get(keyword) || 0) + 1);
    }
  }

  return { tags: tagFreq, authors: authorFreq, keywords: keywordFreq };
}
```

**Why minimal change:** Identical frequency-counting loop for tags, just applied to `paper.tags` instead of `paper.authors`

### 3. AdaptiveLearner

**File:** `src/recommendations/adaptive-learner.ts`

**Changes:**
- When user accepts item: Increment tag weights in profile (same as authors)
- When user rejects item: Optionally decrease tag weights (same as authors)

**Existing pattern for authors (to copy):**
```typescript
learnFromAccept(item: ZoteroItem): void {
  const profile = this.profileService.getProfile();

  for (const author of item.authors) {
    const current = profile.authors.get(author) || 0;
    profile.authors.set(author, current + 1);
  }

  // ... similar for keywords ...
}
```

**New code (apply identical pattern for tags):**
```typescript
learnFromAccept(item: ZoteroItem): void {
  const profile = this.profileService.getProfile();

  // NEW: Update tags
  for (const tag of item.tags) {
    const current = profile.tags.get(tag) || 0;
    profile.tags.set(tag, current + 1);
  }

  // Existing: authors
  for (const author of item.authors) {
    const current = profile.authors.get(author) || 0;
    profile.authors.set(author, current + 1);
  }

  // Existing: keywords
  // ...
}
```

**Why minimal change:** Identical increment pattern, applied to tags

### 4. BatchService

**File:** `src/batch/batch-service.ts`

**Current state:** ProgressTracker already initialized at line 72

**Changes:** Add progress update calls during major phases

**Code already has skeleton:**
```typescript
async generateBatch(options: BatchOptions): Promise<Batch> {
  const progress = new ProgressTracker();  // ← ALREADY HERE

  try {
    progress.start('Filtering candidates...', 100); // ← ALREADY HERE, line 75

    // Filtering phase...
    progress.update(50, 'Scoring candidates...');   // ← ALREADY HERE, line 97

    // Scoring phase...
    progress.update(75, 'Selecting batch...');      // ← ALREADY HERE, line 125

    // Selection phase...
    progress.complete();                             // ← ALREADY HERE, line 140
```

**No code changes needed** — Progress tracking is already implemented in current v1.0 codebase! Just ensure it's being used.

## New Components (v1.1)

### None required for core tag extraction + UX polish

All v1.1 features integrate via **modifications to existing components** and **reuse of existing patterns**.

**Why no new components:**
- Tag extraction: Uses existing tag field in ZoteroItem (already populated by ZoteroConnector)
- Progress tracking: ProgressTracker component already exists and is being used
- Warning notices: Obsidian Notice API already used elsewhere in codebase
- Modal explanations: String templating, no component needed
- Tag scoring: Integrated into existing RecommendationEngine multi-signal scoring
- Tag learning: Integrated into existing AdaptiveLearner pattern

## Data Schema Changes

### ZoteroItem (No Changes ✓)

Already has tags field populated:
```typescript
export interface ZoteroItem {
  // ... existing fields ...
  tags: string[];      // ✓ Already exists, already populated
  // ... rest of fields ...
}
```

**Status:** Tags are extracted during ZoteroConnector.loadItems() via ITEM_TAGS_QUERY. No schema changes needed.

### UserProfile (No Breaking Changes)

```typescript
export interface UserProfile {
  tags: Map<string, number>;     // Already structured for Map<string, number>
  authors: Map<string, number>;  // existing
  keywords: Map<string, number>; // existing
  // ... rest of fields ...
}
```

**Change:** ProfileInitializer populates `profile.tags` during initialization. Previously may have been empty Map, now has tag frequencies from seed papers.

**Impact:** No schema migration needed. Empty Map deserializes fine, populated Map is backward compatible.

### Registry (No Changes ✓)

`RegistryEntry` and `Registry` unchanged. State machine remains: `unseen → proposed → [accepted|rejected|deferred] → imported`

## Build Order for v1.1 Implementation

**Dependency graph:**

```
1. RecommendationEngine (tag scoring)
   └─ Depends on: ZoteroItem.tags ✓ (already exists)

2. ProfileInitializer (tag extraction)
   └─ Depends on: RecommendationEngine ✓

3. AdaptiveLearner (learn from tag signals)
   └─ Depends on: ProfileInitializer ✓

4. BatchService (progress tracking)
   └─ Depends on: ProgressTracker ✓ (already exists)

5. ProfileInitializer updates (warning notices)
   └─ Depends on: Obsidian Notice API ✓ (already used)

6. OverrideModal updates (field explanations)
   └─ Depends on: ValidationService ✓ (already exists)
   └─ Independent, can run parallel
```

### Suggested Implementation Order

1. **RecommendationEngine.calculateTagScore()** — Core new scoring signal
   - Add method, wire into scoreItem()
   - Unit test with mock profiles containing tags
   - Estimated effort: 2-3 hours

2. **ProfileInitializer tag extraction** — Extract tags from seed papers
   - Add frequency counting for tags (copy keyword pattern, apply to tags)
   - Populate profile.tags during initialization
   - Estimated effort: 1-2 hours

3. **AdaptiveLearner tag learning** — Learn from user feedback
   - Increment tag weights on accept (copy author pattern, apply to tags)
   - Optional: decrement on reject
   - Estimated effort: 1 hour

4. **BatchService progress tracking** — Visual feedback during batch generation
   - Verify ProgressTracker calls are working
   - Add update() calls at filtering/scoring/selection phases
   - Estimated effort: 1 hour (mostly testing)

5. **ProfileInitializer warnings** — Alert user about empty profiles
   - Add validation check: `isProfileEmpty(profile)` method
   - Emit Notice if profile empty after seed extraction
   - Estimated effort: 30 minutes

6. **OverrideModal explanations** — Inline help text for validation errors
   - Create `fieldExplanations` Map
   - Render in modal when displaying validation errors
   - Estimated effort: 2 hours (design + implementation)

**Total estimated effort:** 7-10 hours for core features + testing

### Testing Checklist for v1.1

**RecommendationEngine:**
- [ ] scoreItems() includes tag signal in combined score
- [ ] Tag scores normalize correctly (0-1 range)
- [ ] Empty tag list doesn't cause NaN
- [ ] Tag weight configuration applies correctly

**ProfileInitializer:**
- [ ] Tags extracted from seed papers
- [ ] Tag frequencies counted correctly (tag in 3 papers = weight 3.0)
- [ ] Empty profile warning triggers when profile has no signals
- [ ] Warning doesn't block profile creation
- [ ] Empty profile doesn't crash batch generation (falls back to date sorting)

**AdaptiveLearner:**
- [ ] User accepting item with tag X increases profile.tags[X] weight
- [ ] Tag weights persist across Obsidian restarts
- [ ] Subsequent batches score higher for accepted tags
- [ ] Learning works with mixed (tag + author + keyword) profiles

**BatchService Progress:**
- [ ] Progress tracker updates during filtering (0% → 33%)
- [ ] Progress tracker updates during scoring (33% → 66%)
- [ ] Progress tracker updates during selection (66% → 100%)
- [ ] Progress bar renders correctly in Notice
- [ ] Long operations (5000+ items) don't freeze UI
- [ ] Percentage calculations are correct

**UX Enhancements:**
- [ ] Empty profile warning appears after seed selection
- [ ] Warning message is clear and actionable
- [ ] Override modal shows field explanations inline
- [ ] Explanations guide user to correct field in Zotero
- [ ] Explanations don't exceed modal width

## Risk Assessment

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Tag scoring weights overwhelm other signals | LOW | Tags weight = 1.0 (same as author weight), adjust post-release if needed | Configure |
| Empty profile edge case breaks batch gen | MEDIUM | ProfileInitializer validates, BatchService falls back to date sorting, test thoroughly | Test |
| Progress tracker calls too frequently | LOW | Update only on major phase changes (filter/score/select), not per-item | Design |
| Modal explanations outdated | LOW | Maintain as code comments, update when Zotero UI changes | Doc |
| Tag learning creates preference drift | LOW | Monitor user feedback, can reset profile, profile UI allows manual editing | Monitor |
| Null/undefined tag arrays crash scoring | LOW | Add defensive checks: `item.tags?.length > 0` before iteration | Code |

**No architectural blockers identified.** Tag extraction and UX enhancements fit naturally into existing v1.0 design.

## Comparison: v1.0 vs v1.1 Architecture

| Aspect | v1.0 | v1.1 | Change |
|--------|------|------|--------|
| **Scoring signals** | Authors, keywords, recency | Authors, keywords, **tags**, recency | +1 signal |
| **Profile initialization** | Authors + keywords from seeds | **Tags** + authors + keywords from seeds | +1 signal type |
| **Adaptive learning** | Authors + keywords | **Tags** + authors + keywords | +1 signal type |
| **Batch generation UI** | Silent processing | **Progress tracking with Notice** | +UX feature |
| **Validation feedback** | Error modal with list | Error modal + **field explanations** | +UX feature |
| **Empty profile handling** | Silent fallback to date sort | **Warning notice to user** | +UX feature |
| **Component count** | 11 major | 11 major | No change |
| **Service instances** | 8 service instances | 8 service instances | No change |
| **Database queries** | 6 SQL queries | 6 SQL queries | No change |
| **Lines of code** | ~7,324 LOC (v1.0) | ~7,500-7,700 LOC (est.) | +2-5% |

## Architecture Decisions Made

| Decision | Rationale | Alternative | Why Rejected |
|----------|-----------|-------------|-------------|
| Add tags to existing scoring engine, don't create separate service | Tags are one signal; existing multi-signal pattern scales | Separate TagScorer component | Adds unnecessary complexity |
| Extract tags during profile init same as authors/keywords | Consistent pattern, reuses frequency logic | Store tag weights separately in profile | Adds ambiguity, harder to maintain |
| Use ProgressTracker (existing component) | Already implemented, tested, used | Build new progress UI | Duplicate effort, less reliable |
| Emit Notice for empty profile | Non-blocking, user can continue | Modal (interrupts workflow) | More user-friendly |
| Add field explanations in OverrideModal as text | Inline context where user needs it | Separate help modal or tooltips | Adds friction to workflow |
| No schema version bump for v1.1 | Tags and UserProfile.tags are backward compatible | Add migration for version 2 | Unnecessary complexity |
| ProgressTracker calls per phase, not per-item | Balance between detail and performance | Update on every item scored | Too noisy, freezes UI more |

## Performance Implications

**Tag extraction:** Already chunked with 50-item batches in ZoteroConnector.loadItems(). Per-item tag query adds negligible overhead (SQLite is fast, typically 0-20 tags per item).

**Score calculation:** Adding tag score calculation adds 1-2ms per item (simple Map lookups). For 5000 items: ~5-10s total. Already visible with ProgressTracker.

**Progress tracking:** Rendering Notice updates is cheap (Obsidian optimized for this). Update every ~33% of batch = 3-6 updates per batch, no performance impact.

**Memory:** No new data structures beyond tag Maps in UserProfile. Typical profile: 10-100 tags, negligible memory.

**Worst case:** 5000 items × 20 tags/item = 100K tag entries = ~1MB memory (acceptable).

## Validation Against v1.0 Research

From `.planning/SUMMARY.md`:

| Finding | v1.1 Approach |
|---------|---------------|
| UI freezing during batch processing | ProgressTracker provides visual feedback, chunking unchanged (50 items/yield) |
| SQLite database locking | No new database access; ITEM_TAGS_QUERY already part of per-item load |
| Zotero schema changes | Tag query stable across Zotero 6.x/7.x, schema detection still applies |
| JSON state corruption | No change to debounced save pattern (2000ms) |
| Empty profile fallback | Now explicit warning instead of silent fallback |

All v1.1 changes validate against existing v1.0 constraints.

## Integration Points Checklist

- [x] Tag extraction: ZoteroItem.tags already populated ✓
- [x] Score calculation: RecommendationEngine pattern established ✓
- [x] Profile learning: AdaptiveLearner pattern established ✓
- [x] Progress tracking: ProgressTracker exists, wired to BatchService ✓
- [x] Warning notices: Obsidian Notice API established ✓
- [x] Modal enhancements: OverrideModal already handles rendering ✓
- [x] Data persistence: Settings.saveData() already handles Profile ✓
- [x] Dependency injection: All services accept deps in constructor ✓

## Sources

- [ZoteroConnector implementation](../../src/db/zotero-connector.ts) — Tags extracted at line 336-342
- [RecommendationEngine implementation](../../src/recommendations/recommendation-engine.ts) — Multi-signal pattern
- [ProfileInitializer implementation](../../src/profile/profile-initializer.ts) — Signal extraction from seeds
- [AdaptiveLearner implementation](../../src/recommendations/adaptive-learner.ts) — Learning from feedback
- [BatchService implementation](../../src/batch/batch-service.ts) — Batch generation with ProgressTracker
- [ProgressTracker implementation](../../src/performance/progress-tracker.ts) — Progress API in codebase
- [ValidationService implementation](../../src/validation/validation-service.ts) — Validation with error formatting
- [UserProfile types](../../src/profile/types.ts) — Profile structure with Map fields
- [ZoteroItem interface](../../src/db/zotero-connector.ts:37) — Item schema with tags field
- [PROJECT.md](../PROJECT.md) — v1.1 milestone requirements

---

**Conclusion:** v1.1 tag extraction and UX polish integrate cleanly into v1.0 architecture through component modifications and established pattern reuse. No structural changes needed. **No new services or architectural patterns required.** Estimated implementation effort: 7-10 hours for core features.
