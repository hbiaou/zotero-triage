---
phase: quick-013
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/validation/schemas.ts
  - src/settings.ts
autonomous: true

must_haves:
  truths:
    - "Settings UI correctly reflects validation toggle state"
    - "Required fields configuration matches between settings and schemas"
    - "Items with missing required fields show validation warnings"
    - "Block incomplete items setting prevents invalid items from being imported"
  artifacts:
    - path: "src/validation/schemas.ts"
      provides: "Zod schemas for validation rules"
      exports: ["JournalArticleSchema", "BookSchema", "ITEM_TYPE_SCHEMAS"]
    - path: "src/settings.ts"
      provides: "Quality gate settings UI"
      contains: "Block incomplete items"
  key_links:
    - from: "src/settings.ts"
      to: "plugin.settings.qualityGate"
      via: "toggle/field configuration"
      pattern: "qualityGate\\.(enabled|rules)"
    - from: "src/ui/triage-view.ts"
      to: "validationService.validate"
      via: "quality gate check"
      pattern: "qualityGate\\.enabled.*validate"
    - from: "src/validation/validation-service.ts"
      to: "ITEM_TYPE_SCHEMAS"
      via: "schema lookup"
      pattern: "ITEM_TYPE_SCHEMAS\\[.*\\]"
---

<objective>
Verify that "Block incomplete items" toggle and "Required fields by Type" configuration are working correctly.

Purpose: User suspects these settings are not having any effect on validation behavior. This investigation will trace validation flow from settings UI → validation service → schemas to identify why validation may not be working as expected.

Output: Verified validation system behavior and documented findings, with any necessary fixes applied.
</objective>

<execution_context>
@C:\Users\Biaou\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\Biaou\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-01-24-verify-validation-with-incomplete-items.md

## Related Files
@src/settings.ts
@src/validation/validation-service.ts
@src/validation/schemas.ts
@src/validation/types.ts
@src/ui/triage-view.ts
@src/ui/triage-card.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Trace validation flow and identify configuration mismatch</name>
  <files>
    src/settings.ts
    src/validation/schemas.ts
    src/validation/types.ts
  </files>
  <action>
    Investigate the validation configuration mismatch between settings UI and schemas:

    **Problem identified:**
    - Settings UI (lines 83-148 in settings.ts) allows configuring required fields: title, creators, publicationTitle, date, DOI, abstract, ISBN
    - Zod schemas (schemas.ts) have HARDCODED validation rules that don't read from settings.qualityGate.rules
    - JournalArticleSchema always requires: title, authors, journal, year, doi (fixed, not dynamic)
    - BookSchema always requires: title, authors, year, publisher (fixed, not dynamic)

    **The disconnect:**
    - User toggles fields in settings UI → saves to `plugin.settings.qualityGate.rules.journalArticle.requiredFields`
    - ValidationService reads `this.config.enabled` but schemas DON'T read `this.config.rules.requiredFields`
    - Schemas use hardcoded `.min(1, 'field is required')` instead of dynamic field checks

    **Solution approach:**
    Two options:
    1. Make schemas dynamic (complex - need to rebuild schemas on config change)
    2. Remove settings UI for field configuration, keep only global toggle (simpler - schemas already define sensible defaults)

    **Recommended fix:** Remove per-field configuration UI from settings.ts (lines 83-148). Keep only the "Block incomplete items" toggle. This aligns UI with actual validation behavior.

    Rational: The hardcoded schemas already define sensible required fields based on research (Phase 3). Per-field configuration adds complexity without clear user value. Users can override validation at triage time via "Accept Anyway" button.

    **Changes to make:**
    1. In settings.ts, remove lines 83-148 (the "Required Fields by Type" section with all the field toggles)
    2. Keep the "Block incomplete items" toggle (lines 73-81)
    3. Update description to clarify which fields are required: "Prevent import if required fields are missing. Required fields: Journal articles (title, authors, journal, year, DOI, abstract), Books (title, authors, year, publisher, ISBN)"
    4. Keep DEFAULT_QUALITY_GATE_CONFIG in validation/types.ts for backward compatibility but note it's not used for field-level validation
    5. Add code comment in schemas.ts explaining that required fields are hardcoded by design (based on Phase 3 research)
  </action>
  <verify>
    1. Run `npm run build` - should compile without errors
    2. Check settings.ts visually - "Required Fields by Type" section removed, "Block incomplete items" toggle remains
    3. Verify toggle description includes list of actual required fields
    4. Grep for any other references to qualityGate.rules.*.requiredFields that might break
  </verify>
  <done>
    Settings UI simplified to show only global validation toggle with clear description of enforced rules. No broken references to removed field configuration.
  </done>
