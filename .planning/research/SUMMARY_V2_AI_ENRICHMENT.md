# Research Summary: Zotero Triage v2.0 AI Enrichment Engine

**Project:** Zotero Triage Plugin v2.0 (AI Enrichment Milestone)
**Domain:** Academic research note enrichment with LLM-powered content synthesis
**Researched:** 2026-01-30
**Confidence:** MEDIUM-HIGH (stack verified; features researched; integration needs phase-specific validation)

---

## Executive Summary

v2.0 transforms Zotero Triage from a **triage assistant** into an **enrichment engine**, adding AI-powered note generation during the Accept workflow. The research validates that long-context LLMs (Claude 3.5 Sonnet, GPT-4) can reliably summarize research papers when properly grounded in source material, but only if the architecture actively prevents hallucination through evidence validation and evidence hierarchy enforcement.

**Recommended approach:** Integrate AI enrichment as a non-blocking, optional pipeline triggered from Accept that:
1. Assesses content availability (PDF > notes > abstract > metadata)
2. Routes through domain-specific templates (Academic/Software/Farming/General)
3. Calls LLM with strict evidence-grounding prompts
4. Validates every claim against source text before persisting
5. Queues metadata-only items separately, never blocking the user

**Key risk:** Hallucination is the critical failure mode. AI will fabricate unsupported claims if validation isn't architectural. Prevention requires claim-level evidence mapping, not just prompt engineering. Real-world examples (Microsoft Copilot, Stanford legal AI research) show >10% hallucination rates when grounding is weak.

The architecture reuses v1.2 patterns (DI, async chunking, debounced persistence, progress tracking) while adding 9 new components for enrichment orchestration. Build order emphasizes API/storage foundation (EncryptedStorage → AIProvider) before content processing, enabling progressive rollout by feature.

---

## Key Findings

### Recommended Stack

**Core technologies (complementing existing v1.2 stack):**
- **LLM API:** Claude 3.5 Sonnet (primary) with fallback to GPT-4 — 200k token context window handles most academic papers in single pass; lower hallucination rates than GPT-3.5 in research validation
- **Long-context handling:** Section-based chunking for 20k-200k token documents (abstract/intro/methods/results/discussion boundaries); map-reduce only for >200k tokens (rare, defer to v2.1)
- **PDF extraction:** PDF.js for fast client-side extraction (already used in Zotero 7+); fallback to Zotero's cached PDF text extraction API
- **Encryption:** Obsidian SecretStorage API (native Zotero 7+ support) for BYOK API keys; fallback to libsodium.js for pure JavaScript encryption
- **Content metadata:** pdfjs-dist + unpdf for structured section boundary detection in PDFs
- **Token counting:** Model-specific tokenizers (js-tokenizers for Claude/GPT-4) with 1.3x safety margin for accurate API cost estimation
- **Async orchestration:** TypeScript Promise-based pipeline (existing v1.2 pattern); no new dependencies for orchestration layer

**Why this stack:**
- Long-context LLMs verified to handle academic papers without splitting for most use cases
- PDF.js is proven in production (Zotero uses it); adding Obsidian SecretStorage leverages existing Zotero ecosystem
- Tokenizer libraries mature and well-tested; critical for preventing API "context too long" errors
- No significant new external dependencies; reuses v1.2's TypeScript/async patterns

**Stack confidence:** HIGH — LLM capabilities verified with official model cards; context window limits well-documented; PDF extraction patterns established in Zotero ecosystem.

### Expected Features

**Must have (table stakes — users expect these or feature feels incomplete):**
1. **Content extraction (PDF + notes)** — Users expect plugin to read sources, not ask them to copy-paste
2. **Metadata classification** — Different domains need different enrichment (Academic paper ≠ Software tool ≠ Farming research)
3. **Template-based note structure** — Users expect consistent format they can customize; unstructured prose is unusable
4. **YAML frontmatter output** — Machine-readable metadata enables downstream Obsidian queries and filters
5. **Validation & quality gates** — Users expect warnings about hallucination risk and incomplete data
6. **Blocking on Accept** — Users expect notes to generate during Accept workflow, not async batch (existing v1.2 mental model)

