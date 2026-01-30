---
phase: quick-013
plan: 01
subsystem: validation
tags: [validation, quality-gates, settings-ui, video-recordings, zod-schemas]

dependency-graph:
  requires:
    - quick-012: Database connection warning suppression
    - phase-03: Quality gate schemas and validation service
  provides:
    - Simplified validation settings UI aligned with actual behavior
    - Video recording validation support
    - Clear documentation of validation flow
  affects:
    - Future validation schema additions (follow hardcoded pattern)
    - Video recording item handling throughout plugin

tech-stack:
  added: []
  patterns:
    - Hardcoded Zod schemas (not dynamically configurable)
    - URL field extraction from Zotero database
    - Item type schema mapping pattern

key-files:
  created: []
  modified:
    - src/settings.ts: Removed non-functional per-field toggles, updated description
    - src/validation/schemas.ts: Added VideoRecordingSchema, design rationale comments
    - src/validation/validation-service.ts: Added validation flow documentation
    - src/validation/types.ts: Clarified DEFAULT_QUALITY_GATE_CONFIG not used for validation
    - src/db/queries.ts: Added URL field extraction to ITEMS_QUERY
    - src/db/zotero-connector.ts: Added url field to ZoteroItem interface and item construction
    - src/types.ts: Added url field to ZoteroItem type

decisions:
  - decision: Remove per-field validation configuration UI
    rationale: Settings UI showed toggles that had no effect on validation; schemas are intentionally hardcoded based on Phase 3 research
    impact: Users can no longer configure which fields are required per item type (but this never worked anyway)

  - decision: Keep validation rules hardcoded in Zod schemas
    rationale: Research-backed minimum viable metadata requirements; per-field config adds complexity without clear value
    impact: Future item types follow same pattern; users override via "Accept Anyway" for edge cases

  - decision: Add video recording validation for URL only
    rationale: URL validation is straightforward; child notes validation requires architectural changes
    impact: Video recordings validated for title and URL presence; child notes check deferred

  - decision: Document child notes validation as limitation
    rationale: Checking child item count requires database queries during item loading, not validation time
    impact: Future enhancement opportunity if user feedback indicates need

metrics:
  duration: 4h 37m
  tasks-completed: 3
  commits: 3
  files-modified: 7
  completed: 2026-01-30

---

# Quick Task 013: Verify Validation Settings Functionality - Summary

**One-liner:** Fixed settings UI to accurately reflect hardcoded validation rules, added video recording URL validation, and documented complete validation flow with design rationale

## What Was Built

### 1. Simplified Validation Settings UI (Tasks 1-2)

**Problem discovered:** Settings UI showed individual field toggles for journal articles and books (lines 83-148 in settings.ts), but these had **zero effect** on validation behavior. The actual validation rules are hardcoded in Zod schemas and never read from `settings.qualityGate.rules.requiredFields`.

**Solution implemented:**
- Removed 66 lines of non-functional UI code (field-level toggles)
- Updated toggle description to explicitly list actual required fields enforced by schemas
- Added comprehensive documentation explaining why schemas are intentionally hardcoded
- Clarified that `DEFAULT_QUALITY_GATE_CONFIG.requiredFields` kept for backward compatibility only

**Impact:** Users now see accurate UI that matches actual validation behavior. No false impression of configurability.

### 2. Video Recording Validation (Task 3 - New Requirement)

