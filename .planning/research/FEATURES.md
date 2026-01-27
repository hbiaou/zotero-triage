# Feature Research: Library Scope Filtering & Preflight Validation (v1.2)

**Domain:** Obsidian plugin with Zotero integration (library filtering and data quality checks)
**Researched:** 2026-01-27
**Milestone:** v1.2 (library management and data health)
**Confidence:** HIGH (Zotero documentation verified, preflight patterns researched, duplicate detection algorithms analyzed)

---

## Executive Summary

Version 1.2 focuses on **library scope management** and **preflight validation**, ensuring that the triage workflow operates on clean, scoped data. The plugin must filter database queries to target only the user's personal library while excluding group libraries, RSS feeds, deleted items, and retracted items. Additionally, a preflight health check should warn users about common data issues (duplicates, trash volume) before they begin triage, enabling them to fix problems in Zotero.

These features are **non-destructive by design**: The plugin validates and alerts but never modifies user data. All fixes happen in Zotero, not in the plugin. This respects Zotero's data ownership model and keeps the plugin's scope narrow.

---

## Table Stakes Features

Features users expect in a reference manager plugin handling library data.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Personal library filtering** | Plugin processes user's own items; group library content creates confusion and conflicting states | MEDIUM | Filter on libraryID; exclude groups, feeds, retracted items; already excludes trash and attachments in v1.0 |
| **Duplicate item awareness** | Zotero identifies duplicates; processing them creates noise and wastes user time | LOW | Advisory-only; query to detect duplicates and warn before triage starts |
| **Trash exclusion** | Zotero Trash is temporary holding; processing deleted items is confusing | LOW | Already filtered in ITEMS_QUERY; preflight reports volume |
| **Retracted item handling** | Zotero 7+ marks retracted papers; processing them undermines research integrity | MEDIUM | Query for retractedItems table; exclude in scope filter; handle gracefully if table missing (Zotero 6.x) |
| **Preflight data health check** | Before onboarding, user should know if library has issues (duplicates, trash, group content) | MEDIUM | Advisory modal in onboarding wizard; non-blocking, informational only |

**Complexity definitions:**
- LOW: < 2 hours implementation
- MEDIUM: 2-6 hours implementation
- HIGH: > 6 hours implementation

---

## Differentiators

