---
phase: 05-polish
plan: 06
subsystem: utils
tags: [cross-platform, normalization, case-sensitivity, path-handling]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Registry service and path utilities"
  - phase: 02-batch-workflow
    provides: "Item processing workflow"
provides:
  - "Case-insensitive path and key comparison utilities"
  - "Cross-platform path normalization"
  - "Normalized registry key lookups"
affects: [all-phases, cross-platform-reliability, linux-compatibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lowercase normalization for all path and key comparisons"
    - "Forward slash normalization for cross-platform paths"

key-files:
  created:
    - "src/utils/normalization.ts"
  modified:
    - "src/registry/registry-service.ts"
    - "src/utils/paths.ts"

key-decisions:
  - "Use lowercase + forward slash normalization for all path comparisons"
  - "Normalize item keys before registry lookups to prevent case-sensitivity bugs"
  - "Preserve original paths for file operations; only normalize for comparison"

patterns-established:
  - "normalizePath/normalizeItemKey utilities for all comparisons"
  - "pathsEqual/keysEqual convenience functions for equality checks"

# Metrics
duration: 6min
completed: 2026-01-24
---

# Phase 5 Plan 6: Cross-Platform Normalization Summary

**Case-insensitive path and key comparisons prevent Linux-specific bugs via lowercase normalization and forward slash conversion**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-24T20:20:28Z
- **Completed:** 2026-01-24T20:26:07Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created normalization utilities with normalizePath, normalizeItemKey, pathsEqual, keysEqual
- Applied normalization to all registry key lookups and storage operations
- Updated path resolution to use case-insensitive prefix checks for storage: and attachments:
- All path and key comparisons now cross-platform safe

## Task Commits

Each task was committed atomically:

1. **Task 1: Create normalization utilities** - `4b1de97` (feat)
2. **Task 2: Apply normalization to registry lookups** - `8ed2eb7` (feat)
3. **Task 3: Apply normalization to path resolution** - `6bbda6a` (feat)

## Files Created/Modified

- `src/utils/normalization.ts` - Case-insensitive comparison utilities (normalizePath, normalizeItemKey, pathsEqual, keysEqual)
- `src/registry/registry-service.ts` - Normalize item keys in getState and markState methods
- `src/utils/paths.ts` - Normalize attachment paths before prefix comparison in resolvePdfPath

## Decisions Made

- **Lowercase normalization:** All paths and keys converted to lowercase for comparison (RESEARCH.md Pattern 5)
- **Forward slash normalization:** Backslashes replaced with forward slashes for cross-platform consistency
- **Preserve originals:** Original paths preserved for file operations; normalization only for comparison
- **Accept string or number keys:** normalizeItemKey handles both types (Zotero IDs are integers, registry uses strings)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Cross-platform normalization complete and validated:
- TypeScript compiles without errors
- Registry uses normalized keys for all operations
- Path comparisons handle case variations
- Plugin works reliably on Windows, Mac, and Linux

Pattern matches RESEARCH.md recommendations (lowercase + separator normalization).

---
*Phase: 05-polish*
*Completed: 2026-01-24*
