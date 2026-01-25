# Project Research Summary: Zotero Triage v1.1

**Project:** Zotero Triage (v1.1 Feature Enhancement)
**Domain:** Obsidian plugin with Zotero SQLite integration
**Researched:** 2026-01-25
**Confidence:** HIGH (architectural patterns from v1.0 validation + v1.1-specific research)

---

## Executive Summary

Zotero Triage v1.1 extends the v1.0 core (batch workflow, quality gates, literature notes) with **tag extraction from Zotero's SQLite database** and **UX polish for large libraries**. The v1.0 stack (TypeScript, sql.js, Obsidian API, Zod) requires **no new dependencies**—all v1.1 features integrate through existing architectural patterns.

**Key recommendation:** v1.1 is low-risk and well-aligned with v1.0 architecture. Tag-based recommendations unlock a major value proposition (users can filter papers by their own tag taxonomy), and UX improvements directly address pitfalls observed during large-library processing. No new architectural patterns required. Implementation effort: **7-10 hours for core features**.

**Primary risks managed:** (1) Tag scoring weights overwhelming other signals—mitigate with conservative weighting (tag weight = 1.0, same as authors) and post-release tuning; (2) Empty profile edge case—already handled by v1.0's fallback logic, v1.1 adds explicit warning; (3) Large library performance—progress tracking confirms items are being processed, chunked async yielding unchanged from v1.0.

---

## Key Findings

### Recommended Stack (v1.1)

**No new npm dependencies required.** All v1.1 features extend v1.0 stack:

**Core technologies (unchanged from v1.0):**
- **TypeScript 5.8+** — type safety for tag scoring extensions
- **sql.js 1.13.0** — queries tags from `tags` + `itemTags` tables (proven pattern)
- **Obsidian API (latest)** — Notice for progress feedback, Modal for field explanations
- **Zod 3.25.76** — schema validation for extended ZoteroItem with tags field
- **lodash.debounce 4.0.8** — debounced state persistence (unchanged)

**Confidence:** HIGH. Tag schema from official Zotero GitHub; all patterns integrate seamlessly with v1.0 infrastructure.

---

### Expected Features (v1.1)

**Launch with v1.1:**

1. **Tag extraction from Zotero** (MUST-HAVE)
   - Query `itemTags` + `tags` tables for each item during load
   - Integrate into RecommendationEngine as third signal (after authors, keywords)
   - Extract tag profile from seed papers during ProfileInitializer
   - Learn from user feedback (AdaptiveLearner increments tag weights on accept)

2. **Enhanced error messages** (MUST-HAVE)
   - Warning notice if ProfileInitializer detects empty profile
   - Field explanation help text in override modal
   - Why essential: Reduces friction; users understand "why" before fixing metadata

3. **Progress feedback during batch scoring** (MUST-HAVE)
   - Notice updates showing phases: "Filtering [500/5000]" → "Scoring [450/500]" → "Quality check [12/450]"
   - Prevents "is it frozen?" anxiety with 5000-item libraries

4. **Field explanations and validation feedback** (MUST-HAVE)
   - List missing fields by type in override modal
   - Link to Zotero UI sections for each field

**Defer to v2+:**
- Adaptive tag weighting (HIGH complexity, niche use)
- Auto-tag notes with Obsidian tags (HIGH complexity)
- ML tag suggestions (training data problem)

---

### Architecture Approach

v1.1 integrates through **minimal modifications to existing v1.0 components**, reusing established patterns. No new services, no structural changes to dependency injection, no schema migrations.

**Major modifications (4 components):**
1. **RecommendationEngine** — Add `calculateTagScore()` method (follows existing author/keyword pattern)
2. **ProfileInitializer** — Extract tags from seed papers (frequency counting, same pattern as authors)
3. **AdaptiveLearner** — Learn tag weights from user feedback (increment weights on accept, same pattern)
4. **BatchService** — Wire ProgressTracker calls to major phases (already initialized, just add update calls)

**No new components needed** — ProgressTracker exists, Obsidian Notice API already used, Modal enhancements via string templating.

**Key insight:** ZoteroConnector already loads tags via ITEM_TAGS_QUERY (line 336-342)—no change needed, just utilize populated field.

### Critical Pitfalls (from v1.0 research, amplified by v1.1 scale)

**Top pitfalls with v1.1 mitigations:**

1. **UI Freezing During Batch Processing** (CRITICAL)
   - What: Processing 5000+ items synchronously blocks Obsidian main thread
   - Mitigation: Chunked async processing (50 items/yield) unchanged from v1.0; ProgressTracker confirms UI isn't frozen

2. **SQLite Database Locking** (CRITICAL)
   - What: Zotero writes lock database; concurrent read fails with SQLITE_BUSY
   - Mitigation: Verify WAL mode enabled; retry logic with exponential backoff; test with Zotero actively syncing

3. **Zotero Schema Changes Breaking Integration** (MODERATE)
   - What: Zotero updates schema between versions; queries break
   - Mitigation: Tags table schema documented in official Zotero GitHub (HIGH confidence stable); implement version detection

4. **State Corruption from Concurrent Writes** (MODERATE)
   - What: Multiple operations attempt simultaneous state saves; JSON corrupts
   - Mitigation: v1.0 already implements debounced saves (2000ms); v1.1 uses same pattern

5. **Memory Leaks with Large Datasets** (MODERATE)
   - What: 5000 items × tag data accumulates without cleanup
   - Mitigation: Tag data structures (Map<string, number>) negligible memory; process in existing batches <100 items

---

## Implications for Roadmap

**Suggested 6-phase structure based on research:**

