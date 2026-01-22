# Project Research Summary

**Project:** Progressive Zotero-Obsidian Bridge
**Domain:** Obsidian plugin with Zotero SQLite integration
**Researched:** 2026-01-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

Building an Obsidian plugin that progressively imports Zotero references requires navigating a mature but constrained ecosystem. The standard 2025 approach uses **TypeScript + esbuild** for bundling, **sql.js** (WebAssembly) for SQLite access to avoid Electron's native module complications, and **async/await patterns** for non-blocking operations since Web Workers aren't supported. The critical architectural constraint is that Obsidian runs single-threaded, meaning processing 5000+ items synchronously will freeze the UI.

The competitive landscape reveals a significant gap: all existing tools (Zotero Integration, ZotLit, Citations) focus on bulk import workflows, creating "importer's block" when users face hundreds of unprocessed papers. No existing plugin enforces batch-based, progressive workflows or implements quality gates to validate metadata before import. This positions the Progressive Zotero-Obsidian Bridge as the **only tool addressing sustainable, incremental processing habits** through triage interfaces, daily batch generation, and profile-based recommendations.

Key risks center on **UI freezing during batch processing**, **SQLite database locking** with concurrent Zotero access, and **schema changes** between Zotero versions. Mitigation strategies include chunked async processing with manual yielding (50-100 items at a time), read-only database access with WAL mode, and defensive schema version detection at startup. Early validation of these patterns in Phase 1 is critical to avoid architectural rewrites.

## Key Findings

### Recommended Stack

The stack converges on proven Obsidian plugin technologies with WebAssembly-based SQLite to sidestep native module complexity.

