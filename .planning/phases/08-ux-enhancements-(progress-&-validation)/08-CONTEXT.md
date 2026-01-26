# Phase 8: UX Enhancements (Progress & Validation) - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve user feedback during operations and validation guidance. This phase enhances existing workflows with better progress visibility, clearer warnings about empty profiles, helpful guidance in the override modal, and aggregated validation feedback. No new capabilities — focus is on making current features more transparent and helpful.

</domain>

<decisions>
## Implementation Decisions

### Progress feedback design
- Show percentage AND count: "Scoring batch: 43% (450 / 1000)"
- No timing information (no elapsed or estimated time)
- Update frequency: throttled (every 100 items, 500ms intervals) to prevent UI jank

### Empty profile warning
- Timing: Show warning both at profile initialization AND when generating batch
- Tone: Solution-focused — "Tip: Add keywords or authors to improve recommendations"
- Suggested actions: Offer BOTH paths — re-select seed papers OR enrich metadata in Zotero
- Dismissibility: Per session only (user can dismiss for current session, reappears next session)

### Override modal guidance
- Explanation depth: Multi-sentence with fix — explain why field is required and how to fix it
- Example: "Title is required to create readable note filenames. Add a title in Zotero or provide one here."
- Link placement: Single "Open in Zotero" link at top of modal (not per-field)
- Type-specific guidance: Don't show requirements upfront — only flag missing fields to reduce clutter
- Tone: Helpful/friendly — "To create a note, we need a title. You can add one here or in Zotero"

### Validation aggregation
- Display timing: After batch completes (no interruption during workflow)
- Detail level: Expandable details — collapsed by default, user can expand to see item list
- Suggested action: Deep link to open items in Zotero (fix at source, not quick patch)

### Claude's Discretion
- Progress indicator placement (notice vs status bar vs modal) — choose based on existing Obsidian patterns
- Cancellation support for long operations — decide based on measured performance
- Validation warning grouping strategy (by type, by item, or summary) — choose most actionable presentation
- Validation aggregation action (override modal vs Zotero vs both) — user chose Zotero only

</decisions>

<specifics>
## Specific Ideas

- Progress updates must be throttled to prevent UI jank during large library scoring (5000+ items)
- Empty profile warning should guide users to actionable fixes, not just state the problem
- Override modal explanations should be conversational and explain the "why" behind requirements
- Validation warnings should avoid spam by aggregating issues and presenting them after workflow completes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope (feedback and guidance improvements only)

</deferred>

---

*Phase: 08-ux-enhancements-(progress-&-validation)*
*Context gathered: 2026-01-26*
