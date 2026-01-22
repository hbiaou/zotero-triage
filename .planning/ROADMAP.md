# Roadmap: Progressive Zotero-Obsidian Bridge

## Overview

This roadmap delivers a progressive literature processing plugin for researchers with massive Zotero libraries. Phase 1 establishes the foundation (SQLite access, state management, basic note generation). Phase 2 builds the core differentiator (batch-based triage workflow). Phase 3 adds quality gates to prevent importing incomplete metadata. Phase 4 enables intelligent onboarding and recommendations. Phase 5 polishes for production use with performance optimization and cross-platform testing.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - SQLite access, state management, basic note generation
- [ ] **Phase 2: Batch Workflow** - Triage UI, batch generation, processing engine
- [ ] **Phase 3: Quality Gates** - Metadata validation, enhanced templates, annotations
- [ ] **Phase 4: Onboarding & Recommendations** - Setup wizard, profile-based batch generation
- [ ] **Phase 5: Polish** - Performance optimization, error handling, cross-platform testing

## Phase Details

### Phase 1: Foundation
**Goal**: Plugin can read Zotero database, persist processing state, and generate basic literature notes

**Depends on**: Nothing (first phase)

**Requirements**: ZCON-01, ZCON-02, ZCON-03, ZCON-04, RGST-01, RGST-02, NOTE-01, NOTE-02, NOTE-03, NOTE-04, SETT-01, SETT-02

**Success Criteria** (what must be TRUE):
  1. User can configure Zotero database path and plugin connects to database successfully
  2. Plugin reads items from Zotero database (5000+ items) without freezing Obsidian UI
  3. Plugin detects Zotero schema version (6.x vs 7.x) and adapts field queries
  4. User can manually import a single item and a literature note is created with YAML frontmatter (title, authors, year, DOI, Zotero link, PDF path)
  5. Processing registry persists item state (imported/unprocessed) and survives Obsidian restarts

**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Project setup, build tooling, plugin scaffold
- [ ] 01-02-PLAN.md — Zotero database connector with sql.js and EAV queries
- [ ] 01-03-PLAN.md — Settings tab and registry service for state persistence
- [ ] 01-04-PLAN.md — Search modal, preview modal, and note generator

### Phase 2: Batch Workflow
**Goal**: Users can process Zotero items in batches using a card-based triage interface with Accept/Reject/Defer actions

**Depends on**: Phase 1

**Requirements**: BTCH-01, BTCH-02, BTCH-04, TRIG-01, TRIG-02, TRIG-03, TRIG-04, RGST-03, RGST-04, SETT-03

**Success Criteria** (what must be TRUE):
  1. User can generate a batch of 5 candidate items from their Zotero library
  2. Triage dashboard displays items as cards showing title, authors, year, abstract, and item type
  3. User can Accept an item and it creates a literature note immediately
  4. User can Reject an item and it never appears in future batches
  5. User can Defer an item and it may appear in future batches
  6. Dashboard shows batch progress (e.g., "3/5 processed")
  7. Registry never proposes the same item twice (deduplication enforced)
  8. User can see stats dashboard showing items imported, rejected, and pending

**Plans**: TBD

Plans:
- [ ] 02-01: TBD during planning
- [ ] 02-02: TBD during planning
- [ ] 02-03: TBD during planning

### Phase 3: Quality Gates
**Goal**: Plugin validates metadata completeness before import and enhances literature notes with configurable quality gates

**Depends on**: Phase 2

**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, SETT-04

**Success Criteria** (what must be TRUE):
  1. Plugin blocks import if required fields are missing (e.g., journal article missing DOI or year)
  2. User sees exactly which fields are missing when import is blocked
  3. User can click a link to open the item in Zotero and fix metadata
  4. User can override quality gate and force import if needed
  5. Required fields are configurable per item type (journal article vs book vs conference paper)
  6. Imported notes have complete, structured YAML frontmatter with all available metadata

**Plans**: TBD

Plans:
- [ ] 03-01: TBD during planning
- [ ] 03-02: TBD during planning

### Phase 4: Onboarding & Recommendations
**Goal**: New users can quickly set up their profile through a guided wizard, and batches are intelligently generated based on user interests

**Depends on**: Phase 3

**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04, BTCH-03, SETT-05

**Success Criteria** (what must be TRUE):
  1. First-time users see a multi-step setup wizard that guides configuration
  2. User can select 10 seed papers to establish their interest profile
  3. Plugin extracts tags and authors from seed papers for profile
  4. User can skip wizard and configure manually via settings
  5. Batch generation recommends items similar to user's profile (matching tags and authors)
  6. User can modify their profile (re-select seed papers or update preferences)
  7. Recommended batches feel relevant to user's research interests

**Plans**: TBD

Plans:
- [ ] 04-01: TBD during planning
- [ ] 04-02: TBD during planning
- [ ] 04-03: TBD during planning

### Phase 5: Polish
**Goal**: Plugin is production-ready with optimized performance, comprehensive error handling, and cross-platform support

**Depends on**: Phase 4

**Requirements**: (No explicit requirements - polish and optimization across all features)

**Success Criteria** (what must be TRUE):
  1. Plugin loads without noticeable impact on Obsidian startup time (validated with 5000+ item libraries)
  2. Long operations show progress indicators (batch generation, database queries)
  3. Error messages are user-friendly and actionable (not technical stack traces)
  4. Plugin works correctly on Windows, Mac, and Linux
  5. Memory usage remains stable during extended sessions (no leaks)
  6. Database operations handle concurrent Zotero access gracefully (no SQLITE_BUSY errors)

**Plans**: TBD

Plans:
- [ ] 05-01: TBD during planning
- [ ] 05-02: TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/4 | In progress | - |
| 2. Batch Workflow | 0/TBD | Not started | - |
| 3. Quality Gates | 0/TBD | Not started | - |
| 4. Onboarding & Recommendations | 0/TBD | Not started | - |
| 5. Polish | 0/TBD | Not started | - |
