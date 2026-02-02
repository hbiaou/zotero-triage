---
phase: 16-enrichment-orchestration-&-validation
plan: 03
subsystem: error-recovery
tags: [error-handling, retry-queue, stub-notes, exponential-backoff, persistence]

# Dependency graph
requires:
  - phase: 15-content-extraction-&-classification
    provides: Domain classification, evidence extraction, diagnostic notes
  - phase: 14-ai-service-layer
    provides: EvidenceLevel types, AI service interfaces
provides:
  - StubNoteGenerator for enrichment failure fallback with diagnostic info
  - RetryQueue with exponential backoff for persistent retry tracking
  - FailureContext and QueuedEnrichment types for error recovery workflow
affects: [16-04-enrichment-orchestrator, orchestration-layer, batch-processing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exponential backoff retry scheduling (5min, 15min, 45min, 2hr, 6hr)"
    - "Persistent queue storage via vault adapter (.zotero-triage-queue.json)"
    - "Stage-specific diagnostic messages for user guidance"
    - "Zotero deep links for immediate action (zotero://select/library/items/{key})"

key-files:
  created:
    - src/error-recovery/stub-note-generator.ts
    - src/error-recovery/retry-queue.ts
  modified:
    - src/types.ts

key-decisions:
  - "Exponential backoff schedule: 5min, 15min, 45min, 2hr15min, 6hr45min (base 5min * 3^attempts)"
  - "Queue persists to .zotero-triage-queue.json at vault root for plugin reload survival"
  - "Stub notes use General domain template as default fallback"
  - "Stage-specific diagnostic messages guide user to appropriate action"
  - "Unique queue ID: itemID + timestamp for multi-attempt tracking"

patterns-established:
  - "FailureContext captures complete enrichment state at failure point"
  - "Stub notes include Zotero deep link for immediate user access"
  - "RetryQueue.getReadyForRetry() enables batch retry processing"
  - "Filename sanitization prevents invalid characters in note paths"

# Metrics
duration: 5min
completed: 2026-02-02
---

# Phase 16 Plan 03: Error Recovery Infrastructure Summary

**StubNoteGenerator creates diagnostic fallback notes with retry instructions; RetryQueue persists failed enrichments with exponential backoff scheduling**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-02T13:11:21Z
- **Completed:** 2026-02-02T13:16:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- StubNoteGenerator creates valid fallback notes when enrichment fails with diagnostic context
- RetryQueue persists failed enrichments across plugin reloads with exponential backoff
- Stage-specific diagnostic messages guide users to appropriate recovery actions
- Zotero deep links enable immediate access to source item

## Task Commits

Each task was committed atomically:

1. **Task 1: Create StubNoteGenerator for enrichment failure fallback** - `6d542eb` (feat)
2. **Task 2: Create RetryQueue for persistent enrichment retry tracking** - `14ffc74` (feat)

## Files Created/Modified

- `src/error-recovery/stub-note-generator.ts` - Generates stub notes with minimal metadata, diagnostic info, and retry instructions
- `src/error-recovery/retry-queue.ts` - Manages persistent retry queue with exponential backoff scheduling
- `src/types.ts` - Added FailureContext, StubNote, and QueuedEnrichment types

## Decisions Made

**Exponential backoff schedule:**
- Base delay: 5 minutes
- Multiplier: 3x per attempt
- Sequence: 5min, 15min, 45min, 2hr15min, 6hr45min
- Rationale: Prevents retry storms while allowing reasonable recovery window

**Queue persistence location:**
- File: `.zotero-triage-queue.json` at vault root
- Format: JSON array of QueuedEnrichment objects
- Rationale: Vault adapter ensures persistence across plugin reloads, separate from plugin data.json

**Stub note template:**
- Default: General domain template
- Includes: Minimal metadata (title, authors, year, DOI, abstract), diagnostic section, retry instructions
- Rationale: Provides immediate fallback without requiring domain classification

**Stage-specific diagnostics:**
- Classification: "Domain classification failed. Couldn't determine content type."
- Extraction: "Evidence extraction failed. Couldn't retrieve PDF/notes/transcript."
- Enrichment: "AI enrichment failed. LLM timeout, API error, or content policy violation."
- Validation: "Output validation failed. Content contained errors or hallucinations."
- Rationale: Guides user to root cause and appropriate action

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 16 Plan 04 (Enrichment Orchestrator):**
- StubNoteGenerator can be integrated into enrichment error handling
- RetryQueue ready for orchestrator to load/query/update
- FailureContext captures complete state for orchestrator error branches

**Integration points:**
```typescript
// On enrichment failure:
const stub = stubGenerator.createStubNote(failureContext);
const notePath = await stubGenerator.saveStubNote(stub, settings.outputFolder);
await retryQueue.enqueue({
  itemId: item.itemID,
  itemKey: item.itemKey,
  itemTitle: item.title,
  notePath,
  failureStage: failureContext.stage,
  failureReason: failureContext.error.message
});

// Batch retry check:
const ready = retryQueue.getReadyForRetry();
for (const queued of ready) {
  // Retry enrichment
  // On success: retryQueue.dequeue(queued.id)
  // On failure: retryQueue.updateRetryAttempt(queued.id)
}
```

**No blockers.**

---
*Phase: 16-enrichment-orchestration-&-validation*
*Completed: 2026-02-02*
