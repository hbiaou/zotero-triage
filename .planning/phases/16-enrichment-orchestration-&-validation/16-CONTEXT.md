# Phase 16: Enrichment Orchestration & Validation - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Orchestrate the Accept workflow to transform stub notes into enriched literature notes by running classification, extraction, enrichment, and validation in a blocking pipeline with user progress feedback. Handle failures gracefully with stub note fallbacks and queue management. Batch enrichment, re-enrichment, and custom validation rules belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Progress feedback & timing
- Modal appearance timing: Claude's discretion (balance fast operations feeling instant vs providing feedback for slow ops)
- Progress granularity: Claude's discretion (4 major steps vs detailed substeps vs percentage-based)
- Long operation handling (30+ seconds): Claude's discretion (waiting, background option, or auto-background)
- Cancellation capability: Claude's discretion (always available, delayed availability, or no cancellation)

### Template population rules
- Missing evidence sections: Show "N/A" for missing sections (keep section headers with "N/A - insufficient evidence" placeholder)
- Content presentation style: Mixed approach (verbatim quotes for key claims/methods, paraphrasing for context and background)
- Conflicting evidence resolution: PDF takes priority (always prefer fulltext PDF evidence over notes/annotations when conflicts exist)
- Template flexibility: Hybrid - Core sections + optional extras (template sections are mandatory structure, but allow 1-2 additional sections for unique content)

### Validation failure handling
- Metadata inconsistency detection: Claude's discretion (block creation, warnings, or auto-correct)
- Low-confidence sections (< threshold): Omit entirely (only include content meeting confidence threshold, show "N/A" for low-confidence sections)
- Error surfacing timing: Claude's discretion (during enrichment blocking, after enrichment summary, or silent logging)
- Hallucination detection criteria: Claude's discretion (zero tolerance, reasonable inference allowed, or confidence-based)

### Error recovery strategy
- API timeout handling: Claude's discretion (immediate retry, stub + queue, or ask user)
- Extraction failure recovery: Claude's discretion (fallback to next evidence level, diagnostic note, or manual input)
- Stub note creation policy: Claude's discretion (always create, fail gracefully, or depends on failure type)
- Failure notifications: Notice with summary only (Obsidian notice with minimal interruption: "Enrichment failed - item queued for retry")

### Claude's Discretion
Areas where Claude has full flexibility during planning and implementation:
- Progress modal delay threshold and UX timing
- Progress update granularity and step breakdown
- Long operation timeout and background processing behavior
- Cancellation availability and timing
- Metadata validation failure handling (block, warn, or auto-correct)
- Error surfacing strategy (blocking, summary, or logging)
- Hallucination detection thresholds and criteria
- API timeout recovery approach (retry, queue, or user prompt)
- Extraction failure fallback strategy
- Stub note creation policy across failure types

</decisions>

<specifics>
## Specific Ideas

No specific product references or interaction patterns mentioned - open to standard async operation UX patterns and resilience best practices.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 16-enrichment-orchestration-&-validation*
*Context gathered: 2026-02-01*
