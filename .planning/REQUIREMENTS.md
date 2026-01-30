# Requirements: Zotero Triage

**Defined:** 2026-01-30
**Core Value:** Users can progressively process their Zotero backlog without overwhelm, ensuring every imported literature note meets quality standards.

## v2.0 Requirements: The Enrichment Engine

Requirements for AI-powered literature note enrichment. Each maps to roadmap phases.

### AI Service Layer (BYOK)

- [ ] **AI-01**: User can configure API keys for OpenAI provider with encrypted storage
- [ ] **AI-02**: User can configure API keys for Google provider with encrypted storage
- [ ] **AI-03**: User can configure API keys for Anthropic provider with encrypted storage
- [ ] **AI-04**: User can configure API keys for OpenRouter provider with encrypted storage
- [ ] **AI-05**: User can select one global model from configured providers for all enrichment operations
- [ ] **AI-06**: System implements rate limiting with exponential backoff for API calls (prevent quota violations)
- [ ] **AI-07**: System implements circuit breaker pattern for API failures (prevent cascade failures)
- [ ] **AI-08**: User can view token consumption statistics per enrichment operation
- [ ] **AI-09**: User can set budget alerts for API costs (warning threshold configurable)
- [ ] **AI-10**: System retries transient API failures with exponential backoff (3 attempts, then queue)

### Content Extraction & Evidence Hierarchy

- [ ] **EXTRACT-01**: System extracts PDF fulltext from Zotero fulltext cache (primary evidence source)
- [ ] **EXTRACT-02**: System extracts Zotero notes and highlights (secondary evidence source)
- [ ] **EXTRACT-03**: System extracts abstract from metadata (tertiary evidence source)
- [ ] **EXTRACT-04**: System enforces evidence hierarchy (PDF → Notes → Abstract, never metadata-only)
- [ ] **EXTRACT-05**: System queues metadata-only items for later enrichment (deferred queue)
- [ ] **EXTRACT-06**: System auto-fetches video transcripts from YouTube URLs
- [ ] **EXTRACT-07**: System auto-fetches video transcripts from Vimeo URLs
- [ ] **EXTRACT-08**: System detects evidence level and displays in note YAML frontmatter (FullText, Notes, Abstract, MetadataOnly)
- [ ] **EXTRACT-09**: System creates diagnostic note for metadata-only items (explains missing evidence, links to Zotero)
- [ ] **EXTRACT-10**: User can view deferred queue in dashboard (items waiting for evidence)
- [ ] **EXTRACT-11**: System retries deferred items when Zotero database updated (batch retry logic)

### Smart Classification & Template Selection

- [ ] **CLASSIFY-01**: System classifies item domain from title/tags/abstract (Academic, Software, Farming, General)
- [ ] **CLASSIFY-02**: System applies item type priority for structured types (Articles/Books/Theses → ACADEMIC)
- [ ] **CLASSIFY-03**: System applies domain override for unstructured types (Videos/Webpages use classification)
- [ ] **CLASSIFY-04**: System selects template based on item type + domain classification
- [ ] **CLASSIFY-05**: User can override suggested template before enrichment (confirmation modal)
- [ ] **CLASSIFY-06**: System provides 4 domain templates (Academic, Software, Farming, General)
- [ ] **CLASSIFY-07**: Academic template includes sections: Summary, Key Findings, Methods, Results, Limitations, Related Work
- [ ] **CLASSIFY-08**: Software template includes sections: Overview, Features, Architecture, API, Use Cases, Limitations
- [ ] **CLASSIFY-09**: Farming template includes sections: Practice, Context, Benefits, Implementation, Resources
- [ ] **CLASSIFY-10**: General template includes sections: Summary, Key Points, Takeaways, Applications

### Enrichment Pipeline & Orchestration

- [ ] **ENRICH-01**: System triggers blocking enrichment when user clicks Accept (10-30s operation)
- [ ] **ENRICH-02**: System shows progress modal with steps (Classification → Extraction → Enrichment → Validation)
- [ ] **ENRICH-03**: System updates progress percentage during enrichment (0% → 25% → 50% → 75% → 100%)
- [ ] **ENRICH-04**: System fills template sections based on extracted evidence only (never hallucinate)
- [ ] **ENRICH-05**: System marks template sections as "N/A" when no supporting evidence exists
- [ ] **ENRICH-06**: System preserves verbatim quotes from source text (author claims, methods, results)
- [ ] **ENRICH-07**: System validates enriched output for consistency (authors, year, title match metadata)
- [ ] **ENRICH-08**: System validates enriched output for hallucinations (claim-level validation against source)
- [ ] **ENRICH-09**: System flags low-confidence enrichments (confidence score < threshold)
- [ ] **ENRICH-10**: System corrects OCR/transcription errors when highly confident
- [ ] **ENRICH-11**: System handles enrichment failures gracefully (create stub note + queue retry)
- [ ] **ENRICH-12**: User can manually trigger enrichment on existing stub notes (command palette)
- [ ] **ENRICH-13**: System timeout for enrichment after 2 minutes (prevent UI freeze)

### YAML Frontmatter & Output Format

