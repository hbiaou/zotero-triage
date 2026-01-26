# Phase 7: Tag-Based Recommendations - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate tag-based signals into the recommendation scoring engine to improve batch relevance. Tags from Zotero items (already extracted in Phase 6) will be matched against user profile tags to generate scoring contributions alongside existing signals (keywords, authors, recency). Adaptive learning will adjust tag weights based on accept/reject feedback.

This enhances the existing recommendation system - NOT adding new UI features like tag filtering or tag cloud visualization.

</domain>

<decisions>
## Implementation Decisions

### Tag Scoring Weight & Balance
- Initial tag weight: **1.5** (between keywords 2.0 and authors 1.0)
- Tag weight is **user-configurable** in settings (advanced setting, slider range 0.0 - 3.0)
- Items with NO tags: Claude's discretion on penalty/neutral handling
- Multi-match scoring strategy: Claude's discretion (count all vs diminishing returns vs binary)

### Tag Matching Strategy
- **Case-insensitive** matching (normalize to lowercase)
- **Stemming** applied to handle variations ('networks' → 'network', 'running' → 'run')
- Multi-word delimiter handling: Claude's discretion (normalize delimiters, strip, or exact)
- **Filter common noise tags** beyond annotation tags (e.g., 'to-read', 'important', 'review')
- Annotation tags (custom-color-*, highlight-*) already filtered during extraction (Phase 6)

### Profile Tag Selection
- Number of top tags in profile: Claude's discretion
- Minimum frequency threshold: Claude's discretion
- Tag weighting in profile (equal vs frequency-weighted): Claude's discretion
- Sparse tag handling (users with 0-3 tags): Claude's discretion

### Adaptive Learning Behavior
- **Hybrid approach**: Global tag signal adjustment + per-tag weight boosts for frequently accepted/rejected tags
- Learning rate (conservative/moderate/aggressive): Claude's discretion
- Accept vs Reject feedback: **Equal weight** (symmetric updates)
- **Decay over time**: Weights gradually return toward baseline to prevent permanent extremes

### Claude's Discretion
- Multi-match scoring strategy (linear count, diminishing returns, or binary threshold)
- Items with no tags: penalty, neutral, or skip tag scoring entirely
- Multi-word tag delimiter normalization approach
- Optimal number of profile tags (10, 20, 30+)
- Minimum frequency threshold for profile tags
- Profile tag weighting strategy (equal vs frequency-weighted vs rarity-normalized)
- Sparse tag handling (use available, disable scoring, or warn user)
- Learning rate (conservative, moderate, aggressive)
- Specific noise tag patterns to filter (beyond annotation tags)

</decisions>

<specifics>
## Specific Ideas

- Tag weight starts at 1.5 but user can adjust via settings slider (0.0 - 3.0 range)
- Use stemming library for linguistic normalization (consistent with keyword matching if applicable)
- Noise tag filter should catch workflow tags ('to-read', 'important', 'review', 'inbox') but not content tags
- Hybrid learning: global multiplier affects all tags, plus individual tag boost/penalty tracking
- Decay mechanism prevents "stuck" tag weights from old feedback dominating new patterns

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 07-tag-based-recommendations*
*Context gathered: 2026-01-26*
