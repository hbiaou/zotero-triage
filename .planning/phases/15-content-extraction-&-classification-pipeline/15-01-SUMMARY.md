---
phase: 15-content-extraction-&-classification-pipeline
plan: 01
subsystem: content-extraction
tags: [youtube-transcript, video, transcript, extraction, modal-ui]

# Dependency graph
requires:
  - phase: 14-ai-service-layer-and-evidence-foundation
    provides: Evidence extraction hierarchy and service patterns
provides:
  - Video transcript extraction with YouTube automatic fetching
  - Manual transcript input modal for unsupported platforms
  - TranscriptExtractor orchestrator with platform detection
  - TranscriptExtraction type system for evidence integration
affects: [15-02, 15-03, evidence-extraction, enrichment-pipeline]

# Tech tracking
tech-stack:
  added: [youtube-transcript]
  patterns: [Platform detection, Automatic extraction with manual fallback, Error-driven UI flow]

key-files:
  created:
    - src/extraction/types.ts
    - src/extraction/youtube-service.ts
    - src/extraction/transcript-extractor.ts
    - src/ui/transcript-modal.ts
  modified:
    - package.json

key-decisions:
  - "YouTube-only automatic extraction (Vimeo and others require manual input)"
  - "Error requiresManualInput flag drives manual input modal flow"
  - "Platform detection via URL regex before service delegation"
  - "Word count calculated from transcript for token estimation"

patterns-established:
  - "TranscriptExtractionError with requiresManualInput flag for fallback orchestration"
  - "Service pattern: stateless class with detect + extract methods"
  - "Modal pattern: constructor takes callbacks for confirm/cancel"

# Metrics
duration: 6min
completed: 2026-02-01
---

# Phase 15 Plan 01: Video Transcript Extraction Summary

**YouTube automatic transcript fetching with manual fallback modal for unsupported platforms using youtube-transcript package**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-01T06:22:44Z
- **Completed:** 2026-02-01T06:28:56Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- YouTube video transcripts automatically fetched via youtube-transcript package
- Manual transcript input modal for Vimeo and unsupported platforms
- Platform detection orchestrator routes to appropriate extraction service
- TranscriptExtraction type system ready for evidence hierarchy integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create transcript extraction types and error handling** - `6e99e64` (feat)
2. **Task 2: Implement YouTube transcript extraction service** - `399da36` (feat)
3. **Task 3: Create transcript extractor orchestrator and manual input modal** - `75d06f7` (feat)

## Files Created/Modified

- `src/extraction/types.ts` - TranscriptPlatform, TranscriptExtraction, TranscriptExtractionError types
- `src/extraction/youtube-service.ts` - YouTube transcript fetching via youtube-transcript package
- `src/extraction/transcript-extractor.ts` - Platform detection and extraction orchestration
- `src/ui/transcript-modal.ts` - Manual transcript input modal with Obsidian Modal pattern
- `package.json` - Added youtube-transcript dependency

## Decisions Made

**YouTube-only automatic extraction:**
- YouTube is primary video platform use case with robust automatic transcript API
- Vimeo and other platforms throw TranscriptExtractionError with requiresManualInput=true
- Users can manually paste transcripts from any platform via TranscriptModal

**Error-driven UI flow:**
- TranscriptExtractionError.requiresManualInput flag signals when to show manual input modal
- Distinguish between "no captions available" (manual input helpful) vs "API error" (may be temporary)
- Clean separation between service layer (extraction) and UI layer (modal)

**Platform detection approach:**
- URL regex detection (youtube.com, youtu.be, vimeo.com) before service delegation
- Future platforms can be added by extending detectPlatform() and adding service
- Unknown URLs return 'unsupported' platform with manual input suggestion

**Word count for token estimation:**
- Calculate word count from transcript text (split on whitespace, filter empty)
- Consistent with Phase 14 evidence extraction token estimation pattern
- Enables cost prediction before AI API calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation straightforward, youtube-transcript package works as documented.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 15-02 (Evidence Extraction Integration):**
- TranscriptExtraction type compatible with EvidenceExtraction interface
- TranscriptExtractor ready for integration into evidence-extractor.ts
- Manual input modal ready for Accept workflow integration

**Integration points:**
1. Add transcript extraction to EvidenceExtractor hierarchy (FullText > Transcript > Notes > Abstract)
2. Wire TranscriptExtractionError handling to show TranscriptModal in Accept workflow
3. Store transcript as evidence source alongside PDF fulltext and notes

**No blockers or concerns.**

---
*Phase: 15-content-extraction-&-classification-pipeline*
*Completed: 2026-02-01*
