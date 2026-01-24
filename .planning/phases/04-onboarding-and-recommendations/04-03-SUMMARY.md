---
phase: 04-onboarding-and-recommendations
plan: 03
subsystem: ui
tags: [obsidian, modal, onboarding, profile, setup-wizard]

# Dependency graph
requires:
  - phase: 04-01
    provides: Profile types, ProfileService, keyword extraction for signal extraction
  - phase: 04-02
    provides: RecommendationEngine for profile-based recommendations
provides:
  - SetupWizardModal for first-run setup experience
  - SeedPaperPicker component for browseable paper selection
  - ProfileInitializer for creating profiles from seed papers
  - Complete onboarding flow with database configuration and preference collection
affects: [05-polish, future-onboarding-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-step modal wizard pattern for complex configuration flows"
    - "Component-based UI with container rendering (SeedPaperPicker)"
    - "Frequency-based signal weighting for profile initialization"

key-files:
  created:
    - src/ui/setup-wizard-modal.ts
    - src/ui/seed-paper-picker.ts
    - src/profile/profile-initializer.ts
  modified:
    - styles.css

key-decisions:
  - "Three-step wizard: database → preferences → seed papers"
  - "Skippable wizard (allows manual configuration via settings tab)"
  - "Min 5 / max 15 seed papers for profile initialization"
  - "Frequency-based weighting: signal appearing in N papers gets weight N"
  - "Load items before seed picker step (smooth UX, no loading delay)"
  - "Relevance vs Diversity slider (0-1) with labels for user clarity"

patterns-established:
  - "Modal wizard with progress indicator (step X of Y)"
  - "Step validation before advancement (database path exists, min seeds selected)"
  - "Filter-based browsing pattern (year/type/tag filters for large item lists)"

# Metrics
duration: 8min
completed: 2026-01-24
---

# Phase 04 Plan 03: Setup Wizard Summary

**Multi-step onboarding wizard with seed paper selection and frequency-based profile initialization**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-24T18:40:37Z
- **Completed:** 2026-01-24T18:48:47Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- First-run setup wizard guides users through database configuration and profile creation
- Seed paper picker enables browsing Zotero library with filters for selecting research interest papers
- Profile initialization extracts signals (tags, authors, keywords) with frequency-based weighting

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SetupWizardModal with multi-step flow** - `187030f` (feat)
2. **Task 2: Create SeedPaperPicker component for paper selection** - `d3010de` (feat)
3. **Task 3: Implement ProfileInitializer for profile creation from seeds** - `3b16e0e` (feat, pre-existing commit)

## Files Created/Modified
- `src/ui/setup-wizard-modal.ts` - Multi-step wizard modal (database, preferences, seed papers)
- `src/ui/seed-paper-picker.ts` - Browseable paper selection component with filters
- `src/profile/profile-initializer.ts` - Profile creation from seed papers with frequency weighting
- `styles.css` - CSS for wizard and picker components (theme-compatible)

## Decisions Made

**Wizard flow decisions:**
- Three-step wizard (database → preferences → seed papers) provides logical progression
- Skip button always visible (users can configure manually via settings tab)
- Load items before seed picker step (avoids loading spinner in final step)

**Seed selection decisions:**
- Min 5 / max 15 papers enforced (5 = minimum for meaningful profile, 15 = prevents analysis paralysis)
- Click anywhere on row to toggle selection (better UX than checkbox-only)
- Filters use dropdowns (simpler than search for MVP)

**Profile initialization decisions:**
- Frequency-based weighting: signal in 5 papers → weight 5.0 (direct frequency mapping)
- Extract 20 keywords per paper (balances coverage vs noise)
- Handle missing seed papers gracefully (log warning, continue with available papers)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Task 3 commit issue:**
- File `src/profile/profile-initializer.ts` was already committed in prior session (commit 3b16e0e)
- Write operation produced identical content
- No re-commit needed (file already tracked and committed)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 5 (Polish):**
- Complete onboarding flow ready for first-time users
- Profile initialization from seed papers functional
- All UI components theme-compatible

**Integration needed:**
- Wire setup wizard into plugin onload (check if profile exists, show wizard if not)
- Add "Reset Profile" command to trigger wizard again
- Consider adding progress saving (resume wizard if interrupted)

**Known limitations:**
- No tag filtering in seed picker if ZoteroItem.tags is empty (depends on connector loading tags)
- Wizard doesn't validate connectivity during database step (user must click "Test Connection" manually)

---
*Phase: 04-onboarding-and-recommendations*
*Completed: 2026-01-24*
