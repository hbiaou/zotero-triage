# Roadmap: Zotero Triage

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-25)
- ✅ **v1.1 Polish + Tag Support** - Phases 6-8 (shipped 2026-01-27)
- 📋 **v1.2 Library Scope Filtering & Preflight Checks** - Phases 9-12 (planned)

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

<details>
<summary>✅ v1.1 Polish + Tag Support (Phases 6-8) - SHIPPED 2026-01-27</summary>

### Phase 6: Tag Infrastructure & Extraction
**Goal**: Extract tags from Zotero database and integrate into data layer
**Plans**: 3 plans

Plans:
- [x] 06-01: Add annotation filtering and defensive NULL handling to tag extraction
- [x] 06-02: Add schema validation and integrate tags into profile initialization
- [x] 06-03: Verify tag infrastructure with real Zotero 7 database

### Phase 7: Tag-Based Recommendations
**Goal**: Tags improve batch relevance through profile scoring and adaptive learning
**Plans**: 3 plans

Plans:
- [x] 07-01: Extract top 20 tags from seed papers and implement tag scoring with stemming
- [x] 07-02: Add tag-based adaptive learning with weight decay and settings configuration
- [x] 07-03: Verify tag recommendations work end-to-end with real Zotero database

### Phase 8: UX Enhancements (Progress, Validation, Search & Modal UX)
**Goal**: Users receive clear feedback during operations, understand validation requirements, can efficiently find items, and have smooth interaction flows
**Plans**: 3 plans

Plans:
- [x] 08-01: Add throttled progress updates, empty profile warnings, and enhanced override modal guidance
- [x] 08-02: Add search/filter to seed paper picker and batch view
- [x] 08-03: Fix modal sizing and preserve scroll position during item interactions

</details>

### 📋 v1.2 Library Scope Filtering & Preflight Checks (Planned)

**Milestone Goal:** Ensure only relevant, high-quality items from user's personal library enter the recommendation pipeline by filtering unwanted sources and detecting issues before onboarding.

#### Phase 9: Library Filtering Foundation
**Goal**: Plugin queries only personal library items, excluding group libraries, feeds, trash, and retracted items
**Depends on**: Phase 8
**Requirements**: SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-06
**Success Criteria** (what must be TRUE):
  1. User sees only personal library items in onboarding seed picker (no group libraries, feeds, or trash)
  2. User sees transparent scope counts showing what's included vs excluded
  3. User can configure which libraries to include via settings dropdown
  4. Library filter selection persists across plugin restarts
  5. All database queries (onboarding, batch generation, registry) respect library filtering
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Update queries with library filtering and schema validation
- [ ] 09-02-PLAN.md — Verify filtering with real Zotero database

#### Phase 10: Duplicate Detection Service
**Goal**: Plugin identifies duplicate items across libraries to warn users before profile creation
**Depends on**: Phase 9
**Requirements**: PREFLIGHT-01, PREFLIGHT-02, PREFLIGHT-06
**Success Criteria** (what must be TRUE):
  1. Plugin detects items with matching DOI, ISBN, or title across libraries
  2. Plugin displays duplicate count during onboarding without blocking
  3. Plugin provides deep links to Zotero's duplicate items panel
  4. Duplicate detection completes within 30 seconds for 5000+ item libraries
**Plans**: TBD

Plans:
- [ ] TBD

#### Phase 11: Preflight Modal & Integration
**Goal**: Users see comprehensive library health check before onboarding with non-blocking advisories
**Depends on**: Phase 10
**Requirements**: PREFLIGHT-03, PREFLIGHT-04, PREFLIGHT-05, PREFLIGHT-07, PREFLIGHT-08
**Success Criteria** (what must be TRUE):
  1. User sees preflight modal showing trash count, duplicate count, and group library advisories
  2. User can proceed with onboarding despite warnings (non-blocking design)
  3. User sees progress feedback during preflight check (5000+ items)
  4. User can skip preflight check entirely if desired
  5. Preflight gracefully handles missing tables (Zotero 6 vs 7 compatibility)
**Plans**: TBD

Plans:
- [ ] TBD

#### Phase 12: Settings Persistence & UI Polish
**Goal**: Recommendation settings configured in wizard persist to settings panel with easy reconfiguration
**Depends on**: Phase 11
**Requirements**: SETTINGS-01, SETTINGS-02, SETTINGS-03, SETTINGS-04, SETTINGS-05
**Success Criteria** (what must be TRUE):
  1. Relevance vs Diversity setting chosen in onboarding persists to settings panel
  2. User can click "Reconfigure Profile" button to change recommendation settings
  3. Library filter mode persists across plugin reloads
  4. Settings panel displays library selector dropdown
  5. Changing library selection triggers profile re-initialization warning
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 → 10 → 11 → 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Setup | v1.0 | 5/5 | Complete | 2026-01-22 |
| 2. Onboarding & Profile Initialization | v1.0 | 3/3 | Complete | 2026-01-23 |
| 3. Recommendation Engine & Batch Generation | v1.0 | 5/5 | Complete | 2026-01-24 |
| 4. Triage Workflow & Quality Gates | v1.0 | 5/5 | Complete | 2026-01-24 |
| 5. Literature Note Generation & Polish | v1.0 | 5/5 | Complete | 2026-01-25 |
| 6. Tag Infrastructure & Extraction | v1.1 | 3/3 | Complete | 2026-01-25 |
| 7. Tag-Based Recommendations | v1.1 | 3/3 | Complete | 2026-01-26 |
| 8. UX Enhancements (Progress & Validation) | v1.1 | 3/3 | Complete | 2026-01-27 |
| 9. Library Filtering Foundation | v1.2 | 0/2 | Not started | - |
| 10. Duplicate Detection Service | v1.2 | 0/TBD | Not started | - |
| 11. Preflight Modal & Integration | v1.2 | 0/TBD | Not started | - |
| 12. Settings Persistence & UI Polish | v1.2 | 0/TBD | Not started | - |
