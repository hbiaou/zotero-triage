# Zotero Triage - Progressive Zotero-Obsidian Integration

## What This Is

An Obsidian plugin that solves "importer's block" for researchers with massive Zotero libraries (3000+ items). Instead of bulk importing, it provides an "Inbox-to-Vault" pipeline that forces sustainable, batch-based processing (5-10 items/day) with strict quality gates and intelligent tag-based recommendations. Only high-quality, metadata-rich notes enter the vault.

## Core Value

Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## Requirements

### Validated

- ✓ Zotero Connector: Read items from local Zotero SQLite database (read-only, never write) — v1.0
- ✓ Onboarding Wizard: User selects 5-15 seed papers to establish interest profile (keywords + authors) — v1.0
- ✓ Daily Batch Generator: Select 5 candidate items based on seed profile + recency (configurable batch size) — v1.0
- ✓ Triage Dashboard: Card-stack UI where users Accept, Reject, or Defer items from daily batch — v1.0
- ✓ Quality Gate: Block import if configurable required fields (DOI, Year, Author) are missing; prompt user to fix in Zotero — v1.0
- ✓ Literature Note Generator: Create Markdown note in configurable folder with full YAML frontmatter (citation, Zotero links, file refs, processing metadata) — v1.0
- ✓ Processing Registry: Local JSON tracking state of every Zotero ID (unseen, proposed, accepted, rejected, deferred, imported) — never show same item twice — v1.0
- ✓ Settings Panel: Configurable batch size, quality gate fields per item type, profile editor — v1.0
- ✓ Tag Extraction & Integration: Extract tags from Zotero database with annotation filtering, integrate into profile and recommendation scoring — v1.1
- ✓ Tag-based Recommendations: Porter-stemmed tag matching with top-20 frequency-weighted profile tags, adaptive learning with decay — v1.1
- ✓ User-configurable Tag Weights: Settings slider (0.0-3.0) for dynamic tag signal strength tuning — v1.1
- ✓ Progress Feedback: Throttled progress updates (500ms, 100-item batches) for large library operations — v1.1
- ✓ Enhanced Validation UX: Field explanations in override modal, aggregated warnings, empty profile warnings — v1.1
- ✓ Search/Filter Functionality: Real-time filtering by author/title/tags in onboarding and batch views — v1.1
- ✓ Responsive Modal UX: 90vw max-width, scroll preservation during interactions — v1.1
- ✓ Library Scope Filter: Exclude group libraries, feeds, trash, and retracted items from all queries via SQL INNER/LEFT JOIN — v1.2
- ✓ Configurable Library Selection: User-controlled settings for which Zotero libraries to include with dropdown selector — v1.2
- ✓ Preflight Check: Pre-onboarding validation warning about trash items, duplicates, group libraries with color-coded severity — v1.2
- ✓ Non-blocking Preflight UX: Advisory-only health check with skip capability, never prevents onboarding — v1.2
- ✓ Duplicate Detection: Identify same DOI/ISBN/title across libraries with self-join query — v1.2
- ✓ Library Type Detection: Query Zotero schema to distinguish personal vs group vs feed libraries — v1.2
- ✓ Relevance vs Diversity Persistence: Setting configured in wizard persists to settings panel — v1.2
- ✓ Reconfigure Profile Button: Change recommendation settings without re-onboarding, pre-selects existing seed papers — v1.2

### Active

**v2.0 Milestone: The Enrichment Engine**

Goal: Transform stub literature notes into fully enriched, evidence-based knowledge artifacts using AI-powered classification, extraction, and template-based generation.

Target features:
- BYOK AI service layer (OpenAI, Google, Anthropic, OpenRouter) with encrypted API key storage
- Smart domain classification (Academic, Software, Farming, General) driving template selection
- Evidence hierarchy enforcement (PDF fulltext → Zotero notes → Abstract, never metadata-only)
- Template-based enrichment with YAML frontmatter (4 domain templates)
- Map-reduce processing for long content (books/theses with 50k+ tokens)
- Blocking enrichment during Accept action (user sees progress, gets enriched note immediately)
- Queue management for metadata-only items (batch retry when evidence added)
- Auto-fetch video transcripts from YouTube/Vimeo URLs
- Item type priority for template selection (Articles/Books stay ACADEMIC, domain affects Videos/Webpages)
- PDF text extraction via Zotero fulltext cache (leverages existing extraction)

### Out of Scope

- Atomic note extraction (breaking papers into smaller notes) — Deferred to v2.1+
- Semantic search / Embeddings — Deferred to v2.1+ (simple keyword matching sufficient for v1)
- Separate chapter notes for books — Deferred to v2.1+ (embedded chapter summaries sufficient for v2.0)
- Per-operation model selection — Deferred to v2.1+ (one global model keeps v2.0 simple)
- Hybrid PDF extraction (pdf-parse fallback) — Deferred to v2.1+ (Zotero fulltext cache sufficient)
- Migration tools for existing stub notes — Not needed (no active users yet)
- Bi-directional syncing (writing back to Zotero) — Permanent exclusion (read-only safer)
- Cloud services or external APIs — Permanent exclusion (local-first architecture, BYOK only)
- Bulk "import all" button — Permanent exclusion (defeats core purpose)

## Context

