# Roadmap: Zotero Triage v2.0 - The Enrichment Engine

## Overview

v2.0 transforms Zotero Triage from a triage assistant into an enrichment engine by adding AI-powered literature note generation during the Accept workflow. The architecture enforces evidence hierarchy (PDF > notes > abstract > metadata) with hallucination prevention, domain-specific templates, and BYOK API integration for Claude, GPT-4, Google, and OpenRouter.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-25)
- ✅ **v1.1 Polish + Tag Support** - Phases 6-8 (shipped 2026-01-27)
- ✅ **v1.2 Library Scope Filtering & Preflight Checks** - Phases 9-13 (shipped 2026-01-29)
- 🚧 **v2.0 The Enrichment Engine** - Phases 14-19 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-01-25</summary>

See MILESTONES.md for complete v1.0 details.

</details>

<details>
<summary>✅ v1.1 Polish + Tag Support (Phases 6-8) - SHIPPED 2026-01-27</summary>

See MILESTONES.md for complete v1.1 details.

</details>

<details>
<summary>✅ v1.2 Library Scope Filtering & Preflight Checks (Phases 9-13) - SHIPPED 2026-01-29</summary>

See MILESTONES.md for complete v1.2 details.

</details>

### 🚧 v2.0 The Enrichment Engine (In Progress)

**Milestone Goal:** Transform stub literature notes into fully enriched, evidence-based knowledge artifacts using AI-powered classification, extraction, and template-based generation.

**Phase Numbering:**
- Integer phases (14, 15, 16, 17, 18, 19): Planned milestone work
- Decimal phases (14.1, 14.2): Urgent insertions (marked with INSERTED)

---

#### Phase 14: AI Service Layer & Evidence Foundation

**Goal:** Establish bulletproof AI provider abstraction with encrypted API key storage, evidence extraction hierarchy, and hallucination prevention architecture before any enrichment orchestration.

**Depends on:** Nothing (foundation for v2.0)

**Requirements:** AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-10, EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, EXTRACT-08, SETTINGS-01

**Success Criteria** (what must be TRUE):
1. User can configure API keys for OpenAI, Google, Anthropic, and OpenRouter with encrypted storage in OS keychain
2. User can select one global model from configured providers and see it persist across plugin restarts
3. System extracts PDF fulltext from Zotero cache, falls back to notes, then abstract, and never enriches metadata-only items without queuing
4. System displays evidence level (FullText, Notes, Abstract) in note YAML frontmatter for every created note
5. System implements exponential backoff for API failures (3 retries, then queue) and circuit breaker after 5 consecutive failures

**Plans:** 6 plans in 4 waves

Plans:
- [ ] 14-01-PLAN.md — AI types and SecretStorage service
- [ ] 14-02-PLAN.md — Provider abstraction layer and model catalog
- [ ] 14-03-PLAN.md — Concrete provider implementations (OpenAI, Google, Anthropic, OpenRouter)
- [ ] 14-04-PLAN.md — Resilience service (exponential backoff, circuit breaker)
- [ ] 14-05-PLAN.md — Evidence extractor service
- [ ] 14-06-PLAN.md — AI service orchestrator and settings UI

---

#### Phase 15: Content Extraction & Classification Pipeline

**Goal:** Users can classify items into domains (Academic, Software, Farming, General) and extract structured content from PDFs, notes, and transcripts with automatic video URL detection.

**Depends on:** Phase 14

**Requirements:** EXTRACT-06, EXTRACT-07, EXTRACT-09, EXTRACT-10, EXTRACT-11, CLASSIFY-01, CLASSIFY-02, CLASSIFY-03, CLASSIFY-04, CLASSIFY-05, CLASSIFY-06, CLASSIFY-07, CLASSIFY-08, CLASSIFY-09, CLASSIFY-10

**Success Criteria** (what must be TRUE):
1. System auto-fetches video transcripts from YouTube URLs and treats them as evidence sources
2. System classifies items into domains (Academic, Software, Farming, General) based on title, tags, and abstract with item type priority (Articles/Books stay ACADEMIC)
3. User can override suggested domain classification before enrichment in confirmation modal
4. System provides 4 domain-specific templates with appropriate section structures (Summary/Key Findings/Methods for Academic, Overview/Features/Architecture for Software, etc.)
5. System creates diagnostic note for metadata-only items explaining missing evidence and linking to Zotero

**Plans:** 7 plans (4 original + 3 gap closure) in 3 waves

Plans (Original):
- [x] 15-01-PLAN.md — Video transcript extraction (YouTube + manual fallback)
- [x] 15-02-PLAN.md — Domain classification with LLM and confidence scoring
- [x] 15-03-PLAN.md — Classification modal UI and re-classify command
- [x] 15-04-PLAN.md — Diagnostic notes for metadata-only items

Gap Closure Plans:
- [x] 15-05-PLAN.md — Domain-specific template integration (Academic, Software, Farming, General)
- [x] 15-06-PLAN.md — Classification and modal workflow integration
- [x] 15-07-PLAN.md — Diagnostic notes service integration

---

#### Phase 16: Enrichment Orchestration & Validation

**Goal:** Users can Accept items and immediately receive enriched notes with blocking progress feedback, template-based structure, and hallucination validation preventing fabricated claims.

**Depends on:** Phase 15

