# Phase 1: Foundation - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Plugin can read Zotero database, persist processing state, and generate basic literature notes. Users can configure database path and manually import single items. Batch processing, quality gates, and recommendations are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Literature note structure
- Rich metadata in YAML frontmatter: title, authors, year, DOI, zotero-link, journal, volume, pages, abstract, tags, item-type, PDF path
- Structured template for note body with headings (## Summary, ## Key Points, ## Notes) as scaffolding for user to fill
- No abstract in body (it's in frontmatter) — body is for user's own notes

### Import interaction
- Search modal to find items: user opens modal, types to search by title/author, selects from results
- Search results show: title + authors + year (compact, enough to identify)
- Preview before creating: after selecting item, show preview of what will be created, then confirm to create
- Notice toast on success: "Note created: [Title]" that auto-dismisses

### Settings & configuration
- Standard Obsidian settings tab (Settings > Community plugins > ZotBridge)
- Auto-detect Zotero database path: try standard paths first, fall back to manual input if not found
- Configurable folder for literature notes: user sets destination folder in settings

### Feedback & errors
- Progress bar + count when loading large libraries (e.g., "Loading 2500/5000 items")
- Block with clear error if unsupported Zotero schema version detected — explain which versions are supported

### Claude's Discretion
- Author formatting in frontmatter (YAML list vs single string)
- File naming convention for literature notes (citekey style, title-based, or Zotero ID)
- Search scope (all items vs unprocessed only)
- Connection status indicator (status bar vs only on error)
- Error display approach (notice toast vs modal based on severity)

</decisions>

<specifics>
## Specific Ideas

- Preview-then-confirm pattern for imports provides a safety net before creating files
- Progress bar is important for large libraries (5000+ items) to show the plugin is working
- Rich metadata captures everything useful without being "dump everything" approach

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-01-22*
