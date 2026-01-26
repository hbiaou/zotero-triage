# Roadmap: Zotero Triage

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-25)
- 🚧 **v1.1 Polish + Tag Support** - Phases 6-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-01-25</summary>

### Phase 1: Foundation & Setup
**Goal**: Project scaffolding with Zotero connectivity
**Plans**: 5 plans

Plans:
- [x] 01-01: Initialize Obsidian plugin structure with TypeScript
- [x] 01-02: Integrate sql.js for Zotero SQLite database access
- [x] 01-03: Implement ZoteroConnector with schema detection
- [x] 01-04: Add exponential backoff retry logic for SQLITE_BUSY
- [x] 01-05: Create settings panel with basic configuration

### Phase 2: Onboarding & Profile Initialization
**Goal**: User establishes interest profile from seed papers
**Plans**: 3 plans

Plans:
- [x] 02-01: Build multi-step setup wizard UI
- [x] 02-02: Implement seed paper selection (5-15 items)
- [x] 02-03: Extract keywords and authors for profile

### Phase 3: Recommendation Engine & Batch Generation
**Goal**: Intelligent daily batch selection based on user profile
**Plans**: 5 plans

Plans:
- [x] 03-01: Implement multi-signal scoring (keywords, authors, recency)
- [x] 03-02: Create daily batch generator with configurable batch size
- [x] 03-03: Add adaptive learning from user feedback
- [x] 03-04: Implement processing registry (JSON-based state tracking)
- [x] 03-05: Add progress tracking for batch operations

### Phase 4: Triage Workflow & Quality Gates
**Goal**: Users process batches with quality enforcement
**Plans**: 5 plans

Plans:
- [x] 04-01: Build card-stack triage UI (Accept/Reject/Defer)
- [x] 04-02: Implement Zod validation for configurable quality gates
- [x] 04-03: Create override modal with Zotero deep links
- [x] 04-04: Add quality gate configuration per item type
- [x] 04-05: Implement deferred items re-queue logic

### Phase 5: Literature Note Generation & Polish
**Goal**: High-quality notes with full metadata integration
**Plans**: 5 plans

Plans:
- [x] 05-01: Generate Markdown notes with YAML frontmatter
- [x] 05-02: Add citation metadata, Zotero links, file references
- [x] 05-03: Implement processing metadata tracking
- [x] 05-04: Add configurable output folder
- [x] 05-05: Cross-platform testing and performance optimization

</details>

### 🚧 v1.1 Polish + Tag Support (In Progress)

**Milestone Goal:** Enhance user experience with better feedback and guidance, plus add tag-based recommendation signals to improve batch relevance.

#### Phase 6: Tag Infrastructure & Extraction
**Goal**: Extract tags from Zotero database and integrate into data layer
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: TAG-01, TAG-02, VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
  1. Plugin extracts tags from Zotero itemTags and tags tables for each item
  2. ZoteroItem schema includes tags field with proper null handling
  3. Tag extraction handles schema variations defensively (null tags don't crash)
  4. Existing profiles without tags Map remain compatible (backward compatibility)
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Add annotation filtering and defensive NULL handling to tag extraction
- [ ] 06-02-PLAN.md — Add schema validation and integrate tags into profile initialization
- [ ] 06-03-PLAN.md — Verify tag infrastructure with real Zotero 7 database

#### Phase 7: Tag-Based Recommendations
**Goal**: Tags improve batch relevance through profile scoring and adaptive learning
**Depends on**: Phase 6
**Requirements**: TAG-03, TAG-04, TAG-05, TAG-06
**Success Criteria** (what must be TRUE):
  1. User profile captures tag frequencies from seed papers (top N tags weighted)
  2. Recommendation engine scores items based on tag overlap with profile
  3. Adaptive learner adjusts tag weights from accept/reject feedback
  4. Zotero 7 annotation tags (custom-color-*, highlight-*) are filtered from scoring
  5. Tag scoring integrates with existing keyword/author signals without overwhelming them
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Extract top 20 tags from seed papers and implement tag scoring with stemming
- [x] 07-02-PLAN.md — Add tag-based adaptive learning with weight decay and settings configuration
- [x] 07-03-PLAN.md — Verify tag recommendations work end-to-end with real Zotero database

#### Phase 8: UX Enhancements (Progress, Validation, Search & Modal UX)
**Goal**: Users receive clear feedback during operations, understand validation requirements, can efficiently find items, and have smooth interaction flows
**Depends on**: Phase 6 (tag infrastructure not required for UX features)
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10
**Success Criteria** (what must be TRUE):
  1. User sees granular progress updates during batch scoring for 5000+ item libraries
  2. Progress updates are throttled (every 100 items, 500ms intervals) to prevent UI jank
  3. User receives warning notice when seed papers result in empty profile
  4. Override modal explains why fields are required and how to fix in Zotero (per-field guidance)
  5. Validation warnings are aggregated to prevent notice spam during batch operations
  6. Scroll position is preserved after marking items during batch processing
  7. User can search/filter seed papers during onboarding by author, keyword, or title
  8. User can search/filter items during batch processing by author, keyword, title, or tags
  9. Seed items selection modal during onboarding is wide enough to display content without horizontal scrolling
  10. Scroll position is preserved in seed items selection modal when clicking to select items (doesn't reset to top)
**Plans**: TBD

Plans:
- [ ] TBD (pending plan-phase)

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Setup | v1.0 | 5/5 | Complete | 2026-01-22 |
| 2. Onboarding & Profile Initialization | v1.0 | 3/3 | Complete | 2026-01-23 |
| 3. Recommendation Engine & Batch Generation | v1.0 | 5/5 | Complete | 2026-01-24 |
| 4. Triage Workflow & Quality Gates | v1.0 | 5/5 | Complete | 2026-01-24 |
| 5. Literature Note Generation & Polish | v1.0 | 5/5 | Complete | 2026-01-25 |
| 6. Tag Infrastructure & Extraction | v1.1 | 3/3 | Complete | 2026-01-25 |
| 7. Tag-Based Recommendations | v1.1 | 3/3 | Complete | 2026-01-26 |
| 8. UX Enhancements (Progress & Validation) | v1.1 | 0/TBD | Not started | - |
