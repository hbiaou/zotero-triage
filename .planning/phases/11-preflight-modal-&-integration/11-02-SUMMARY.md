---
phase: 11-preflight-modal-&-integration
plan: 02
subsystem: onboarding
tags: [preflight, integration, setup-wizard, first-run, settings]
requires: [11-01]
provides:
  - PreflightModal integration in main.ts startup flow
  - PreflightModal integration in settings panel wizard triggers
  - ensureConnectorInitialized() method for sync contexts
affects: [12-*]
tech-stack:
  added: []
  patterns:
    - Callback-based modal sequencing (preflight → wizard)
    - Lazy connector initialization for sync contexts
    - Inline callback wrapping for isolated button handlers
key-files:
  created: []
  modified:
    - src/main.ts
    - src/settings.ts
decisions:
  - decision: Extract openSetupWizardAfterPreflight() method in main.ts
    rationale: Separate method for clarity, reusability, and testability of wizard callback logic
    alternatives: Inline wizard creation in preflight callback (rejected for readability)
    impacts: [code-organization]
  - decision: Inline wizard creation in settings.ts button handlers
    rationale: Each button handler is already isolated, no shared state, inlining keeps triggers explicit
    alternatives: Extract to helper method (deferred to future refactoring)
    impacts: [code-duplication]
  - decision: ensureConnectorInitialized() as fire-and-forget async wrapper
    rationale: PreflightModal needs connector but called from sync context, modal handles connection errors gracefully
    alternatives: Make showSetupWizard async (rejected for broader refactoring scope)
    impacts: [error-handling]
metrics:
  duration: 4 minutes
  completed: 2026-01-29
---

# Phase 11 Plan 02: Preflight Integration Summary

**One-liner:** PreflightModal wired into all setup wizard entry points (startup, settings) for health check before onboarding

## What Was Built

Integrated PreflightModal into plugin startup and settings panel flows so users see library health warnings before profile creation.

**main.ts Integration:**
- Modified `showSetupWizard()` to create PreflightModal before SetupWizardModal
- Extracted `openSetupWizardAfterPreflight()` method with wizard callback logic
- Added `ensureConnectorInitialized()` for sync-context connector initialization
- PreflightModal's `onComplete` callback triggers wizard after acknowledgment

**settings.ts Integration:**
- Wrapped "Run Setup Wizard" button (initial profile) with PreflightModal
- Wrapped "Re-run Wizard" button (reconfigure profile) with PreflightModal
- Preserved existing wizard callback logic (profile initialization, settings updates, notices)
- Both settings triggers now show preflight-first flow

**Connector Initialization:**
- `ensureConnectorInitialized()` fires async `ensureConnected()` without waiting
- PreflightModal handles connection errors gracefully (catastrophic error screen)
- Avoids making `showSetupWizard()` async to minimize refactoring scope

## Key Design Decisions

**Extracted Method vs Inline Callbacks:**
main.ts uses extracted `openSetupWizardAfterPreflight()` method for clarity and reusability, while settings.ts inlines wizard creation in preflight callbacks because:
- Each button handler is already isolated (no shared state)
- Inlining keeps the two wizard triggers explicit and separate
- Future refactoring could extract to helper method if needed

**Sync vs Async Connector Initialization:**
Created `ensureConnectorInitialized()` as fire-and-forget wrapper rather than making `showSetupWizard()` async because:
- PreflightModal already handles connection errors gracefully
- Avoids broader refactoring of first-run flow timing
- Connector initialization can happen asynchronously while modal renders

**Callback Sequencing Pattern:**
PreflightModal → onComplete callback → SetupWizardModal follows established Obsidian modal pattern:
- User acknowledges preflight warnings
- Modal closes and calls onComplete
- onComplete immediately opens wizard
- Seamless transition from health check to profile setup

## Implementation Notes

**Three Entry Points for Wizard:**
1. **First-run startup** (main.ts line 364): Triggered when no profile exists
2. **Settings "Run Setup Wizard"** (settings.ts line 282): Initial profile creation
3. **Settings "Re-run Wizard"** (settings.ts line 322): Profile reconfiguration

