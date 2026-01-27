# Requirements: Zotero Triage

**Defined:** 2026-01-25
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## v1.1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases.

### Tag Extraction & Recommendations

- [x] **TAG-01**: Extract tags from Zotero SQLite database (itemTags + tags tables)
- [x] **TAG-02**: Add tags field to ZoteroItem schema with proper NULL handling
- [x] **TAG-03**: Populate user profile with tag frequencies from seed papers
- [x] **TAG-04**: Score items based on tag overlap with user profile
- [x] **TAG-05**: Update tag weights from accept/reject actions (adaptive learning)
- [x] **TAG-06**: Filter Zotero 7 annotation tags (custom-color-*, highlight-*)

### UX Polish (Progress & Feedback)

- [ ] **UX-01**: Display granular progress during batch scoring for 5000+ item libraries
- [ ] **UX-02**: Throttle progress updates (every 100 items, 500ms intervals) to prevent UI jank
- [ ] **UX-03**: Show warning Notice when ProfileInitializer gets empty profile from seed papers
- [ ] **UX-04**: Add field explanations to override modal (why required + how to fix in Zotero)
- [ ] **UX-05**: Aggregate validation warnings to prevent notice spam
- [ ] **UX-06**: Fix scroll position during batch processing (preserve user's position after marking items)
- [ ] **UX-07**: Add search/filter to onboarding seed paper selection (by author, keyword, title)
- [ ] **UX-08**: Add search/filter to batch processing view (by author, keyword, title, tags)
- [ ] **UX-09**: Expand seed items selection modal width during onboarding (eliminate horizontal scrolling)
- [ ] **UX-10**: Preserve scroll position in seed items selection modal when clicking items (don't reset to top)

### Data Quality & Validation

- [x] **VAL-01**: Implement defensive NULL handling for tag queries (schema variations)
- [x] **VAL-02**: Ensure backward compatibility with empty tags Map in existing profiles

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Recommendations

- **REC-01**: ML-based tag suggestions for untagged papers
- **REC-02**: Citation network analysis for recommendations
- **REC-03**: Collaborative filtering from community profiles

### Advanced UX

- **ADV-UX-01**: Keyboard shortcuts for triage actions (j/k navigation, a/d/r for actions)
- **ADV-UX-02**: Batch undo (undo last N actions)
- **ADV-UX-03**: Triage session history (review what was accepted/rejected)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-tagging papers based on content | High complexity, requires ML/NLP, defer to v2 |
| Tag hierarchy support | Zotero doesn't support nested tags natively |
| Bulk tag editing | Violates read-only constraint |
| Tag cloud visualization | Nice-to-have, not core value |
| Custom tag weights (user-specified) | Adaptive learning handles this automatically |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAG-01 | Phase 6 | Complete |
| TAG-02 | Phase 6 | Complete |
| TAG-03 | Phase 7 | Complete |
| TAG-04 | Phase 7 | Complete |
| TAG-05 | Phase 7 | Complete |
| TAG-06 | Phase 7 | Complete |
| UX-01 | Phase 8 | Complete |
| UX-02 | Phase 8 | Complete |
| UX-03 | Phase 8 | Complete |
| UX-04 | Phase 8 | Complete |
| UX-05 | Phase 8 | Complete |
| UX-06 | Phase 8 | Complete |
| UX-07 | Phase 8 | Complete |
| UX-08 | Phase 8 | Complete |
| UX-09 | Phase 8 | Complete |
| UX-10 | Phase 8 | Complete |
| VAL-01 | Phase 6 | Complete |
| VAL-02 | Phase 6 | Complete |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14 (100% coverage)
- Unmapped: 0

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after roadmap creation*
