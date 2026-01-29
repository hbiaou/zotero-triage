---
phase: 11-preflight-modal-&-integration
plan: 01
subsystem: onboarding
tags: [preflight, health-check, modal, ui, advisory]
requires: [10-01]
provides:
  - PreflightService for sequential health checks
  - PreflightModal for color-coded advisory display
  - SQL queries for trash and group library detection
affects: [11-02]
tech-stack:
  added: []
  patterns:
    - Sequential async checks with progress callbacks
    - Color-coded severity UI (critical/warning/info)
    - Graceful degradation for database errors
    - Zotero 6/7 compatibility via table existence check
key-files:
  created:
    - src/services/preflight-service.ts
    - src/ui/preflight-modal.ts
  modified:
    - src/db/queries.ts
    - styles.css
decisions:
  - decision: Sequential check execution (trash → duplicates → groups)
    rationale: UI simplicity for progress messages, database load distribution, predictable timing for timeout
    alternatives: Parallel execution (rejected for complexity)
    impacts: [11-02]
  - decision: Color-coded severity (red/yellow/blue)
    rationale: PatternFly standards, visual hierarchy for different issue types
    alternatives: Single warning color (rejected for less clarity)
    impacts: [ui-consistency]
  - decision: Zotero 6/7 compatibility via sqlite_master table check
    rationale: Graceful degradation for deletedItems table that may not exist
    alternatives: Version-specific queries (rejected for added complexity)
    impacts: [compatibility]
metrics:
  duration: 6 minutes
  completed: 2026-01-29
---

# Phase 11 Plan 01: Preflight Service & Modal Summary

**One-liner:** Sequential health check service with color-coded advisory modal for trash/duplicates/groups before onboarding

## What Was Built

Created PreflightService and PreflightModal to display library health warnings before user profile creation.

**PreflightService (src/services/preflight-service.ts):**
- Sequential health check orchestration (trash → duplicates → groups)
- Progress callbacks for UI updates ("Checking for trash...", etc.)
- Graceful error handling (returns 0 counts on error, never throws)
- Zotero 6/7 compatibility via deletedItems table existence check
- Exports PreflightCheckResult interface with trash/duplicate/group data

**PreflightModal (src/ui/preflight-modal.ts):**
- Color-coded advisory cards: red (duplicates), yellow (trash), blue (groups)
- Exact count display ("47 items in trash" not ranges)
- Progress spinner with sequential check updates
- 15-second timeout message for large libraries
- "Skip Preflight" button to bypass checks entirely
- "I Understand" acknowledgment button to proceed
- onClose override prevents accidental Escape key dismissal
- Catastrophic error handling with "Continue Anyway" bypass

**SQL Queries (src/db/queries.ts):**
- TRASH_COUNT_QUERY: Count deletedItems for personal library
- GROUP_LIBRARY_QUERY: Check for non-user libraries (groups, feeds)

**CSS Styling (styles.css):**
- Severity color styling (critical/warning/info)
- Advisory card layout with left border indicators
- Progress spinner animation
- Skip button positioning (top-right corner)

## Key Design Decisions

**Sequential vs Parallel Execution:**
Chose sequential check execution over parallel for:
- UI simplicity: progress messages update clearly ("Checking for trash..." → "Checking for duplicates...")
- Database load distribution: avoids simultaneous query load
- Predictable timing: 15-second timeout logic easier to reason about

**Color-Coded Severity Levels:**
Implemented PatternFly-inspired severity system:
- Red (critical): Duplicates - most impactful to workflow
- Yellow (warning): Trash - affects accuracy but not blocking
- Blue (info): Group libraries - informational only

**Graceful Degradation Philosophy:**
All checks return 0 counts on error rather than throwing:
- Trash check: If deletedItems table missing (Zotero 6 compatibility), return 0
- Duplicate check: If detection fails, return empty array
- Group library check: If query fails, assume no groups

This non-blocking design ensures preflight never prevents onboarding.

**Skip Capability:**
Per ROADMAP.md requirement PREFLIGHT-07, users can skip preflight entirely:
- Skip button visible throughout (during checks and results)
- No mandatory acknowledgment - user controls flow
- Supports power users who want to bypass health check

## Implementation Notes

**Zotero 6/7 Compatibility:**
The deletedItems table exists in both versions, but PreflightService checks for table existence before querying using sqlite_master. This follows the defensive pattern established in Phase 9 for retractedItems.

