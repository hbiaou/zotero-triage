# Phase 12: Settings Persistence & UI Polish - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Recommendation settings configured in wizard (Relevance vs Diversity, library selection) persist to settings panel with easy reconfiguration. Users can modify these settings later without re-running the full wizard. This phase connects existing wizard choices to the settings panel and provides reconfiguration flows.

</domain>

<decisions>
## Implementation Decisions

### Settings persistence flow
- **Save timing**: Settings save immediately on wizard completion
- **Manual edits**: Changes in settings panel apply immediately (no Save button required)
- **Library filter coupling**: Library filter is tied to profile configuration (changing library triggers profile re-init warning)
- **Editability**: Claude's discretion on which settings are read-only vs directly editable in settings panel

### Reconfigure UI pattern
- **Button behavior**: Claude's discretion on whether to re-open full wizard or show targeted settings dialog
- **Seed paper preservation**: When wizard re-opens, pre-select existing seed papers (user can modify before continuing)
- **Button granularity**: Claude's discretion on unified vs separate reconfigure buttons for different aspects
- **Active batch handling**: Claude's discretion on whether to preserve or invalidate current batch when profile is reconfigured

### Library change behavior
- **Change trigger**: Claude's discretion on showing warning modal vs immediate application
- **Re-init trigger**: Claude's discretion on automatic vs manual profile re-initialization after library change
- **Warning content**: Simple confirmation message ('Changing library will reset your profile. Continue?')
- **Progress preservation**: Processing history persists even for items filtered out by new library selection

### Settings panel layout
- **Grouping strategy**: Claude's discretion on how to group recommendation settings (single section vs multiple)
- **Library selector placement**: Claude's discretion on whether library filter appears in main settings or separate location
- **Visual hierarchy**: Settings ordered by logical flow (library → profile → batch → output)
- **Profile state display**: Claude's discretion on whether to show read-only profile metadata (seed count, dates, etc.)

### Claude's Discretion
- Which settings should be wizard-only vs directly editable in settings panel
- Whether reconfigure button re-opens full wizard or shows targeted dialog
- Single unified reconfigure button vs separate buttons for different aspects
- Whether to preserve or invalidate current batch during reconfiguration
- Whether library change shows warning modal or applies immediately
- Whether library change triggers automatic re-init or requires manual action
- How to group recommendation settings (single section vs multiple groups)
- Where library selector appears (main settings panel vs separate)
- Whether to display read-only profile metadata in settings panel

</decisions>

<specifics>
## Specific Ideas

- Settings should feel immediate and responsive (no explicit Save button for most changes)
- Library changes are high-impact and should be treated carefully (tied to profile)
- Processing history should be preserved across library changes (user's work shouldn't be lost)
- Settings should follow logical setup flow: library scope → profile configuration → batch generation → output

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-settings-persistence-&-ui-polish*
*Context gathered: 2026-01-29*
