---
phase: 07-tag-based-recommendations
plan: 01
subsystem: recommendations
tags: [stemmer, porter-stemmer, tag-scoring, multi-signal, profile-initialization]

# Dependency graph
requires:
  - phase: 06-tag-infrastructure-&-extraction
    provides: Tag extraction from Zotero database; tags field on ZoteroItem with annotation tag filtering
provides:
  - Tag-based scoring integrated into recommendation engine alongside author/keyword signals
  - Profile initialization extracts top 20 tags from seed papers with frequency-based weighting
  - Tag normalization utilities (case-insensitive + Porter stemming) for consistent matching
  - Noise tag filtering (workflow tags: to-read, important, review; annotation tags: custom-color-*, highlight-*)
affects: [08-ux-enhancements, adaptive-learning]

# Tech tracking
tech-stack:
  added: [stemmer (npm package for Porter stemmer)]
  patterns:
    - "Tag normalization with stemming for linguistic variation handling"
    - "Frequency-weighted top-N signal selection in profile initialization"
    - "Linear multi-match scoring strategy (sum all matching weights)"

key-files:
  created:
    - src/utils/stemming.ts
  modified:
    - src/profile/profile-initializer.ts
    - src/profile/types.ts
    - src/recommendations/recommendation-engine.ts

key-decisions:
  - "Tag weight set to 1.5 (between keywords 2.0 and authors 1.0)"
  - "Top 20 tags from seed papers for profile (frequency-weighted)"
  - "Linear multi-match scoring: sum all matching tag weights, no diminishing returns"
  - "Items with no tags score 0 (neutral, not penalized)"
  - "Multi-word tags use exact match after stemming (don't split phrases)"
  - "Noise tag filtering includes workflow tags AND annotation tags (defense-in-depth)"

patterns-established:
  - "Pattern 1: Centralized normalization (normalizeTag function) used everywhere for consistency"
  - "Pattern 2: Defensive noise filtering at profile construction prevents workflow metadata from polluting recommendations"
  - "Pattern 3: Tag scoring follows same pattern as author/keyword scoring (summing weighted matches)"

# Metrics
duration: 4min
completed: 2026-01-26
---

# Phase 07 Plan 01: Tag-Based Recommendations Summary

**Tag-based scoring with Porter stemming and frequency-weighted top-20 profile tags, integrated into multi-signal recommendation engine**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-26T11:13:30Z
- **Completed:** 2026-01-26T11:17:43Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Tag profile building extracts top 20 most frequent tags from seed papers with frequency-based weights
- Tag scoring implementation matches item tags to profile using case-insensitive Porter stemming
- Noise tag filtering prevents workflow metadata ('to-read', 'important') and annotation tags ('custom-color-*', 'highlight-*') from polluting recommendations
- Tag signals contribute to recommendation scores alongside existing author and keyword signals
- DEFAULT_PROFILE_WEIGHTS.tagWeight updated to 1.5 (positioned between keywords and authors)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build tag profile from seed papers with top-20 frequency weighting** - `a212dda` (feat)
   - Install stemmer package
   - Create src/utils/stemming.ts with normalizeTag and isNoiseTag
   - Add buildTagProfile method to ProfileInitializer
   - Update DEFAULT_PROFILE_WEIGHTS.tagWeight to 1.5

2. **Task 2: Implement tag scoring in recommendation engine with stemmed matching** - `67540de` (feat)
   - Replace calculateTagScore stub with full implementation
   - Import normalizeTag for case-insensitive stemmed matching
   - Linear multi-match scoring: sum all matching tag weights
   - Items with no tags return score 0 (neutral)

## Files Created/Modified
- `src/utils/stemming.ts` - Tag normalization utilities (normalizeTag with Porter stemmer, isNoiseTag filter)
- `src/profile/profile-initializer.ts` - Added buildTagProfile method extracting top 20 tags with frequency weighting
- `src/profile/types.ts` - Updated DEFAULT_PROFILE_WEIGHTS.tagWeight from 1.0 to 1.5
- `src/recommendations/recommendation-engine.ts` - Implemented calculateTagScore with stemmed matching and linear multi-match scoring
- `package.json` / `package-lock.json` - Added stemmer dependency

## Decisions Made

**Tag weight positioning:** Set tagWeight to 1.5, positioned between keywords (2.0) and authors (1.0) per Phase 7 CONTEXT.md decision. This gives tags moderate importance while allowing keyword signals to dominate when both match.

**Top-N selection:** Selected top 20 tags from seed papers for profile. Frequency-based filtering ensures high-signal tags dominate; minimum frequency threshold of 1 allows rare but meaningful tags. Research showed 10-30 is typical; 20 balances coverage vs noise.

**Multi-match scoring strategy:** Linear multi-match (sum all matching weights) chosen over diminishing returns or binary threshold. Linear approach is fair and straightforward: item with tags [machine, learning, deep] matching profile [machine, learning] scores weight(machine) + weight(learning). Doesn't penalize diverse papers.

**No-tag handling:** Items without tags return score 0 (neutral, not penalized). Tags are enhancement signal; absence doesn't indicate irrelevance. Preserves recency/keyword/author signals for untagged items.

**Multi-word tag handling:** Exact match after stemming, don't split. 'machine learning' matches 'machine learning' only, not 'machine' or 'learning' separately. Preserves semantic phrases and simplifies implementation.

**Noise tag filtering:** Defense-in-depth approach filters both workflow tags (to-read, important, review, inbox, etc.) AND annotation tags (custom-color-*, highlight-*, annotation-*) despite Phase 6 claiming annotation tags already filtered. Prevents any potential leakage if extraction logic changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - stemmer integration, tag normalization, and scoring implementation worked as expected. TypeScript compilation succeeded with no errors.

## User Setup Required

None - no external service configuration required. Stemmer is a pure JavaScript library with no external dependencies.

## Next Phase Readiness

**Ready for adaptive learning (Plan 02):**
- Tag scoring infrastructure in place
- Profile tags properly weighted and normalized
- Scoring contribution visible in scoreBreakdown.tagScore
- Baseline weights available for decay mechanism

**Ready for settings UI (future phase):**
- DEFAULT_PROFILE_WEIGHTS.tagWeight can be exposed as user-configurable slider (0.0-3.0 range per CONTEXT.md)
- Tag weight already integrated into scoring pipeline

**No blockers or concerns:**
- Tag extraction from Phase 6 provides tags field on ZoteroItem
- Profile structure already supports Map<string, number> for tag weights
- Recommendation engine already implements multi-signal scoring pattern

---
*Phase: 07-tag-based-recommendations*
*Completed: 2026-01-26*
