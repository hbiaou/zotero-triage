---
task: "005"
type: quick
subsystem: database
tags: [zotero-connector, preflight, async, error-handling]

# Dependency graph
requires:
  - task: "004"
    provides: Preflight check failure handling (skip vs reopen)
provides:
  - Database connection timing fixes for preflight checks
  - Async initialization pattern for wizard entry points
affects: [wizard-initialization, settings-panel, database-connection]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-connection-pattern, graceful-degradation]

key-files:
  created: []
  modified: [src/main.ts, src/settings.ts]

key-decisions:
  - "Make showSetupWizard async to properly await database connection"
  - "Replace fire-and-forget ensureConnectorInitialized() with await ensureConnected()"
  - "Add graceful degradation: skip preflight and show wizard if connection fails"

patterns-established:
  - "All wizard entry points must await ensureConnected() before creating PreflightModal"
  - "Connection errors show notice and proceed to wizard (disconnected state) rather than blocking"

# Metrics
duration: 2min
completed: 2026-01-29
---

# Quick Task 005: Fix Database Connection Errors During Preflight

**Async connection pattern ensures database is ready before preflight checks execute, eliminating "Database not connected" errors**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-29T23:20:48Z
- **Completed:** 2026-01-29T23:23:16Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Fixed race condition where preflight checks ran before database connection completed
- Made showSetupWizard async and await database connection
- Updated both settings panel button handlers with consistent async pattern
- Added graceful error handling for connection failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Make showSetupWizard async and await connection** - `09e3ec6` (fix)
2. **Task 2: Update settings panel buttons to await connection** - `8146e0d` (fix)
3. **Task 3: Test connection flow and preflight checks** - `3fa1b21` (test)

## Files Modified
- `src/main.ts` - Changed showSetupWizard() from sync void to async Promise<void>, replaced ensureConnectorInitialized() with await ensureConnected(), added try-catch for connection errors
- `src/settings.ts` - Updated both "Run Setup Wizard" and "Reconfigure Profile" button handlers to await ensureConnected() before creating PreflightModal

## Decisions Made

1. **Make showSetupWizard async instead of keeping it sync**
   - Rationale: Already had 1000ms delay, async is appropriate. Allows proper await of connection.

2. **Replace ensureConnectorInitialized() with await ensureConnected()**
   - Rationale: ensureConnectorInitialized() was fire-and-forget workaround for sync contexts. Now that contexts are async, use proper async method with guarantees.

3. **Graceful degradation on connection failure**
   - Rationale: Show notice and proceed to wizard in disconnected state rather than completely blocking user. Maintains wizard accessibility even if database unavailable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed smoothly with no blocking issues.

## Next Phase Readiness

- Database connection timing issue resolved
- Preflight checks will now execute with proper database connectivity
- Pattern established for all async wizard entry points

---
*Task: 005*
*Completed: 2026-01-29*
