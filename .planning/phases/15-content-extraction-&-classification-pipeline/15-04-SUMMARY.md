---
phase: 15-content-extraction-&-classification-pipeline
plan: 04
subsystem: enrichment
tags: [diagnostic-notes, evidence-hierarchy, deferred-queue, registry-states, zotero-deeplinks]

# Dependency graph
requires:
  - phase: 15-02
    provides: Domain classification and evidence extraction foundation
provides:
  - Diagnostic note service for metadata-only items
  - Registry states for enrichment queue (enriched, enrichment_pending, enrichment_failed)
  - Enrichment metadata tracking for retry logic
  - Zotero deep links for user action
affects: [16-accept-workflow-integration, 18-deferred-queue-retry-logic]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnostic note generation with YAML frontmatter and actionable guidance"
    - "Evidence-based diagnostic reason determination"
    - "Zotero deep links (zotero://select/library/items/{key})"
    - "Enrichment metadata in registry entries for deferred queue tracking"

key-files:
  created:
    - src/services/diagnostic-note-service.ts
  modified:
    - src/types.ts
    - src/registry/types.ts
    - src/registry/registry-service.ts

key-decisions:
  - "ProcessingState extended with enriched, enrichment_pending, enrichment_failed states"
  - "EnrichmentMetadata tracks evidenceLevel, pendingReason, retryCount, lastRetryTimestamp"
  - "Diagnostic notes include Zotero deep links for immediate user action"
  - "Five diagnostic reasons: no_pdf, no_notes, no_transcript, abstract_only, metadata_only"
  - "Validation ensures diagnostic note quality before returning to caller"
  - "Fallback note generation prevents blank notes on generation failure"

patterns-established:
  - "Diagnostic note structure: YAML frontmatter + What's Missing + What You Can Do + Zotero link"
  - "Example templates serve as specification for diagnostic note format"
  - "Evidence-based reason determination (item type + evidence level + sources)"

# Metrics
duration: 7min
completed: 2026-02-01
---

# Phase 15 Plan 04: Diagnostic Notes & Deferred Queue Summary

**Diagnostic note service generates tailored user guidance for metadata-only items with Zotero deep links, plus registry states for deferred enrichment queue tracking**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-01T06:37:45Z
- **Completed:** 2026-02-01T06:44:39Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- DiagnosticNoteService generates user-friendly notes for insufficient evidence scenarios
- Registry supports enrichment queue states (enriched, enrichment_pending, enrichment_failed)
- Enrichment metadata tracking for retry logic (evidence level, pending reason, retry count)
- Zotero deep links enable direct item access for evidence addition
- Five diagnostic reasons with tailored actionable guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Update registry types for deferred queue state** - `58da119` (feat)
2. **Task 2: Implement diagnostic note service** - `a7e655e` (feat)
3. **Task 3: Create diagnostic note examples and validation** - `a0cd361` (feat)

## Files Created/Modified

- `src/services/diagnostic-note-service.ts` - Generates diagnostic notes with YAML frontmatter, actionable guidance, and Zotero deep links
- `src/types.ts` - Extended ProcessingState with enrichment states, added enrichmentMetadata to RegistryEntry
- `src/registry/types.ts` - Updated RegistryStats to track enrichment states
- `src/registry/registry-service.ts` - Updated to use ProcessingState and initialize new stats counters

## Decisions Made

1. **ProcessingState extended with enrichment lifecycle states**
   - enriched: Item successfully enriched with AI-generated content
   - enrichment_pending: Queued for retry when evidence becomes available (deferred queue)
   - enrichment_failed: Failed after retries, requires manual intervention
   - Rationale: Prepare for Phase 18 deferred queue retry logic

2. **EnrichmentMetadata optional field in RegistryEntry**
   - evidenceLevel: What evidence was available at last attempt
   - pendingReason: Human-readable reason for pending state
   - retryCount: Number of enrichment attempts (0 = first attempt)
   - lastRetryTimestamp: ISO 8601 timestamp of last retry
   - Rationale: Track retry state without breaking existing registry entries (backward compatible)

3. **Five diagnostic reasons for tailored guidance**
   - no_pdf: Item has notes but no PDF (suggests adding PDF)
   - no_notes: Item has PDF but no notes (rare, suggests adding annotations)
   - no_transcript: Video item lacks transcript (suggests manual input or skip)
   - abstract_only: Only abstract available (suggests adding PDF or notes)
   - metadata_only: No content at all (suggests checking if content should exist)
   - Rationale: Different evidence gaps require different user actions

4. **Zotero deep links in diagnostic notes**
   - Format: `zotero://select/library/items/{itemKey}`
   - Enables one-click navigation to item for evidence addition
   - Rationale: Reduce friction in user workflow, make guidance immediately actionable

5. **Example templates as specification**
   - Four example notes (no_pdf, no_transcript, abstract_only, metadata_only)
   - Serve as documentation and validation reference
   - Rationale: Clear specification of expected format for future maintenance

6. **Validation before return**
   - Checks YAML frontmatter, required fields, section headers
   - Fallback note generation if validation fails
   - Rationale: Never return blank or malformed notes to users

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All tasks completed without blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 16 (Accept Workflow Integration):**
- Registry supports enrichment_pending state for deferred queue
- Diagnostic note service ready to generate notes for metadata-only items
- Enrichment metadata structure established for retry tracking

**Preparation for Phase 18 (Deferred Queue Retry Logic):**
- enrichment_pending state ready for queue implementation
- enrichmentMetadata structure supports retry count and timestamps
- pendingReason field enables filtering queue by diagnostic reason

**No blockers or concerns.**

---
*Phase: 15-content-extraction-&-classification-pipeline*
*Completed: 2026-02-01*
