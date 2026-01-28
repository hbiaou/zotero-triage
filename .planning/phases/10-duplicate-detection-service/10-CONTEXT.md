# Phase 10: Duplicate Detection Service - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Identify duplicate items within the user's personal library (filtered scope from Phase 9) and display non-blocking advisory during onboarding preflight check. Provides deep links to Zotero's duplicate management interface. Does not include duplicate resolution or merging - only detection and notification.

</domain>

<decisions>
## Implementation Decisions

### Matching Strategy
- **DOI-first hierarchy**: Match by DOI if present (most reliable), fall back to ISBN for books, then normalized title matching
- **Normalized exact match for titles**: Strip punctuation, lowercase, remove articles (a/an/the), require exact match - avoids false positives while catching obvious duplicates
- **Personal library scope only**: Only detect duplicates within selected personal library (respects Phase 9 filtering), excludes group libraries
- **Claude's Discretion**: Item type-aware matching rules (apply DOI for articles, ISBN for books, etc.)

### Display & Messaging
- **Preflight modal section**: Duplicate warning appears as part of comprehensive preflight check (Phase 11), grouped with trash count and library advisories
- **Summary count only**: Display total duplicate count with link to Zotero - "X potential duplicates found" - simple and non-intrusive
- **Action-oriented tone**: "Found X duplicates that may affect recommendations. Review and merge before continuing." - encourages cleanup without blocking
- **Dismissible per session**: User can dismiss warning for current onboarding session, reappears on next setup/reconfigure

### Performance Approach
- **Single self-join query**: One SQL query with self-join on DOI/ISBN/normalized title - fast database operation, single round-trip
- **Silent detection**: No separate progress indicator - detection happens as part of preflight check with shared progress bar
- **Claude's Discretion**: Caching strategy (session vs persistent vs none) and timeout handling (graceful degradation if exceeds 30s)

### Deep Link Behavior
- **Duplicate Items panel**: Link opens Zotero's built-in Duplicate Items view (left sidebar) showing native duplicate detection
- **Auto-launch Zotero**: zotero:// protocol launches Zotero automatically if not running (OS-dependent behavior)
- **Version detection**: Detect Zotero version from database schema, adjust URI format if needed to handle 6.x vs 7.x differences
- **Claude's Discretion**: Exact zotero:// URI construction (research correct format for duplicate items panel)

</decisions>

<specifics>
## Specific Ideas

- Query should leverage Phase 9's library filtering - duplicate detection operates on same filtered item set as recommendation engine
- Performance target: <30 seconds for 5000+ item libraries (success criteria from roadmap)
- Non-blocking design: user can proceed with onboarding despite duplicate warnings
- Title normalization should be consistent with any future search/matching features

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 10-duplicate-detection-service*
*Context gathered: 2026-01-28*
