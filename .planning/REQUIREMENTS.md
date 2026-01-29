# Requirements: Zotero Triage v1.2

**Defined:** 2026-01-27
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## v1.2 Requirements

Requirements for milestone v1.2 - Library Scope Filtering & Preflight Checks. Each maps to roadmap phases.

### Scope Filtering (Query-level)

- [x] **SCOPE-01**: Plugin filters ITEMS_QUERY to personal library only (exclude group libraries, feeds)
- [x] **SCOPE-02**: Plugin excludes retracted items from queries (Zotero 7+ with graceful degradation)
- [x] **SCOPE-03**: Plugin displays transparent scope counts (personal items, excluded groups, excluded feeds, trash)
- [x] **SCOPE-04**: User can configure which libraries to include via settings dropdown
- [x] **SCOPE-05**: Plugin persists library filter selection across restarts
- [x] **SCOPE-06**: Plugin applies library filtering to all database queries (onboarding, batch generation, registry)

### Preflight Validation

- [x] **PREFLIGHT-01**: Plugin queries Zotero's itemRelated table to detect duplicates before onboarding
- [x] **PREFLIGHT-02**: Plugin displays duplicate count with advisory message during onboarding
- [x] **PREFLIGHT-03**: Plugin queries deletedItems table to count trash volume
- [x] **PREFLIGHT-04**: Plugin displays trash count with advisory to empty in Zotero
- [x] **PREFLIGHT-05**: Plugin detects group library items and displays exclusion advisory
- [x] **PREFLIGHT-06**: Plugin provides deep links (zotero:// URIs) to Zotero Duplicate Items panel
- [x] **PREFLIGHT-07**: Preflight check is non-blocking (user can proceed despite warnings)
- [x] **PREFLIGHT-08**: Preflight modal shows progress during query execution (5000+ items)

### Settings & Persistence

- [x] **SETTINGS-01**: Relevance vs Diversity setting configured in onboarding wizard persists to settings panel
- [x] **SETTINGS-02**: User can access "Reconfigure Profile" button in settings to change recommendation settings
- [x] **SETTINGS-03**: Library filter mode persists across plugin reloads
- [x] **SETTINGS-04**: Settings panel displays library selector dropdown (choose personal libraries)
- [x] **SETTINGS-05**: Changing library selection in settings triggers profile re-initialization warning

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Filtering

- **ADV-FILTER-01**: Cross-library deduplication (detect items across multiple personal libraries)
- **ADV-FILTER-02**: Metadata quality scoring (completeness assessment for DOI, year, author)
- **ADV-FILTER-03**: Bulk retraction checking (query CrossRef API for retracted papers)

### Advanced Preflight

- **ADV-PREFLIGHT-01**: Historical library health dashboard (track trash/duplicate trends over time)
- **ADV-PREFLIGHT-02**: Collaborative conflict detection (group library items modified by multiple users)
- **ADV-PREFLIGHT-03**: Automated repair workflows (guided cleanup of duplicates, trash)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-merge duplicates in plugin | Violates read-only constraint; risks data loss; user loses control. Guide to Zotero's native merge UI instead. |
| Auto-empty trash | User may intentionally keep items in trash temporarily. Warn about volume but don't auto-delete. |
| Force single-library mode | Researchers with multiple personal libraries want flexibility. Offer library selector, don't restrict. |
| Fuzzy duplicate matching | High false positive rate; Zotero's exact matching (DOI/ISBN/title) is conservative and reliable. Don't reinvent algorithm. |
| Write to Zotero database | Read-only principle is foundational. All fixes happen in Zotero, not plugin. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 9 | Complete |
| SCOPE-02 | Phase 9 | Complete |
| SCOPE-03 | Phase 13 | Complete |
| SCOPE-04 | Phase 12 | Complete |
| SCOPE-05 | Phase 12 | Complete |
| SCOPE-06 | Phase 9 | Complete |
| PREFLIGHT-01 | Phase 10 | Complete |
| PREFLIGHT-02 | Phase 11 | Complete |
| PREFLIGHT-03 | Phase 11 | Complete |
| PREFLIGHT-04 | Phase 11 | Complete |
| PREFLIGHT-05 | Phase 11 | Complete |
| PREFLIGHT-06 | Phase 10 | Complete |
| PREFLIGHT-07 | Phase 11 | Complete |
| PREFLIGHT-08 | Phase 11 | Complete |
| SETTINGS-01 | Phase 12 | Complete |
| SETTINGS-02 | Phase 12 | Complete |
| SETTINGS-03 | Phase 12 | Complete |
| SETTINGS-04 | Phase 12 | Complete |
| SETTINGS-05 | Phase 12 | Complete |

**Coverage:**
- v1.2 requirements: 19 total
- Mapped to phases: 19/19 (100%)
- Unmapped: 0

**Phase Coverage:**
- Phase 9 (Library Filtering Foundation): 3 requirements (SCOPE-01, SCOPE-02, SCOPE-06)
- Phase 10 (Duplicate Detection Service): 2 requirements (PREFLIGHT-01, PREFLIGHT-06)
- Phase 11 (Preflight Modal & Integration): 5 requirements (PREFLIGHT-02, PREFLIGHT-03, PREFLIGHT-04, PREFLIGHT-05, PREFLIGHT-07, PREFLIGHT-08)
- Phase 12 (Settings Persistence & UI Polish): 7 requirements (SCOPE-04, SCOPE-05, SETTINGS-01, SETTINGS-02, SETTINGS-03, SETTINGS-04, SETTINGS-05)
- Phase 13 (Library Statistics Display): 1 requirement (SCOPE-03)

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-27 after roadmap creation*
