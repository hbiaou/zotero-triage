# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-01-22)

**Core value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

**Current focus:** Phase 5 - Polish

## Current Position

Phase: 5 of 5 (Polish)
Plan: 04 of 06
Status: In progress
Last activity: 2026-01-24 — Completed 05-04-PLAN.md

Progress: [█████████░] 85%

## Performance Metrics

**Velocity:**
- Total plans completed: 18
- Average duration: 61 min
- Total execution time: 18.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4/4 | 28 min | 7 min |
| 02-batch-workflow | 3/3 | 74 min | 25 min |
| 03-quality-gates | 3/3 | 945 min | 315 min |
| 04-onboarding-and-recommendations | 5/5 | 38 min | 8 min |
| 05-polish | 4/6 | 21 min | 5 min |

**Recent Trend:**
- Last 5 plans: 04-05 (12 min), 05-02 (4 min), 05-03 (5 min), 05-04 (6 min), 05-06 (6 min)
- Trend: Phase 5 in progress; error handling integrated into database and services

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Direct SQLite access (via sql.js) for performance with large libraries (VALIDATED in 01-02)
- Phase 1: JSON registry over SQLite for simpler MVP state management (can migrate later if needed)
- Phase 1: Read-only database access to prevent writing to Zotero (safety constraint)
- Plan 01-02: Use sql.js wasmBinary option with fs.readFileSync for WASM loading
- Plan 01-02: Schema version range 100-200 to support Zotero 6.x and 7.x
- Plan 01-02: Chunk size of 50 items for UI responsiveness
- Plan 01-03: 2000ms debounce delay for registry saves (balance data safety vs I/O)
- Plan 01-03: Registry stored in plugin data.json alongside settings
- Plan 01-04: Always quote author names in YAML to handle special characters
- Plan 01-04: Use folded block scalar (>) for abstracts in YAML
- Plan 01-04: 100 character filename limit for cross-platform compatibility
- Plan 02-01: Default batch size 5 items (conservative, encourages small sessions)
- Plan 02-01: Most recent items first (sort by dateAdded descending)
- Plan 02-01: Deferred state distinct from rejected (allows re-including in batches)
- Plan 02-01: getAllEntries returns { id, entry } array for velocity calculations
- Plan 02-02: Undo timeout 3 seconds (per CONTEXT.md specification)
- Plan 02-02: Progress indicator with dual display (text + visual bar)
- Plan 02-02: Card abstract truncated at 200 characters for layout balance
- Plan 02-02: Button hierarchy: Accept (accent), Defer (neutral), Reject (text with border)
- Plan 02-02: Triage view in right sidebar for accessible workflow
- Plan 02-03: SessionTracker lives in plugin instance (persists across view opens/closes)
- Plan 02-03: Velocity calculated from registry entry timestamps (last 24h and 7d)
- Plan 02-03: Pending count calculated as total minus all processed states
- Plan 02-03: Batch completion checks for more items to show appropriate next step
- Plan 02-03: Stats panel uses Obsidian CSS variables for full theme compatibility
- Plan 03-01: Use Zod for schema validation with type-safe error formatting
- Plan 03-01: Default quality gates enabled with DOI/journal/year required for articles
- Plan 03-01: Include empty fields in YAML with placeholders (collections: [], isbn: '') for clarity
- Plan 03-01: Extract collections, issue, publisher, isbn from Zotero database EAV schema
- Plan 03-02: Validation runs during card rendering (fast, synchronous, decoupled from batch service)
- Plan 03-02: Override modal requires explicit confirmation to bypass quality gates
- Plan 03-02: Defer/Reject actions skip validation (users can skip items regardless of completeness)
- Plan 03-02: Accept button changes to "Accept Anyway" for invalid items
- Plan 03-02: zotero://select deep links enable external metadata fixes
- Plan 03-03: Publisher and isbn fields added to ZoteroItem interface (were missing despite extraction)
- Plan 03-03: BookSchema publisher validation uses .min(1).nullable() pattern matching JournalArticleSchema
- Plan 04-01: Map-based signal storage for profile (tags, authors, keywords) with JSON serialization
- Plan 04-01: Profile weight constraints (min: 0.1, max: 5.0, accept boost: +0.2, reject penalty: -0.1)
- Plan 04-01: Simple frequency-based keyword extraction with 50+ stopword list (no external NLP for MVP)
- Plan 04-01: Profile stored in plugin settings (not separate file) for vault portability
- Plan 04-01: ProfileService uses 2000ms debounce delay matching RegistryService pattern
- Plan 04-02: Default relevance-only mode (relevanceVsDiversity: 0) for MVP simplicity
- Plan 04-02: 3-year recency window with 1.5x multiplier for recent papers
- Plan 04-02: 20 keywords extracted per item for scoring
- Plan 04-02: Normalize scores to 0-100 range for UI presentation
- Plan 04-02: Tag extraction deferred (ZoteroItem schema doesn't include tags yet)
- Plan 04-03: Three-step wizard (database → preferences → seed papers) for onboarding
- Plan 04-03: Min 5 / max 15 seed papers for profile initialization
- Plan 04-03: Frequency-based weighting (signal in N papers gets weight N)
- Plan 04-03: Skippable wizard allows manual configuration via settings tab
- Plan 04-03: Load items before seed picker step for smooth UX
- Plan 04-04: Profile-aware scoring only when profile exists, fallback to date-based sorting
- Plan 04-04: Adaptive learning calls only when profile exists (backward compatibility)
- Plan 04-04: Map deserialization in getProfile for proper data structure restoration
- Plan 04-04: Weight adjustment delta of 0.5 for manual editing
- Plan 04-04: Top 10 signals displayed per type in profile editor
- Plan 04-05: 1-second delay for wizard trigger (allows UI to load)
- Plan 04-05: Wizard is skippable (supports manual configuration)
- Plan 04-05: Learning happens after registry update but before undo window
- Plan 04-05: Defer actions skip learning (neutral, doesn't indicate interest)
- Plan 05-02: Use Obsidian Notice API with 0ms timeout for persistent progress display
- Plan 05-02: Progress bar uses Unicode characters (█ filled, ░ empty) for visual feedback
- Plan 05-02: Auto-dismiss success messages after 5s (Obsidian default)
- Plan 05-02: Non-blocking updates via start/update/complete/error lifecycle
- Plan 05-02: Use Obsidian Notice API with 0ms timeout for persistent progress display
- Plan 05-02: Progress bar uses Unicode characters (█ filled, ░ empty) for visual feedback
- Plan 05-02: Auto-dismiss success messages after 5s (Obsidian default)
- Plan 05-02: Non-blocking updates via start/update/complete/error lifecycle
- Plan 05-03: Exponential backoff with 2x multiplier, capped at 5000ms max delay
- Plan 05-03: Jitter of 0-50ms to prevent thundering herd when multiple operations retry simultaneously
- Plan 05-03: Fail-fast for non-retryable errors (only retry SQLITE_BUSY)
- Plan 05-03: 5 retry attempts by default with 100ms initial delay
- Plan 05-04: ErrorModal displays collapsible technical details for debugging
- Plan 05-04: Database operations wrapped with 5 retry attempts at 100ms initial delay
- Plan 05-04: BatchService shows Notice on error, then re-throws for upstream handling
- Plan 05-04: ValidationService catches errors and returns validation failure instead of throwing
- Plan 05-06: Use lowercase + forward slash normalization for all path and key comparisons
- Plan 05-06: Normalize item keys before registry lookups to prevent case-sensitivity bugs
- Plan 05-06: Preserve original paths for file operations; only normalize for comparison

### Pending Todos

1. **Verify validation features with incomplete items** (2026-01-24)
   - Area: validation
   - Context: Phase 3 validation system fully implemented but not tested with incomplete items (user's library has 100% complete metadata)
   - Files: src/ui/triage-card.ts, src/ui/override-modal.ts, src/ui/triage-view.ts

### Blockers/Concerns

**Phase 1 (Foundation):** COMPLETE
- SQLite locking: MITIGATED - sql.js reads database into memory
- Schema changes: RESOLVED - Version detection implemented in 01-02
- UI freezing: RESOLVED - processInChunks implemented in 01-02

**Phase 2 (Batch Workflow):** COMPLETE
- Card-based UI patterns: RESOLVED - Implemented in 02-02 with theme-compatible CSS

**Phase 3 (Quality Gates):** COMPLETE
- All verification gaps closed with 03-03 gap closure plan
- Publisher field validation complete
- Quality gate system fully functional

**Phase 4 (Onboarding & Recommendations):** COMPLETE ✓
- All 5 plans executed successfully
- Verification passed: 7/7 success criteria verified
- Profile infrastructure: Types, service, keyword extraction
- Recommendation engine: Multi-signal scoring with adaptive learning
- Setup wizard: Multi-step onboarding with seed paper selection (5-15 papers)
- Profile integration: Batch scoring, settings UI, learning from user feedback
- Known limitation: Tag scoring returns 0 (ZoteroItem schema missing tags field - documented, acceptable)

**Phase 5 (Polish):** IN PROGRESS
- Plan 05-02 complete: ProgressTracker infrastructure for non-blocking progress feedback
- Plan 05-03 complete: Exponential backoff retry handler for SQLITE_BUSY errors
- Plan 05-04 complete: Error handling integrated into database and services
- Plan 05-06 complete: Cross-platform path and key normalization
- Error handling: ErrorModal displays user-friendly messages, database operations auto-retry on SQLITE_BUSY
- Cross-platform reliability: Case-insensitive comparisons prevent Linux-specific bugs

## Session Continuity

Last session: 2026-01-24T22:53:34Z
Stopped at: Completed 05-04-PLAN.md (Error Handling Integration)
Resume file: None
Next plan: 05-05 or other polish plans

Config (if exists):
{
  "mode": "yolo",
  "depth": "standard",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "budget",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  }
}
