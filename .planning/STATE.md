# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-30)

**Core value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

**Current focus:** Phase 14 - AI Service Layer & Evidence Foundation

## Current Position

Phase: 14 of 19 (AI Service Layer & Evidence Foundation)
Plan: 14-03 of 6 (Provider Implementations)
Status: In progress (5/6 plans complete)
Last activity: 2026-01-31 — Completed 14-03-PLAN.md (Provider Implementations)

Progress: [████░░░░░░░░░░░░░░░░] 13/19 phases (68% milestone progress, 8.3% v2.0 progress)

## Performance Metrics

**Velocity:**
- Total plans completed: 45 (from v1.0-v1.2 + quick tasks + v2.0)
- Average duration: ~34 min per plan
- Total execution time: ~25 hours 11 minutes

**By Phase:**

**Phase 14 (v2.0 - AI Service Layer):**
- 14-01: 15 min (Types & Secret Storage)
- 14-02: 65 min (Provider Abstraction Layer)
- 14-03: 6 min (Provider Implementations)
- 14-04: 6 min (Resilience Patterns)
- 14-05: 11 min (Evidence Extraction)

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

**Phase 14 (AI Service Layer):**
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

Last session: 2026-01-31
Stopped at: Completed 14-03-PLAN.md (Provider Implementations)
Resume file: None

Next action: Continue phase 14 execution (1 plan remaining: AI service orchestration)

---

*Last updated: 2026-01-31 after completing plan 14-03*
