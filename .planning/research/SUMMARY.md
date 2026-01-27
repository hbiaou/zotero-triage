# Project Research Summary: Zotero Triage v1.2

**Project:** Zotero Triage Plugin (v1.2 Milestone: Library Filtering & Preflight Checks)
**Domain:** Obsidian plugin with Zotero integration
**Researched:** 2026-01-27
**Confidence:** HIGH

---

## Executive Summary

Zotero Triage v1.2 adds **library scope filtering** and **preflight data health checks** to the existing recommendation engine, enabling users to process only personal library items while detecting common data issues (duplicates, trash volume, group membership) before triage begins. The milestone is **additive with zero new dependencies**: all features use the existing TypeScript + sql.js + Obsidian API stack with targeted SQL query extensions and modest new settings fields.

The architecture strategy is **filter-first**: library scoping happens at ZoteroConnector query time (not post-processing), reducing memory overhead and improving performance. A new DuplicateDetector service identifies potential duplicates (DOI/ISBN/title matching) for user review in a preflight modal before ProfileInitializer runs. This is **non-blocking advisory design**: warnings inform users without preventing workflow progression.

The critical insight from research: **duplicate detection is hard**. Zotero's own algorithm has documented false positives (same ISBN across book volumes, same DOI from publisher series). The plugin must use conservative matching (requiring multiple field confirmation) and allow user override, or risk blocking legitimate items and eroding trust.

---

## Key Findings

### Recommended Stack

v1.2 requires **zero new npm packages**. The existing stack (TypeScript 5.9.3, sql.js 1.13.0, Obsidian API latest) fully supports the new features with targeted extensions:

**Core technologies (no changes):**
- **TypeScript 5.9.3** — Query logic and type-safe duplicate detection fit existing patterns
- **sql.js 1.13.0** — Read-only SQL queries for library filtering, duplicate detection, and preflight validation
- **Obsidian API (latest)** — Settings persistence (saveData/loadData), Modal extensions (PreflightCheckModal), new Setting controls

**Feature-specific additions:**
1. **Library filtering:** Zotero SQLite schema additions to ITEMS_QUERY (WHERE clause filters by libraryID, type = 'user', archived = 0)
2. **Duplicate detection:** In-memory service using existing ZoteroItem array; DOI/ISBN/title matching via string normalization
3. **Preflight checks:** New queries to itemRelated (duplicates), deletedItems (trash), groups (group library detection), retractedItems (Zotero 7+)
4. **Settings persistence:** New ZoteroTriageSettings fields (libraryFilterMode, preflightCheckEnabled, lastPreflightCheck)

**Implementation scope:** ~500 lines of new code across 4 components. **Cost:** 2-4 hours per component.

---

### Expected Features

v1.2 focuses on **scope management** and **data transparency** before triage begins.

**Must have (table stakes):**
- **Personal library filtering** — Exclude group libraries, feeds, trash, archived items; users expect plugin to respect their library scope
- **Preflight health check modal** — Before onboarding, show item count, duplicate count, trash volume; advisory only, never blocking
- **Duplicate item awareness** — Query Zotero's itemRelated table; warn users about DOI/ISBN matches without blocking
- **Non-destructive by design** — Plugin validates and alerts; all fixes happen in Zotero, not in plugin

**Should have (competitive differentiators):**
- **Transparent scope display** — Show exactly which items plugin processes vs. what's excluded
- **Configurable library selection** — Settings UI to choose which personal library to process

**Defer to v2+:**
- Complex fuzzy matching (author + publication year) — Conservative and error-prone
- Auto-merge duplicates — Violates read-only constraint; user loses control
- Library health dashboard — Advanced feature

---

### Architecture Approach

v1.2 integrates four new components into the existing v1.1 architecture while preserving the ProfileInitializer → RecommendationEngine → BatchService → RegistryService flow:

**Major components:**

1. **ZoteroConnector (modified)** — Add library filtering to ITEMS_QUERY; accept `libraryFilter` parameter; execute query-time filtering

