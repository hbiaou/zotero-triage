# Phase 15: Content Extraction & Classification Pipeline - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase enables automatic content extraction from multiple evidence sources (PDFs, notes, video transcripts) and intelligent classification of items into domain-specific categories (Academic, Software, Farming, General) to enable template-based enrichment. Classification happens automatically with user override when confidence is low.

</domain>

<decisions>
## Implementation Decisions

### Video transcript handling
- **Supported platforms:** YouTube only for automatic extraction
- **Manual transcript option:** Allow users to manually paste transcripts for unsupported platforms
- **URL detection:** Check Zotero URL field only (not Extra field or other fields)
- **Automatic extraction:** Fetch transcripts automatically in background during Accept workflow (no user confirmation needed)
- **Failure handling:** When automatic extraction fails (no captions, API error, unsupported platform), prompt user with modal to manually paste transcript or skip enrichment

### Classification logic
- **Signal priority:** Item type first, then content-based classification
  - If item type is Article, Book, Thesis, Conference Paper, or Report → force Academic domain (hard override)
  - For other item types (Webpage, Video, etc.) → use title/tags/abstract for classification
- **Low confidence handling:** Always show override modal when classification confidence is below threshold (force user to pick domain)
- **No learning:** Classification logic is fixed, does not learn from user overrides (keep it simple)

### User override flow
- **Modal timing:** Show classification modal only when confidence is low (not on every Accept)
- **Modal content:** Display suggested domain only with dropdown to change ("Classified as Academic. Change if needed.")
- **Skip option:** Claude's discretion - decide based on UX flexibility vs simplicity
- **Post-enrichment re-classification:** Yes, provide re-classify command to change domain and re-enrich with different template after enrichment completes

### Metadata-only handling
- **Diagnostic note content:** Claude's discretion - write appropriate diagnostic content balancing helpfulness and clarity
- **Zotero linking:** Claude's discretion - decide based on technical feasibility and UX value (zotero://select protocol)
- **Retry behavior:** Auto-queue for retry - add to deferred queue when metadata-only item encountered (system retries when Zotero DB updated per Phase 18)
- **Tailored messaging:** Yes, different diagnostic note content based on what's missing (no PDF vs no PDF+notes vs video with no transcript)

### Claude's Discretion
- Exact classification algorithm implementation (weighted scoring, threshold values)
- Skip option in classification modal (allow backing out of Accept)
- Diagnostic note formatting and tone
- Zotero deep link implementation approach
- Confidence threshold value for triggering override modal

</decisions>

<specifics>
## Specific Ideas

- YouTube is primary use case for video transcripts, but users should be able to manually add transcripts for other platforms
- Classification should be conservative - when uncertain, ask the user rather than guessing
- Metadata-only items should provide clear guidance on what to do next (actionable, not just an error message)
- Re-classification capability is important for users who realize classification was wrong after seeing enriched output

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 15-content-extraction-&-classification-pipeline*
*Context gathered: 2026-01-31*
