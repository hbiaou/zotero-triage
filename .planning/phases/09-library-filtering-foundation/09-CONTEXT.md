# Phase 9: Library Filtering Foundation - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement query-level filtering to ensure only personal library items enter the recommendation pipeline. Group libraries, feeds, trash, and retracted items are excluded from all database queries (onboarding, batch generation, registry operations).

</domain>

<decisions>
## Implementation Decisions

### Filter scope & defaults
- **Personal library only by default**: Plugin works exclusively with user's personal library (libraryID = 1 or NULL in Zotero schema)
- **Hard-coded exclusions**: Trash, retracted items, group libraries, and feeds are ALWAYS excluded (no user configuration)
- **No settings UI**: Filtering behavior is documented in README/help only, not in settings panel (since it's not configurable)
- **Implicit behavior**: Users don't see filter indicators in UI; plugin simply operates on personal library

### User control & visibility
- **No visibility indicators**: Plugin doesn't display filter status anywhere in UI (no "Personal library (234 items)" badges)
- **Empty library error**: If user has NO personal library items (only group libraries), show error modal on startup explaining why plugin cannot function
- **No bypass mechanism**: Filter is a hard boundary with no override, developer mode, or bypass option

### Filter persistence & scope
- **Apply to all queries**: Every database query across the plugin (onboarding seed picker, batch generation, registry lookups) applies library filter
- **No migration for existing users**: Filtering only affects new onboardings after this update; existing user profiles remain untouched (simplest approach, avoids data disruption)

### Transparency & counts
- **Counts reflect filtered results**: Item counts show what's available (e.g., "234 items" = personal library count), not total database items
- **Search results count only**: When users search within UI, show search match count without mentioning library filtering context (e.g., "3 results" not "3 of 234")

### Claude's Discretion
- **Persistence strategy**: Whether to store hard-coded filter values in settings JSON for future extensibility vs treating as pure constant
- **Debug logging**: Whether to log filter statistics to console for troubleshooting or keep filtering silent
- **Error message wording**: Exact copy for empty library error modal
- **SQL query structure**: How to structure WHERE clauses for optimal performance (INNER JOIN vs WHERE IN vs libraryID checks)

</decisions>

<specifics>
## Specific Ideas

- "Hard boundary" approach: filtering is architectural, not a user-configurable feature
- Error on empty library: better to fail loudly than silently show empty lists
- No migration: avoid disrupting existing users' profiles with retroactive filtering

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-library-filtering-foundation*
*Context gathered: 2026-01-27*