**Requirements:** ENRICH-01, ENRICH-02, ENRICH-03, ENRICH-04, ENRICH-05, ENRICH-06, ENRICH-07, ENRICH-08, ENRICH-09, ENRICH-10, ENRICH-11, ENRICH-12, ENRICH-13, OUTPUT-01, OUTPUT-02, OUTPUT-03, OUTPUT-04, OUTPUT-05, OUTPUT-06, OUTPUT-07, OUTPUT-08, OUTPUT-09, OUTPUT-10, OUTPUT-11, OUTPUT-12

**Success Criteria** (what must be TRUE):
1. User clicks Accept and sees progress modal with steps (Classification → Extraction → Enrichment → Validation) updating 0% → 25% → 50% → 75% → 100%
2. Enriched note contains template sections filled based on extracted evidence only, with "N/A" for sections lacking supporting evidence
3. Enriched note preserves verbatim quotes from source text for claims, methods, and results
4. System validates enriched output for consistency (authors, year, title match metadata) and flags low-confidence sections (confidence < threshold)
5. System handles enrichment failures gracefully by creating stub note and queuing retry, never blocking user workflow

**Plans:** 5 plans in 3 waves

Plans:
- [ ] 16-01-PLAN.md — Enrichment Service (LLM-powered template population)
- [ ] 16-02-PLAN.md — Output Validation Stack (frontmatter schemas, metadata consistency, hallucination detection)
- [ ] 16-03-PLAN.md — Error Recovery & Retry Queue (stub note generator, persistent retry queue)
- [ ] 16-04-PLAN.md — Enrichment Orchestrator (pipeline state machine, progress modal, timeout handling)
- [ ] 16-05-PLAN.md — Workflow Integration & Commands (Accept flow, manual re-enrichment command)

---

#### Phase 17: Long Content Strategy & Map-Reduce

**Goal:** Users can enrich long-form content (books, theses with 50k+ tokens) without context window limits using map-reduce processing that preserves chapter-level specificity.

**Depends on:** Phase 16

**Requirements:** LONG-01, LONG-02, LONG-03, LONG-04, LONG-05, LONG-06, LONG-07, LONG-08

**Success Criteria** (what must be TRUE):
1. System detects long content when extracted text exceeds 50,000 tokens and automatically switches to map-reduce processing
2. System extracts chapter boundaries from PDF bookmarks/TOC when available, falls back to fixed-window chunking (~20k tokens) when not
3. System generates chapter-level summaries in map phase preserving specificity (not generic abstracts) and embeds them in final literature note
4. User sees progress for map phase showing chapter-by-chapter advancement (Chapter 1/N → Chapter 2/N → ...)

**Plans:** TBD

Plans:
- [ ] 17-01: [TBD during plan-phase]

---

#### Phase 18: Registry State & Queue Management

**Goal:** System tracks enrichment state per item, persists deferred queue for metadata-only items, and retries when evidence becomes available without user intervention.

**Depends on:** Phase 16 (Phase 17 can run in parallel)

**Requirements:** EXTRACT-05, REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-04, REGISTRY-05, REGISTRY-06

**Success Criteria** (what must be TRUE):
1. System tracks enrichment states (enriched, enrichment_pending, enrichment_failed) in registry with metadata (model used, token count, cost, timestamp)
2. System queues metadata-only items in deferred queue and displays them in dashboard view (items waiting for evidence)
3. System persists deferred queue to disk and survives plugin reload without losing queue state
4. System detects PDF changes via hash comparison and re-enriches if PDF updated in Zotero
5. System retries deferred items when Zotero database updated using batch retry logic

**Plans:** TBD

Plans:
- [ ] 18-01: [TBD during plan-phase]

---

#### Phase 19: Settings UI & Statistics Dashboard

**Goal:** Users can configure enrichment behavior (timeouts, retries, confidence thresholds, automatic enrichment toggle) and view enrichment statistics (costs, token consumption, success rates).

**Depends on:** Phase 18

**Requirements:** AI-08, AI-09, SETTINGS-02, SETTINGS-03, SETTINGS-04, SETTINGS-05, SETTINGS-06, SETTINGS-07

**Success Criteria** (what must be TRUE):
1. User can access Enrichment settings tab with controls for templates, timeouts (default 2 min, max 5 min), retries (default 3, max 5), and confidence threshold (default 0.5, range 0.0-1.0)
2. User can enable/disable automatic enrichment with toggle that affects Accept flow behavior
3. User can view token consumption statistics per enrichment operation in dashboard
4. User can set budget alert warning threshold and receive notifications when approaching limit
5. User can view enrichment statistics dashboard showing total enriched, costs, failures, and success rate

**Plans:** TBD

Plans:
- [ ] 19-01: [TBD during plan-phase]

---

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-13 | v1.0-v1.2 | - | Complete | 2026-01-29 |
| 14. AI Service Layer & Evidence Foundation | v2.0 | 6/6 | Complete | 2026-01-31 |
| 15. Content Extraction & Classification Pipeline | v2.0 | 7/7 | Complete | 2026-02-01 |
| 16. Enrichment Orchestration & Validation | v2.0 | 0/5 | Planning | - |
| 17. Long Content Strategy & Map-Reduce | v2.0 | 0/TBD | Not started | - |
| 18. Registry State & Queue Management | v2.0 | 0/TBD | Not started | - |
| 19. Settings UI & Statistics Dashboard | v2.0 | 0/TBD | Not started | - |

---

*Last updated: 2026-02-01 after Phase 16 planning*
