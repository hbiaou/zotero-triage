# Phase 4: Onboarding & Recommendations - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two connected capabilities:
1. **Setup wizard** - First-run guided configuration for new users (database path, preferences, seed paper selection)
2. **Recommendation engine** - Intelligent batch generation based on user interest profile (tag/author/keyword matching with adaptive learning)

The wizard establishes user preferences and creates an initial profile. The recommendation engine uses that profile to generate relevant batches, learning from user actions over time.

</domain>

<decisions>
## Implementation Decisions

### Wizard Flow & Steps

- **Trigger:** Wizard appears only on first plugin load (one-time setup)
- **Skippable:** Users can skip wizard entirely and configure via settings tab instead
- **Steps collected:**
  1. Zotero database path
  2. Batch size and quality gate preferences
  3. Seed paper selection (10 papers representing research interests)
- **Re-run capability:** Settings tab provides both "Re-run setup wizard" button AND direct profile editing view
- Users can re-run wizard from scratch OR edit their profile directly (re-select seeds, update preferences)

### Seed Paper Selection

- **Selection interface:** Browse with filters (year, item type, tags) rather than search or pre-filtered list
- **Display format:** Show title + authors + year only (minimal info to identify papers)
- **Guidance:** Display helpful tips ("Pick papers that represent your current research interests")
- **Seed count:** Flexible range (not exactly 10) — minimum needed for meaningful profile, maximum to avoid over-narrowing

### Profile & Preferences

- **Extracted signals:** Tags + authors + keywords (automatic keywords extracted from titles/abstracts, in addition to Zotero tags and authors)
- **Weighting strategy:** Frequency-based weighting (signals appearing in more seed papers get higher weight)
- **Profile editing:** Full editing capabilities — users can view AND manually add/remove tags, adjust weights, exclude authors
- **Storage location:** Claude's discretion (plugin settings vs separate profile file)

### Recommendation Algorithm

- **Scoring approach:** Multiple signals + recency boost
  - Base score from tag/author/keyword matching with frequency-based weights
  - Additional boost for recent publications
- **Relevance vs diversity:** User-configurable setting to choose preference (pure relevance vs balanced diversity)
- **Cold-start handling:** Random sampling when no profile exists (helps users discover their library)
- **Adaptive learning:** Learn from both accepts AND rejects
  - Accepted items boost those tags/authors/keywords in profile over time
  - Rejected items diminish those signals — profile evolves with user behavior

### Claude's Discretion

- Exact scoring algorithm implementation
- Profile storage location (settings vs separate file)
- Flexible seed count range (determine min/max values)
- Keyword extraction method from titles/abstracts
- Diversity algorithm when user chooses balanced mode

</decisions>

<specifics>
## Specific Ideas

- Wizard should feel lightweight and optional — users who know their library can skip straight to manual config
- Profile editing view should show current weights/signals clearly so users understand what's driving recommendations
- Recommendations should "learn" over time but users should be able to reset or override the learning (full control)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-onboarding-and-recommendations*
*Context gathered: 2026-01-23*