2. **DuplicateDetector (new)** — Standalone service scanning loaded items for duplicate DOIs, ISBNs, and titles; returns DuplicateGroup[] with confidence scores

3. **PreflightCheckModal (new)** — Obsidian Modal displaying duplicate groups; allows user to keep/remove items; returns resolved seed list; never blocking

4. **RegistryService (unchanged)** — Continues to track all historical triage state; filtering at query time preserves history

**Data flow:** Plugin load → ZoteroConnector.loadItems({libraryFilter}) → Batch uses pre-filtered set. Wizard: SetupWizardModal → DuplicateDetector → PreflightCheckModal (if needed) → ProfileInitializer

**Integration principle:** Filter early (at query time), validate late (before profile creation), advise always (never silently discard data).

---

### Critical Pitfalls

Research identified five critical pitfalls; three are high-risk without proper prevention:

1. **Filtering breaks batch generation** (CRITICAL)
   - Root cause: Misunderstanding libraryID vs. collections; filter conditions ordered incorrectly; not tested with multi-group/feed/archived libraries
   - Prevention: Test with representative libraries; add debug logging; make filtering optional and toggleable

2. **Duplicate detection false positives** (CRITICAL)
   - Root cause: DOI/ISBN-only matching without type/year validation; same DOI from publisher series; multi-volume books share ISBN
   - Prevention: Require multi-field confirmation (DOI AND title similarity, not OR); validate publication type compatibility; allow ±1 year variance; make advisory-only with override button

3. **Preflight blocking UX** (HIGH)
   - Root cause: 30+ second validation without progress feedback; modal without recovery path; users force-quit plugin
   - Prevention: Show progress during validation; implement 30-second timeout with graceful degradation; always provide "Skip Check" button

4. **Schema incompatibility (Zotero 6 vs. 7)** (MEDIUM)
   - Root cause: Zotero 7 introduced annotation tags, changed feed handling; schema not guaranteed stable
   - Prevention: Include version-specific schema checks; test on both versions; filter annotation tags; graceful degradation for missing tables

5. **Performance degradation at scale** (MEDIUM)
   - Root cause: O(n²) duplicate detection (25M comparisons for 5000 items); no batch optimization; memory grows 50MB+
   - Prevention: Pre-filter by DOI/ISBN first; implement early-exit; batch validation in chunks; add 30-second timeout; test on 5000+ items

---

## Implications for Roadmap

Research suggests four implementation phases, each independently testable.

### Phase 1: Library Filtering Foundation
**Delivers:** Modified ITEMS_QUERY with libraryID filtering, ZoteroConnector changes, new settings field, debug logging
**Avoids:** Pitfall #1 (filtering breaks batch) — extensive testing with multi-group/feed/archived libraries
**Effort:** 2-3 hours | **Priority:** P1

### Phase 2: Duplicate Detection Service
**Delivers:** DuplicateDetector class with DOI/ISBN/title matching, confidence scoring, comprehensive testing
**Avoids:** Pitfall #2 (false positives) — conservative multi-field matching, user override
**Effort:** 2 hours | **Priority:** P1

### Phase 3: Preflight Modal & Integration
**Delivers:** PreflightCheckModal with progress feedback, timeout protection, non-blocking design, integration with wizard flow
**Avoids:** Pitfall #3 (blocking UX) — recovery buttons, progress updates, always-skippable flow
**Flags:** Test preflight queries on Zotero 6.0 and 7.x; verify retractedItems table handling
**Effort:** 3 hours | **Priority:** P1

### Phase 4: Settings Persistence & UI Polish
**Delivers:** Library selection dropdown in settings, persistent selection, batch generation respects selection
**Avoids:** None — Phase 1 already handles persistence; this is UX refinement
**Effort:** 1-2 hours | **Priority:** P2

**Phase Ordering Rationale:**
1. Filtering first (foundation for all downstream)
2. Detector second (service pure logic, no UI)
3. Modal third (depends on detector, integrates into wizard)
4. Settings last (polishing layer, can be deferred)

---

## Research Flags

