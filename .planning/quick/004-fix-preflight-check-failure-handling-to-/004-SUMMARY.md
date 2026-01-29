---
type: summary
phase: quick
plan: "004"
subsystem: onboarding
tags: [preflight, wizard, error-handling, ux]

requires:
  - "Phase 11 (Preflight Modal)"
  - "Phase 2 (Onboarding Wizard)"

provides:
  - "Conditional wizard opening based on profile existence"
  - "Graceful degradation when database unavailable"

affects:
  - "Future onboarding flows"
  - "Error handling patterns"

tech-stack:
  added: []
  patterns:
    - "Guard clauses for conditional initialization"
    - "Profile-aware flow control"

key-files:
  created: []
  modified:
    - path: "src/main.ts"
      lines: 387-389
      purpose: "Profile check guard in showSetupWizard()"

decisions:
  - id: "guard-at-entry"
    choice: "Add profile check at method entry vs callback check"
    rationale: "Cleaner separation - method itself is responsible for guard logic"
    alternatives: "Check inside preflight callback (couples preflight to profile)"
    impact: "Simpler code flow, easier to understand and maintain"

metrics:
  duration: "~1 min"
  completed: "2026-01-29"
---

# Quick Task 004: Fix Preflight Check Failure Handling Summary

**One-liner:** Profile existence guard prevents onboarding loop when database unavailable

## Problem

When users who had already completed onboarding encountered database connection errors during preflight checks and clicked "I Understand", the setup wizard would reopen, creating a frustrating loop. This occurred because the `PreflightModal.onComplete` callback ALWAYS triggered `openSetupWizardAfterPreflight()`, regardless of whether the user already had a profile.

## Solution

Added a `hasProfile()` guard at the start of `showSetupWizard()` method. If a profile exists, the method returns immediately without opening preflight or wizard modals.

**Code change in `src/main.ts` (lines 387-389):**

```typescript
if (this.profileService.hasProfile()) {
  return;
}
```

This simple guard ensures:
- **First-time users (no profile):** Get preflight + wizard as intended
- **Existing users with database errors:** Preflight closes without reopening wizard
- **Existing users with working database:** No modals shown (existing behavior from lines 142-147)

## What Was Built

### Task 1: Add profile check before opening wizard in showSetupWizard()

**Status:** Complete
**Commit:** 9f5d463

Added conditional logic to prevent wizard from reopening for users with existing profiles:

1. Guard clause checks `this.profileService.hasProfile()` at method entry
2. Returns immediately if profile exists
3. Preserves all existing preflight/wizard logic for new users
4. No changes to PreflightModal class or callback signatures

**Files modified:**
- `src/main.ts`: Added 7 lines (guard + comments)

## Verification

### Code Inspection

```bash
grep -A 10 "private showSetupWizard" src/main.ts
```

Confirmed:
- Guard clause exists at lines 387-389
- Check happens before any modal initialization
- Comment explains the purpose clearly

### Expected Behavior

**Scenario 1: New user (no profile)**
- Launch plugin → preflight modal opens → click "I Understand" → wizard opens ✓

**Scenario 2: Existing user with database issue**
- Launch plugin with profile but broken db path → preflight may show errors → click "I Understand" → modal closes (NO wizard) ✓

**Scenario 3: Existing user with working database**
- Launch plugin with profile and valid db → no modals open ✓

**Edge case: User deletes profile manually**
- Wizard should open again (first-time flow) ✓

**Edge case: User clicks "Reconfigure Profile" in settings**
- Wizard should open (explicit user action, different code path - not affected by this fix) ✓

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

### Why Guard at Method Entry?

**Alternative considered:** Add profile check inside the preflight callback

**Chosen approach:** Guard at `showSetupWizard()` entry

**Rationale:**
- **Separation of concerns:** The method itself knows when it should/shouldn't run
- **Simpler flow:** Preflight doesn't need to know about profile state
- **Reusability:** If `showSetupWizard()` is called from other contexts, guard applies consistently
- **Clarity:** Intent is clear at method entry rather than buried in callback

### Profile Check Timing

The guard checks `hasProfile()` synchronously at method entry. This works because:
- Profile state is loaded during plugin initialization
- Profile service `hasProfile()` is a fast synchronous check
- No race conditions - profile either exists or doesn't at startup

## Commits

| Hash    | Type | Message                                    |
|---------|------|--------------------------------------------|
| 9f5d463 | fix  | Add profile check before opening wizard    |

## Files Changed

```
src/main.ts | 7 insertions(+)
```

**Total:** 1 file, 7 lines added

## Duration

**Total time:** ~1 minute

## Next Steps

This fix eliminates the onboarding loop issue. No further work needed. The pattern could be applied to other initialization flows that should respect existing state.

## Related

- **Phase 11:** Preflight Modal implementation
- **Phase 2:** Onboarding Wizard setup
- **Phase 12:** Settings persistence (ensures profile survives restarts)