**Progress Callback Pattern:**
PreflightService accepts optional ProgressCallback parameter:
```typescript
await service.executePreflightChecks((message) => {
  this.updateProgress(message);
});
```
This enables real-time UI updates during long-running checks.

**15-Second Timeout:**
Modal sets setTimeout for 15 seconds. If checks still running, shows message:
"Large library detected. This may take up to a minute..."
This prevents user confusion during slow duplicate detection on 5000+ item libraries.

**Error Handling Hierarchy:**
1. Per-check errors: Populate *Error fields in PreflightCheckResult, continue to next check
2. Catastrophic errors: Display "Continue Anyway" bypass screen
3. User can always skip preflight entirely via Skip button

**Messaging Tone:**
Per CONTEXT.md guidance, uses direct & actionable directives:
- "In Zotero, go to Trash collection to review and empty" (not "Consider reviewing trash")
- "In Zotero, go to Duplicate Items in left sidebar to merge" (clear path to action)

## Testing Notes

**Manual Testing Required:**
- Large library (5000+ items) to verify timeout message appears
- Zotero 6.x database to verify deletedItems table check works
- Database with actual trash items (manually delete items in Zotero)
- Database with duplicate items (import same paper twice with different metadata)
- Database with group libraries (join or create Zotero group)

**Error Scenarios to Test:**
- Disconnected database during checks (should show catastrophic error)
- Corrupted deletedItems table (should return 0 trash)
- Duplicate detection timeout (should populate duplicateError field)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Phase 11 Plan 02 (Preflight Integration):**
Ready to integrate. PreflightModal needs to be called from setup wizard before profile creation:

```typescript
// In setup-wizard-modal.ts, before showing seed paper picker:
const preflightModal = new PreflightModal(
  this.app,
  this.connector,
  new DuplicateDetectionService(this.connector),
  () => {
    // Proceed to seed papers step
    this.currentStep = 'seed-papers';
    this.renderStep();
  }
);
preflightModal.open();
```

**No blockers identified.**

## Commits

| Commit | Type | Description | Files |
|--------|------|-------------|-------|
| 390d057 | feat | PreflightService with sequential health checks | src/services/preflight-service.ts, src/db/queries.ts |
| ea34be9 | feat | PreflightModal with color-coded severity display | src/ui/preflight-modal.ts, styles.css |

## Files Modified

**Created:**
- src/services/preflight-service.ts (209 lines)
- src/ui/preflight-modal.ts (339 lines)

**Modified:**
- src/db/queries.ts (+26 lines: TRASH_COUNT_QUERY, GROUP_LIBRARY_QUERY)
- styles.css (+175 lines: preflight advisory styling, severity colors)

## Dependencies

**Imports:**
- ZoteroConnector (existing Phase 1)
- DuplicateDetectionService (Phase 10)
- Obsidian Modal (framework)

**Exports:**
- PreflightService class
- PreflightCheckResult interface
- ProgressCallback type
- PreflightModal class

## Metrics

**Execution Time:** 6 minutes
**Lines Added:** 749 lines (209 service + 339 modal + 26 queries + 175 CSS)
**Commits:** 2
**Files Created:** 2
**Files Modified:** 2

**Complexity:**
- Low: Sequential async logic with progress callbacks
- Medium: Color-coded UI with severity levels
- Low: SQL queries for trash and group library detection

## Success Criteria Met

- [x] PreflightService orchestrates sequential health checks (trash → duplicates → groups)
- [x] PreflightService calls progress callback before each check with descriptive message
- [x] PreflightService checks for deletedItems table existence (Zotero 6 vs 7 compatibility)
- [x] PreflightCheckResult interface captures all check results and errors
- [x] PreflightModal displays color-coded advisories (red for duplicates, yellow for trash, blue for info)
- [x] Modal shows exact counts ("47 items in trash" not ranges)
- [x] Modal updates progress message during checks ("Checking for trash...", etc.)
- [x] "Skip Preflight" button visible throughout, bypasses check entirely
- [x] Escape key prevented from dismissing modal via onClose override
- [x] 15-second timeout message appears if checks run long
- [x] "I Understand" button closes modal and calls onComplete callback
- [x] Catastrophic errors show "Continue Anyway" bypass option
- [x] CSS styling provides visual distinction between severity levels
- [x] All code compiles without TypeScript errors