</task>

<task type="auto">
  <name>Task 2: Test validation behavior with actual incomplete items</name>
  <files>
    src/validation/validation-service.ts
    src/ui/triage-view.ts
  </files>
  <action>
    Document the validation flow and create test instructions for user:

    **Validation flow:**
    1. `triage-view.ts:157-175` - Checks if qualityGate.enabled, runs validate() for each batch item
    2. `triage-view.ts:460-478` - On Accept click, runs validate() again, shows OverrideConfirmModal if invalid
    3. `validation-service.ts:42-78` - Returns early with valid:true if !config.enabled
    4. `validation-service.ts:54-66` - Gets schema from ITEM_TYPE_SCHEMAS based on itemType
    5. `schemas.ts` - Hardcoded Zod schemas with .min(1) for required fields

    **Current behavior (should work correctly):**
    - If qualityGate.enabled = false → all items pass validation
    - If qualityGate.enabled = true → items validated against hardcoded schemas
    - Invalid items show validation badge, "Accept Anyway" button, and OverrideConfirmModal on accept

    **Why user might think it's not working:**
    - Their library has very complete metadata (all items valid per Phase 3 todo)
    - The field configuration UI gave false impression of customizability
    - No invalid items = no visible validation effects

    **Testing instructions for user:**
    1. Enable "Block incomplete items" toggle in settings
    2. In Zotero, temporarily remove DOI from one journal article (to create invalid item)
    3. Generate batch in Triage view until that item appears
    4. Verify validation badge shows "1 missing" on the card
    5. Verify "Accept Anyway" button appears (not just "Accept")
    6. Click "Accept Anyway" → verify OverrideConfirmModal appears with missing fields list
    7. After testing, restore DOI in Zotero

    Create a comment in validation-service.ts documenting that schemas are intentionally hardcoded based on Phase 3 research findings.
  </action>
  <verify>
    1. Code comments added to validation-service.ts and schemas.ts explaining design decision
    2. No functional changes to validation logic (only UI simplification from Task 1)
  </verify>
  <done>
    Validation flow documented with clear design rationale. Test instructions provided for user to verify behavior with actual incomplete items.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Simplified validation settings UI by removing per-field configuration that wasn't connected to actual validation logic. Documented validation flow and design rationale.
  </what-built>
  <how-to-verify>
    1. Open plugin settings in Obsidian
    2. Navigate to "Quality Gates" section
    3. Verify you see:
       - "Block incomplete items" toggle
       - Description clearly states which fields are required for each item type
       - NO individual field checkboxes (those were non-functional)

    4. Test validation behavior:
       - Enable "Block incomplete items"
       - In Zotero, temporarily remove DOI from one journal article
       - Generate batch until that item appears
       - Verify validation badge appears on card ("1 missing")
       - Verify "Accept Anyway" button (not "Accept")
       - Click "Accept Anyway" → verify modal shows missing fields

    5. Disable "Block incomplete items" toggle
       - Generate batch with same incomplete item
       - Verify NO validation badge appears
       - Verify "Accept" button (not "Accept Anyway")
       - Verify item can be accepted without modal

    6. Restore the DOI in Zotero after testing
  </how-to-verify>
  <resume-signal>
    Type "approved" if validation is working correctly, or describe any issues observed.
  </resume-signal>
</task>

</tasks>

<verification>
- [ ] Settings UI shows only "Block incomplete items" toggle (no per-field checkboxes)
- [ ] Toggle description lists actual required fields
- [ ] npm run build completes successfully
- [ ] Code comments explain hardcoded schema design decision
- [ ] User confirms validation works when toggle enabled with incomplete item
- [ ] User confirms validation bypassed when toggle disabled
</verification>

<success_criteria>
- Settings UI accurately reflects actual validation behavior (no false configuration options)
- Validation toggle controls whether quality gates are enforced
- User understands which fields are required and why they're not individually configurable
- Validation behavior verified with actual incomplete items
</success_criteria>

<output>
After completion, create `.planning/quick/013-verify-that-the-block-incomplete-items-i/013-SUMMARY.md`
</output>
