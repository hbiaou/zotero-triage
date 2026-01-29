# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-27)

**Core value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.
**Current focus:** Phase 12 - Settings Persistence & UI Polish

## Current Position

Phase: 12 of 12 (Settings Persistence & UI Polish)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-01-29 - Completed 12-01-PLAN.md (Settings Persistence)

Progress: [███████████░] 96% (11.5 of 12 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 33
- Average duration: ~40 min per plan
- Total execution time: ~23 hours 18 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Setup | 5 | 4h | ~48 min |
| 2. Onboarding | 3 | 2h | ~40 min |
| 3. Recommendation Engine | 5 | 4h | ~48 min |
| 4. Triage Workflow | 5 | 4h | ~48 min |
| 5. Literature Notes | 5 | 3.5h | ~42 min |
| 6. Tag Infrastructure | 3 | 2h | ~40 min |
| 7. Tag Recommendations | 3 | 2h | ~40 min |
| 8. UX Enhancements | 3 | 2.5h | ~50 min |
| 9. Library Filtering | 2 | 2h | ~62 min |
| 10. Duplicate Detection | 1 | 4min | ~4 min |
| 11. Preflight Modal | 2 | 10min | ~5 min |
| 12. Settings Persistence | 1 | 8min | ~8 min |

**Recent Trend:**
- v1.0 shipped: 23 plans across 5 phases (2026-01-25)
- v1.1 shipped: 9 plans across 3 phases (2026-01-27)
- v1.2 in progress: 6 plans in phases 9-12 (2026-01-29)
- Average ~40 min per plan
- Trend: Fast execution on simple tasks (phases 10-12: 4-8 min avg)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.2 work:

- **Phase 12**: Settings become single source of truth for recommendation preferences (not stored only in profile)
- **Phase 12**: Wizard saves preferences to settings before calling completion callback (settings-first architecture)
- **Phase 12**: Profile initializer reads preferences from settings instead of wizard parameters (decoupled flow)
- **Phase 12**: onComplete callback signature simplified to accept only seedPaperIds array (preferences in settings)
- **Phase 11**: Extract openSetupWizardAfterPreflight() method in main.ts (separate method for clarity vs inline callback)
- **Phase 11**: Inline wizard creation in settings.ts button handlers (isolated handlers vs helper method extraction)
- **Phase 11**: ensureConnectorInitialized() as fire-and-forget async wrapper (modal handles errors vs making showSetupWizard async)
- **Phase 11**: Sequential check execution for preflight (trash → duplicates → groups for UI simplicity vs parallel for speed)
- **Phase 11**: Color-coded severity levels (red/yellow/blue PatternFly standards vs single warning color)
- **Phase 11**: Zotero 6/7 compatibility via sqlite_master table check (graceful degradation for deletedItems)
- **Phase 10**: Single SQL self-join query for duplicate detection (DOI/ISBN/title in one query vs separate queries)
- **Phase 10**: SQL-based title normalization (LOWER, REPLACE, TRIM in query vs client-side JavaScript)
- **Phase 10**: Graceful degradation for duplicate detection errors (return 0 duplicates vs throwing)
- **Phase 9**: Include standalone notes as research artifacts (exclude only child notes with parentItemID)
- **Phase 9**: SQL-level library filtering via INNER JOIN (filter at query time vs post-processing for performance)
- **Phase 9**: LEFT JOIN for retractedItems (graceful Zotero 6.x/7.x compatibility)
- **Phase 9**: Consistent exclusion lists between ITEMS_QUERY and ITEM_COUNT_QUERY (annotation added to count query)
- **Phase 8**: Progressive disclosure for field help (examples visible, explanations expandable)
- **Phase 7**: Porter stemming for tag matching (linguistic normalization improves matching flexibility)
- **Phase 6**: SQL-level annotation tag filtering (filter at query time vs post-processing)
- **Phase 1**: Lazy database initialization (defer connection to first use for fast startup)

### Pending Items for v1.2

**Current milestone (v1.2) addresses:**

1. Library scope filter and preflight check (from accumulated todos)
   - Exclude group libraries, feeds, trash, retracted items
   - Query-time filtering at libraryID level
   - Preflight modal with duplicate detection and trash advisories

2. ~~Fix Relevance vs Diversity persistence (from accumulated todos)~~ (DONE - Phase 12)
   - ~~Setting configured in wizard now persists to settings panel~~ (DONE - Plan 12-01)
   - Add "Reconfigure Profile" button for easy changes (Plan 12-02)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Add visual status indicators for processed items in batch | 2026-01-25 | a3d13ec | [001-add-visual-status-indicators](./quick/001-add-visual-status-indicators/) |
| 002 | Fix modal sizing and persistent settings warning | 2026-01-25 | 222f510 | [002-fix-modal-sizing-and-persistent-settings](./quick/002-fix-modal-sizing-and-persistent-settings/) |
| 003 | Fix wizard modal sizing and search input functionality | 2026-01-27 | 2311dd6 | [003-1-the-issue-with-the-triage-setup-wizard](./quick/003-1-the-issue-with-the-triage-setup-wizard/) |

### Blockers/Concerns

**v1.2 Known Constraints:**
- ~~Library filtering must be query-time (not post-processing) to maintain performance~~ (DONE - Phase 9)
- ~~Query performance needs testing with 5000+ items across multiple libraries~~ (TESTED - Phase 9: 12,876 items, no issues)
- ~~Duplicate detection needs conservative multi-field matching to avoid false positives~~ (DONE - Phase 10: DOI-first hierarchy with exact normalized title match)
- ~~Preflight checks must be non-blocking (advisory only, never prevent workflow)~~ (DONE - Phase 11: Skip button, graceful error handling)
- ~~Zotero 6 vs 7 compatibility requires graceful degradation for missing tables (retractedItems)~~ (DONE - Phase 9, extended in Phase 11 for deletedItems)

**Research flags:**
- Phase 11: Preflight must work on both Zotero 6.0+ and 7.x (Zotero 7.0+ tested in Phase 9, need Zotero 6.x testing)
- Phase 11: No direct zotero:// URI to "Duplicate Items" collection - need UI instructions for manual navigation

## Session Continuity

Last session: 2026-01-29
Stopped at: Completed 12-01-PLAN.md (Settings Persistence)
Resume file: None

**Next step:** Continue Phase 12 - Plan 02 (Settings UI Polish)

Config:
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