**Current state (v1.2 shipped):**
- Plugin built with TypeScript, 9,340 LOC
- Tech stack: Obsidian Plugin API, sql.js for SQLite, Zod for validation, Porter stemming for tag normalization
- Successfully handles 12,876+ item libraries with query-level filtering and preflight health checks
- Library filtering tested with production database: 11,494 personal items → 9,392 after exclusions (groups, feeds, annotations, trash, retracted)
- Adaptive learning refines recommendations from user feedback with weight decay mechanism
- Tag-based recommendations complement keyword/author signals for improved batch relevance
- Preflight check system provides color-coded advisories (duplicates, trash, groups) before onboarding

**Target users:** Researchers and academics with large Zotero libraries (3000-5000+ items) who feel overwhelmed by the prospect of bulk importing. They want sustainable daily processing, not a one-time dump.

**Problem with existing tools:** Current Zotero-Obsidian integrations dump thousands of messy citations, creating a "digital junkyard" of low-quality notes that users never revisit.

**Key insight (validated):** The constraint of 5-10 items/day is a feature, not a limitation. It forces engagement and quality over quantity.

**Zotero access approach (validated):** Direct SQLite read via sql.js for performance. Schema detection (version 100-200) handles Zotero 6.x and 7.x. Defensive NULL handling and annotation tag filtering ensure reliability across schema variations.

**Recommendation engine (validated):** Multi-signal scoring (tags, keywords, authors, recency) with adaptive learning. Porter-stemmed tag matching with top-20 frequency-weighted profiles. Simple frequency-based keyword extraction. No vectors or embeddings needed.

**Known limitations:**
- Adaptive learning only fully implemented for tags (authors/keywords use simpler weight adjustment)
- No PDF text extraction or semantic search (deferred to v2)
- No bidirectional syncing to Zotero (read-only architecture is intentional)

## Constraints

- **Stack**: TypeScript, Obsidian Plugin API — non-negotiable
- **Performance**: Must handle 5000+ item libraries without freezing Obsidian UI
- **Local-first**: No external cloud services, no heavy vector databases for MVP
- **Read-only**: Never write to Zotero database — user fixes metadata in Zotero directly
- **Zotero dependency**: Requires Zotero installed locally with accessible SQLite database

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Direct SQLite over API | Performance with large libraries; Zotero's web API requires Zotero running | ✓ Good — sql.js handles 5000+ items smoothly |
| Keywords + Authors for profile | Keeps recommendation engine simple; avoids embedding complexity | ✓ Good — Adaptive learning works well without vectors |
| Deferred items re-queue | Simpler state machine; user will see deferred items again eventually | ✓ Good — Allows users to postpone without permanent rejection |
| Configurable quality gates | Different users have different metadata standards | ✓ Good — Per-item-type validation flexible enough for diverse needs |
| JSON registry over SQLite | Simpler for MVP; can migrate to SQLite if needed | ✓ Good — Debounced saves prevent I/O overhead |
| Lazy database initialization | Defer connection to first use for fast startup | ✓ Good — Achieved <50ms plugin load time |
| Exponential backoff for SQLITE_BUSY | Handle concurrent Zotero access gracefully | ✓ Good — 5 retry attempts with jitter prevents lock failures |
| Seed paper range 5-15 (not fixed 10) | Flexibility for different library sizes and user preferences | ✓ Good — Min 5 ensures profile quality, max 15 prevents decision fatigue |
| Tag weight 1.5 (between keywords 2.0 and authors 1.0) | Balanced contribution from tag signal | ✓ Good — Tags enhance recommendations without overwhelming other signals |
| Top 20 tags for profile | Balance coverage vs noise | ✓ Good — Captures key topics without diluting signal strength |
| Porter stemming for tag matching | Linguistic normalization (e.g., "forest" matches "forestry") | ✓ Good — Improves matching flexibility without complexity |
| Linear multi-match tag scoring | Sum all matching tag weights, no diminishing returns | ✓ Good — Fair for diverse papers, simple to understand |
| Weight decay (0.95 factor, every 10 events) | Prevent permanent weight extremes | ✓ Good — Conservative decay allows learning while avoiding instability |
| Throttled progress (500ms, 100-item batches) | Prevent UI jank during large library scoring | ✓ Good — Responsive feedback without performance degradation |
| Progressive disclosure for field help | Examples visible, explanations expandable | ✓ Good — Most users understand from examples, details available when needed |
| SQL-level annotation tag filtering | Filter at query time vs post-processing | ✓ Good — More efficient, reduces data transfer and processing |
| SQL-level library filtering (INNER JOIN) | Query-time filtering vs post-processing for performance | ✓ Good — Centralized architecture prevents bypass paths, tested with 12,876 items |
| DOI-first duplicate hierarchy | DOI → ISBN → normalized title for conservative matching | ✓ Good — Low false positives, matches Zotero's native algorithm |
| Sequential preflight checks | Run checks one at a time vs parallel | ✓ Good — Simpler UI progress updates, predictable timing |
| Color-coded severity levels | Red (critical), yellow (warning), blue (info) | ✓ Good — PatternFly standards, clear visual hierarchy |
| Non-blocking preflight design | Advisory-only with skip button vs mandatory check | ✓ Good — Respects user autonomy, never prevents workflow |
| Settings-first architecture | Preferences persist in settings independent of profile | ✓ Good — Enables reconfiguration without re-running wizard |
| Encapsulated query methods | Specific typed methods (queryLibraryStats) vs generic query(sql) | ✓ Good — Type safety, maintainability, follows detectDuplicates pattern |
| Standalone notes inclusion | Include independent research notes, exclude only child notes | ✓ Good — User feedback validated this distinction |

---
*Last updated: 2026-01-30 after v2.0 milestone start*