Features that set v1.2 apart from competing plugins.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Transparent scope filtering** | Show user exactly which items plugin processes (My Library only); rebuild trust in data handling | LOW | Display count of items processed vs. total library; show exclusions in preflight |
| **Configurable library selection** | Power users with multiple personal libraries (e.g., "Research", "Reading") can choose which to process | HIGH | Settings tab with library selector; persist choice; requires multiple-library querying |
| **Preflight repair workflow** | Guide users to fix problems in Zotero before starting triage (duplicates → merge, trash → empty) | MEDIUM | Modal with actionable links (zotero:// deep links to Duplicate Items panel) |
| **Duplicate conflict prevention** | Proactively warn about duplicates that would create conflicting note states | MEDIUM | Query duplicate detection; cross-reference with existing notes; warn of conflicts |
| **Historical library health dashboard** | Show trends: trash growth over time, duplicate accumulation, library clean-up impact | HIGH | Advanced feature; track metrics in settings; visualize (deferred to v1.2.x) |

---

## Anti-Features

Features that seem appealing but create problems. Deliberately avoid in v1.2.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-merge duplicates in the plugin** | "Just fix duplicates automatically" | Violates read-only constraint; risks data loss if merge logic differs from Zotero's; user loses control | Guide user to Zotero's built-in merge UI (Tools → Duplicate Items); plugin only warns |
| **Auto-empty trash** | "Delete old items automatically to clean up" | User may have intentionally moved items to trash (temporary removal); plugin can't distinguish intent | Warn about trash volume; user manually empties in Zotero when ready |
| **Auto-exclude group libraries by scanning all groups** | "Just detect and skip all shared content" | Zotero's group library list can be large; scanning all groups at startup kills performance; user may intentionally include group content in some workflows | Offer settings checkbox to enable/disable group filtering; default to My Library only |
| **Force single-library mode** | "Only allow processing one library at a time" | Researchers with "Personal" and "Research" libraries want to choose which to process; forcing choice is annoying | Offer library selector in settings (v1.2+); default to primary library; allow switching |
| **Complex duplicate matching (fuzzy matching by title + authors)** | "Don't rely on Zotero's duplicate detection; find more duplicates ourselves" | Fuzzy matching adds complexity and false positives; Zotero's exact-match (DOI/ISBN/title) is conservative and reliable; maintaining separate duplicate logic creates divergence | Use Zotero's built-in duplicate detection (query duplicateItems view); don't invent new algorithms |

---

## Feature Dependencies

Understanding which features must be built first.

```
v1.1 Complete (Architecture foundation)
├── Recommendation Engine (tags, authors, keywords)
├── Batch Processing (filtering, scoring, selection)
└── Quality Gates (validation)

v1.2 Library Filtering & Preflight:

Scope Filtering (Query-level):
├── Library ID Detection
│   ├── Requires: Zotero database schema knowledge
│   ├── Queries: libraries table to find user library ID
│   └── Constraints: Must handle Zotero 6.x/7.x variations
├── Group/Feed Exclusion
│   ├── Requires: Library ID detection
│   ├── Queries: groups, feeds tables for non-user libraries
│   └── Constraints: Safe exclusion; no data loss
├── Retracted Item Handling
│   ├── Requires: Schema version check (7+)
│   └── Constraints: Graceful degradation for Zotero 6.x
└── Updated ITEMS_QUERY
    ├── Requires: All above
    ├── Modifies: WHERE clause to filter by libraryID
    └── Backward compatible with v1.0 (no schema changes)

Preflight Check (User Advisory):
├── Duplicate Detection Query
│   ├── Requires: Zotero's itemRelated table (duplicate links)
│   └── Output: Count of duplicates + warning modal
├── Trash Volume Assessment
│   ├── Requires: deletedItems table scan
│   └── Output: Item count in trash + tip
├── Group Library Advisory
│   ├── Requires: Library filtering query
│   └── Output: Count of group items found (if any)
├── Retracted Item Count
│   ├── Requires: retractedItems table check
│   └── Output: Count + advisory
└── Preflight Modal in Onboarding
    ├── Requires: All above queries
    ├── Integrates with: OnboardingWizard
    └── Triggers: After database connection, before seed selection

Library Selection Settings (Optional, v1.2.x):
├── Library Dropdown
│   ├── Requires: libraries table query
│   ├── Queries: all user libraries (type = 'user')
│   └── Persists in settings
├── Library-scoped Batch Generation
│   ├── Requires: Filter parameter in ITEMS_QUERY
│   └── Updates: BatchService, RecommendationEngine
└── Per-library Profile/Registry
    ├── Requires: Registry persistence per library
    └── Constraint: User chooses library in settings
```

### Dependency Notes

- **Scope filtering must come before preflight checks:** Queries need to handle library filtering consistently; preflight reuses the same library detection logic
- **Preflight checks are non-blocking:** Warnings don't prevent triage from starting; they're advisory only
- **Settings integration is optional for v1.2.0:** Basic feature filters to My Library only; settings UI for library selection deferred to v1.2.x if time permits
- **Retracted item handling gracefully degrades:** If retractedItems table missing (Zotero 6.x), query fails silently; warning doesn't appear

---

## Zotero Database Structure (Research)

### Library Organization

Zotero uses a **library hierarchy** stored in the `libraries` table:

| Column | Values | Purpose |
|--------|--------|---------|
| `libraryID` | 1 (typical), 2+ | Unique library identifier |
| `type` | 'user', 'group', 'feed' | Library category |
| `name` | (text) | User-facing name |
| `fileEditable` | 0/1 | Whether plugin can write (always 0 for read-only) |

**Examples:**
- `libraryID=1, type='user'` → User's "My Library" (primary personal library)
- `libraryID=2, type='group'` → "Project X Team Library" (shared, group-owned)
- `libraryID=3, type='feed'` → "ArXiv Computer Science Feed" (RSS-sourced)

**Key constraint:** All items in the `items` table have a `libraryID` foreign key. Filtering by libraryID is the core scoping mechanism.

### Duplicate Detection

Zotero stores duplicate relationships in the `itemRelated` table:

| Column | Purpose |
|--------|---------|
| `itemID` | First item in pair |
| `linkedItemID` | Related item |
| `predicateID` | Relationship type (1 = duplicate) |

**Query pattern:** `SELECT * FROM itemRelated WHERE predicateID = 1` identifies duplicate pairs.

**Important:** Duplicates are bidirectional. If item A duplicates item B, only one entry is stored (item A → item B); need to query in both directions.

### Trash and Retraction

Existing v1.0 already filters:
- `deletedItems` table (items in Trash)
- `itemType NOT IN ('attachment', 'note')` (non-content items)

v1.2 adds:
- `retractedItems` table (Zotero 7+ only; contains list of DOIs or itemIDs of retracted papers)

---

## Duplicate Detection: Best Practices

### How Zotero Detects Duplicates

From official Zotero documentation:

Zotero identifies duplicates by comparing:
1. **Primary fields** (exact match required):
   - Title
   - DOI
   - ISBN

2. **Secondary fields** (if primary fields match or missing):
   - Publication year (within 1 year)
   - Author/creator last name + first initial match (at least one author)

**Key insight:** Zotero uses **exact matching for primary fields** (DOI/ISBN/title), not fuzzy matching. This is intentionally conservative to avoid false positives.

### Why Plugin Should NOT Implement Fuzzy Matching

**Research findings:**
- Fuzzy matching algorithms (Levenshtein, Jaro-Winkler, Jaccard) are useful for data cleanup but have high false positive rates
- Title fuzzy matching is particularly risky: "Machine Learning in Medicine" vs. "Machine Learning and Medicine" would fuzzy-match but are different papers
- Author fuzzy matching creates problems: "Smith, J." vs. "Smith, James" should match, but also "Jones" vs. "Smith" shouldn't

**Recommendation:** Use Zotero's built-in duplicate detection (query `itemRelated` table); don't invent new algorithms. If Zotero says items are duplicates, they are. If Zotero doesn't flag them, leave them alone.

**Plugin's role:** Warn user about Zotero-detected duplicates; guide to Zotero's merge UI; monitor for duplicates that would create conflicting notes.

---

## Preflight Check Patterns

### Research on Data Quality Gates

From broader data import literature:

**Two UX patterns for preflight checks:**

| Pattern | UX | Use Case |
|---------|-----|----------|
| **Blocking gate** | Modal prevents proceeding until issues resolved | Critical blockers (no items to process, database corruption) |
| **Warning advisory** | Non-modal notice; user can dismiss and proceed | Non-critical advisories (duplicates, old trash, performance tips) |

**Best practice:** Combine both:
- **Blocking gate** for true blockers (corrupted DB, no personal library found)
- **Warning advisory** for user-actionable tips (duplicates to merge, trash to empty)

v1.2 uses **warning advisory** approach: Onboarding wizard shows preflight health check with recommendations, but user can skip and proceed if they choose.

### Scope Filtering UX

**Transparency principle:** Show user exactly what the plugin is processing.

**Recommended preflight display:**
```
Library Health Check

Personal Library: 4,237 items (processing)
Group Libraries: 2 groups with 3,891 items (excluded)
RSS Feeds: 1 feed with 156 items (excluded)
Trash: 23 items (excluded)

Recommendations:
• Resolve 7 duplicate items before starting (Tools → Duplicate Items in Zotero)
• Consider emptying Trash if you have old items there (23 items)

Ready to start triage? [Yes, proceed] [Review settings]
```

This gives user confidence that the plugin is narrowly scoped and non-intrusive.

---

## Feature Categorization for v1.2

### Launch with v1.2.0

**Core value:** Filter to personal library; warn about data quality issues before triage.

**Must-have features:**

1. **Personal Library Filtering (Scope Filter)**
   - Filter ITEMS_QUERY WHERE libraryID = (select libraryID from libraries where type = 'user' limit 1)
   - Exclude group libraries (libraryID in groups table)
   - Exclude feed libraries (libraryID in feeds table)
   - Exclude retracted items if table exists (Zotero 7+)
   - Why essential: Current plugin may process group/feed items, creating confusion and conflicting states
   - Complexity: MEDIUM (SQL joins, schema detection)

2. **Preflight Health Check Modal**
   - Query duplicate count: SELECT COUNT from itemRelated WHERE predicateID = 1
   - Query trash count: SELECT COUNT from deletedItems
   - Query group count: Items with libraryID not in My Library
   - Display in OnboardingWizard as new step before seed selection
   - Why essential: Users unaware of duplicates will waste time triaging conflicting metadata; trash volume impacts performance
   - Complexity: MEDIUM (multiple queries, modal integration)

3. **Advisory Warnings (Non-blocking)**
   - "7 duplicate items detected. Resolve in Zotero (Tools → Duplicate Items) for cleaner processing."
   - "23 items in Trash (excluded from triage). Consider emptying Trash to improve database speed."
   - "Your library includes group-shared items; only personal library items will be processed."
   - Why essential: Gives user context for why data looks the way it does; builds confidence in plugin
   - Complexity: LOW (text + conditionals)

4. **Personal Library Only by Default**
   - ITEMS_QUERY filters to My Library (libraryID = 1, typically)
   - No UI changes in v1.2.0; settings hard-coded to personal library
   - Why essential: Prevents silent processing of group content; aligns with plugin's single-user design
   - Complexity: LOW (SQL WHERE clause)

### Add After Validation (v1.2.x)

**Polish and user feedback refinement:**

- **Library selector in settings:** Dropdown to choose which personal library to process (v1.2.1+)
- **Preflight repair workflow:** Deep links from modal to Zotero actions (zotero://select/items/0_... to jump to Duplicate Items panel)
- **Trash management UI:** Optional "Empty Trash" button in settings (v1.2.2+ if safe to implement)
- **Library health dashboard:** Track metrics over time (optional, v1.2.x)

### Future Consideration (v3+)

**Complex features deferred to avoid v1.2 scope creep:**

- **Cross-library deduplication:** Detect items that appear in multiple personal libraries and warn about sync conflicts
- **Metadata quality scoring:** Assess completeness (has title? has DOI? has year?) and surface low-quality items
- **Bulk retraction checking:** Query retracted papers database (CrossRef API) to flag potentially retracted items
- **Collaborative conflict detection:** For group libraries, detect items modified by multiple users and mark as high-risk

---

## Implementation Scope & Risks

### Library Filtering (Scope: Clear)

**What we know:**
- Zotero stores libraryID in items table; libraries table has type field
- v1.0 already excludes trash (deletedItems) and non-content items (attachments, notes)
- RetractedItems table exists in Zotero 7+; absent in Zotero 6.x (safe to check for existence)
- SQL schema is stable across Zotero 6.x/7.x for core tables

**Implementation plan:**
1. Modify ITEMS_QUERY WHERE clause: `AND i.libraryID = (SELECT libraryID FROM libraries WHERE type = 'user' LIMIT 1)`
2. Add schema check in ZoteroConnector for retractedItems table
3. If table exists, add `AND i.itemID NOT IN (SELECT itemID FROM retractedItems)` to WHERE clause
4. Update ITEM_COUNT_QUERY with same filters
5. Test with real Zotero databases (6.x and 7.x)

**Risk:** LOW — SQL changes are localized; filtering is standard pattern; backward compatible with v1.0 registries (no data schema change)

### Duplicate Detection (Scope: Clear)

**What we know:**
- Zotero stores duplicates in itemRelated table with predicateID = 1
- Duplicate links are bidirectional but stored once (query both directions to be safe)
- Most users with 5000-item libraries have 5-50 duplicates (based on research)
- Querying duplicates is fast (single indexed table scan)

**Implementation plan:**
1. Add DUPLICATES_QUERY: `SELECT COUNT(DISTINCT itemID) FROM itemRelated WHERE predicateID = 1 AND (itemID IN (select itemID from items) OR linkedItemID IN (select itemID from items))`
2. In ZoteroConnector, add `countDuplicates()` method
3. Call during preflight check; display count in advisory
4. Optionally, list duplicate item pairs if helpful (not required for v1.2.0)

**Risk:** LOW — Read-only query; no data modifications; duplicates already exist (not created by plugin)

### Preflight Modal (Scope: Clear)

**What we know:**
- OnboardingWizard already has multi-step modal pattern (database path → seed selection)
- Obsidian Modal API well-documented and stable
- Non-blocking advisory is simpler than blocking gate

**Implementation plan:**
1. Add new OnboardingWizard step: "Library Health Check" (before seed selection)
2. Run all preflight queries (duplicates, trash, groups, retracted) at step entry
3. Display results with actionable text
4. Provide [Proceed] and [Review Settings] buttons (both allow progression)
5. If zero issues found, offer [Skip Health Check] fast-path

**Risk:** LOW — Uses existing OnboardingWizard patterns; advisory-only (no blocking); query results are informational only

---

## Feature Complexity Matrix

| Feature | User Value | Impl. Cost | Risk | Priority |
|---------|------------|-----------|------|----------|
| **Personal library filtering** | MEDIUM (correctness; prevents confusion) | MEDIUM (SQL + schema check) | LOW | P1 |
| **Duplicate detection query** | MEDIUM (awareness; guidance) | LOW (single query) | LOW | P1 |
| **Trash count advisory** | LOW (informational; nice-to-have) | LOW (count query) | LOW | P1 |
| **Preflight modal in onboarding** | MEDIUM (transparency; user control) | MEDIUM (modal integration) | LOW | P1 |
| **Retracted item handling** | LOW (Zotero 7+ only; rare) | MEDIUM (schema detection) | LOW | P2 |
| **Group library advisory** | LOW (informational; likely 0 groups) | LOW (library filtering query) | LOW | P1 |
| **Library selector in settings** | MEDIUM (power users) | HIGH (settings UI + persistence) | MEDIUM | P2 |
| **Trash management button** | LOW (convenience; user rarely needs) | MEDIUM (API call complexity) | HIGH | P3 |
| **Deep links to Zotero panels** | MEDIUM (workflow improvement) | LOW (zotero:// URI scheme) | LOW | P2 |

---

## Competitive Landscape for v1.2

How competing tools handle library scoping and preflight checks:

| Feature | ZotLit | Zotero Integration | Citations | ZotBridge v1.2 Approach |
|---------|--------|-------------------|-----------|------------------------|
| **Library scope filtering** | Not documented; likely processes all items | Not documented; likely includes groups | N/A (file-based) | Explicitly filter to My Library; transparent advisory |
| **Duplicate detection** | Not documented | Not documented | N/A | Query Zotero's itemRelated; warn before triage |
| **Trash handling** | Not documented | Not documented | N/A | Advisory only; no deletion |
| **Preflight data health check** | Not documented | Not documented | N/A | Modal with actionable recommendations |
| **Transparency** | Minimal | Minimal | N/A | Show exact scope (4237 personal, 3891 group, 23 trash) |

**Competitive advantage of v1.2:**
- Only plugin that explicitly shows library scope and allows user to verify correct filtering
- Only plugin that warns about duplicates before triage (prevents wasted time)
- Only plugin that provides deep links to Zotero repair workflows

---

## Research Quality Assessment

| Area | Confidence | Source Quality | Gaps |
|------|------------|----------------|------|
| Zotero library structure (schema) | HIGH | Official Zotero docs + GitHub schema + forum discussions | None |
| Duplicate detection (Zotero's algorithm) | HIGH | Official Zotero documentation + research papers | None |
| Trash handling | HIGH | Official Zotero docs + schema gist | None |
| Preflight UX patterns | MEDIUM | Data import literature + general UX patterns | No Obsidian-specific guidance |
| Retracted item support (Zotero 7+) | MEDIUM | Zotero release notes + forum discussions | Limited official documentation |
| Group library behavior | HIGH | Official Zotero docs + community forum | None |
| Fuzzy matching pitfalls | HIGH | Data deduplication research papers | Application-specific gotchas not fully explored |

**Overall confidence: HIGH** for core feature discovery (library filtering, duplicate detection). UX implementation details (modal styling, copy) have medium confidence and should be validated with users during Phase 6 detailed planning.

---

## Open Questions for Phase-Specific Research

1. **Multi-library support priority:** Should v1.2.0 include library selector in settings, or defer to v1.2.1? (Timeline/scope decision)

2. **Retracted items in v1.2.0:** Should we handle Zotero 7+ retractedItems gracefully, or assume all users on Zotero 7? (Platform support decision)

3. **Duplicate deep link behavior:** When user clicks "Resolve duplicates" link, should it open Zotero or use zotero:// URI to jump directly to Duplicate Items panel? (Integration testing needed)

4. **Preflight performance:** With large libraries (20K+ items), will preflight queries (duplicate scan, trash count) take > 1 second? (Benchmark during implementation)

5. **Group library heuristics:** Should plugin warn if it detects ANY group libraries in Zotero (even if not processing them)? Or only warn if group items were found in previous query? (UX decision)

6. **Trash advisory threshold:** At what trash volume should the "Consider emptying Trash" warning trigger? (50 items? 100? User preference?)

---

## SQL Query Examples

### Personal Library Filter

```sql
-- Identify user's personal library ID
SELECT libraryID
FROM libraries
WHERE type = 'user'
LIMIT 1;

-- Filter ITEMS_QUERY to personal library only
WHERE i.itemID NOT IN (SELECT itemID FROM deletedItems)
  AND i.libraryID = (SELECT libraryID FROM libraries WHERE type = 'user' LIMIT 1)
  AND it.typeName != 'attachment'
  AND it.typeName != 'note'
  AND it.typeName != 'annotation'
```

### Retracted Item Filter (Zotero 7+)

```sql
-- Check if retractedItems table exists (Zotero 7+)
-- Then add to WHERE clause:
AND i.itemID NOT IN (SELECT itemID FROM retractedItems)
-- If table doesn't exist, gracefully skip this filter
```

### Duplicate Detection Query

```sql
-- Count duplicate items
SELECT COUNT(DISTINCT itemID) as duplicate_count
FROM itemRelated
WHERE predicateID = 1;  -- predicateID = 1 indicates duplicate relationship

-- Find specific duplicate pairs
SELECT ir.itemID, ir.linkedItemID, i1.title as title1, i2.title as title2
FROM itemRelated ir
JOIN items i1 ON ir.itemID = i1.itemID
JOIN items i2 ON ir.linkedItemID = i2.itemID
WHERE ir.predicateID = 1
ORDER BY ir.itemID;
```

### Trash Volume Query

```sql
-- Count items in trash
SELECT COUNT(*) as trash_count
FROM deletedItems;

-- List items in trash (optional)
SELECT i.itemID, i.key,
  MAX(CASE WHEN f.fieldName = 'title' THEN idv.value END) as title,
  i.dateModified
FROM deletedItems di
JOIN items i ON di.itemID = i.itemID
LEFT JOIN itemData id ON i.itemID = id.itemID
LEFT JOIN fields f ON id.fieldID = f.fieldID
LEFT JOIN itemDataValues idv ON id.valueID = idv.valueID
GROUP BY i.itemID
ORDER BY i.dateModified DESC;
```

---

## Sources

### Zotero Official Documentation
- [Zotero Collections and Tags](https://www.zotero.org/support/collections_and_tags) — Library organization and scope
- [Zotero Duplicate Detection](https://www.zotero.org/support/duplicate_detection) — Official duplicate detection algorithm
- [Zotero Database Schema (GitHub)](https://github.com/zotero/zotero/blob/main/resource/schema/userdata.sql) — Full schema with libraryID, itemRelated, retractedItems
- [Zotero Direct SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) — Read-only access patterns

### Duplicate Detection & Data Quality Research
- [Duplicate Detection Algorithms for Bibliographic Descriptions](https://www.researchgate.net/publication/228350031_Duplicate_detection_algorithms_of_bibliographic_descriptions) — Academic research on matching algorithms
- [Data Matching: Entity Resolution and Duplicate Detection](https://dl.acm.org/doi/book/10.5555/2344108) — Comprehensive guide to deduplication techniques
- [Fuzzy Matching 101: Complete Guide for 2026](https://matchdatapro.com/fuzzy-matching-101-a-complete-guide-for-2026/) — When to use fuzzy vs. exact matching
- [Evidence-Based Literature Review: De-duplication](https://pmc.ncbi.nlm.nih.gov/articles/PMC10789108/) — Importance of deduplication in research workflows
- [Completeness Metrics in Metadata](https://direct.mit.edu/qss/article/5/1/31/119466/Completeness-degree-of-publication-metadata-in-eight-free-access-scholarly-databases) — Metadata quality dimensions

### Preflight & Data Quality Gates
- [Data Validation in ETL - 2026 Guide](https://www.integrate.io/blog/data-validation-etl/) — Pre-load quality gates and validation patterns
- [Data Quality Tools 2026: Complete Buyer's Guide](https://www.ovaledge.com/blog/data-quality-tools/) — Modern data quality practices
- [7 Best Practices for Data Quality Management in 2026](https://www.invensis.net/blog/effective-data-quality-management-best-practices) — Quality gate design patterns

### Zotero Community Insights
- [Zotero Forums: Group Libraries and Trash](https://forums.zotero.org/discussion/56551/group-libraries-trash-deleting-items-etc) — Community best practices
- [Zotero Forums: Managing Duplicates for Reviews](https://forums.zotero.org/discussion/107994/managing-counting-duplicates-for-reviews-best-practice) — How researchers handle duplicates
- [Zotero Forums: Duplicate Detection](https://forums.zotero.org/discussion/42/duplicate-detection) — User expectations and use cases

### UX & Onboarding
- [Onboarding UX Patterns](https://www.appcues.com/blog/choosing-the-right-user-onboarding-ux-pattern) — Multi-step wizard patterns
- [Error Handling UX Design Patterns](https://medium.com/design-bootcamp/error-handling-ux-design-patterns-c2a5bbae5f8d) — Blocking vs. warning gates
- [Mobile Onboarding Best Practices for 2026](https://www.designstudiouiux.com/blog/mobile-app-onboarding-best-practices/) — User guidance during setup

### v1.0 & v1.1 Architecture Reference
- `.planning/research/ARCHITECTURE.md` — Component structure and data flow
- `.planning/research/STACK.md` — Technology stack (sql.js, Obsidian API)
- `.planning/research/FEATURES.md` (v1.1) — Tag extraction and UX patterns
- `.planning/todos/pending/2026-01-27-implement-library-scope-filter-and-preflight-check.md` — Detailed requirements

---

**Research complete. v1.2 features categorized with clear implementation scope. Ready for Phase 6 detailed planning and roadmap creation.**
