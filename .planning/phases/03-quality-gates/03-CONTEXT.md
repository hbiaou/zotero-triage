# Phase 3: Quality Gates - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a metadata validation system that checks completeness before import. The system blocks or warns about incomplete items, shows users exactly what's missing, provides links to fix metadata in Zotero, and supports configurable quality rules per item type. Enhanced YAML frontmatter includes comprehensive metadata beyond Phase 1 basics.

</domain>

<decisions>
## Implementation Decisions

### Validation Blocking Behavior
- **Configurable strictness**: User controls whether validation failures block import or just warn
- **Default mode**: Block by default (strict validation) - users must opt-in to allow incomplete imports
- **Blocked item actions**: Three options available:
  1. Open in Zotero (link/deep-link to fix metadata)
  2. Override and accept (force import despite missing fields - requires confirmation modal)
  3. Skip for now (defer item - may reappear after metadata fixed)
- **Override confirmation**: Required - modal shows what's missing and impact before allowing override

### Missing Field Feedback
- **Stats dashboard**: Show count of items blocked by validation
- **Batch summary**: After batch generation, display count of items with validation issues (e.g., "2 items have validation issues")

### Quality Rules Per Item Type
- **Journal articles - required fields**:
  - Core identifiers: DOI, Year, Journal name
  - Authorship: Authors (at least one)
  - Content: Title, Abstract
- **Books - required fields**:
  - Core identifiers: ISBN, Year, Publisher
  - Authorship: Authors or Editors (at least one)
  - Content: Title
- **Rule configurability**: User configurable via settings
- **Settings UI**: Per-type checkboxes - settings tab shows item types with checkboxes for fields to require

### Metadata Enhancement Strategy
- **Additional metadata to extract**:
  - Publication details: Journal/Publisher, Volume, Issue, Pages
  - Categorization: Tags, Collections, Item type
  - Content signals: Abstract, Keywords, Notes
- **Optional field handling**: Include with placeholder (e.g., `keywords: []` or `keywords: ""`) - makes intent explicit
- **Tag filtering**: User configurable - settings allow defining tag inclusion/exclusion patterns

### Claude's Discretion
- Feedback presentation location (badge vs inline on card) - optimize for UI clarity and space
- Level of detail in missing field explanations (field names only vs with context)
- Zotero deep-link implementation (cross-platform reliability)
- YAML structure (flat vs grouped) - balance clarity and Dataview compatibility
- Additional metadata fields that add research value

</decisions>

<specifics>
## Specific Ideas

No specific product references mentioned - open to standard validation patterns and research metadata best practices.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope (metadata validation and enhancement).

</deferred>

---

*Phase: 03-quality-gates*
*Context gathered: 2026-01-23*
