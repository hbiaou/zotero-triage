# Requirements: Zotero Triage

**Defined:** 2026-01-25
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## v1.1 Requirements

Requirements for v1.1 release. Each maps to roadmap phases.

### Tag Extraction & Recommendations

- [ ] **TAG-01**: Extract tags from Zotero SQLite database (itemTags + tags tables)
- [ ] **TAG-02**: Add tags field to ZoteroItem schema with proper NULL handling
- [ ] **TAG-03**: Populate user profile with tag frequencies from seed papers
- [ ] **TAG-04**: Score items based on tag overlap with user profile
- [ ] **TAG-05**: Update tag weights from accept/reject actions (adaptive learning)
- [ ] **TAG-06**: Filter Zotero 7 annotation tags (custom-color-*, highlight-*)

### UX Polish (Progress & Feedback)

- [ ] **UX-01**: Display granular progress during batch scoring for 5000+ item libraries
- [ ] **UX-02**: Throttle progress updates (every 100 items, 500ms intervals) to prevent UI jank
- [ ] **UX-03**: Show warning Notice when ProfileInitializer gets empty profile from seed papers
- [ ] **UX-04**: Add field explanations to override modal (why required + how to fix in Zotero)
- [ ] **UX-05**: Aggregate validation warnings to prevent notice spam
- [ ] **UX-06**: Fix scroll position during batch processing (preserve user's position after marking items)

### Data Quality & Validation

- [ ] **VAL-01**: Implement defensive NULL handling for tag queries (schema variations)
- [ ] **VAL-02**: Ensure backward compatibility with empty tags Map in existing profiles

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
| TAG-01 | TBD | Pending |
| TAG-02 | TBD | Pending |
| TAG-03 | TBD | Pending |
| TAG-04 | TBD | Pending |
| TAG-05 | TBD | Pending |
| TAG-06 | TBD | Pending |
| UX-01 | TBD | Pending |
| UX-02 | TBD | Pending |
| UX-03 | TBD | Pending |
| UX-04 | TBD | Pending |
| UX-05 | TBD | Pending |
| UX-06 | TBD | Pending |
| VAL-01 | TBD | Pending |
| VAL-02 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 14 ⚠️

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after initial definition*