**User requirement:** Validate video recording items require URL field populated (and ideally child notes, but that's deferred).

**Implementation:**
- Added URL field extraction to `ITEMS_QUERY` SQL query
- Updated `ZoteroItem` interface in 3 files to include `url: string | null`
- Created `VideoRecordingSchema` with title and URL validation
- Registered schema in `ITEM_TYPE_SCHEMAS` mapping
- Updated settings description to include "Video recordings (title, URL)"

**Limitation documented:** Child notes validation cannot be done at schema level (requires database query for child items). Documented in code comments as potential future enhancement at import time rather than validation time.

### 3. Comprehensive Validation Documentation

**Added to `validation-service.ts`:**
- Complete validation flow (batch load → card render → override modal)
- Current behavior with toggle enabled vs disabled
- Step-by-step testing instructions for users
- Design rationale for hardcoded schemas

**Result:** Future maintainers and users can understand exactly how validation works without reverse-engineering code.

## Validation Flow (Documented)

```
1. triage-view.ts (lines 157-175): Batch loads
   → If qualityGate.enabled: validate all items
   → Show aggregated Notice: "Validation: 2x Missing doi, 1x Missing url"

2. triage-card.ts (line 95): Render cards
   → Invalid items: "Accept Anyway" button
   → Valid items: "Accept" button

3. triage-view.ts (lines 460-478): User clicks Accept/Accept Anyway
   → Re-validate item
   → If invalid: show OverrideConfirmModal with missing fields list
   → User can confirm override or cancel

4. validation-service.ts (lines 73-82): validate() method
   → If !config.enabled: return valid immediately
   → Get schema from ITEM_TYPE_SCHEMAS[itemType]
   → No schema = allow through (unknown types valid)
   → Validate with Zod, return structured errors

5. schemas.ts: Hardcoded Zod schemas
   → JournalArticleSchema: title, authors, journal, year, doi, abstract
   → BookSchema: title, authors, year, publisher, isbn
   → VideoRecordingSchema: title, url
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added video recording validation**
- **Found during:** Checkpoint (user requirement)
- **Issue:** No validation for video recording items; user needs URL validation
- **Fix:** Added URL field extraction, created VideoRecordingSchema, updated settings UI
- **Files modified:** src/db/queries.ts, src/db/zotero-connector.ts, src/types.ts, src/validation/schemas.ts, src/settings.ts
- **Commit:** 8470d3c

**Rationale:** User has video recordings in library and needs quality gates for them. Adding URL validation is critical for user's workflow (they summarize videos as child notes, URL needed for reference).

## Technical Details

### Schema Design Pattern

All validation schemas follow this pattern:

```typescript
export const ItemTypeSchema = z.object({
  // Required fields: .min(1) with error message
  field: z.string().min(1, 'Field is required').nullable(),

  // Required arrays: .min(1) for "at least one"
  authors: z.array(z.string()).min(1, 'At least one author required'),

  // Optional fields: .nullable().optional()
  optionalField: z.string().nullable().optional()
});
```

**Why `.nullable()`?** Zotero's EAV schema returns `NULL` for missing fields. Zod requires explicit `.nullable()` to accept `null` values.

**Why `.min(1)` instead of `.nonempty()`?** Better error messages for users.

### URL Field Extraction

**SQL change in queries.ts:**
```sql
MAX(CASE WHEN fieldName = 'url' THEN value END) AS url
```

**Added to column index mapping in zotero-connector.ts:**
```typescript
url: columns.indexOf('url')
```

**Added to item construction:**
```typescript
url: row[colIndex.url] as string | null
```

**Type safety:** TypeScript ensures `url` field propagates through entire system.

## Testing Validation

User verified (checkpoint approved):

1. ✅ Settings UI shows only "Block incomplete items" toggle (no field checkboxes)
2. ✅ Description lists actual required fields for all item types
3. ✅ Journal article missing DOI triggers validation warning
4. ✅ "Accept Anyway" button appears for invalid items
5. ✅ OverrideConfirmModal shows specific missing fields
6. ✅ Video recording missing URL triggers validation warning
7. ✅ Disabling toggle bypasses all validation (no warnings, normal Accept button)

**Result:** Validation working correctly across all item types.

## Known Limitations

### Child Notes Validation (Deferred)

**User requirement:** Video recordings should require "at least one child note must exist"

**Why not implemented:**
- Current architecture loads items without child item counts
- Would require additional SQL query joining `itemNotes` table with `parentItemID`
- Validation happens on in-memory item objects, not during database loading
- Adding child count to `ZoteroItem` interface would require updating batch generation, caching, etc.

**Documented location:** `src/validation/schemas.ts` (VideoRecordingSchema comment)

**Future approach if needed:**
1. Add child note count extraction during `loadItems()` in zotero-connector
2. Add `childNoteCount: number` to `ZoteroItem` interface
3. Update `VideoRecordingSchema` to validate `childNoteCount >= 1`
4. Or implement as import-time check (separate from quality gate validation)

**User impact:** Video recordings only validated for URL presence. User must manually ensure they've added summary notes before importing.

## Next Phase Readiness

**Unblocked capabilities:**
- ✅ Add new item type schemas (follow `VideoRecordingSchema` pattern)
- ✅ Validation UI accurately reflects actual behavior
- ✅ Users understand which fields are required and why

**No blockers identified.**

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| src/settings.ts | Refactor | Removed 66 lines of non-functional field toggle UI |
| src/validation/schemas.ts | Feat + Docs | Added VideoRecordingSchema, design rationale comments |
| src/validation/validation-service.ts | Docs | Added comprehensive validation flow documentation |
| src/validation/types.ts | Docs | Clarified DEFAULT_QUALITY_GATE_CONFIG not used |
| src/db/queries.ts | Feat | Added URL field extraction to ITEMS_QUERY |
| src/db/zotero-connector.ts | Feat | Added url field to interface and item construction |
| src/types.ts | Feat | Added url field to ZoteroItem type |

## Lessons Learned

1. **Always trace configuration to usage** - Settings UI showed configuration that was completely ignored by actual validation logic. This caused user confusion about whether validation was working.

2. **Document design decisions in code** - Added comments explaining *why* schemas are hardcoded (research-backed requirements, avoid complexity). Future maintainers won't second-guess the approach.

3. **Validation architecture has boundaries** - Child notes validation bumps against current architecture's assumption that validation operates on flat item objects. Would need schema changes to support relational validation.

4. **User feedback reveals real usage patterns** - User has video recordings in library (not just academic papers). Plugin should support diverse Zotero item types.

## User Impact

**Before this task:**
- Settings UI showed field toggles that didn't work
- User confused why validation settings seemed to have no effect
- Video recordings had no validation

**After this task:**
- Settings UI shows only what actually works (global toggle)
- Clear description of which fields are required for each item type
- Video recordings validated for URL presence
- Complete documentation for understanding/testing validation

**User satisfaction:** ✅ Approved at checkpoint
