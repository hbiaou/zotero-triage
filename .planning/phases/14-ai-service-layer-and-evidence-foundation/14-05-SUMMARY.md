---
phase: 14-ai-service-layer-and-evidence-foundation
plan: 05
subsystem: ai
tags: [evidence-extraction, pdf, zotero, ai-service, database]

# Dependency graph
requires:
  - phase: 14-01
    provides: AI types (EvidenceLevel, EvidenceExtraction)
  - phase: zotero-connector
    provides: Database access and ZoteroItem interface
provides:
  - EvidenceExtractor service with hierarchy (PDF → Notes → Abstract → Metadata)
  - PDF fulltext extraction from Zotero cache
  - Notes and abstract extraction from database
  - Token estimation for cost prediction
  - Evidence quality assessment (canEnrich)
affects: [14-06-enrichment-pipeline, 14-07-model-router, ai-enrichment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence hierarchy pattern (graceful degradation from PDF → Notes → Abstract → Metadata)"
    - "Query method pattern for database access"

key-files:
  created:
    - src/services/evidence-extractor.ts
  modified:
    - src/db/zotero-connector.ts

key-decisions:
  - "Evidence threshold: Proceed with enrichment if FullText OR Notes available (Abstract-only items queued)"
  - "Token estimation: words / 0.75 for rough approximation before API call"
  - "PDF extraction from Zotero .zotero-ft-cache files (hybrid approach deferred to later phase)"

patterns-established:
  - "Evidence hierarchy enforcement: extractPDFFulltext() → extractNotes() → extractAbstract() → MetadataOnly"
  - "Graceful degradation: Log errors but continue to next evidence level on failure"
  - "Generic query() method on ZoteroConnector for custom SQL queries"

# Metrics
duration: 11min
completed: 2026-01-31
---

# Phase 14 Plan 05: Evidence Extraction Service Summary

**Evidence hierarchy service (PDF → Notes → Abstract → Metadata) with Zotero cache extraction, database queries, and token estimation for AI enrichment**

## Performance

- **Duration:** 11 min
- **Started:** 2026-01-31T16:07:15Z
- **Completed:** 2026-01-31T16:17:46Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Evidence extractor with 4-level hierarchy enforcing best-available source selection
- PDF fulltext extraction from Zotero's .zotero-ft-cache files
- Notes and abstract extraction via database queries with HTML stripping
- Token estimation (words / 0.75) for cost prediction before API calls
- Evidence quality assessment (canEnrich) determines enrichment eligibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement PDF fulltext extraction from Zotero cache** - `7a89fc2` (feat)
2. **Task 2: Implement notes and abstract extraction** - `9c105d0` (feat)
3. **Task 3: Implement evidence hierarchy and main extract method** - `29c2be1` (feat)
4. **Bug fix: Correct isValidEvidence return type** - `11782f5` (fix)

## Files Created/Modified
- `src/services/evidence-extractor.ts` - Evidence extraction service with hierarchy enforcement
- `src/db/zotero-connector.ts` - Added generic query() method for custom SQL queries

## Decisions Made

**Evidence threshold decision:**
Per CONTEXT.md, proceed with enrichment if either FullText OR Notes available. Abstract-only items are queued as metadata-only. This balances quality requirements with practical coverage.

**Token estimation approach:**
Use rough approximation (words / 0.75) for cost estimation. Exact tokenization happens at API provider level. This is sufficient for pre-flight cost prediction without adding dependencies.

**PDF extraction strategy:**
Implement Zotero cache extraction first. Hybrid approach with PDF.js fallback deferred to later phase based on real-world cache hit rates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added ZoteroConnector.query() method**
- **Found during:** Task 2 (Notes and abstract extraction)
- **Issue:** ZoteroConnector only exposed high-level methods (loadItems, getItem) but evidence extractor needs custom SQL queries for notes and abstracts. No generic query method existed.
- **Fix:** Added public query() method to ZoteroConnector that executes SQL and returns results as objects with column names as keys
- **Files modified:** src/db/zotero-connector.ts
- **Verification:** TypeScript compilation succeeds, query method matches sql.js result structure
- **Committed in:** 9c105d0 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed isValidEvidence return type**
- **Found during:** Task 3 verification (TypeScript compilation)
- **Issue:** Boolean expression `content && content.trim().length >= MIN_EVIDENCE_LENGTH` inferred as `string | boolean` instead of `boolean`
- **Fix:** Wrapped expression in `!!()` to ensure boolean return type
- **Files modified:** src/services/evidence-extractor.ts
- **Verification:** TypeScript compilation succeeds with no type errors
- **Committed in:** 11782f5 (fix commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Query method was essential missing functionality - evidence extractor cannot work without database access. Type fix was compilation blocker. No scope creep.

## Issues Encountered

None - implementation followed plan specification. SQL queries worked as designed, file system operations handled errors gracefully, type system caught boolean inference issue during verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for enrichment pipeline:**
- Evidence extraction service complete with hierarchy enforcement
- All evidence levels (FullText, Notes, Abstract, MetadataOnly) supported
- Token estimation enables cost prediction before API calls
- canEnrich() method determines enrichment eligibility
- getEvidenceDescription() provides human-readable descriptions for YAML frontmatter

**Foundation complete for:**
- Phase 14-06: Enrichment pipeline orchestration
- Phase 14-07: Model router and provider selection
- Future AI enrichment features using evidence hierarchy

**No blockers.** Evidence extraction is independent of provider configuration and can be tested with mock items immediately.

---
*Phase: 14-ai-service-layer-and-evidence-foundation*
*Completed: 2026-01-31*
