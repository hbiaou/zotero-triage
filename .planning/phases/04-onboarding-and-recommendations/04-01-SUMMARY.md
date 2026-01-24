---
phase: 04-onboarding-and-recommendations
plan: 01
subsystem: profile
tags: [profile-management, keyword-extraction, adaptive-learning, recommendation-engine, user-preferences]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Plugin architecture and settings persistence pattern
  - phase: 02-batch-workflow
    provides: RegistryService pattern for debounced persistence
provides:
  - UserProfile type with tags/authors/keywords weight maps
  - ProfileService for CRUD and adaptive learning
  - Keyword extraction utility for text analysis
  - Profile persistence via plugin settings
affects: [04-02-recommendation-engine, 04-03-setup-wizard, 02-batch-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Map-based signal storage with JSON serialization for settings"
    - "Debounced profile saves (2000ms) matching RegistryService pattern"
    - "Adaptive learning with weight constraints (min: 0.1, max: 5.0)"
    - "Frequency-based keyword extraction with stopword filtering"

key-files:
  created:
    - src/profile/types.ts
    - src/profile/profile-service.ts
    - src/profile/keyword-extractor.ts
  modified:
    - src/types.ts

key-decisions:
  - "Use Map<string, number> for signal weights (tags, authors, keywords) instead of objects for type safety"
  - "Serialize Maps to plain objects for JSON storage compatibility"
  - "Apply weight constraints: min 0.1, max 5.0, accept boost +0.2, reject penalty -0.1"
  - "Use 2000ms debounce delay for profile saves matching RegistryService pattern"
  - "Simple frequency-based keyword extraction with 50+ stopword list (no external NLP libraries for MVP)"
  - "Default minimum keyword length 4 characters to filter noise"
  - "Store profile in plugin settings (not separate file) for vault portability"

patterns-established:
  - "Pattern 1: ProfileService mirrors RegistryService architecture (plugin ref, debounced saves, CRUD methods)"
  - "Pattern 2: Keyword extraction uses tokenization → stopword filtering → frequency counting → top N selection"
  - "Pattern 3: Profile learning uses conservative constants to prevent runaway weights or zeros"

# Metrics
duration: 6min
completed: 2026-01-24
---

# Phase 04 Plan 01: Profile Management Infrastructure Summary

**Profile service with weighted signal storage (tags/authors/keywords), adaptive learning from user feedback, and frequency-based keyword extraction**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-24T18:18:28Z
- **Completed:** 2026-01-24T18:24:11Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Profile type definitions with Map-based signal storage for tags, authors, and keywords with weights
- ProfileService providing full CRUD operations, signal management, and adaptive learning
- Keyword extraction utility using frequency analysis with comprehensive stopword filtering
- Profile persistence integrated into plugin settings with debounced saves

## Task Commits

Each task was committed atomically:

1. **Task 1: Create profile types and data structures** - `56cad85` (feat)
2. **Task 2: Implement ProfileService for profile management** - `38d9014` (feat)
3. **Task 3: Implement keyword extraction utility** - `d95696b` (feat)

## Files Created/Modified
- `src/profile/types.ts` - UserProfile, ProfileSignal, ProfileWeights type definitions with Map-based storage
- `src/profile/profile-service.ts` - ProfileService class with CRUD, signal management, adaptive learning, debounced persistence
- `src/profile/keyword-extractor.ts` - Frequency-based keyword extraction with stopword filtering and tokenization
- `src/types.ts` - Extended ZotBridgeSettings with userProfile field (nullable)

## Decisions Made

**Map-based signal storage:**
- Used `Map<string, number>` for tags/authors/keywords instead of plain objects
- Provides type safety and cleaner iteration
- Serialized to objects for JSON storage compatibility

**Weight constraints for adaptive learning:**
- Min weight: 0.1 (prevents signals from reaching zero)
- Max weight: 5.0 (prevents runaway weights)
- Accept boost: +0.2 (conservative increment on user accept)
- Reject penalty: -0.1 (conservative decrement on user reject)
- Ensures profile remains stable and doesn't diverge to extremes

**Simple keyword extraction for MVP:**
- Frequency-based approach without external NLP libraries
- 50+ comprehensive stopword list
- Min length 4 characters (filters noise like "the", "and", "it")
- Handles hyphenated terms by splitting and processing parts
- Sufficient for academic paper text (titles/abstracts)

**Profile persistence pattern:**
- Stored in plugin settings (not separate file) for vault portability
- 2000ms debounce delay matching RegistryService pattern
- Immediate save on createProfile (explicit user action)
- Serialization handles Map → Object conversion for JSON

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without obstacles. Build verification passed after each task.

## User Setup Required

None - no external service configuration required. Profile infrastructure is internal to plugin.

## Next Phase Readiness

**Ready for next phase:**
- Profile types fully defined and integrated into settings
- ProfileService provides complete API for profile management
- Keyword extraction ready for use in seed paper processing
- Adaptive learning foundation in place for recommendation engine

**Next steps:**
- Plan 04-02: Implement recommendation engine using ProfileService for scoring
- Plan 04-03: Build setup wizard that creates profiles and extracts signals from seed papers
- Integrate recordAccept/recordReject into triage view (Phase 2 extension)

**Notes:**
- Tag and keyword extraction from ZoteroItem not yet implemented (ZoteroItem doesn't have tags field)
- recordAccept/recordReject currently only boost/diminish author weights
- Full signal extraction will be implemented in setup wizard when processing seed papers

---
*Phase: 04-onboarding-and-recommendations*
*Completed: 2026-01-24*
