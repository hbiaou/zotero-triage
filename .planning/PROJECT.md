# Zotero Triage - Progressive Zotero-Obsidian Integration

## What This Is

An Obsidian plugin that solves "importer's block" for researchers with massive Zotero libraries (3000+ items). Instead of bulk importing, it provides an "Inbox-to-Vault" pipeline that forces sustainable, batch-based processing (5-10 items/day) with strict quality gates. Only high-quality, metadata-rich notes enter the vault.

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

### Active

(No active requirements — ready for v1.1 planning)

### Out of Scope

- Atomic note extraction (breaking papers into smaller notes) — Deferred to v2
- Semantic search / Embeddings — Deferred to v2 (simple keyword matching sufficient for MVP)
- PDF text extraction — Deferred to v2
- Bi-directional syncing (writing back to Zotero) — Deferred to v2 (read-only safer for MVP)
- Cloud services or external APIs — Local-first architecture (permanent constraint)
- Bulk "import all" button — Defeats core purpose (prevents importer's block)

## Context

**Current state (v1.0 shipped):**
- Plugin built with TypeScript, ~7,324 LOC
- Tech stack: Obsidian Plugin API, sql.js for SQLite, Zod for validation
- Successfully handles 5000+ item libraries with lazy initialization (<50ms startup)
- Adaptive learning refines recommendations from user feedback (accept/reject weight adjustments)

**Target users:** Researchers and academics with large Zotero libraries (3000-5000+ items) who feel overwhelmed by the prospect of bulk importing. They want sustainable daily processing, not a one-time dump.

**Problem with existing tools:** Current Zotero-Obsidian integrations dump thousands of messy citations, creating a "digital junkyard" of low-quality notes that users never revisit.

**Key insight (validated):** The constraint of 5-10 items/day is a feature, not a limitation. It forces engagement and quality over quantity.

**Zotero access approach (validated):** Direct SQLite read via sql.js for performance. Schema detection (version 100-200) handles Zotero 6.x and 7.x.

**Recommendation engine (validated):** Multi-signal scoring (keywords, authors, recency) with adaptive learning. Simple frequency-based keyword extraction. No vectors or embeddings needed for MVP.

**Known limitations:**
- Tag extraction not implemented (ZoteroItem schema missing tags field) — deferred to v1.1
- Profile initialization edge case: Empty profile falls back to date sorting (no user warning) — documented for v1.1

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

---
*Last updated: 2026-01-25 after v1.0 milestone completion*
