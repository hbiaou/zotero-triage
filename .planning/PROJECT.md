# Progressive Zotero-Obsidian Bridge

## What This Is

An Obsidian plugin that solves "importer's block" for researchers with massive Zotero libraries (3000+ items). Instead of bulk importing, it provides an "Inbox-to-Vault" pipeline that forces sustainable, batch-based processing (5-10 items/day) with strict quality gates. Only high-quality, metadata-rich notes enter the vault.

## Core Value

Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Zotero Connector: Read items from local Zotero SQLite database (read-only, never write)
- [ ] Onboarding Wizard: User selects 10 "seed" papers to establish interest profile (tags/keywords + authors)
- [ ] Daily Batch Generator: Select 5 candidate items based on seed profile + easy wins (has PDF, configurable recency)
- [ ] Triage Dashboard: Card-stack UI where users Accept, Reject, or Defer items from daily batch
- [ ] Quality Gate: Block import if configurable required fields (DOI, Year, Author) are missing; prompt user to fix in Zotero
- [ ] Literature Note Generator: Create Markdown note in `10_Literature/` with full YAML frontmatter (citation, Zotero links, file refs, processing metadata)
- [ ] Processing Registry: Local JSON tracking state of every Zotero ID (unseen, proposed, accepted, rejected, imported) — never show same item twice
- [ ] Settings Panel: Configurable recency threshold, required quality gate fields

### Out of Scope

- Atomic note extraction (breaking papers into smaller notes) — Phase 2
- Semantic search / Embeddings — Phase 2
- PDF text extraction — Phase 2
- Bi-directional syncing (writing back to Zotero) — Phase 2
- Cloud services or external APIs — Local-first architecture

## Context

**Target users:** Researchers and academics with large Zotero libraries (3000-5000+ items) who feel overwhelmed by the prospect of bulk importing. They want sustainable daily processing, not a one-time dump.

**Problem with existing tools:** Current Zotero-Obsidian integrations dump thousands of messy citations, creating a "digital junkyard" of low-quality notes that users never revisit.

**Key insight:** The constraint of 5-10 items/day is a feature, not a limitation. It forces engagement and quality over quantity.

**Zotero access approach:** Direct SQLite read for performance. Requires handling potential schema changes in Zotero updates.

**Recommendation engine (MVP):** Simple keyword/tag matching + author matching from seed papers. No vectors or embeddings.

## Constraints

- **Stack**: TypeScript, Obsidian Plugin API — non-negotiable
- **Performance**: Must handle 5000+ item libraries without freezing Obsidian UI
- **Local-first**: No external cloud services, no heavy vector databases for MVP
- **Read-only**: Never write to Zotero database — user fixes metadata in Zotero directly
- **Zotero dependency**: Requires Zotero installed locally with accessible SQLite database

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Direct SQLite over API | Performance with large libraries; Zotero's web API requires Zotero running | — Pending |
| Tags + Authors for profile | Keeps recommendation engine simple; avoids embedding complexity | — Pending |
| Deferred items re-queue | Simpler state machine; user will see deferred items again eventually | — Pending |
| Configurable quality gates | Different users have different metadata standards | — Pending |
| JSON registry over SQLite | Simpler for MVP; can migrate to SQLite if needed | — Pending |

---
*Last updated: 2025-01-22 after initialization*
