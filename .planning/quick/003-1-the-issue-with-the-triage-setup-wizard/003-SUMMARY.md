---
phase: quick-003
plan: 01
subsystem: ui
tags: [obsidian, modal, search, wizard, css, flexbox, ux]

# Dependency graph
requires:
  - phase: 08-ux-enhancements
    provides: Modal and search UI components
provides:
  - Responsive wizard modal without horizontal overflow (90vw max-width)
  - Functional search input with selective re-rendering pattern
  - Full-width search box layout in seed picker filters
affects: [onboarding, seed-selection, triage-view]

# Tech tracking
tech-stack:
  added: []
  patterns: [selective-re-rendering, flexbox-responsive-filters]

key-files:
  created: []
  modified:
    - styles.css
    - src/ui/seed-paper-picker.ts
    - src/ui/triage-view.ts
    - src/ui/modals/triageSetupWizard.ts

key-decisions:
  - "Selective re-rendering pattern instead of full component re-render for search filtering"
  - "Search input on separate flex row using flex: 1 1 100% for full width"
  - "Modal sizing via :has() selector targeting Obsidian modal wrapper"

patterns-established:
  - "Selective re-render: Only update filtered content, preserve interactive elements (search inputs, filters)"
  - "Two-row flexbox layout: Full-width search on row 1, equal-width filters on row 2"

# Metrics
duration: ~45min (across multiple checkpoint cycles)
completed: 2026-01-27
---

# Quick Task 003: Wizard Modal and Search Input Fixes

**Responsive wizard modal (90vw) with functional full-width search using selective re-rendering pattern**

## Performance

- **Duration:** ~45 minutes (with user verification checkpoints)
- **Started:** 2026-01-27
- **Completed:** 2026-01-27
- **Tasks:** 3 (with refinements)
- **Files modified:** 4

## Accomplishments

- Fixed wizard modal horizontal overflow with CSS targeting Obsidian modal wrapper
- Implemented selective re-rendering pattern preventing search input destruction
- Redesigned filter layout giving search input full width on separate row
- Search now functional in both seed picker and triage batch view

## Task Commits

Each issue was committed atomically:

1. **Task 1: Fix wizard modal sizing** - `e5bc1e9` (fix)
   - Added `.modal:has(.zotero-triage-wizard)` CSS rule with 90vw max-width
   - Prevents horizontal scroll at all viewport widths

2. **Task 2: Initial search fix attempt** - `b24fd41` (fix - incomplete)
   - Attempted value restoration approach
   - Revealed deeper issue: search input destroyed on every keystroke

3. **Task 3: Fix search functionality with selective re-rendering** - `3671c49` (fix)
   - Added `renderPaperListOnly()` in seed-paper-picker.ts
   - Added `renderCardListOnly()` in triage-view.ts
   - Search input now persists during filtering, accepts continuous typing

4. **Task 3a: Fix search input width** - `2311dd6` (fix)
   - Adjusted flexbox layout with `flex: 1 1 100%` on search wrapper
   - Search appears on own row, full width above other filters

## Files Created/Modified

- `styles.css` - Added modal sizing rule and flexbox search layout adjustments
- `src/ui/seed-paper-picker.ts` - Selective re-rendering methods for filtering without destroying search input
- `src/ui/triage-view.ts` - Selective re-rendering for batch view search
- `src/ui/modals/triageSetupWizard.ts` - (Task 1 - modal sizing constraint)

## Decisions Made

**1. Selective re-rendering over value restoration**
- Initial approach tried to restore input value after full re-render
- Root cause: `applyFilters()` called `render()` which called `container.empty()`, destroying search input
- Solution: Only re-render filtered content (paper list), not entire component
- Rationale: Prevents DOM destruction, maintains focus, better UX

**2. Search on separate flexbox row**
- Search was sharing equal flex space with 4 dropdowns (too narrow)
- Used `flex: 1 1 100%` to force search onto own row
- Dropdowns remain on second row with `flex: 1` and `min-width: 120px`
- Rationale: Users need to see typed text; vertical space cheaper than horizontal

**3. Modal wrapper targeting with :has() selector**
- Obsidian Modal structure: `.modal` wrapper → `.modal-content` → our contentEl
- Used `.modal:has(.zotero-triage-wizard)` to target wrapper when wizard is open
- Applied `max-width: 90vw !important` to override Obsidian defaults
- Rationale: Must constrain outer wrapper, not just inner content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Root cause deeper than anticipated**
- **Found during:** Task 2 (search input value restoration)
- **Issue:** Value restoration didn't work because input element was destroyed on every keystroke. The entire component was re-rendering (calling `container.empty()`), not just losing the value.
- **Fix:** Implemented selective re-rendering pattern with new methods:
  - `renderPaperListOnly()` / `renderCardListOnly()` - only update filtered content
  - `renderStatusOnly()` - only update status text
  - Preserved scroll position during partial re-renders
- **Files modified:** src/ui/seed-paper-picker.ts, src/ui/triage-view.ts
- **Verification:** Search input accepts continuous typing, filtering works in real-time
- **Committed in:** 3671c49

**2. [Rule 3 - Blocking] Search box width insufficient**
- **Found during:** User verification checkpoint
- **Issue:** Search functionality worked but box too narrow to see typed text. Shared equal flex space with 4 dropdowns, making each ~20% width.
- **Fix:**
  - Added `flex: 1 1 100%` to `.seed-picker-search` in styles.css
  - Added `flex-wrap: wrap` to `.seed-picker-filters` container
  - Added `min-width: 120px` to select dropdowns
  - Result: Search takes full width on row 1, dropdowns on row 2
- **Files modified:** styles.css, src/ui/seed-paper-picker.ts (comment update)
- **Verification:** Search input spans full width, typed text visible
- **Committed in:** 2311dd6

---

**Total deviations:** 2 auto-fixed (2 blocking issues requiring architectural adjustment)
**Impact on plan:** Both issues were discovery-driven fixes. Plan addressed symptoms; execution revealed and fixed root causes. Pattern established (selective re-rendering) will benefit future similar scenarios.

## Issues Encountered

**Issue 1: Initial fix approach inadequate**
- Attempted to restore `this.searchInput.value` after re-render
- Discovered during testing that input was being destroyed entirely, not just losing value
- Resolution: Changed strategy from "preserve value" to "prevent destruction" via selective re-rendering

**Issue 2: CSS flexbox behavior with mixed content**
- Search input and select dropdowns all received equal flex space
- Made search unusably narrow (5 items sharing 100% width = 20% each)
- Resolution: Separated search into own flex row using `flex: 1 1 100%` with `flex-wrap: wrap` on container

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready:**
- Wizard modal properly sized and responsive across viewport widths
- Search functionality works in both seed picker and batch triage view
- Onboarding workflow UX improved, reducing user frustration
- Selective re-rendering pattern established for future filter implementations

**Pattern for future use:**
When implementing real-time filtering on lists:
1. Store filter state as class properties (survives re-render)
2. Create selective re-render methods that only update filtered content
3. Preserve interactive elements (inputs, filters) by not calling `container.empty()` on parent
4. Maintain scroll position across partial re-renders using `requestAnimationFrame()`

---
*Phase: quick-003*
*Completed: 2026-01-27*
