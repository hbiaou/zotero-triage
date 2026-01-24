# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2025-01-22)

**Core value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

**Current focus:** Phase 4 - Onboarding & Recommendations

## Current Position

Phase: 4 of 5 (Onboarding & Recommendations)
Plan: 04 of 04
Status: Phase complete
Last activity: 2026-01-24 — Completed 04-04-PLAN.md

Progress: [█████████░] 78%

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 77 min
- Total execution time: 18.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4/4 | 28 min | 7 min |
| 02-batch-workflow | 3/3 | 74 min | 25 min |
| 03-quality-gates | 3/3 | 945 min | 315 min |
| 04-onboarding-and-recommendations | 4/4 | 26 min | 7 min |

**Recent Trend:**
- Last 5 plans: 03-03 (3 min), 04-01 (6 min), 04-02 (5 min), 04-03 (8 min), 04-04 (7 min)
- Trend: Phase 4 completed with consistent fast velocity; recommendation system fully integrated

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

### Pending Todos

1. **Verify validation features with incomplete items** (2026-01-24)
   - Area: validation
   - Context: Phase 3 validation system fully implemented but not tested with incomplete items (user's library has 100% complete metadata)
   - Files: src/ui/triage-card.ts, src/ui/override-modal.ts, src/ui/triage-view.ts

2. **Wire adaptive learning into triage actions** (2026-01-24)
   - Area: recommendations
   - Context: BatchService has recordAccept/recordReject methods but they're not called from triage-view.ts
   - Files: src/ui/triage-view.ts
   - Action: Call batchService.recordAccept/recordReject on user actions

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

**Phase 4 (Onboarding & Recommendations):** COMPLETE
- Profile infrastructure: COMPLETE - Types, service, and keyword extraction implemented
- Recommendation engine: COMPLETE - Multi-signal scoring with adaptive learning
- Setup wizard: COMPLETE - Multi-step onboarding with seed paper selection
- Profile integration: COMPLETE - BatchService uses recommendation scoring, settings UI provides full profile control
- Integration gap: recordAccept/recordReject not wired from triage-view.ts (see Pending Todos)
- Known limitation: Tag scoring returns 0 (ZoteroItem schema missing tags field)

## Session Continuity

Last session: 2026-01-24T19:36:11Z
Stopped at: Completed 04-04-PLAN.md (Phase 4 complete)
Resume file: None
Next phase: 05-polish

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