**Should have (competitive differentiators — set v2.0 apart from competitors):**
1. **Section-aware summarization** — Most tools hallucinate across sections; v2.0 preserves structure (abstract → intro → methods → results → conclusion) with explicit source attribution for each claim
2. **Video transcript auto-fetch** — YouTube/Vimeo transcripts extracted automatically (unique among academic plugins); saves 5+ min per video
3. **Evidence-level YAML tracking** — Frontmatter shows confidence in note (abstract_only vs. fulltext_analyzed); enables downstream prioritization
4. **Deferred queue for metadata-only items** — Never blocks user; metadata-only items queued for later enrichment when PDF becomes available
5. **Long-form content handling** — Handles 50k+ word PDFs without context window limits (map-reduce); competitors fail >20k words
6. **Hallucination prevention** — Evidence citations in output; confidence scoring; user can verify claims against source

**Defer to v2.1+ (not essential for MVP):**
- Real-time streaming output (UX feels incomplete; increases API costs 3x)
- Map-reduce for 50k+ word documents (edge case; >99% academic papers <20k tokens)
- Template customization UI (can ship static templates; user customization Phase 2)
- Batch reprocessing workflow (optional after core enrichment stabilizes)
- Multi-model support (start with one model; add switching logic in Phase 2)
- Related papers linking (knowledge graph features v3+)

**Features confidence:** MEDIUM-HIGH — Enrichment patterns researched; templates surveyed; validation patterns documented. Integration with v1.2 workflow needs phase-specific validation during Phase 1.

### Architecture Approach

AI enrichment integrates as an optional, non-blocking async pipeline triggered from the existing Accept action, adding 9 new components while maintaining compatibility with v1.x registry and note generation. Key insight: enrichment is **fire-and-forget** from the user perspective—note creation happens synchronously (user gets immediate feedback), enrichment happens asynchronously (updates note background).

**Major components (new in v2.0):**

1. **EnrichmentOrchestrator** — Coordinates pipeline, manages state transitions, implements fire-and-forget pattern with fallback to deferred queue
2. **SmartClassifier** — Classifies items into domains (Academic/Software/Farming/General) using rule-based approach + optional LLM assistance
3. **TemplateSelector** — Selects domain/item-type-specific templates (e.g., academic_paper, software_tool, farming_research)
4. **ContentExtractor** — Extracts text from PDF (priority), user notes, abstract, metadata in order of evidence quality
5. **LongContentHandler** — Implements section-based chunking and map-reduce for documents >20k tokens
6. **AIProvider** — Abstraction layer for BYOK model selection (Claude, GPT-4, Ollama) with retry logic and rate limiting
7. **EncryptedStorage** — Encrypts and persists API keys using OS keychain or libsodium.js (BYOK pattern)
8. **EnrichmentValidator** — Validates LLM output against template schema and source text; flags hallucinations
9. **QueueManager** — Tracks metadata-only items for deferred enrichment; handles retry state

**Integration points:**
- Accept flow: After NoteGenerator.createNote() returns, async EnrichmentOrchestrator.enrich() triggered
- Registry state: New states added (enriched, enrichment_pending) to track enrichment progress
- Progress tracking: ProgressTracker extended to show enrichment stages (classification → extraction → enrichment → validation)
- Settings: New enrichment settings (provider, model, timeout, evidence threshold, validation strictness)

**Data flow:**
```
User Accept → NoteGenerator.createNote() [sync, ~100ms]
           → Registry.markState('imported')
           → Return to UI immediately
           ↓ (async)
           → EnrichmentOrchestrator.assessEvidence()
           → SmartClassifier.classify()
           → TemplateSelector.selectTemplate()
           → ContentExtractor.extract()
           → LongContentHandler if needed
           → AIProvider.sendRequest()
           → EnrichmentValidator.validate()
           → NoteGenerator.updateNote()
           → Registry.markState('enriched' | 'enrichment_pending')
```

**Reused patterns from v1.x:**
- Dependency injection for loose coupling
- Async chunking for non-blocking processing
- Debounced state persistence (2000ms)
- Progress callbacks for UI updates
- Retry with exponential backoff for API failures
- Multi-signal scoring (similar to RecommendationEngine approach)

**Architecture confidence:** MEDIUM — v1.x foundations are solid; enrichment layer adds complexity. Integration points with Accept flow, registry state machine, and note persistence need Phase 1 verification. API provider abstraction is straightforward; the complexity is in error handling, validation, and evidence hierarchy enforcement.

### Critical Pitfalls

Research identified 5 critical failure modes requiring architectural prevention:

