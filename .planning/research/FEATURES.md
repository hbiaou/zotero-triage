# Feature Research: Zotero Triage v1.1 — Tag Extraction and UX Polish

**Domain:** Obsidian plugin with Zotero integration (tag extraction and user feedback enhancements)
**Researched:** 2026-01-25
**Milestone:** v1.1 (subsequent feature set after v1.0 core workflow)
**Confidence:** HIGH (architecture research complete, tag storage verified, UX patterns documented)

---

## Executive Summary

Version 1.1 focuses on two dimensions:

1. **Tag extraction from Zotero:** Integrate user-assigned tags from Zotero items into the recommendation engine and note generation, surfacing papers that match user tag preferences alongside keywords/authors.

2. **UX polish for large libraries:** Enhance user feedback during long operations (5000+ item batch scoring), provide clearer error messages when profile initialization fails, and guide users to fix metadata issues through improved modal help text.

The v1.0 core (batch workflow, quality gates, literature notes) operates well in isolation. v1.1 extends the recommendation engine with tags and improves visibility during processing. Both dimensions use existing Obsidian patterns (Notices for feedback, modal help text conventions, tag storage in Zotero's `itemTags` table).

---

## Table Stakes Features

Features users expect in a *v1.1 update* to an existing Zotero-Obsidian plugin.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tag extraction from Zotero** | Users with heavily-tagged libraries should see tag alignment in recommendations | MEDIUM | Zotero stores tags in `tags` + `itemTags` tables; many users tag papers before importing |
| **Error messages for empty profile** | When seed papers yield no keywords/authors, user needs guidance, not silent fallback | LOW | Obsidian Notice API; warn in ProfileInitializer when profile is empty |
| **Progress feedback during batch scoring** | Processing 5000 items takes 2-5 seconds; user needs visual confirmation something is happening | MEDIUM | Chunked async processing with Notice updates (not modal blocking) |
| **Field explanations in override modal** | Users asked to fix metadata in Zotero need guidance on which fields matter and why | LOW | Help text in modal (Setting component `setDesc()` pattern) |
| **Visual validation feedback** | When quality gate blocks import, user sees which fields are missing and how to fix in Zotero | LOW | List missing fields in modal, link to Zotero documentation |

**Complexity definitions:**
- LOW: < 4 hours implementation
- MEDIUM: 4-8 hours implementation
- HIGH: > 8 hours implementation

---

## Differentiators

Features that set v1.1 apart from competing plugins. Not required, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Tag-based recommendations** | Surface papers matching user's tag taxonomy, not just keywords/authors | MEDIUM | Extends recommendation engine; users control what tags mean to them |
| **Granular progress indicators** | Show which phase of scoring (filtering, ranking, quality check), not just % complete | MEDIUM | Improves feedback during 5000+ item operations; reduces "is it frozen?" anxiety |
| **Explanation-driven quality gates** | Don't just block; explain WHY a field is required and how to fix in Zotero | LOW | Differentiates from plugins that hide metadata requirements |
| **Adaptive tag weighting** | Learn user's tag preferences from accept/reject feedback | HIGH | Advanced feature; deferred to v1.2+ |

---

## Anti-Features

Features that seem appealing but create problems. Deliberately avoid in v1.1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Modal that blocks during batch scoring** | Seems like good UX to show progress | Freezes entire Obsidian app during 5000-item processing; users can't interact with vault while waiting | Use non-modal Notice notifications that update in place |
| **Auto-populate tags during import** | "Tag the note automatically using Zotero tags" | Requires NLP/taxonomy mapping; Obsidian's flat tag structure doesn't align with Zotero's; user should choose which Zotero tags become Obsidian tags | Expose tags as YAML frontmatter field; let user link manually or via templater script |
| **Bulk re-tag all imported notes** | Users want to tag past imports with new rules | Couples tag logic to past imports; breaks processing workflow (past items are locked by design) | Focus on forward-looking tagging; users can re-tag manually using Obsidian's native tag editor |
| **Machine learning tag suggestions** | "ML to predict best tags for new papers" | Adds complexity, poor ROI without substantial training data; users already have their own tagging system | Stick with exact-match tag signals from seed profile |

---

## Feature Dependencies

Understanding which features must be built first.

```
v1.0 Complete (Architecture foundation)
├── Processing Registry (tracks item state)
├── Zotero Connector (reads SQLite)
├── Recommendation Engine (keywords + authors)
└── Literature Note Generator

v1.1 Enhancements:

Tag Extraction:
├── Zotero Tag Reader
│   ├── Requires: Zotero Connector (reads from SQLite)
│   └── Queries: tags + itemTags tables
├── ZoteroItem Schema Extension
│   ├── Requires: Tag Reader
│   └── Adds: tags[] field to item metadata
├── Profile Analyzer (tag dimension)
│   ├── Requires: ZoteroItem schema + Tag Reader
│   └── Outputs: User's tag profile from seed papers
└── Recommendation Engine Extension
    ├── Requires: Profile Analyzer + Processing Engine
    ├── Adds: Tag-based scoring signal
    └── Combines: Keywords + Authors + Tags

UX Polish:

Error Messages:
├── ProfileInitializer Warning
│   ├── Requires: Recommendation Engine (to detect empty profile)
│   └── Outputs: Notice when profile has 0 signals
├── Quality Gate Explanation Modal
│   ├── Requires: Quality Gate (validation rules)
│   └── Outputs: Modal listing missing fields + Zotero fix instructions
└── Metadata Validator Feedback
    ├── Requires: Quality Gate
    └── Lists: Which fields are missing, why they matter

Progress Feedback:
├── Batch Scoring Progress Tracker
│   ├── Requires: Processing Engine (chunked async)
│   └── Outputs: Notice updating with phase + item count
├── Tag Extraction Progress
│   ├── Requires: Zotero Tag Reader (for large libraries)
│   └── Outputs: Loading indicator during tag indexing
└── Initialization Progress Modal
    ├── Requires: Initial setup phase (onLayoutReady)
    └── Shows: Database load, tag index build, profile analysis
```

### Dependency Notes

- **Tag extraction requires extended Zotero Connector:** The existing connector queries items; v1.1 must also query `itemTags` + `tags` tables to join tag data.
- **Profile analyzer must understand tags:** Current profile (keywords + authors from seed set) needs a tag dimension—which tags appear in seed papers?
- **Recommendation engine combines all signals:** v1.0 multiplies keyword score × author score; v1.1 adds × tag score (all normalized).
- **Error messages depend on existing validators:** v1.0 already has quality gate and profile initialization; v1.1 adds better feedback around them.
- **Progress updates don't require new architecture:** v1.0's chunked async processing already yields to event loop; v1.1 adds Notice updates to existing yields.

---

## v1.1 Feature Categorization

### Launch with v1.1

**Core value:** Better user guidance + tag-based recommendations for heavily-tagged libraries.

**Must-have features:**

1. **Tag Extraction**
   - Query Zotero `itemTags` + `tags` tables for each item
   - Add `tags: string[]` field to ZoteroItem schema
   - Integrate into seed profile analysis: "What tags appear in user's 5-15 seed papers?"
   - Add tag signal to recommendation scoring (equal weight to keywords and authors initially)
   - Why essential: Validation requirement from PROJECT.md ("Tag extraction from Zotero, integrate into recommendations")

2. **Enhanced Error Messages**
   - Show Notice warning if ProfileInitializer detects empty profile (zero keywords, zero authors, zero tags)
   - Suggestion: "Seed papers have no keywords/authors/tags. Try selecting papers that have richer metadata."
   - In Quality Gate override modal: List missing fields by type (e.g., "Missing: Title, DOI, Year") with Zotero fixing instructions
   - Why essential: Project requirement from PROJECT.md ("Enhanced error messages: Show user warning when seed papers result in empty profile")

3. **Progress During Batch Scoring**
   - For 5000-item libraries, display Notice that updates during batch generation
   - Show phases: "Filtering… [500/5000]" → "Ranking… [432 candidates]" → "Quality check… [12 final]"
   - Why essential: Prevents "is it frozen?" anxiety for large libraries; validates research finding that v1.0 lacks progress feedback for 5000+ items

4. **Field Explanation Help Text**
   - In override modal, each field has setDesc() explaining why it's required and how to fix in Zotero
   - Example: "Title — Required for creating readable notes. Add or edit in Zotero if missing"
   - Why essential: Reduces support friction; users understand the "why" before fixing metadata

### Add After Validation (v1.1.x)

**Polish and refinement based on user feedback:**

- **Keyboard shortcuts in modal:** Tab/Shift-Tab navigation, Enter to confirm, Escape to close (accessibility improvement)
- **Export tag profile:** Allow users to see their tag profile from seed set ("You've tagged papers with: 15 unique tags")
- **Tag filtering in triage view:** Optional—show only papers matching user's seed tags (power-user feature)

### Future Consideration (v2+)

**Complex features deferred to avoid v1.1 scope creep:**

- **Adaptive tag weighting:** Learn from user's accept/reject history which tags predict interest
- **Auto-tag notes with Obsidian tags:** Complex mapping between Zotero tag taxonomy and Obsidian's flat tags
- **Tag-based collections:** Group imported papers by seed tags (couples to past imports, conflicts with deferred-processing design)
- **ML tag suggestions:** NLP-based tag predictions (needs training, adds complexity)

---

## Implementation Scope & Risks

### Tag Extraction (Scope: Clear)

**What we know:**
- Zotero stores tags in two tables: `tags` (tag definitions) and `itemTags` (many-to-many linking items to tags)
- Query pattern: `SELECT t.name FROM tags t JOIN itemTags it ON t.tagID = it.tagID WHERE it.itemID = ?`
- Most users have < 100 unique tags per library
- Tag names are plain text (Unicode-safe, including emoji)

**Implementation plan:**
1. Extend ZoteroItem type to include `tags: string[]`
2. Extend ZoteroConnector to query itemTags (one additional SQL join)
3. Extend ProfileAnalyzer to extract tags from seed papers
4. Extend RecommendationEngine to score on tags (normalize across signal types)

**Risk:** MEDIUM — New SQL query adds complexity, but schema is stable and well-documented.

### UX Polish (Scope: Clear)

**What we know:**
- Obsidian Notice API supports `.setMessage()` for updating notifications
- Modal help text uses Setting component's `setDesc()` method
- Progress patterns already exist in v1.0's chunked async processing; v1.1 just adds visibility

**Implementation plan:**
1. In ProfileInitializer, detect empty profile (zero total signals) → show Notice
2. In QualityGate override modal, use `setDesc()` for each field explaining requirement
3. In BatchGenerator, add Notice.setMessage() calls in async chunk loop to show progress
4. Test with real user's 5000-item Zotero library for performance

**Risk:** LOW — All patterns already exist in Obsidian ecosystem; mainly wiring existing components together.

---

## Feature Complexity Matrix

| Feature | User Value | Impl. Cost | Risk | Priority |
|---------|------------|-----------|------|----------|
| **Tag extraction** | HIGH (alignment with user taxonomy) | MEDIUM (SQL + schema extension) | MEDIUM | P1 |
| **Empty profile warning** | MEDIUM (guidance, not blocking) | LOW (one Notice call) | LOW | P1 |
| **Batch scoring progress** | MEDIUM (reduces anxiety) | MEDIUM (async tracking) | LOW | P1 |
| **Field explanation help text** | MEDIUM (reduces friction) | LOW (text additions) | LOW | P1 |
| **Visual validation feedback** | MEDIUM (clarity) | LOW (formatting) | LOW | P1 |
| **Keyboard nav in modals** | LOW (nice-to-have accessibility) | MEDIUM (event handling) | LOW | P2 |
| **Tag profile export** | LOW (informational only) | LOW (formatting) | LOW | P2 |
| **Adaptive tag weighting** | HIGH (learning) | HIGH (algorithm) | HIGH | P3 |

---

## Competitive Landscape for v1.1

**How competitors handle similar features:**

| Feature | ZotLit | Zotero Integration | Citations | ZotBridge v1.1 Approach |
|---------|--------|-------------------|-----------|------------------------|
| **Tag support** | Direct query from DB, synced in real-time | Limited; focuses on BibTeX metadata | BibTeX doesn't include tags | Extract + integrate into recommendations |
| **Progress feedback** | Silent bulk import (no feedback) | Silent bulk import (no feedback) | N/A (file-based, instant) | Progressive notice updates during scoring |
| **Error guidance** | Minimal; assumes user knows fields | Minimal; assumes user knows fields | N/A | Explain each required field + how to fix |
| **Accessibility** | Not documented | Not documented | N/A | Planned (v1.1.x): Keyboard navigation |

**Competitive advantage of v1.1:**
- Only tool that surfaces tag alignment in recommendations
- Only tool that provides phase-by-phase progress feedback for large libraries
- Only tool that explains *why* metadata fields are required

---

## Research Quality Assessment

| Area | Confidence | Source Quality | Gaps |
|------|------------|----------------|------|
| Zotero tag storage (schema) | HIGH | Official Zotero docs + GitHub schema gist | None significant |
| Obsidian Notice API | HIGH | Official docs + sample plugin + dev forum | None significant |
| Obsidian Modal patterns | HIGH | Official docs + sample plugin + community examples | None significant |
| Tag weighting algorithms | LOW | Inferred from v1.0's keyword/author approach | Not validated with users yet |
| Progress UX patterns | MEDIUM | Existing plugins + forum discussions | No Obsidian-specific guidance doc |
| Accessibility (keyboard nav) | MEDIUM | Community forum discussions + feature requests | Official Obsidian guidelines incomplete |

**Overall confidence: HIGH** for feature discovery and implementation approach. Detailed algorithm research (e.g., optimal tag weight in recommendation scoring) deferred to Phase 6 detailed planning.

---

## Open Questions for Phase-Specific Research

1. **Tag weighting algorithm:** What's the optimal relative weight for tags vs. keywords vs. authors in recommendation scoring? (Research during Phase 6 detailed planning)

2. **Large library performance:** Does querying `itemTags` table add meaningful latency for 5000-item libraries? (Prototype and benchmark during Phase 6)

3. **User tag practices:** Do users maintain consistent tagging for research papers, or is tagging ad-hoc? (Inferred from project context; validate with user interviews if v1.1 flops)

4. **Progress feedback granularity:** Is showing "Filtering [500/5000]" helpful, or should we show "Scoring item 500/5000: Machine Learning"? (UX decision during Phase 6 design)

5. **Keyboard navigation priority:** Is keyboard-only modal navigation important for target users (academics, likely desktop-first)? (Consider feedback from v1.0 launch)

---

## Sources

### Zotero Tag Storage
- [Zotero Collections and Tags Documentation](https://www.zotero.org/support/collections_and_tags)
- [Zotero Database Schema (GitHub Gist)](https://gist.github.com/pchemguy/19fa69fb4e74ef0cca0026aa0dbf5f42)
- [Zotero Forums — Direct SQLite Access](https://forums.zotero.org/discussion/12512/need-zotero-database-schema)

### Obsidian API Patterns
- [Obsidian Plugin API Documentation](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Modals Documentation](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian Notice API Usage](https://dev.to/bjarnerentz/journey-developing-an-obsidian-plugin-part-2-improving-the-architecture-basic-error-handling-and-5aa6)

### UX and Accessibility
- [Obsidian Forum — Keyboard Navigation in Modals](https://forum.obsidian.md/t/accessibility-keyboard-navigation-and-shortcuts-for-dialogs-and-pop-up-modals/109)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Advanced Progress Bars Plugin](https://www.obsidianstats.com/plugins/advanced-progress-bars)

### v1.0 Architecture Reference
- `.planning/research/STACK.md` — Core technology decisions (sql.js, Obsidian API)
- `.planning/research/ARCHITECTURE.md` — Component structure (ProcessingEngine, RegistryService)
- `.planning/PROJECT.md` — v1.1 requirements and target users

---

**Research complete. v1.1 features categorized and dependencies mapped. Ready for Phase 6 detailed planning and roadmap creation.**