**Core technologies:**
- **TypeScript 5.8+**: Required by Obsidian plugin ecosystem, provides type safety and modern language features
- **esbuild 0.24+**: De facto bundler for Obsidian plugins (10-100x faster than Webpack), configured for CommonJS and ES2018 target
- **sql.js 1.13.0**: WebAssembly-based SQLite implementation avoiding Electron rebuild issues — community-verified for Obsidian plugins
- **Node.js 22 LTS**: Development runtime with active support until April 2027
- **Obsidian API (Modal, Setting, ItemView)**: Built-in UI primitives sufficient for card-based triage interface
- **lodash.debounce**: Industry-standard debouncing (Obsidian's built-in debounce behaves like throttle)

**Critical decision:** Use **sql.js over better-sqlite3** because native bindings fail in Obsidian's Electron environment (stack trace parsing incompatibility). Slight performance trade-off (WebAssembly vs. native) is negligible for 5000-item queries loaded into memory.

**Performance note:** No Web Workers or worker threads support in Obsidian as of 2025. All processing must use async/await with manual yielding via `setTimeout(fn, 0)` or chunked patterns.

### Expected Features

**Must have (table stakes):**
- Import citations from Zotero — core value proposition
- Create literature notes with customizable templates — primary use case
- Insert citations in notes with @ autocomplete — academic writing requirement
- Search Zotero library — users need to find items before import
- Annotation import — users annotate PDFs in Zotero, expect those to transfer
- Metadata in YAML frontmatter — Obsidian standard practice
- Zotero 7 compatibility — current version as of 2026

**Should have (differentiators):**
- **Batch-based workflow** — PRIMARY DIFFERENTIATOR: prevents importer's block, enforces 5-10 items/day processing (no existing tool does this)
- **Quality gates** — validate metadata completeness before import (title, DOI, year, volume) to prevent garbage notes
- **Triage interface (Accept/Reject/Defer)** — structured decision-making UI reduces cognitive load
- **Processing registry** — track state per item (unprocessed, triaged, imported, deferred) across sessions
- **Daily batch generation** — removes decision fatigue by suggesting what to process today
- **Onboarding wizard** — reduces setup friction, creates initial user profile from seed papers
- **Profile-based recommendations** — learns user preferences to suggest relevant papers in batches

**Defer (v2+):**
- AI-assisted summaries — complex, external dependencies, emerging pattern
- Two-way sync with Zotero — high complexity, niche need (Better Notes already does this)
- Advanced template customization — users need simple version first
- Collection sync — manual selection sufficient for MVP
- In-app PDF annotation — duplicates Zotero's excellent PDF reader

**Anti-features (deliberately NOT building):**
- Bulk "import all" button — causes importer's block, defeats purpose
- Built-in PDF reader — Zotero already does this well
- Custom metadata fields — breaks Zotero compatibility
- Full-text PDF search — Zotero handles this

### Architecture Approach

The plugin follows Obsidian's component-based architecture with a central Plugin class managing lifecycle and accessing platform APIs through the `app` object. For processing 5000+ items without freezing the main thread, the architecture implements chunked async processing, lazy loading, and debounced state persistence.

**Major components:**
1. **Settings Manager** — persist configuration (Zotero path, batch size) using `loadData()/saveData()` JSON API
2. **Zotero Connector** — read-only SQLite access via sql.js, query items/metadata without locking conflicts
3. **Registry Service** — track processing state (unprocessed/triaged/imported/deferred) with debounced saves to prevent corruption
4. **Processing Engine** — batch generator with recommendation logic, quality gate validation, chunked processing (50-100 items with yields)
5. **Generator Service** — create literature notes via Vault API (`vault.create()`) with YAML frontmatter templates
6. **UI Layer** — Onboarding Wizard (multi-step Modal), Triage Dashboard (custom ItemView with card-based UI)

**Data flow:** Zotero Connector queries SQLite → Processing Engine filters/ranks based on Registry → Triage View displays batch → User accepts → Generator Service creates notes → Registry marks processed

**Performance pattern:** Use `onLayoutReady()` for heavy initialization (not `onload()`), process in 50-100 item chunks with `await sleep(0)` to yield control, cache processed metadata in memory, debounce Registry saves (2 seconds after last update).

**Build order recommendation:** Settings Manager → Zotero Connector (validate SQLite access early) → Registry Service → Processing Engine → Generator Service → UI Layer. Critical path is Zotero Connector (high risk) followed by Processing Engine (chunked patterns must be validated with 5000 items).

### Critical Pitfalls

1. **UI Freezing During Batch Processing** — Processing thousands of items synchronously blocks Obsidian's main thread (no Web Workers). Users report "freezes my vault." Prevent with async/await + manual yielding every 10-50 items using `setTimeout(fn, 0)`, defer heavy work to `onLayoutReady()`, implement cancellation. Test with simulated 5000 items in Phase 1.

2. **SQLite Database Locking** — Reading Zotero's database while Zotero runs causes `SQLITE_BUSY` errors. Zotero likely uses WAL mode for concurrent reads, but must verify. Prevent with read-only database opening, immutable flag if supported, busy timeout + retry logic, NEVER attempt writes. Verify WAL mode with `PRAGMA journal_mode`. Test in Phase 1 with Zotero actively syncing.

3. **Zotero Schema Changes Breaking Integration** — SQLite structure changes between Zotero versions (4→5, 5→6). Queries fail with missing columns. Prevent with schema version detection (`SELECT value FROM version WHERE schema='userdata'`), defensive queries checking column existence, version compatibility matrix, focus on stable core tables (items, creators). Implement version detection in Phase 1.

4. **JSON State Corruption from Concurrent Writes** — Multiple operations saving state simultaneously corrupt data.json. Users lose triage progress. Prevent with debounced save queue (1-2 seconds inactivity), prevent concurrent saves with flag, implement state versioning + validation, keep backups of previous state. Critical for Phase 2 (user interactions).

5. **Memory Leaks with Large Datasets** — Processing 5000+ items without cleanup causes heap overflow. Prevent with batch processing + clearing references, register event listeners via Obsidian's API (auto-cleanup), avoid capturing large objects in closures, monitor memory with Chrome DevTools during development.

## Implications for Roadmap

Based on research, suggested phase structure balances risk mitigation (validate SQLite access early), dependency ordering (state persistence before batch processing), and user value delivery (basic import before advanced recommendation).

### Phase 1: Foundation (SQLite Access + State Management)
**Rationale:** Validate the two highest-risk technical decisions (sql.js for SQLite, read-only concurrent access) before building on them. State persistence is foundational for all subsequent phases.

**Delivers:**
- Plugin connects to Zotero database, reads items
- Settings UI for database path configuration
- Processing registry tracks item state (JSON persistence)
- Basic literature note generation (single item, no batch)

**Addresses:**
- Zotero connection (table stakes)
- State persistence (differentiator infrastructure)

**Avoids:**
- SQLite locking (test read-only with Zotero running)
- Schema changes (implement version detection)
- Startup performance (lazy loading pattern)

**Research flags:**
- Needs research: Zotero schema structure (which tables/columns stable across versions)
- Needs research: sql.js performance benchmarking with real 5000-item database

### Phase 2: Batch Workflow (Triage UI + Processing Engine)
**Rationale:** Core differentiator is batch-based workflow. Build Processing Engine with chunked async patterns and Triage UI before adding intelligence (recommendations). Manual batch selection sufficient for MVP.

**Delivers:**
- Triage Dashboard (custom ItemView with card-based UI)
- Accept/Reject/Defer actions update Registry
- Processing Engine generates batches (manual selection or simple newest-first)
- Chunked processing pattern (50-100 items with yields)

**Uses:**
- Obsidian Modal/ItemView API (table stakes)
- lodash.debounce for state saves

**Implements:**
- Processing Engine component
- Triage View component
- Debounced Registry saves

**Avoids:**
- UI freezing (chunked processing with yield points)
- State corruption (debounced saves, validation on load)
- Memory leaks (batch processing with cleanup)

**Research flags:**
- Needs research: Card-based UI patterns in existing plugins (study Card View Mode, Banyan)
- Standard patterns: Obsidian Modal/View API well-documented

### Phase 3: Quality Gates + Literature Notes
**Rationale:** Quality gates are key differentiator (no other tool validates metadata). Literature notes depend on quality validation passing.

**Delivers:**
- Quality gate validation (check for missing title, DOI, year, volume)
- Metadata validator UI showing what's missing
- Enhanced literature note templates with frontmatter
- Annotation import from Zotero

**Addresses:**
- Quality gates (differentiator)
- Template customization (table stakes)
- Annotation import (table stakes)

**Avoids:**
- Importing low-quality metadata (core value proposition)

**Research flags:**
- Standard patterns: YAML frontmatter generation is string templating
- Standard patterns: Annotation import via Zotero database queries

### Phase 4: Onboarding + Profile-Based Recommendations
**Rationale:** Reduce setup friction, enable intelligent batch generation. Requires user profile from seed papers.

**Delivers:**
- Onboarding wizard (multi-step Modal for setup)
- User profile creation from seed papers (initial preferences)
- Profile-based batch generator (recommend papers similar to accepted items)
- Daily batch auto-generation (removes decision fatigue)

**Addresses:**
- Onboarding wizard (differentiator)
- Profile-based recommendations (differentiator)
- Daily batch generation (differentiator)

**Avoids:**
- Setup complexity (guided wizard vs. raw settings)

**Research flags:**
- Needs research: Recommendation algorithm logic (similarity scoring, tag matching)
- Needs research: Wizard usability patterns (test with users)

### Phase 5: Polish + Performance Optimization
**Rationale:** After core features work, optimize for production use.

**Delivers:**
- Incremental indexing (only query items added since last sync)
- Progress indicators for long operations
- Error handling improvements (user-friendly messages)
- Cross-platform testing (Windows, Mac, Linux)
- Startup time optimization (lazy loading validated)

**Avoids:**
- Startup performance impact (cache processed metadata)
- Memory leaks (profiling with 5000 items)

**Research flags:**
- Standard patterns: Progress indicators via Obsidian Notice API
- Needs research: Best UX for long-running operations in Obsidian

### Phase Ordering Rationale

- **Phase 1 first:** SQLite access is critical path and highest risk (locking, schema changes). Must validate early or pivot architecture.
- **Phase 2 before 3:** Triage UI is core UX; build with simple batch selection before adding quality gates complexity.
- **Phase 3 before 4:** Quality gates must work before recommendations (don't recommend low-quality papers).
- **Phase 4 deferred:** Onboarding/recommendations add intelligence but aren't blocking for basic workflow.
- **Phase 5 last:** Polish happens after core features validated with users.

**Chunked processing pattern:** Must be implemented in Phase 1 (during initial SQLite queries) and refined in Phase 2 (during batch generation). This pattern pervades entire architecture, not a late-stage optimization.

**State management:** Registry Service built in Phase 1, used by all subsequent phases. Debounced saves critical for Phase 2 (rapid user interactions in Triage UI).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Foundation):** Zotero schema structure (which fields stable across versions 6.x/7.x)
- **Phase 1 (Foundation):** sql.js performance with 5000-item queries (needs benchmarking with real database)
- **Phase 2 (Batch Workflow):** Card-based UI rendering patterns (study existing plugin implementations)
- **Phase 4 (Recommendations):** Recommendation algorithm design (similarity scoring, tag matching, citation network analysis)

Phases with standard patterns (skip research-phase):
- **Phase 3 (Quality Gates):** YAML frontmatter generation is straightforward string templating
- **Phase 3 (Literature Notes):** Vault API for file creation is well-documented
- **Phase 5 (Polish):** Error handling and progress indicators use standard Obsidian APIs

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Obsidian tooling (TypeScript, esbuild) widely adopted; sql.js community-verified for Obsidian plugins |
| Features | MEDIUM | Existing tools cataloged from GitHub/docs (HIGH), but batch workflow need inferred from forum complaints (LOW — no user interviews) |
| Architecture | HIGH | Plugin lifecycle and component patterns documented in official Obsidian API; performance patterns validated by Dataview reference implementation |
| Pitfalls | HIGH | UI freezing, SQLite locking, schema changes confirmed by multiple official + community sources; state corruption is general JavaScript pattern |

**Overall confidence:** MEDIUM-HIGH

Stack and architecture decisions have high confidence (official docs + working examples). Feature prioritization has medium confidence (competitive analysis solid, but solution fit hypothesis not validated with target users). Pitfalls have high confidence for technical risks (database locking, UI freezing) and medium for workflow risks (user value of batch processing).

### Gaps to Address

**During Phase 1 planning:**
- **Zotero schema version mapping:** Which field IDs (title, authors, DOI, year) are stable across Zotero 6.x and 7.x? Query structure for items table?
- **sql.js performance validation:** Benchmark query time for 5000-item library loaded into memory. Is chunked processing needed for queries, or only for JavaScript processing?
- **Obsidian Electron version:** Current Electron version determines ES2018 vs. ES2020+ feature availability (official config uses ES2018, but verify)

**During Phase 2 planning:**
- **Batch workflow user validation:** Hypothesis that batch-based processing prevents importer's block needs testing with 5-10 PhD students
- **Triage UI interaction patterns:** Accept/Reject/Defer sufficient, or need additional actions (Skip for now, Export, etc.)?

**During Phase 4 planning:**
- **Recommendation algorithm design:** What signals best predict user interest? Citation counts, publication date, author overlap, tag similarity, citation network proximity?
- **Profile initialization:** What's minimum viable seed set? 3 papers? 10 papers?

**Post-MVP validation:**
- **Quality gate value:** Do users appreciate metadata validation, or see it as friction? Needs usage analytics or user interviews.
- **Template flexibility:** Should users customize note templates, or is single template sufficient? Defer until user requests.

## Sources

### Primary (HIGH confidence)
- [Obsidian Plugin Build Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) — Official plugin documentation
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) — Official template with esbuild config
- [Zotero Direct SQLite Database Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access) — Official warning about read-only access, schema changes
- [TypeScript 5.8 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html) — Language features
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) — LTS schedule
- [SQLite WAL Mode](https://sqlite.org/wal.html) — Concurrent access documentation

### Secondary (MEDIUM confidence)
- [Obsidian Forum: SQLite Integration](https://forum.obsidian.md/t/adding-sqlite-database-integration-to-an-obsidian-plugin/88272) — Community recommends sql.js over better-sqlite3
- [Obsidian Forum: Worker Threads Not Supported](https://forum.obsidian.md/t/how-to-speed-up-cpu-intensive-tasks-in-an-obsidian-plugin-workers-not-supported/103392) — Confirms no Web Workers
- [Obsidian Forum: Startup Performance](https://forum.obsidian.md/t/call-for-plugin-performance-optimization-especially-for-plugin-startup/32321) — Plugin startup time complaints
- [GitHub - mgmeyers/obsidian-zotero-integration](https://github.com/mgmeyers/obsidian-zotero-integration) — Existing plugin analysis
- [GitHub - PKM-er/obsidian-zotlit](https://github.com/PKM-er/obsidian-zotlit) — Alternative plugin with direct DB access
- [Obsidian Dataview Performance](https://github.com/blacksmithgu/obsidian-dataview/discussions/2116) — Reference for large dataset indexing patterns

### Tertiary (LOW confidence)
- [Obsidian Forum discussions on bulk import](https://forum.obsidian.md/t/bulk-import-zotero-library-annotations-into-obsidian-with-zotero-integration-plugin/76254) — User pain points (self-selecting sample)
- [Zotero Forums: Metadata quality issues](https://forums.zotero.org/discussion/79970/warning-for-incomplete-metadata) — Need for quality gates (inferred from complaints)
- [Academic workflow blog posts](https://medium.com/@alexandraphelan/an-updated-academic-workflow-zotero-obsidian-cffef080addd) — User workflows (individual experiences, not systematic)

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