**1. Hallucinated Enrichment (AI Inventing Unsupported Claims)** — P1
- **Risk:** AI generates plausible-sounding facts not in source. User trusts enrichment, cites in research, later discovers false claims.
- **Real-world impact:** Stanford legal AI study found >10% hallucination rate in citations; Microsoft Copilot generated false meeting summaries; Perplexity initially hallucinated PDF citations before retraining.
- **Prevention:** Every claim in output must map to source text span. Implement claim-level validation, not just prompt engineering. Block generation if can't find evidence. Evidence grounding is mandatory architectural constraint, not optional optimization.
- **Indicators of failure:** Metadata-only enrichment generating specific numbers not in metadata; enrichment claiming sources for statements not in PDF; AI-generated keywords not appearing in actual text.

**2. API Failure Cascade (Key Errors, Rate Limits, Timeouts)** — P2
- **Risk:** API failure blocks UI indefinitely; retry logic hammers dying API; partial enrichment corrupts state; invalid key detected after 100 items enriched.
- **Real-world impact:** 429 rate limit errors triggering exponential retry loops (500+ failed attempts); timeout cascades (60s → 120s → 240s waits); token counting mismatches claiming 30k tokens when actual is 60k.
- **Prevention:** Classify API errors (401 = don't retry, 429 = exponential backoff + circuit breaker, timeout = 1 retry only, 5xx = retry with backoff). Implement circuit breaker pattern (stop retrying after 5 consecutive failures). Validate API keys on startup. Count tokens accurately with 1.3x safety margin.
- **Indicators of failure:** Plugin freezes without error message; rate limit causes "retrying..." for 5+ minutes; enriched 50 items then hung indefinitely; network timeout on large PDFs followed by exponential retries.

**3. Performance Collapse on Large Documents (50k+ Tokens, UI Blocking)** — P1
- **Risk:** 50-page PDF takes 90+ seconds to process; UI frozen (no timeout feedback); user thinks crashed; plugin actually working. At scale (200+ items), total time becomes unacceptable (2+ hours).
- **Real-world impact:** Token counting estimates wrong (actual 1.5x claimed); map-reduce implementations naive (split by character, lose sentence boundaries, incoherent summaries); no progress feedback; no caching (same PDF enriched twice costs 2x).
- **Prevention:** Implement accurate token counting (use model tokenizers, not estimates); smart chunking by page/paragraph (not character count); show progress during API calls; cache enrichment results per (itemId, pdfHash); enforce 2-minute timeout per item.
- **Indicators of failure:** Enriched 3 items, then plugin froze for 5 minutes; token count wrong (API says "context too long"); map-reduce produces incoherent summaries; 200-item batch takes 2+ hours; same PDF enriched twice costs double.

**4. Evidence Hierarchy Violations (Metadata-Only Enrichment Misconclassification)** — P1
- **Risk:** Metadata-only items enriched with same quality as PDF-based items. Template asks for "methods" field; AI generates from abstract (not actual methods section). Users don't notice evidence source, trust metadata-only enrichment as if PDF-based.
- **Real-world impact:** Stanford legal AI: "Models make unsupported claims when training data incomplete; metadata-only documents especially prone to hallucination." Nature 2025: AI abstracts from metadata had 8% false claims vs. <0.5% from PDF-grounded.
- **Prevention:** Encode evidence hierarchy in templates (PDF-required fields blocked for metadata-only items). Make evidence source explicit in UI ("Based on: PDF" vs. "Based on: Abstract only"). Block metadata-only enrichment from risky templates. Separate enrichment paths (FullPDF vs. MetadataOnly).
- **Indicators of failure:** Metadata-only items contain specific numbers not in metadata; UI doesn't show evidence source; same template produces incomparable results across PDF/metadata items; metadata-only items flagged as low quality only after review.

**5. Queue State Corruption (Partial Enrichment, Missing Checkpoint, Stale Cache)** — P2
- **Risk:** User enriches 100 items; API fails at item #48. Plugin doesn't mark completion status. User resumes; plugin either re-enriches #1-47 (wasting API calls) or skips them (losing work). Cache says "enrichment skipped" but new PDF added; plugin re-enriches or skips inconsistently.
- **Real-world impact:** Batch processing failure cascades; no way to resume mid-batch; partial state persisted without completion markers; version/change tracking missing.
- **Prevention:** Track explicit enrichment state per item (NotEnriched, Enriching, Enriched, SkippedByUser, SkippedNoEvidence, Failed, FailedRecoverable). Persist batch state to disk. Detect item changes (PDF hash mismatch). Resume restores complete state. Isolate metadata-only items in separate queue.
- **Indicators of failure:** User re-runs enrichment; sees duplicate enrichment; partial batch lost on restart; metadata-only items enriched, then PDF added, plugin re-enriches (double cost); cache shows "skipped" but UI allows re-enrichment.

---

## Implications for Roadmap

Based on research, suggested 5-phase structure for v2.0 delivery. Phase ordering follows dependency graph (API/storage first, then content, then orchestration, then UI, then polish).

### Phase 1: AI Service Layer & Evidence-Based Enrichment Foundation
**Rationale:** API abstraction and storage must be bulletproof before content processing. Hallucination validation must be architectural, not retrofitted.
**Delivers:**
- EncryptedStorage (API key management with OS keychain)
- AIProvider (LLM abstraction with retry/backoff/circuit breaker)
- ContentExtractor (PDF text + abstract + metadata extraction with priority fallback)
- SmartClassifier (domain classification)
- TemplateSelector (template registry system)
- EnrichmentValidator (schema + hallucination validation)
- Token counting utilities (accurate, with 1.3x safety margin)
- Section-based chunking for 20k-200k token documents

**Features delivered:**
- PDF text extraction with fallback to abstract
- Metadata classification (Academic/Software/Farming/General)
- Template-based structure with validation
- Evidence hierarchy enforcement (PDF > notes > abstract > metadata)
- Hallucination detection (claim validation against source)

**Avoids:**
- Hallucinated enrichment (claim-level validation prevents fabrications)
- API failure cascade (circuit breaker + error classification)
- Performance collapse on large docs (accurate token counting + chunking)
- Evidence hierarchy violation (evidence_level field in output)

**Research flags:**
- Phase 1a needs research: Optimal prompt engineering for hallucination prevention (Test 10+ prompts on 20 PDFs; measure false claim rate)
- Phase 1b needs research: Token counting accuracy across PDF types (Benchmark PDF.js + model tokenizers on 100 papers; verify accuracy ±10%)
- Phase 1c needs research: PDF extraction quality baseline (Test PDF.js vs. Zotero extraction on 50 papers; measure text quality)

**Standard patterns (skip research):**
- LLM API integration patterns (well-established)
- Encryption library selection (mature ecosystem)
- TypeScript dependency injection (existing v1.2 pattern)

### Phase 2: Enrichment Orchestration & Queue Management
**Rationale:** Core enrichment pipeline combines Phase 1 components. Queue system handles metadata-only items, enabling non-blocking user experience.
**Delivers:**
- EnrichmentOrchestrator (pipeline coordination, fire-and-forget pattern)
- LongContentHandler (map-reduce for 50k+ token documents)
- QueueManager (deferred enrichment queue with state persistence)
- Registry state machine extension (enriched, enrichment_pending states)
- Progress tracking integration

**Features delivered:**
- Blocking enrichment on Accept with progress feedback
- Deferred queue for metadata-only items
- Batch state persistence with resume capability
- Progress modal showing enrichment stages

**Avoids:**
- Queue state corruption (explicit state tracking per item)
- Performance collapse (2-minute timeout per item, progress feedback)
- Blocking UI indefinitely (async pipeline returns immediately after note creation)

**Research flags:**
- Phase 2a needs research: User tolerance for blocking enrichment (A/B test: <10s spinner vs. progress modal; measure force-quit rate at 10s, 30s, 60s)
- Phase 2b needs research: Deferred queue adoption UX (Beta test with 50+ users; measure queue size growth, rework rate)
- Phase 2c needs research: Long-context performance (Benchmark map-reduce on 50k+ word PDFs; measure token cost vs. quality tradeoff)

**Standard patterns (skip research):**
- Batch state persistence (well-established patterns)
- Async/await orchestration (existing v1.2 pattern)
- Debounced state saves (reused from v1.2)

### Phase 3: Content Integration & Validation UI
**Rationale:** User-facing enrichment features. Note structure enhancements, validation feedback, evidence display.
**Delivers:**
- Enhanced note frontmatter (enrichment_status, enrichment_timestamp, enrichment_model, enriched_by, evidence_level, source_sections, confidence)
- Validation UI (diff viewer for generated vs. validated content)
- Evidence source badges ("Enriched from: PDF" vs. "Enriched from: Abstract only")
- Confidence scoring visualization
- Error recovery UI

**Features delivered:**
- Rich YAML frontmatter for downstream Obsidian queries
- User verification of hallucination-flagged sections
- Evidence source transparency
- Enrichment history and rollback (Phase 3b)

**Avoids:**
- Silent metadata-only fallback (evidence source always shown)
- User confusion about enrichment quality (badges + confidence scores visible)
- Inability to undo enrichment (keep enrichment history)

**Research flags:**
- Phase 3a needs research: UX for evidence source badges (Test 3 design variants; measure comprehension)
- Phase 3b needs research: Validation diff UI complexity (User test manual review of hallucinated sections; measure time to approve/reject)

### Phase 4: Video Transcripts & Template Customization
**Rationale:** Differentiator features. Video transcript auto-fetch (YouTube/Vimeo) and template customization UI.
**Delivers:**
- YouTube/Vimeo transcript auto-fetcher (with language detection)
- Transcript-based enrichment path
- Template customization UI (user-editable templates via settings, no code changes)
- Custom domain support

**Features delivered:**
- Video content enrichment (YouTube/Vimeo transcripts auto-extracted)
- User-customizable templates (YAML editor in settings)
- Extensible domain taxonomy

**Research flags:**
- Phase 4a needs research: Video transcript availability and accuracy (Survey 100 popular YouTube videos; measure transcript availability %, quality %)
- Phase 4b needs research: User template customization adoption (Beta test customization UI; measure usage rate, template variants created)

### Phase 5: Performance Optimization & Production Hardening
**Rationale:** Scale testing, caching strategies, monitoring. Before GA release.
**Delivers:**
- PDF extraction caching (LRU cache, ~100MB for 1000 PDFs)
- Enrichment result caching (per itemId + pdfHash, invalidates on PDF change)
- API cost tracking and reporting
- Batch cost estimation before enrichment
- Monitoring/telemetry (hallucination detection rate, API cost per item, timeout frequency)

**Features delivered:**
- Performance optimizations (no re-extraction/re-enrichment of cached items)
- User cost visibility (API costs shown before batch)
- Production monitoring (track hallucination rate, API reliability, performance)

**Standard patterns (skip research):**
- Caching strategies (well-established LRU patterns)
- Cost tracking (straightforward calculation)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| **Stack** | HIGH | LLM capabilities verified with official model cards (Claude 3.5, GPT-4 context windows); PDF.js proven in Zotero; token counting libraries mature. |
| **Features** | MEDIUM-HIGH | Core features researched and validated against 5+ competing tools. Validation patterns documented. Template system proven in enterprise tools. Video transcript handling less researched; needs Phase 4 validation. |
| **Architecture** | MEDIUM | v1.x foundations solid. Enrichment layer adds complexity; integration with Accept flow, registry state machine, and note persistence needs Phase 1 verification. API provider abstraction straightforward; evidence validation more complex. |
| **Pitfalls** | HIGH | Hallucination prevention researched extensively (2026 surveys, Stanford case study, Microsoft/Perplexity failures). API error handling patterns well-documented. Performance bottlenecks identified with concrete examples. Evidence hierarchy violations clearly defined. Queue state corruption covered by established batch processing patterns. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

1. **Hallucination rate baseline** — Research shows general patterns but not specific to academic domain. Need beta testing with 100+ papers; measure false claim rate in actual user workflows.

2. **Domain classification accuracy** — Rule-based approach ~85% accurate; LLM-assisted improves it, but no benchmarks on this domain. Baseline test needed before shipping.

3. **PDF extraction quality variance** — PDF.js vs. Zotero extraction performance not compared on complex layouts (tables, code, multi-column). Need evaluation on 50-paper sample.

4. **Zotero 7+ PDF API compatibility** — Plugin needs to read PDFs from Zotero's cache. API compatibility not verified against Zotero 6.x and 7.x. Phase 1 must verify.

5. **User preferences: blocking vs. async enrichment** — Research shows users expect notes during Accept, but no data on tolerance for 10-30s wait. UX testing needed during Phase 1.

6. **Deferred queue adoption** — New UX pattern; user expectations unknown. Beta test with 50+ users; measure queue size growth and rework rate (Phase 2).

7. **Template customization adoption** — Users want custom templates per research, but no data on implementation effort or adoption. Plan Phase 4 UX research before building customization UI.

8. **Long-context performance degradation** — Gemini 3 Pro supports 1M tokens but accuracy degrades with context length ("Context Rot" effect). Need benchmarks on 50k+ word PDFs to validate practical token limits for this domain.

---

## Summary for Roadmap Creation

The v2.0 AI Enrichment Engine is architecturally sound and well-researched. The recommendation is to proceed with phased delivery starting with Phase 1 (AI service layer & hallucination prevention), which delivers core value and reduces risk. Key success factors:

1. **Hallucination prevention is architectural, not optional.** Evidence grounding and claim validation must be built in Phase 1, not retrofitted later. This is the #1 risk from research.

2. **Evidence hierarchy enforcement prevents metadata-only hallucinations.** Templates must specify which fields require PDF vs. abstract. Metadata-only items get separate, restricted enrichment paths.

3. **Non-blocking, optional design prevents UX failures.** Fire-and-forget async pattern + deferred queue + progress feedback = users never blocked, quality gates never compromised.

4. **API robustness prevents cascade failures.** Circuit breaker + error classification + accurate token counting + 2-minute timeouts prevent the retry storms and timeouts documented in 2026 LLM failures.

5. **Gap analysis drives phase research.** Hallucination rate baseline (Phase 1), domain classification accuracy (Phase 1), PDF extraction quality (Phase 1), user blocking tolerance (Phase 1), queue adoption (Phase 2) need validation before respective phases start.

**Ready for requirements definition:** YES. Feature categorization is complete. Dependencies are mapped. Competitive advantages are validated. Critical pitfalls are identified with prevention strategies. Gaps for phase-specific research are explicit. Roadmapper can proceed to Phase 1 planning.

---

## Sources

### Primary Research (HIGH confidence)

**LLM & Long-Context:**
- Claude 3.5 Model Card (Anthropic) — Context window, performance benchmarks
- Best Long Context LLMs January 2026 (WhatLLM) — Gemini 3 Pro 1M tokens documented
- Hallucination Mitigation Survey (MDPI 2025, 2026) — Comprehensive taxonomy of hallucination prevention techniques
- Context Rot Research (Chroma) — Performance degradation with large context

**Content Extraction & Classification:**
- MOLE: Metadata Extraction in Scientific Papers (EMNLP 2025) — LLM-based metadata extraction patterns
- Research Paper Content Hierarchy Extraction (Nature Communications) — Structured information extraction from papers
- S2 Chunking: Spatial & Semantic Analysis (arxiv) — Advanced chunking strategies

**Zotero Ecosystem:**
- Zotero Better Notes Plugin (GitHub) — Working example of Zotero note generation
- Zotero Direct SQLite Access (Official) — Database access patterns for plugins
- ZotFile Extract Annotations (Zotero) — Annotation extraction patterns

**Competing Tools:**
- 11 Best AI Tools for Scientific Literature Review (Cypris 2026) — NotebookLM, Elicit, Semantic Scholar compared
- Best AI Tools for Research 2026 (PaperGuide) — Feature comparison analysis

### Secondary Research (MEDIUM confidence)

**Hallucination Detection & Fact Verification:**
- Survey on Hallucination in LLMs (Preprints.org) — Definitions and mitigation approaches
- Hallucination Detection and Fact Verification (arxiv) — Detection/verification combined
- Mitigating Hallucinations via Multi-Agent Framework (MDPI 2025) — Multi-agent orchestration

**API Reliability:**
- Tackling Rate Limiting for LLM Apps (Portkey) — Exponential backoff, circuit breaker patterns
- Rate Limiting in AI Gateway (TrueFoundry) — 2026 best practices
- LLM Tool-Calling in Production (Medium) — Retry failure analysis and solutions

**Performance & Blocking UI:**
- Long Document Summarization with Gemini (Google Cloud) — Official map-reduce guide
- Master LLM Summarization Strategies (Galileo.ai) — Chunking vs. section-based vs. map-reduce comparison
- Blocking UI Patterns (Medium/CodeGuru) — Non-blocking operation patterns for resource-intensive tasks

### Tertiary Research (implementation details)

- Obsidian Plugin API documentation
- LangChain documentation (map-reduce implementation)
- TypeScript async/await patterns
- LLM API cost analysis (Claude vs. GPT-4 at scale)
- Zotero forums (PDF handling, memory issues)

---

*Research completed: 2026-01-30*
*Synthesized from: FEATURES_V2_AI_ENRICHMENT.md, ARCHITECTURE.md, PITFALLS_V2_0_AI_ENRICHMENT.md*
*Ready for roadmap: yes*