**Phases needing deeper research during planning:**

- **Phase 1:** Query performance optimization — If preflight check takes >10 seconds on 5000 items, may need algorithm redesign. Run EXPLAIN QUERY PLAN.

- **Phase 3:** Zotero version compatibility — Must validate preflight queries work on both Zotero 6.0+ and 7.x. May require community testing during beta.

**Phases with standard patterns (skip research-phase):**

- **Phase 2:** Duplicate detection algorithm is deterministic; standard O(n) pre-filtering + matching. No research needed beyond test case development.

- **Phase 4:** Settings UI uses proven Obsidian Plugin API patterns. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Zero new dependencies; existing stack fully supports features. Official Zotero schema verified. |
| **Features** | HIGH | Feature categories clearly defined with dependencies resolved. Sourced from Zotero documentation and competitive landscape. |
| **Architecture** | HIGH | Integration points identified in existing v1.1 architecture. Component boundaries clear. Existing SetupWizardModal pattern serves as proven reference. |
| **Pitfalls** | HIGH | Five critical pitfalls identified with real-world examples from Zotero forums. Prevention strategies documented with recovery costs assessed. |

**Overall confidence: HIGH**

All four research dimensions converge. Official Zotero documentation is primary source. Existing v1.1 architecture is mature and stable. Pitfall research grounded in community issues.

---

## Gaps to Address

During planning and implementation, flag these areas for validation:

1. **Multi-library performance testing** — Research assumes query-time filtering is optimal; needs verification on user machines with 5000+ items across 3+ libraries. If preflight check exceeds 30 seconds, redesign algorithm.

2. **Duplicate detection accuracy baseline** — Implement test cases for 20+ known duplicate scenarios. Measure precision/recall before shipping. If accuracy <95%, adjust confidence thresholds.

3. **Zotero version compatibility matrix** — Create documented matrix of Zotero 6.0, 6.1, 7.0, 7.1+ with version-dependent behaviors. Test preflight on at least two versions before release.

4. **Preflight timeout scenarios** — Simulate large libraries (10K+ items) to verify 30-second timeout doesn't cause data loss. Measure memory growth; set alert at 150MB.

5. **User feedback on false positives** — Plan Phase 3 validation to include beta testers with large libraries. Gather feedback on duplicate detection accuracy and preflight perceived friction.

---

## Sources

### Primary (HIGH confidence)

- **Zotero SQLite Schema** — Official [GitHub schema definition](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql)
- **Zotero Duplicate Detection Docs** — Official [duplicate detection algorithm](https://www.zotero.org/support/duplicate_detection)
- **Zotero Database Access** — Official [read-only SQLite access patterns](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
- **Obsidian Plugin API** — [Official settings persistence patterns](https://docs.obsidian.md/Plugins/Storing+data)

### Secondary (MEDIUM confidence)

- **Zotero Community Forums** — Real-world issues: ISBN false positives, group library filtering, duplicate detection accuracy
- **v1.1 Architecture** — Existing codebase serves as proven reference for integration patterns
- **Data Quality Research** — Peer-reviewed studies on duplicate detection algorithms and deduplication pitfalls

### Tertiary (implementation details)

- Test case development requires access to real Zotero databases with multi-group/feed/archive scenarios
- Performance profiling needs EXPLAIN QUERY PLAN analysis and WASM sql.js benchmarking

---

*Research completed: 2026-01-27*
*Ready for roadmap creation: YES*

---

## Research Files Reference

- **STACK.md** — Technology stack analysis; zero new dependencies; SQL query patterns; settings extensions; implementation patterns
- **FEATURES.md** — Feature categorization (table stakes vs. differentiators); dependency graph; Zotero database structure; preflight UX patterns
- **ARCHITECTURE_V1_2.md** — Component integration guide; data flow diagrams; recommended build order (Phase 1-4); performance implications; anti-patterns to avoid
- **PITFALLS_V1_2.md** — Critical pitfalls (5 identified); prevention strategies; real-world examples from Zotero ecosystem; recovery costs
