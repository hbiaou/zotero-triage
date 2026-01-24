---
phase: 04-onboarding-and-recommendations
plan: 02
subsystem: recommendation-engine
tags: [recommendation, scoring, adaptive-learning, profile, typescript]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Profile infrastructure with signal storage and keyword extraction"
provides:
  - "Multi-signal scoring engine (tags, authors, keywords)"
  - "Recency boost for recent publications"
  - "Diversity penalty to reduce redundancy"
  - "Adaptive learner for profile evolution from user feedback"
  - "Cold-start handling with random scores"
affects: [04-03-setup-wizard, batch-workflow, recommendations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frequency-weighted scoring algorithm"
    - "Service class pattern for recommendation engine"
    - "Cold-start handling with randomization"

key-files:
  created:
    - src/recommendations/types.ts
    - src/recommendations/recommendation-engine.ts
    - src/recommendations/adaptive-learner.ts
  modified: []

key-decisions:
  - "Default relevance-only mode (relevanceVsDiversity: 0) for MVP simplicity"
  - "3-year recency window with 1.5x multiplier for recent papers"
  - "20 keywords extracted per item for scoring"
  - "Normalize scores to 0-100 range for UI presentation"
  - "Tag extraction deferred (ZoteroItem schema doesn't include tags yet)"

patterns-established:
  - "RecommendationEngine follows service class pattern (constructor with dependencies)"
  - "Cold-start uses random scores when profile is empty"
  - "AdaptiveLearner calls profileService.recordAccept/recordReject for debounced saves"
  - "Signal extraction helper shared between scoring and learning"

# Metrics
duration: 5min
completed: 2026-01-24
---

# Phase 04 Plan 02: Recommendation Engine Summary

**Multi-signal recommendation engine with adaptive learning from user feedback, recency boost, and cold-start handling**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-24T18:30:01Z
- **Completed:** 2026-01-24T18:34:49Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Intelligent scoring algorithm matching items to user profile using tags, authors, and keywords
- Recency boost gives recent publications higher priority
- Adaptive learner evolves profile by boosting accepted signal weights and diminishing rejected ones
- Cold-start handling provides random scores when no profile exists

## Task Commits

Each task was committed atomically:

1. **Task 1: Create recommendation types** - `74ebf00` (feat)
2. **Task 2: Implement RecommendationEngine with multi-signal scoring** - `c5c10c7` (feat)
3. **Task 3: Implement AdaptiveLearner for profile evolution** - `56dd99a` (feat)

## Files Created/Modified

### Created
- `src/recommendations/types.ts` - ScoredItem, RecommendationConfig, MatchedSignal interfaces
- `src/recommendations/recommendation-engine.ts` - Profile-aware scoring with multi-signal algorithm
- `src/recommendations/adaptive-learner.ts` - Profile evolution from user accept/reject feedback

## Decisions Made

1. **Relevance-only default:** Set `relevanceVsDiversity: 0` as default for MVP - pure relevance mode is simpler and users can adjust later
2. **Recency window:** 3-year window with 1.5x multiplier balances recent vs established work
3. **Keyword extraction limit:** 20 keywords per item provides good coverage without noise
4. **Tag extraction deferred:** ZoteroItem interface doesn't include tags field yet - will be added when tag extraction is implemented in ZoteroConnector
5. **Score normalization:** Normalize to 0-100 for intuitive UI display (0 = poor match, 100 = perfect match)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully with no blocking issues.

## Next Phase Readiness

**Ready for Phase 04-03 (Setup Wizard):**
- Recommendation engine ready to score seed papers
- Adaptive learner ready to integrate with triage workflow
- Profile service ready for wizard to create initial profiles

**Known limitation:**
- Tag scoring currently returns 0 (ZoteroItem schema doesn't include tags)
- Will be addressed when tag extraction is added to ZoteroConnector in future phases

**Integration points for batch workflow:**
1. BatchService can call `RecommendationEngine.scoreItems()` to prioritize items
2. Triage view can call `AdaptiveLearner.learnFromAccept/learnFromReject()` on user actions
3. Setup wizard can use `ProfileService.createProfile()` to initialize from seed papers

---
*Phase: 04-onboarding-and-recommendations*
*Completed: 2026-01-24*
