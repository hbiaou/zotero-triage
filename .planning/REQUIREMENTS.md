# Requirements: Zotero Triage v1.2

**Defined:** 2026-01-27
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## v1.2 Requirements

Requirements for milestone v1.2 - Library Scope Filtering & Preflight Checks. Each maps to roadmap phases.

### Scope Filtering (Query-level)

- [ ] **SCOPE-01**: Plugin filters ITEMS_QUERY to personal library only (exclude group libraries, feeds)
- [ ] **SCOPE-02**: Plugin excludes retracted items from queries (Zotero 7+ with graceful degradation)
- [ ] **SCOPE-03**: Plugin displays transparent scope counts (personal items, excluded groups, excluded feeds, trash)
- [ ] **SCOPE-04**: User can configure which libraries to include via settings dropdown
- [ ] **SCOPE-05**: Plugin persists library filter selection across restarts
- [ ] **SCOPE-06**: Plugin applies library filtering to all database queries (onboarding, batch generation, registry)

### Preflight Validation

- [ ] **PREFLIGHT-01**: Plugin queries Zotero's itemRelated table to detect duplicates before onboarding
- [ ] **PREFLIGHT-02**: Plugin displays duplicate count with advisory message during onboarding
- [ ] **PREFLIGHT-03**: Plugin queries deletedItems table to count trash volume
- [ ] **PREFLIGHT-04**: Plugin displays trash count with advisory to empty in Zotero
- [ ] **PREFLIGHT-05**: Plugin detects group library items and displays exclusion advisory
- [ ] **PREFLIGHT-06**: Plugin provides deep links (zotero:// URIs) to Zotero Duplicate Items panel
- [ ] **PREFLIGHT-07**: Preflight check is non-blocking (user can proceed despite warnings)
- [ ] **PREFLIGHT-08**: Preflight modal shows progress during query execution (5000+ items)

### Settings & Persistence

- [ ] **SETTINGS-01**: Relevance vs Diversity setting configured in onboarding wizard persists to settings panel
- [ ] **SETTINGS-02**: User can access "Reconfigure Profile" button in settings to change recommendation settings
- [ ] **SETTINGS-03**: Library filter mode persists across plugin reloads
- [ ] **SETTINGS-04**: Settings panel displays library selector dropdown (choose personal libraries)
- [ ] **SETTINGS-05**: Changing library selection in settings triggers profile re-initialization warning

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
| SCOPE-01 | Phase 9 | Pending |
| SCOPE-02 | Phase 9 | Pending |
| SCOPE-03 | Phase 9 | Pending |
| SCOPE-04 | Phase 9 | Pending |
| SCOPE-05 | Phase 9 | Pending |
| SCOPE-06 | Phase 9 | Pending |
| PREFLIGHT-01 | Phase 10 | Pending |
| PREFLIGHT-02 | Phase 10 | Pending |
| PREFLIGHT-03 | Phase 11 | Pending |
| PREFLIGHT-04 | Phase 11 | Pending |
| PREFLIGHT-05 | Phase 11 | Pending |
| PREFLIGHT-06 | Phase 10 | Pending |
| PREFLIGHT-07 | Phase 11 | Pending |
| PREFLIGHT-08 | Phase 11 | Pending |
| SETTINGS-01 | Phase 12 | Pending |
| SETTINGS-02 | Phase 12 | Pending |
| SETTINGS-03 | Phase 12 | Pending |
| SETTINGS-04 | Phase 12 | Pending |
| SETTINGS-05 | Phase 12 | Pending |

**Coverage:**
- v1.2 requirements: 19 total
- Mapped to phases: 19/19 (100%)
- Unmapped: 0

**Phase Coverage:**
- Phase 9 (Library Filtering Foundation): 6 requirements
- Phase 10 (Duplicate Detection Service): 3 requirements
- Phase 11 (Preflight Modal & Integration): 5 requirements
- Phase 12 (Settings Persistence & UI Polish): 5 requirements

---
*Requirements defined: 2026-01-27*
*Last updated: 2026-01-27 after roadmap creation*