### Phase 1: Foundation (Unchanged from v1.0)
- Database access, SQLite locking, schema version detection
- No additional v1.1 work needed

### Phase 2: Tag Extraction & Multi-Signal Scoring
- RecommendationEngine with tag scoring (3-4 hours)
- ProfileInitializer extracting tags from seeds (1-2 hours)
- AdaptiveLearner learning tag weights (1 hour)
- Avoids: UI freezing (chunked async unchanged); state corruption (same debounce pattern)

### Phase 3: Progress Tracking & UX Polish
- ProgressTracker visibility during batch scoring (2-3 hours)
- Warning notice for empty profiles
- Field explanation help text
- Avoids: UI freezing perception; confusion during long operations

### Phase 4: Validation & Error Handling
- Enhanced override modal with field explanations (1 hour)
- Visual validation feedback
- Avoids: State corruption (validation prevents invalid items)

### Phase 5: Integration Testing & Performance
- Cross-platform testing (Windows/Mac/Linux)
- Performance benchmarks on 5000-item library
- Edge case validation (empty libraries, schema versions)
- Avoids: UI freezing, memory leaks, schema changes, state corruption

### Phase 6: Feature Design & Tuning
- Tag scoring weight optimization
- Field explanation text review
- Accessibility improvements

### Phase Ordering Rationale

1. **Foundation first (Phase 1):** Database access is foundational; v1.1 tag queries depend on it.

2. **Core feature second (Phase 2):** Tag extraction is primary v1.1 value (differentiator vs. competitors).

3. **UX enhancements parallel-ready (Phase 3):** Progress and error messages don't depend on functional tags.

4. **Validation polishing (Phase 4):** Ensures error messages guide users effectively.

5. **Testing and integration (Phase 5):** Comprehensive real-world validation before release.

6. **Fine-tuning (Phase 6):** Algorithm weights, accessibility features, messaging clarity.

**Why this grouping minimizes risk:**
- Separates risky work (database access, large-scale processing) to Phase 1-2 with focused testing
- UX work (Phase 3) is low-risk, doesn't block anything
- Testing (Phase 5) is comprehensive before users see code
- No big-bang integration; features built incrementally

---

### Research Flags

**Phases requiring deeper research during planning:**

- **Phase 2 (Tag Scoring Algorithm):** How much should tags contribute to final score? Start with equal weight to keywords, validate against user feedback.

- **Phase 3 (Field Explanation UX):** User test the help text—is it clear why each field matters?

- **Phase 5 (Cross-platform Testing):** Zotero paths differ by OS; explicit testing on Windows/Mac/Linux with attachment lookup.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Foundation):** v1.0 research already covered SQLite access, Zotero schema.

- **Phase 4 (Validation Modal):** Standard Obsidian modal pattern, well-documented.

- **Phase 6 (Tuning):** No research needed. Phase 5 will reveal which parameters need adjustment.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | No new dependencies; v1.0 stack proven. Tag schema from official Zotero GitHub. |
| **Features** | HIGH | All must-haves straightforward; dependencies mapped in FEATURES.md. |
| **Architecture** | HIGH | 4 component modifications, no new services. All patterns proven in v1.0. |
| **Pitfalls** | MEDIUM-HIGH | Critical pitfalls documented from v1.0 research. Tag weighting needs post-launch monitoring. |

**Overall confidence: HIGH**

v1.1 is well-scoped, low-risk, and aligns with v1.0 architecture. No foundational assumptions need validation. Implementation complexity is moderate (7-10 hours), and all integration points are explicit.

### Gaps to Address

1. **Tag weighting algorithm optimization** — Start with conservative weights (1.0 same as authors); adjust post-release based on user feedback.

2. **Field explanation text clarity** — Explanations are plausible but untested with actual users. Phase 3 should include user testing.

3. **Large library performance benchmarking** — v1.1 adds tag queries; must verify <5s batch operation on 5000-item library.

4. **Automatic vs. user tags differentiation** — Zotero's itemTags.type field (0=user, 1=automatic). v1.1 treats equally. Revisit if users report noisy recommendations.

5. **Obsidian version compatibility** — v1.1's ProgressModal and Notice API usage should be tested on Obsidian 1.3+.

---

## Sources

### Primary Research Files
- **STACK.md** — v1.1 stack additions (tags queries, progress tracking patterns, modal components). HIGH confidence from official Zotero schema + Obsidian API docs.
- **FEATURES.md** — v1.1 features (tag extraction, progress feedback, field explanations). HIGH confidence from project requirements + competitive landscape analysis.
- **ARCHITECTURE.md** — Integration points (4 modified components, no new services). HIGH confidence from codebase review + pattern validation.
- **PITFALLS.md** — Risk mitigation (UI freezing, SQLite locking, schema changes, state corruption). HIGH confidence from official docs + community forums + real-world examples.

### Official Documentation
- [Zotero Direct SQLite Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- [Zotero GitHub userdata.sql schema](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql)
- [Obsidian Plugin API Docs](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Modals & Notice API](https://docs.obsidian.md/Plugins/User+interface/Modals)
- [Zod Schema Validation](https://zod.dev/api)

### Community & Project Context
- [Zotero Forums — SQLite access](https://forums.zotero.org/)
- [Obsidian Plugin Developer Forum](https://forum.obsidian.md/)
- v1.0 research outputs (STACK.md, PITFALLS.md from prior research phase)

---

**Research completed:** 2026-01-25
**Ready for roadmap:** YES — Sufficient confidence and specificity for v1.1 phase planning.
**Estimated implementation:** 7-10 hours for core features + 2 hours testing
**Risk level:** LOW-MODERATE (standard Obsidian/SQLite pitfalls, all documented and mitigable)
