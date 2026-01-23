# Phase 2: Batch Workflow - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Triage interface where users process Zotero items in batches using a card-based UI with Accept/Reject/Defer actions. Users can generate batches of candidate items, review them in cards, take actions, and see progress stats. This phase does NOT include: quality gates (Phase 3), intelligent recommendations (Phase 4), or advanced filtering.

</domain>

<decisions>
## Implementation Decisions

### Action mechanics
- Buttons only for actions (no keyboard shortcuts in Phase 2)
- All actions immediate + Undo capability
- Undo appears as toast notification in corner, available for 3 seconds
- User specified: "All actions immediate + Undo" for fast workflow with safety net

### Batch generation & sizing
- Batch size is user-configurable in settings
- Default batch size: 5 items (conservative starting point, encourages regular small sessions)
- Item selection: Most recent first (prioritize recently added items)
- If insufficient unprocessed items: Offer to include deferred items to fill batch

### Progress tracking & stats
- Dashboard displays:
  - Total items breakdown (imported/rejected/deferred/pending)
  - Current batch progress (e.g., "3/5 processed")
  - Session stats (items processed in current Obsidian session)
  - Processing velocity (items per day/week)
- When batch fully processed: Show completion message + prompt to generate next batch
  - Celebrates progress while giving user choice to continue or take break

### Claude's Discretion
- Post-action flow (how cards transition after Accept/Reject/Defer)
- Stats dashboard placement (above cards, sidebar, or separate view)
- Real-time vs periodic stats updates
- Exact UI layout and styling for cards
- Toast notification styling and animations

</decisions>

<specifics>
## Specific Ideas

No specific product references mentioned — open to standard approaches for card-based triage interfaces.

User emphasized:
- Fast workflow with safety net (immediate actions + undo)
- Progressive processing without overwhelm (small default batch size)
- Clear progress visibility (multiple stat types)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-batch-workflow*
*Context gathered: 2026-01-23*
