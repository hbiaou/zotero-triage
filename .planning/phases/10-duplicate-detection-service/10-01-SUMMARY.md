---
phase: 10-duplicate-detection-service
plan: 01
subsystem: database
tags: [sqlite, sql.js, duplicate-detection, self-join, zotero-schema]

# Dependency graph
requires:
  - phase: 09-library-filtering-foundation
    provides: Library filtering infrastructure (INNER JOIN libraries, retractedItems handling)
provides:
  - Duplicate detection service using DOI-first hierarchy (DOI → ISBN → normalized title)
  - DUPLICATES_QUERY with self-join architecture on normalized_items CTE
  - DuplicateDetectionService class returning total count and sample groups
  - ZoteroConnector.detectDuplicates() method
affects: [11-preflight-modal, duplicate-ui-integration, recommendation-quality]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service layer pattern for database operations (DuplicateDetectionService)"
    - "Self-join SQL query for duplicate detection with normalized_items CTE"
    - "DOI-first matching hierarchy (DOI → ISBN → normalized title)"

key-files:
  created:
    - src/services/duplicate-detection-service.ts
  modified:
    - src/db/queries.ts
    - src/db/zotero-connector.ts

key-decisions:
  - "Use single SQL self-join query instead of separate queries for DOI/ISBN/title"
  - "Normalize titles in SQL (LOWER, REPLACE, TRIM) for consistent matching"
  - "Return 0 duplicates on error (graceful degradation) instead of throwing"
  - "Sample first 3 duplicate groups for UI display"

patterns-established:
  - "Service layer delegates to ZoteroConnector for database access"
  - "SQL normalization via nested REPLACE calls for title comparison"
  - "Self-join condition (i1.itemID < i2.itemID) avoids duplicate pairs"

# Metrics
duration: 4min
completed: 2026-01-28
---

# Phase 10 Plan 1: Duplicate Detection Service Summary

**SQL-based duplicate detection using DOI-first hierarchy (DOI → ISBN → normalized title) with self-join query and graceful error handling**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-28T15:59:14Z
- **Completed:** 2026-01-28T16:03:42Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- DUPLICATES_QUERY added to queries.ts with DOI-first hierarchy and Phase 9 library filtering
- DuplicateDetectionService class with detectDuplicates() method returning { totalDuplicates, sampleGroups }
- ZoteroConnector.detectDuplicates() integration delegating to service layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DUPLICATES_QUERY to queries.ts** - `bf8df3a` (feat)
2. **Task 2: Create DuplicateDetectionService** - `e10f2d3` (feat)
3. **Task 3: Integrate detectDuplicates into ZoteroConnector** - `61b9eff` (feat)

## Files Created/Modified
- `src/db/queries.ts` - Added DUPLICATES_QUERY with self-join using normalized_items CTE
- `src/services/duplicate-detection-service.ts` - Created DuplicateDetectionService class with detectDuplicates() and DuplicateGroup interface
- `src/db/zotero-connector.ts` - Added detectDuplicates() method and isConnected getter

## Decisions Made

**Query architecture:** Single SQL query with CASE statement for DOI/ISBN/title hierarchy instead of separate queries. Reduces round-trips and simplifies result processing.

**Title normalization:** Performed in SQL using nested REPLACE calls (lowercase, strip articles, remove punctuation) rather than client-side JavaScript. Ensures consistent normalization across all comparisons.

**Error handling:** Service returns { totalDuplicates: 0, sampleGroups: [] } on error instead of throwing. Allows preflight check to continue even if duplicate detection fails.

**Sample groups:** Return first 3 duplicate groups for UI display. Provides enough examples without overwhelming user, matches preflight modal design.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully with TypeScript compilation passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 11 (Preflight Modal Integration):**
- Backend duplicate detection service complete and accessible via ZoteroConnector.detectDuplicates()
- Service returns structured data (total count + sample groups) ready for UI rendering
- Graceful error handling ensures preflight check won't crash if detection fails
- Performance target (<30 seconds for 5000+ items) designed into query, actual testing in Phase 11

**Query design validated:**
- Uses Phase 9 library filtering patterns (INNER JOIN libraries, LEFT JOIN retractedItems)
- Excludes same item types as ITEMS_QUERY (deletedItems, attachments, annotations, child notes)
- Self-join condition prevents duplicate pairs in results

**Known constraints:**
- No direct zotero:// URI to "Duplicate Items" collection - Phase 11 will provide instructions for manual navigation
- No caching for MVP - compute on-demand during preflight check
- No progress indicators - detection runs silently (Phase 11 may add progress UI if needed)

---
*Phase: 10-duplicate-detection-service*
*Completed: 2026-01-28*