All three now show PreflightModal first, ensuring consistent health check flow.

**Preserved Wizard Callback Logic:**
The async callbacks inside SetupWizardModal constructors were copied verbatim, ensuring:
- Profile initialization via profileInitializer.initializeProfile()
- Settings updates and persistence
- Success/skip notices
- Settings panel refresh after profile creation

**Error Handling Flow:**
1. User clicks wizard trigger
2. ensureConnectorInitialized() fires async connection
3. PreflightModal opens immediately (doesn't wait for connection)
4. If connection fails, PreflightService returns errors
5. PreflightModal shows "Continue Anyway" bypass
6. User can proceed to wizard despite preflight failure

**Skip vs Acknowledge:**
Users can bypass preflight in two ways:
1. **Skip Preflight button**: Immediately proceeds to wizard without running checks
2. **I Understand button**: Acknowledges health warnings after viewing results

Both trigger the same onComplete callback → wizard opens.

## Testing Notes

**Manual Testing Required:**
- First-run startup (delete existing profile, reload plugin)
- Settings "Run Setup Wizard" button (ensure preflight appears)
- Settings "Re-run Wizard" button (ensure preflight appears)
- Skip preflight button (should open wizard immediately)
- I Understand button (should open wizard after viewing results)
- Connection error during preflight (should show "Continue Anyway")

**Verification Scenarios:**
- Preflight modal appears before wizard in all three entry points
- Clicking "I Understand" immediately opens wizard
- Clicking "Skip Preflight" immediately opens wizard
- Wizard callback logic works (profile created, settings updated, notices shown)
- Settings panel refreshes after profile creation

**Error Scenarios:**
- Database not configured: PreflightModal should show catastrophic error
- Database connection fails: Should show "Continue Anyway" bypass
- Preflight checks fail: Should populate error advisories but allow continuation

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Phase 12 (Final Polish & Documentation):**
Ready to proceed. Preflight integration completes Phase 11 implementation.

**No blockers identified.**

Preflight modal now appears before setup wizard in all entry points:
- First-run startup ✓
- Settings panel initial profile ✓
- Settings panel reconfigure profile ✓

User flow now enforces health check acknowledgment before onboarding, completing the v1.2 preflight feature.

## Commits

| Commit | Type | Description | Files |
|--------|------|-------------|-------|
| fcc20a5 | feat | PreflightModal integration in main.ts startup flow | src/main.ts |
| 6ed64b9 | feat | PreflightModal integration in settings panel wizard triggers | src/settings.ts |

## Files Modified

**Created:**
None - integration only

**Modified:**
- src/main.ts (+44 lines: PreflightModal integration, extracted method, ensureConnectorInitialized)
- src/settings.ts (+69 lines, -35 lines: Two wizard triggers wrapped with PreflightModal)

## Dependencies

**Imports Added:**
- PreflightModal (from Phase 11-01)
- DuplicateDetectionService (from Phase 10)

**Exports:**
- ensureConnectorInitialized() method on ZoteroTriagePlugin (public method)

## Metrics

**Execution Time:** 4 minutes
**Lines Modified:** +113 lines, -35 lines
**Commits:** 2
**Files Created:** 0
**Files Modified:** 2

**Complexity:**
- Low: Callback wrapping pattern
- Low: Method extraction for code organization
- Low: Fire-and-forget async initialization

## Success Criteria Met

- [x] PreflightModal appears before SetupWizardModal in all entry points (startup, settings)
- [x] Clicking "I Understand" in preflight immediately opens wizard
- [x] Clicking "Continue Anyway" on error also opens wizard
- [x] Existing wizard callback logic unchanged (profile initialization works)
- [x] TypeScript compilation succeeds
- [x] PreflightModal imported in main.ts and settings.ts
- [x] Three integration points verified (main.ts + 2 settings buttons)
- [x] ensureConnectorInitialized() method created for sync contexts
- [x] openSetupWizardAfterPreflight() method extracted in main.ts
- [x] Inline wizard callbacks preserved in settings.ts
