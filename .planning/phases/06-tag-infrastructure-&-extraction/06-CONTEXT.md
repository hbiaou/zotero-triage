# Phase 6: Tag Infrastructure & Extraction - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract tags from Zotero's SQLite database (itemTags + tags tables) and integrate them into the plugin's data layer. This phase establishes the foundation for tag-based recommendations. The boundary is clear: get tags into the system reliably with proper schema integration and backward compatibility. How tags are *used* for scoring belongs in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Tag Extraction Strategy
- Target Zotero 7 schema only (no Zotero 6 backward compatibility)
- If tag extraction fails for a specific item: item gets empty tags array, continue processing (graceful degradation)

### Claude's Discretion
- SQL query approach: per-item JOIN during loading vs batch query after items loaded
- Table existence verification: check sqlite_master first vs try/catch approach
- Profile tag storage format: Map<string, number> frequency vs top N array (choose based on Phase 7 scoring needs)
- Tags field optionality: required vs optional in ZoteroItem schema
- Schema validation failure handling: log and continue vs fail item validation
- Tag count limits: no limit vs cap at N tags per item (performance consideration)

### Data Structure & Storage
- Store tags as array of objects: `tags: {name: string, type?: number}[]`
  - Preserves Zotero's tag metadata (type 0=user, type 1=auto) for potential filtering
- Normalize tag names to lowercase for consistency during extraction
- Deduplicate tags after normalization (if normalization creates duplicates, keep only one)

### Schema Compatibility
- Items with no tags: store as empty array `tags: []` (consistent structure)
- Existing v1.0 profiles without tags: auto-migrate on first load
  - Re-extract seed papers with tags, update profile automatically (seamless upgrade)

### Tag Filtering & Cleanup
- Filter out Zotero 7 annotation tags: exclude `custom-color-*`, `highlight-*`, `ink-*`, `underline-*`
- Filter out empty or whitespace-only tags during extraction
- Preserve tag type field (0=user, 1=auto), let Phase 7 scoring logic decide how to use it

</decisions>

<specifics>
## Specific Ideas

- "Trust the proven pattern from v1.0" — use direct SQLite queries similar to existing keyword/author extraction
- "Defensive coding" — items without tags should still be usable, tags enhance but don't break core functionality
- "Seamless upgrade" — v1.0 users shouldn't need to think about tags, auto-migration on first load

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-tag-infrastructure-&-extraction*
*Context gathered: 2026-01-25*
