# Project Milestones: Zotero Triage

## v1.2 Library Scope Filtering & Preflight Checks (Shipped: 2026-01-29)

**Delivered:** Ensure only relevant, high-quality items from user's personal library enter the recommendation pipeline by filtering unwanted sources and detecting issues before onboarding.

**Phases completed:** 9-13 (8 plans total)

**Key accomplishments:**

- **Query-level Library Filtering**: All database queries filter to personal library only, excluding group libraries, feeds, trash, and retracted items via SQL INNER/LEFT JOIN pattern with Zotero 6/7 compatibility
- **Duplicate Detection Service**: DOI-first hierarchy (DOI → ISBN → normalized title) with self-join SQL query, providing duplicate counts and sample groups with graceful error handling
- **Comprehensive Preflight Check System**: Color-coded advisory modal (red/yellow/blue severity) with sequential health checks (trash/duplicates/groups), non-blocking design, 15-second timeout message for large libraries
- **Settings Persistence Architecture**: Recommendation preferences (relevance vs diversity, recency boost, library filter) persist from wizard to settings panel with full reconfiguration support
- **Library Scope Transparency**: Real-time statistics display showing personal items, excluded groups/feeds/trash with queryLibraryStats() encapsulated method pattern

**Stats:**

- 40 files created/modified
- 9,340 lines of TypeScript
- 5 phases, 8 plans, 19 v1.2 requirements satisfied
- 7 days from start to ship (2026-01-22 → 2026-01-29)

**Git range:** `a8e966a` (feat(09-01)) → `ff4b385` (feat(13-01))

**What's next:** Ready for v1.3 or v2.0 planning - potential focus areas include advanced filtering (metadata quality scoring, retraction checking), export functionality, or batch processing optimizations.

---

## v1.1 Polish + Tag Support (Shipped: 2026-01-27)

**Delivered:** Enhanced user experience with comprehensive UX improvements and tag-based recommendation signals for improved batch relevance.

**Phases completed:** 6-8 (9 plans total)

**Key accomplishments:**

- **Tag-based Recommendations**: Extract tags from Zotero database, integrate Porter-stemmed tag scoring with top-20 frequency-weighted profile tags, adaptive learning with decay mechanism
- **User-configurable Tag Weights**: Settings slider (0.0-3.0) allows dynamic tuning of tag signal strength during recommendation scoring
- **Throttled Progress Tracking**: 500ms time-based updates with 100-item batches prevent UI jank for 5000+ item libraries
- **Enhanced Validation UX**: Field explanations in override modal with progressive disclosure, aggregated validation warnings, empty profile warnings with guidance
- **Search/Filter Functionality**: Real-time filtering by author/title/tags in onboarding seed picker and batch processing view
- **Responsive Modal Improvements**: 90vw max-width eliminates horizontal scrolling, scroll preservation during item interactions
- **Defensive Tag Infrastructure**: SQL-level annotation filtering, NULL handling, schema validation with graceful degradation

**Stats:**

- 40 files created/modified
- ~7,092 lines of TypeScript
- 3 phases, 9 plans, 14 v1.1 requirements satisfied
- 2 days from start to ship (2026-01-25 → 2026-01-27)

**Git range:** `d5a540f` (feat(06-01)) → `aff9be6` (feat(08-03))

**What's next:** Ready for next milestone planning - potential focus areas include library scope filtering, adaptive learning for all signals, or advanced recommendation features.

---

## v1.0 MVP (Shipped: 2026-01-25)

**Delivered:** Progressive literature processing plugin that solves "importer's block" through batch-based triage workflow with quality gates and intelligent recommendations.

**Phases completed:** 1-5 (23 plans total)

**Key accomplishments:**

- **Progressive Triage System**: Batch-based workflow with card UI prevents overwhelm by enforcing sustainable 5-item processing sessions
- **Quality Gates with Override**: Zod validation blocks incomplete metadata imports, with user override capability and Zotero deep links for external fixes
- **Intelligent Onboarding**: Multi-step setup wizard with seed paper selection (5-15 papers) establishes user profile for personalized recommendations
- **Adaptive Learning Engine**: Multi-signal scoring (keywords, authors, recency) with automatic weight adjustments from user accept/reject feedback
- **Production-Ready Polish**: Lazy initialization (<50ms startup), progress tracking with visual feedback, exponential backoff retries for SQLITE_BUSY, cross-platform path normalization

**Stats:**

- 130 files created/modified
- ~7,324 lines of TypeScript
- 5 phases, 23 plans, 34 v1 requirements satisfied
- 3 days from init to ship (2026-01-22 → 2026-01-25)

**Git range:** `3ea447c` → `a398d64`

**What's next:** v1.1 will focus on UX enhancements based on beta testing feedback, including enhanced error messages, granular progress during batch scoring, and override modal field explanations.

---
