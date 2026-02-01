---
phase: 15-content-extraction-&-classification-pipeline
plan: 07
subsystem: workflow
tags: [diagnostic-notes, evidence-extraction, enrichment, user-guidance]

# Dependency graph
requires:
  - phase: 15-04
    provides: DiagnosticNoteService implementation with Zotero deep links
  - phase: 14-05
    provides: EvidenceExtractor with canEnrich() validation
provides:
  - Diagnostic note integration in Accept workflow
  - Evidence-based note creation (diagnostic vs regular)
  - Enrichment pending queue for metadata-only items
affects: [16-accept-workflow-integration, enrichment, deferred-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence check before note creation"
    - "Graceful degradation to diagnostic notes"

key-files:
  created: []
  modified:
    - src/main.ts
    - src/ui/triage-view.ts

key-decisions:
  - "Diagnostic notes created at Accept time (not deferred)"
  - "Items with insufficient evidence marked as enrichment_pending"
  - "Evidence check guards normal note creation"

patterns-established:
  - "Evidence validation in performAccept before note creation"
  - "Diagnostic note fallback for MetadataOnly and Abstract-only items"

# Metrics
duration: 14min
completed: 2026-02-01
---

# Phase 15-07: Diagnostic Notes Integration Summary

**Diagnostic notes with Zotero deep links now guide users when items lack sufficient evidence for enrichment**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-01T18:30:05Z
- **Completed:** 2026-02-01T18:44:29Z
- **Tasks:** 2 (verification)
- **Files modified:** 0 (work completed in previous plan)

## Accomplishments

- Diagnostic note service integrated into Accept workflow (via plan 15-06)
- Evidence level checked before note creation
- Metadata-only items receive actionable guidance instead of stub notes
- Enrichment pending queue populated with retry metadata

## Task Verification

Work described in this plan was completed in commit `3ec1ae5` (plan 15-06):

1. **Task 1: Integrate DiagnosticNoteService** - Already complete ✅
   - DiagnosticNoteService imported and initialized in main.ts
   - Evidence check added to triage-view.ts performAccept()
   - Diagnostic notes created when evidenceExtractor.canEnrich() returns false
   - Items marked as enrichment_pending with metadata

2. **Task 2: Verify Zotero deep links** - Already complete ✅
   - Deep links present in all diagnostic reasons
   - Format: `zotero://select/library/items/{itemKey}`
   - All five diagnostic reasons have appropriate guidance

## Files Created/Modified

Modified in commit 3ec1ae5 (plan 15-06):
- `src/main.ts` - Added DiagnosticNoteService initialization
- `src/ui/triage-view.ts` - Added evidence check and diagnostic note creation in performAccept()

## Decisions Made

None - work was completed as part of plan 15-06 integration.

## Deviations from Plan

**Plan Overlap with 15-06:**

Plan 15-07 described work that was already implemented in plan 15-06 (commit 3ec1ae5). The classification integration (15-06) included diagnostic note integration as a necessary component of the Accept workflow enhancement.

**Why this happened:**
- Plan 15-06 needed diagnostic notes to handle items with insufficient evidence
- Gap closure plans 15-06 and 15-07 were created simultaneously from verification report
- Both plans addressed overlapping gaps in workflow integration

**Resolution:**
- Verified all 15-07 requirements are met in existing code
- Documented completion in this summary
- No additional implementation needed

---

**Total deviations:** Plan already complete from 15-06
**Impact on plan:** No code changes required - verification-only execution

## Issues Encountered

None - work was already complete.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Diagnostic note workflow is complete and functional:
- ✅ Insufficient evidence items receive diagnostic notes
- ✅ Zotero deep links provide immediate action
- ✅ Enrichment pending queue tracks retry state
- ✅ Five diagnostic reasons handled (no_pdf, no_notes, no_transcript, abstract_only, metadata_only)

Ready for Phase 16 (Accept Workflow Integration) to build on this foundation.

**Blockers:** None

**Concerns:**
- Need user testing to verify diagnostic note clarity and helpfulness
- Retry logic for enrichment pending items not yet implemented (deferred to Phase 16+)

---
*Phase: 15-content-extraction-&-classification-pipeline*
*Completed: 2026-02-01*
