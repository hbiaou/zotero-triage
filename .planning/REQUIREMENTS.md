# Requirements: Zotero Triage

**Defined:** 2025-01-22
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring only quality notes enter their vault.

## v1 Requirements

Requirements for MVP release. Each maps to roadmap phases.

### Zotero Connection

- [ ] **ZCON-01**: Plugin can read items from local Zotero SQLite database (read-only)
- [ ] **ZCON-02**: Plugin detects Zotero schema version (6.x vs 7.x) and handles field differences
- [ ] **ZCON-03**: Plugin auto-detects database location on Windows, Mac, and Linux
- [ ] **ZCON-04**: User can manually specify database path in settings

### Onboarding

- [x] **ONBD-01**: Plugin provides multi-step setup wizard Modal for first-time users
- [x] **ONBD-02**: User can select 10 seed papers to establish interest profile
- [x] **ONBD-03**: Plugin extracts tags and authors from seed papers for profile
- [x] **ONBD-04**: User can skip wizard and configure manually via settings

### Batch Generation

- [ ] **BTCH-01**: Plugin can generate a batch of N candidate items on demand (default: 5)
- [ ] **BTCH-02**: User can request new batch at any time via command or button
- [x] **BTCH-03**: Batch ranking uses profile similarity (matching tags and authors)
- [ ] **BTCH-04**: Batch generator never proposes items already in registry (dedup)

### Triage Dashboard

- [ ] **TRIG-01**: Plugin provides card-based ItemView for reviewing batch items
- [ ] **TRIG-02**: Each card has Accept, Reject, and Defer action buttons
- [ ] **TRIG-03**: Card shows metadata preview: title, authors, year, abstract, item type
- [ ] **TRIG-04**: Dashboard shows batch progress indicator (X/5 processed)

### Quality Gate

- [ ] **QUAL-01**: Plugin blocks import if configurable required fields are missing
- [ ] **QUAL-02**: Plugin shows exactly which fields are missing for blocked items
- [ ] **QUAL-03**: Plugin provides zotero://select link to fix item in Zotero
- [ ] **QUAL-04**: User can override quality gate and force import despite warnings
- [ ] **QUAL-05**: Required fields are configurable per item type (e.g., journal article requires DOI, book requires ISBN)

### Note Generator

- [ ] **NOTE-01**: Plugin creates markdown note in configurable folder (default: 10_Literature/)
- [ ] **NOTE-02**: Note includes full YAML frontmatter: title, authors, year, DOI, publication, item type
- [ ] **NOTE-03**: Frontmatter includes zotero://select link and citekey
- [ ] **NOTE-04**: Frontmatter includes path to PDF attachment if exists

### Processing Registry

- [ ] **RGST-01**: Plugin tracks state of each Zotero item: unseen, proposed, accepted, rejected, deferred, imported
- [ ] **RGST-02**: Registry persists to plugin data folder as JSON
- [ ] **RGST-03**: Batch generator respects registry states (dedup enforcement)
- [ ] **RGST-04**: Plugin provides stats dashboard: X imported, Y rejected, Z pending

### Settings

- [ ] **SETT-01**: User can configure Zotero database path
- [ ] **SETT-02**: User can configure output folder for literature notes
- [ ] **SETT-03**: User can configure batch size (default: 5)
- [ ] **SETT-04**: User can configure required fields per item type for quality gate
- [x] **SETT-05**: User can modify profile (re-select seed papers, update preferences)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Processing

- **ADVP-01**: Atomic note extraction (breaking papers into concept notes)
- **ADVP-02**: Semantic search / embeddings for smarter recommendations
- **ADVP-03**: PDF text extraction for content-aware processing
- **ADVP-04**: Annotation import from Zotero PDF annotations

### Sync & Integration

- **SYNC-01**: Bi-directional sync (write status back to Zotero)
- **SYNC-02**: Collection-based filtering (process specific Zotero collections)
- **SYNC-03**: Real-time database watching (auto-detect new items)

### UI Enhancements

- **UIEN-01**: Advanced template customization
- **UIEN-02**: Keyboard shortcuts for triage actions
- **UIEN-03**: Bulk operations (accept/reject multiple items)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Bulk "import all" button | Defeats core purpose — causes importer's block |
| Built-in PDF reader | Zotero already does this well |
| Custom Zotero metadata fields | Breaks Zotero compatibility |
| Full-text PDF search | Zotero handles this |
| AI-assisted summaries | Complex, external dependencies, defer to v2+ |
| Cloud sync / external services | Local-first architecture requirement |
| Vector database / embeddings | Complexity not justified for MVP |
| Writing to Zotero | Read-only constraint for safety |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ZCON-01 | Phase 1 | Complete |
| ZCON-02 | Phase 1 | Complete |
| ZCON-03 | Phase 1 | Complete |
| ZCON-04 | Phase 1 | Complete |
| ONBD-01 | Phase 4 | Complete |
| ONBD-02 | Phase 4 | Complete |
| ONBD-03 | Phase 4 | Complete |
| ONBD-04 | Phase 4 | Complete |
| BTCH-01 | Phase 2 | Complete |
| BTCH-02 | Phase 2 | Complete |
| BTCH-03 | Phase 4 | Complete |
| BTCH-04 | Phase 2 | Complete |
| TRIG-01 | Phase 2 | Complete |
| TRIG-02 | Phase 2 | Complete |
| TRIG-03 | Phase 2 | Complete |
| TRIG-04 | Phase 2 | Complete |
| QUAL-01 | Phase 3 | Complete |
| QUAL-02 | Phase 3 | Complete |
| QUAL-03 | Phase 3 | Complete |
| QUAL-04 | Phase 3 | Complete |
| QUAL-05 | Phase 3 | Complete |
| NOTE-01 | Phase 1 | Complete |
| NOTE-02 | Phase 1 | Complete |
| NOTE-03 | Phase 1 | Complete |
| NOTE-04 | Phase 1 | Complete |
| RGST-01 | Phase 1 | Complete |
| RGST-02 | Phase 1 | Complete |
| RGST-03 | Phase 2 | Complete |
| RGST-04 | Phase 2 | Complete |
| SETT-01 | Phase 1 | Complete |
| SETT-02 | Phase 1 | Complete |
| SETT-03 | Phase 2 | Complete |
| SETT-04 | Phase 3 | Complete |
| SETT-05 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2025-01-22*
*Last updated: 2026-01-23 - Clarified BTCH-01 and BTCH-02 wording, added 'deferred' to RGST-01*
