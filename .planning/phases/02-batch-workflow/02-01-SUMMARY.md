---
phase: 02-batch-workflow
plan: 01
subsystem: workflow
tags: [batch-processing, registry, state-management, settings, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: ZoteroConnector with getCachedItems, RegistryService with state tracking, settings infrastructure
provides:
  - BatchService for generating batches of items based on registry state
  - Deferred state in registry for items postponed by user
  - Batch size configuration in settings (1-20, default 5)
  - getAllEntries method for velocity calculations
affects: [02-02, 02-03, 02-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [Batch generation with state filtering, Deferred item fallback]

key-files:
  created:
    - src/batch/types.ts
    - src/batch/batch-service.ts
  modified:
    - src/types.ts
    - src/registry/types.ts
    - src/registry/registry-service.ts
    - src/settings.ts

key-decisions:
  - "Default batch size: 5 items (conservative starting point)"
  - "Most recent items first (sort by dateAdded descending)"
  - "Deferred state distinct from rejected (allows re-including in batches)"
  - "getAllEntries method returns array of { id, entry } for velocity calculations"

patterns-established:
  - "Batch generation filters by registry state before sorting"
  - "includeDeferred option controls whether deferred items can fill batches"
  - "Selected items marked as 'proposed' when batch is generated"

# Metrics
duration: 65min
completed: 2026-01-23
---

# Phase 02 Plan 01: Batch Generation Infrastructure Summary

**BatchService generates configurable batches of recent Zotero items, respecting registry state with deferred item fallback**

## Performance

- **Duration:** 65 min (1h 5m)
- **Started:** 2026-01-23T12:04:48Z
- **Completed:** 2026-01-23T13:10:10Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- BatchService generates batches of N items sorted by dateAdded (most recent first)
- Deferred state added to registry type system with stats tracking
- Batch size configurable via settings slider (1-20, default 5)
- getAllEntries method enables future velocity calculations (Plan 02-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create batch types and service** - `aa288f6` (feat)
2. **Task 2: Add deferred state and getAllEntries to registry** - `95be11b` (feat)
3. **Task 3: Add batch size setting** - `ee6303d` (feat)

## Files Created/Modified

### Created
- `src/batch/types.ts` - BatchOptions and Batch interfaces
- `src/batch/batch-service.ts` - BatchService class with generateBatch, utility methods

### Modified
- `src/types.ts` - Added 'deferred' to RegistryState, batchSize to settings
- `src/registry/types.ts` - Added deferred field to RegistryStats
- `src/registry/registry-service.ts` - Added getAllEntries method, updated getStats for deferred count
- `src/settings.ts` - Added Batch Settings section with size slider

## Decisions Made

1. **Default batch size: 5 items** - Conservative starting point to encourage regular small sessions without overwhelming users (per CONTEXT.md)
2. **Most recent items first** - Sort by dateAdded descending to prioritize recently added items (per CONTEXT.md)
3. **Deferred state distinct from rejected** - Allows deferred items to be re-included in future batches when needed
4. **getAllEntries returns { id, entry } array** - Enables velocity calculations in Plan 02-03 by providing full registry access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks implemented smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 02-02 (Card UI Implementation):**
- BatchService can generate batches of items
- Registry supports all required states (unseen, proposed, accepted, rejected, deferred, imported)
- Settings provide batch size configuration
- getAllEntries method ready for velocity dashboard (Plan 02-03)

**No blockers.**

**Next step:** Implement card-based UI for triage with Accept/Reject/Defer actions.

---
*Phase: 02-batch-workflow*
*Completed: 2026-01-23*
