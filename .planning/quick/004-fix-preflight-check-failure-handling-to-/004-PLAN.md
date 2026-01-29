---
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main.ts
autonomous: true

must_haves:
  truths:
    - "When database connection fails during preflight and user clicks 'I Understand', the modal closes without triggering onboarding"
    - "Users who have completed onboarding are not sent back to onboarding when database connection fails"
    - "Onboarding wizard only opens if user has no profile (first-time setup)"
  artifacts:
    - path: "src/main.ts"
      provides: "Conditional wizard opening logic"
      min_lines: 400
  key_links:
    - from: "PreflightModal.onComplete callback"
      to: "hasProfile() check"
      via: "conditional wizard opening"
      pattern: "if.*hasProfile.*showSetupWizard|hasProfile.*\\?.*wizard"
---

<objective>
Fix preflight check failure handling to prevent reopening onboarding when users who have already completed setup encounter database connection errors.

**Purpose:** Eliminate frustrating onboarding loops when database is temporarily unavailable. Users who have completed setup should be able to proceed to main functionality even if preflight checks fail.

**Output:** Conditional wizard opening logic that checks for existing profile before triggering onboarding.
</objective>

<execution_context>
@C:\Users\Biaou\.claude\get-shit-done\workflows\execute-plan.md
@C:\Users\Biaou\.claude\get-shit-done\templates\summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/main.ts
@src/profile/profile-service.ts
@src/ui/preflight-modal.ts
</context>

<tasks>

<task type="auto">
  <name>Add profile check before opening wizard in showSetupWizard()</name>
  <files>src/main.ts</files>
  <action>
    Modify `showSetupWizard()` method (currently line 383-402) to check if profile exists before opening preflight/wizard:

    1. At the start of `showSetupWizard()`, check `this.profileService.hasProfile()`:
       - If profile EXISTS: Do NOT open preflight or wizard. Just return silently.
       - If profile does NOT exist: Continue with current preflight/wizard flow.

    2. Keep all existing preflight/wizard logic intact (connector initialization, PreflightModal, openSetupWizardAfterPreflight).

    3. The fix ensures:
       - First-time users (no profile): Get preflight + wizard
       - Existing users clicking "I Understand" on preflight errors: Modal closes, no wizard reopening
       - Existing users with database connection issues: Can skip to main functionality

    **Why this pattern:** The root cause is that PreflightModal's onComplete callback ALWAYS calls `openSetupWizardAfterPreflight()`, even when user already has a profile. By adding a guard at the top of `showSetupWizard()`, we prevent wizard from opening for users who have already completed setup.

    **Do NOT:**
    - Modify PreflightModal class
    - Change the onComplete callback signature
    - Add profile checks inside the preflight callback (guard at method entry is cleaner)
  </action>
  <verify>
    Manual testing scenarios:
    1. New user (no profile): Verify preflight + wizard opens as before
    2. Existing user (has profile) with broken database: Verify preflight opens, clicking "I Understand" closes modal without wizard
    3. Existing user with working database: Verify no preflight/wizard at all (existing behavior from line 142-147)

    Code inspection:
    ```bash
    # Verify hasProfile() check added at start of showSetupWizard()
    grep -A 5 "private showSetupWizard" src/main.ts
    ```
  </verify>
  <done>
    - `showSetupWizard()` method checks `this.profileService.hasProfile()` at entry
    - If profile exists, method returns immediately without opening modals
    - If no profile, preflight and wizard open as before
    - Manual testing confirms users with existing profiles are not sent to onboarding on database errors
  </done>
</task>

</tasks>

<verification>
**Functional verification:**
1. New user flow: Launch plugin with no profile → preflight modal opens → click "I Understand" → wizard opens
2. Existing user with database issue: Launch plugin with profile but broken db path → preflight may show errors → click "I Understand" → modal closes (NO wizard)
3. Existing user with working database: Launch plugin with profile and valid db → no modals open (existing behavior)

**Edge cases:**
- User deletes profile manually: Wizard should open again (first-time flow)
- User clicks "Reconfigure Profile" button in settings: Wizard should open (explicit user action, different code path)
</verification>

<success_criteria>
**Measurable outcomes:**
- [ ] `showSetupWizard()` method has `hasProfile()` guard at entry
- [ ] Users with existing profiles do NOT see wizard when preflight errors occur
- [ ] New users (no profile) still get preflight + wizard as before
- [ ] Code changes are minimal (<5 lines added)
</success_criteria>

<output>
After completion, create `.planning/quick/004-fix-preflight-check-failure-handling-to-/004-SUMMARY.md`
</output>