- [ ] **OUTPUT-01**: System generates YAML frontmatter with note_type field (always "literature-note")
- [ ] **OUTPUT-02**: System generates YAML frontmatter with zotero_item_type field (detected item type)
- [ ] **OUTPUT-03**: System generates YAML frontmatter with knowledge_domain field (classification result)
- [ ] **OUTPUT-04**: System generates YAML frontmatter with evidence_level field (FullText, Notes, Abstract, MetadataOnly)
- [ ] **OUTPUT-05**: System generates YAML frontmatter with template_used field (ACADEMIC, SOFTWARE, FARMING, GENERAL)
- [ ] **OUTPUT-06**: System generates YAML frontmatter with date_processed field (YYYY-MM-DD)
- [ ] **OUTPUT-07**: System generates YAML frontmatter with zotero_key field (if available)
- [ ] **OUTPUT-08**: System generates YAML frontmatter with doi field (if available)
- [ ] **OUTPUT-09**: System outputs Obsidian-compatible Markdown (headings, lists, tables, callouts, wikilinks)
- [ ] **OUTPUT-10**: System appends 6-8 tags on single line at end of note
- [ ] **OUTPUT-11**: System never wraps output in code blocks (direct Markdown)
- [ ] **OUTPUT-12**: System never uses emojis in enriched notes

### Long Content Strategy (Map-Reduce)

- [ ] **LONG-01**: System detects long content when extracted text > 50,000 tokens
- [ ] **LONG-02**: System extracts chapter boundaries from PDF bookmarks/TOC (if available)
- [ ] **LONG-03**: System falls back to fixed-window chunking (~20k tokens) when no TOC
- [ ] **LONG-04**: System implements map phase (summarize each chapter independently)
- [ ] **LONG-05**: System preserves chapter-level specificity in summaries (no generic abstracts)
- [ ] **LONG-06**: System implements reduce phase (generate final note from chapter summaries)
- [ ] **LONG-07**: System embeds chapter summaries in final literature note (not separate notes)
- [ ] **LONG-08**: System shows progress for map phase (Chapter 1/N → Chapter 2/N → ...)

### Registry & State Management

- [ ] **REGISTRY-01**: System adds "enriched" state to registry (item successfully enriched)
- [ ] **REGISTRY-02**: System adds "enrichment_pending" state to registry (queued for retry)
- [ ] **REGISTRY-03**: System adds "enrichment_failed" state to registry (permanent failure after retries)
- [ ] **REGISTRY-04**: System tracks enrichment metadata (model used, token count, cost, timestamp)
- [ ] **REGISTRY-05**: System persists deferred queue to disk (survives plugin reload)
- [ ] **REGISTRY-06**: System detects PDF changes via hash (re-enrich if PDF updated in Zotero)

### Settings & Configuration

- [ ] **SETTINGS-01**: User can access AI Service settings tab (provider selection, API keys, model)
- [ ] **SETTINGS-02**: User can access Enrichment settings tab (templates, timeouts, retries, budget)
- [ ] **SETTINGS-03**: User can enable/disable automatic enrichment (toggle for Accept flow)
- [ ] **SETTINGS-04**: User can configure enrichment timeout (default 2 minutes, max 5 minutes)
- [ ] **SETTINGS-05**: User can configure retry attempts (default 3, max 5)
- [ ] **SETTINGS-06**: User can configure confidence threshold for flagging (default 0.5, range 0.0-1.0)
- [ ] **SETTINGS-07**: User can view enrichment statistics dashboard (total enriched, costs, failures)

## v2.1+ Requirements (Deferred)

Future enhancements tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Separate chapter notes for books (linked to parent literature note)
- **ADV-02**: Per-operation model selection (fast model for classification, powerful for enrichment)
- **ADV-03**: Hybrid PDF extraction (pdf-parse fallback when Zotero cache unavailable)
- **ADV-04**: Custom user-defined templates (editable template system)
- **ADV-05**: Batch re-enrichment command (re-enrich all notes with updated model)
- **ADV-06**: Semantic search integration (RAG for finding related notes)
- **ADV-07**: Atomic note extraction (break papers into concept-level notes)

## Out of Scope

Explicitly excluded features documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Bi-directional Zotero syncing | Violates read-only constraint; user loses control; data corruption risk |
| Cloud-hosted enrichment service | Violates local-first architecture; BYOK is mandatory |
| Automatic acceptance without enrichment | Defeats core value (quality over quantity) |
| Real-time collaborative enrichment | Out of scope for personal research tool |
| Custom LLM fine-tuning | Too complex; prompt engineering + validation sufficient |
| Bulk "enrich all" without triage | Defeats progressive processing philosophy |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AI-01 to AI-10 | TBD | Pending |
| EXTRACT-01 to EXTRACT-11 | TBD | Pending |
| CLASSIFY-01 to CLASSIFY-10 | TBD | Pending |
| ENRICH-01 to ENRICH-13 | TBD | Pending |
| OUTPUT-01 to OUTPUT-12 | TBD | Pending |
| LONG-01 to LONG-08 | TBD | Pending |
| REGISTRY-01 to REGISTRY-06 | TBD | Pending |
| SETTINGS-01 to SETTINGS-07 | TBD | Pending |

**Coverage:**
- v2.0 requirements: 69 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 69 ⚠️

---
*Requirements defined: 2026-01-30*
*Last updated: 2026-01-30 after initial definition*
