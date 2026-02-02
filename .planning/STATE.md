# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-30)

**Core value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

**Current focus:** Phase 16 - Enrichment Orchestration & Validation

## Current Position

Phase: 16 of 19 (Enrichment Orchestration & Validation)
Plan: 16-04 of 4 (Enrichment Orchestrator & Progress UI)
Status: Phase Complete (4/4 plans complete)
Last activity: 2026-02-02 — Completed 16-04-PLAN.md (EnrichmentOrchestrator with five-stage pipeline, EnrichmentProgressModal)

Progress: [████████░░░░░░░░░░░░] 16/19 phases (84% milestone progress, 12.2% v2.0 progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 56 (from v1.0-v1.2 + quick tasks + v2.0)
- Average duration: ~26 min per plan
- Total execution time: ~27.0 hours

**By Phase:**

**Phase 16 (v2.0 - Enrichment Orchestration & Validation):**
- 16-01: 6 min (Enrichment Service Foundation)
- 16-02: 7 min (Output Validation Stack)
- 16-03: 5 min (Error Recovery Infrastructure)
- 16-04: 4 min (Enrichment Orchestrator & Progress UI)

**Phase 15 (v2.0 - Content Extraction & Classification):**
- 15-01: 6 min (Video Transcript Extraction)
- 15-02: 5 min (Domain Classification System)
- 15-03: 210 min (Classification Modal & Evidence Integration)
- 15-04: 7 min (Diagnostic Notes & Deferred Queue)
- 15-05: 4 min (Domain-Specific Templates)
- 15-06: 10 min (Classification & Modal Integration - Gap Closure)
- 15-07: 14 min (Diagnostic Notes Integration - Gap Closure, verification only)

**Phase 14 (v2.0 - AI Service Layer):**
- 14-01: 15 min (Types & Secret Storage)
- 14-02: 65 min (Provider Abstraction Layer)
- 14-03: 6 min (Provider Implementations)
- 14-04: 6 min (Resilience Patterns)
- 14-05: 11 min (Evidence Extraction)
- 14-06: 45 min (AI Service Orchestrator & Settings UI)

Historical velocity from v1.0-v1.2 available in MILESTONES.md.

**Recent Trend:**
- v1.0 shipped: 23 plans across 5 phases (2026-01-25)
- v1.1 shipped: 9 plans across 3 phases (2026-01-27)
- v1.2 shipped: 8 plans across 5 phases (2026-01-29)
- Trend: Stable execution velocity, fast on simple tasks (3-7 min avg for phases 10-13)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 work:

**Phase 16 (Enrichment Orchestration & Validation):**
- 16-04: Evidence extraction before classification (classification needs evidence)
- 16-04: Progress bar color transitions: blue → green (< 50% → < 90% → 100%)
- 16-04: Modal auto-closes after 1s on success, 3s on error
- 16-04: Timeout enforced at orchestration level (2 minutes)
- 16-04: PipelineStageError wrapper for stage-specific failures with itemId context
- 16-03: Exponential backoff schedule: 5min, 15min, 45min, 2hr15min, 6hr45min (base 5min * 3^attempts)
- 16-03: Queue persists to .zotero-triage-queue.json at vault root for plugin reload survival
- 16-03: Stub notes use General domain template as default fallback
- 16-03: Stage-specific diagnostic messages guide user to appropriate action
- 16-03: Unique queue ID: itemID + timestamp for multi-attempt tracking
- 16-02: Hallucination detection only runs if schema/metadata valid (expensive LLM call)
- 16-02: YAML parsing uses yaml library not gray-matter (gray-matter not installed)
- 16-02: Authors extracted from ZoteroItem.authors string array (Last, First format)
- 16-02: Evidence content field used for all evidence types (single content field, not separate fullText/notes/abstract)
- 16-02: MetadataOnly evidence skips hallucination detection (no content to validate against)
- 16-02: Validation errors block note save, warnings are informational only
- 16-01: AIService.complete() method (not generateCompletion) for LLM calls
- 16-01: 2-minute timeout threshold for enrichment operations
- 16-01: 30k character truncation for evidence to prevent token overflow
- 16-01: Simple YAML parser implementation (no yaml library dependency)
- 16-01: Mixed content style: verbatim quotes for claims, paraphrasing for context
- 16-01: PDF priority over notes for conflicting evidence
- 16-01: Evidence hierarchy enforcement via EvidenceExtractor.canEnrich() check before enrichment
- 16-01: Promise.race() for timeout handling without external libraries

**Phase 15 (Content Extraction & Classification):**
- 15-07: Diagnostic notes created at Accept time (not deferred to enrichment)
- 15-07: Items with insufficient evidence marked as enrichment_pending
- 15-07: Evidence check guards normal note creation in performAccept()
- 15-06: Async recordAccept() for classification workflow integration
- 15-06: Modal shown when confidence < 0.70 AND not hard override
- 15-06: Fallback to General domain (0.0 confidence) on classification failure
- 15-06: setEnrichmentMetadata() for partial metadata updates in registry
- 15-06: Initialization order ensures AI services available before BatchService
- 15-05: Template content preserved exactly from user-provided files without modification
- 15-05: Frontmatter includes domain-specific fields (knowledge_domain, template_used, evidence_level)
- 15-05: Title placeholder replacement with item.title from ZoteroItem
- 15-05: Default fallback to General template for unrecognized domains
- 15-05: Domain type union ('Academic' | 'Software' | 'Farming' | 'General') for type safety
- 15-04: ProcessingState extended with enriched, enrichment_pending, enrichment_failed states
- 15-04: EnrichmentMetadata tracks evidenceLevel, pendingReason, retryCount, lastRetryTimestamp
- 15-04: Diagnostic notes include Zotero deep links for immediate user action
- 15-04: Five diagnostic reasons: no_pdf, no_notes, no_transcript, abstract_only, metadata_only
- 15-04: Validation ensures diagnostic note quality before returning to caller
- 15-04: Fallback note generation prevents blank notes on generation failure
- 15-03: Classification modal triggered when confidence < 0.70 (from 15-02 research)
- 15-03: Transcript extraction positioned between PDF fulltext and notes in evidence hierarchy
- 15-03: Re-classification command extracts Zotero item ID from note frontmatter
- 15-03: Domain guide collapsible to reduce modal clutter
- 15-02: Confidence threshold 0.70 for override modal trigger (industry standard per research)
- 15-02: Item type hard overrides bypass content analysis (journalArticle → Academic)
- 15-02: Domain normalization handles LLM synonyms ("research" → "Academic")
- 15-02: Fallback to General domain with confidence 0.3 on LLM failure
- 15-02: Temperature 0.3 for consistent classification across calls
- 15-01: YouTube-only automatic extraction (Vimeo and others require manual input)
- 15-01: Error requiresManualInput flag drives manual input modal flow
- 15-01: Platform detection via URL regex before service delegation
- 15-01: Word count calculated from transcript for token estimation

**Phase 14 (AI Service Layer):**
- 14-06: Modal UI pattern for API key configuration (password input with test/save/clear)
- 14-06: containerEl.empty() before re-render to prevent DOM duplication
- 14-06: AISettingsTab as component not standalone PluginSettingTab
- 14-06: Fallback provider order configurable but optional (advanced feature)
- 14-05: Evidence threshold - Proceed with enrichment if FullText OR Notes available (Abstract-only items queued)
- 14-05: Token estimation uses words / 0.75 for rough approximation before API call
- 14-05: PDF extraction from Zotero .zotero-ft-cache files (hybrid approach with PDF.js deferred)
- 14-04: Jitter fraction 0.5 (±50% randomization) prevents thundering herd
- 14-04: Failure threshold 5, success threshold 2 for balanced circuit breaker recovery
- 14-04: Max retry delay capped at 30s to prevent excessive wait times
- 14-04: Retry-after headers take precedence over exponential backoff
- 14-04: Per-provider circuits enable independent failure handling
- 14-03: OpenAI validation: /v1/models endpoint for lightweight auth check
- 14-03: Google validation: /models endpoint with API key in query param
- 14-03: Anthropic 529 overload: Non-retryable despite 5xx status code
- 14-03: OpenRouter tracking: GitHub repo URL and plugin name in headers
- 14-02: Default model: gemini-3-flash-preview (Google Gemini 3 Flash)
- 14-02: Factory pattern with self-registration for providers
- 14-02: Error retry strategy: 401/403 non-retryable, 429 retryable with backoff, 5xx retryable
- 14-02: Dual factory interface: functional (createProvider) + OOP (ProviderFactoryClass)
- 14-01: Use Obsidian's secretStorage API instead of custom encryption library
- 14-01: Evidence hierarchy: FullText > Notes > Abstract > MetadataOnly
- 14-01: Synchronous secret storage methods (Obsidian API is sync, not async)
- 14-01: Graceful error handling in SecretStorageService (log, don't throw)

**v1.0-v1.2:**
- v1.2: SQL-level library filtering for query-time performance
- v1.2: Non-blocking preflight design (advisory-only, never prevents workflow)
- v1.1: Tag weight 1.5 (between keywords 2.0 and authors 1.0)
- v1.0: JSON registry over SQLite for simpler MVP state management
- v1.0: Lazy database initialization for <50ms plugin load time

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 14 research needs:**
- Hallucination rate baseline: Need beta testing with 100+ papers to measure false claim rate
- Token counting accuracy: Benchmark PDF.js + model tokenizers on 100 papers (target ±10%)
- PDF extraction quality: Test PDF.js vs. Zotero extraction on 50 papers

**Phase 15 research needs:**
- Domain classification accuracy: Baseline test before shipping (target >85% accuracy)
- Video transcript availability: Survey 100+ YouTube videos for transcript quality/availability

**Phase 16 research needs:**
- User blocking tolerance: A/B test <10s spinner vs. progress modal at 10s, 30s, 60s intervals
- Deferred queue adoption: Beta test with 50+ users to measure queue growth and rework rate

**Architecture decisions pending:**
- API provider selection priority (start with Claude 3.5 Sonnet vs. GPT-4)
- PDF extraction approach (PDF.js vs. Zotero cache API vs. hybrid)

**Architecture decisions resolved:**
- Encryption library: Obsidian SecretStorage API (14-01) - provides OS keychain integration

## Session Continuity

Last session: 2026-02-02
Stopped at: Completed Phase 16 execution (4/4 plans complete)
Resume file: None

Next action: Phase 16 COMPLETE - proceed to Phase 17 (Acceptance Modal & Batch UI Enhancement)

---

*Last updated: 2026-02-02 after completing Phase 16 Plan 04*
