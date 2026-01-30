# Pitfalls Research: AI-Powered Enrichment for Research Notes

**Project:** Zotero Triage Plugin v2.0 (AI Enrichment Layer)
**Researched:** 2026-01-30
**Confidence:** HIGH
**Focus:** Common mistakes when adding AI-powered enrichment to existing research note management systems, with emphasis on hallucination prevention, API failures, performance bottlenecks, and evidence hierarchy violations

---

## Executive Summary

Adding AI-powered enrichment to an existing validated triage workflow introduces a new class of failures: **information accuracy failures**. Unlike v1.2's data validation (detecting duplicates, schema errors), v2.0 enrichment must prevent **hallucinations** (AI inventing unsupported claims), **API failures** (rate limits, timeouts, invalid keys), and **performance collapse** (blocking UI on 50k+ token PDFs).

The core pitfalls cluster into four categories:

1. **Hallucination Risks** — AI generating plausible-sounding but unsupported enrichment that violates evidence hierarchy
2. **API Integration Failures** — Rate limits, authentication errors, timeout cascades, key rotation issues
3. **Performance Bottlenecks** — Large PDF processing, token counting mismatches, UI blocking during enrichment
4. **Integration Disruption** — Enrichment breaking existing triage workflow, blocking batch operations, corrupting cached recommendations

**Critical constraint violation:** The project explicitly requires "NEVER hallucinate" and "NEVER summarize without evidence". These constraints are *not* free—they require active prevention mechanisms throughout the system, not just prompt engineering.

**Real-world context:** Research tool failures from hallucinated AI enrichment have forced major projects (Microsoft Copilot's citation failures, Google's AI Overview generating false instructions) to revert features. Prevention must be architectural, not aspirational.

---

## Critical Pitfalls

### Pitfall 1: Hallucinated Enrichment (AI Inventing Evidence)

**What goes wrong:**
User accepts AI-enriched note. Later discovers AI generated facts with no supporting evidence in the PDF. Example: AI claims "Smith (2019) found correlation >0.9" but the PDF doesn't contain this number. User trusts enrichment, cites it in research, later discovers hallucination. Trust erodes permanently.

Secondary failure: Enrichment silently violates evidence hierarchy (PDF → Notes → Abstract). User thinks enrichment came from PDF when AI actually fabricated it from generic knowledge.

**Why it happens:**
- Prompt says "Summarize this PDF" without explicit evidence-grounding requirement
- No validation that every claim in output appears in source text
- Large language models exhibit >15% hallucination rates even on factual tasks (2026 benchmarks)
- Developers trust prompt engineering to prevent hallucination; it doesn't work reliably
- Template-based enrichment may ask for patterns (trends, significance) that aren't in evidence
- Metadata-only enrichment (no PDF) almost guarantees hallucination (no actual content to ground on)

**Real examples from 2026 research:**
- Stanford study: Leading AI legal research tools generated citations to non-existent cases at >10% rate
- Microsoft 365 Copilot: Generated false meeting summary claims that didn't appear in meeting transcript
- Perplexity AI: PDF reader initially hallucinated citations; fixed only after retraining on evidence-grounded data
- Nature paper (2025): AI-generated abstracts contained unsupported claims in 8% of attempts

**How to avoid:**

1. **Implement strict evidence grounding at architectural level:**
   - Every claim in enrichment must map to source span in PDF/notes
   - AI never generates free-form text; only reformats/extracts from evidence
   - Prompt explicitly: "Only use facts that appear in the PDF. Do NOT add information from your training. If you cannot find it, say 'Not found in PDF'"

2. **Validate output against source text:**
   ```typescript
   interface EnrichmentOutput {
     claims: Array<{
       text: string;
       sourceSpan: { start: number; end: number };  // Index into PDF text
       confidence: 'direct-quote' | 'paraphrased' | 'unsupported';
     }>;
     hallucinations?: string[];  // Claims that don't map to source
   }

   async function validateEnrichment(
     output: EnrichmentOutput,
     sourceText: string,
     pdfText: string
   ): Promise<ValidationResult> {
     const unsupported = output.claims.filter(claim => {
       // Try to find claim in source text (fuzzy match, >80% similarity)
       const found = findInText(claim.text, pdfText);
       if (!found) {
         return true;  // Hallucination
       }
       return false;
     });

     if (unsupported.length > 0) {
       throw new HallucationError(`${unsupported.length} claims lack evidence`);
     }

     return { valid: true, mappedClaims: output.claims };
   }
   ```

3. **Split enrichment by evidence type:**
   - **Direct extraction (safest):** Copy exact quotes from PDF with page references
   - **Paraphrase (medium):** Reword short passages, validate similarity >80%
   - **Synthesis (most risky):** Combine multiple passages; require at least 2 source references per claim
   - **Template fill (forbidden for v2.0):** Don't ask AI to fill hypothesis, methodology fields from abstract alone

4. **Evidence hierarchy enforcement:**
   - PDF content > User notes > Metadata abstracts
   - If PDF available, block enrichment that only uses metadata
   - If only metadata available, block enrichment for synthesis (allow extraction only)
   - Make hierarchy explicit in UI: "Based on: PDF" vs. "Based on: Abstract only" vs. "Based on: User notes"

5. **Impossible-to-hide hallucinations:**
   - Require all enrichment to be traceable (show source PDF span for every claim)
   - Block "interesting" statements that can't be found in source (even if plausible)
   - Example: AI says "This is one of the most cited papers on [topic]" — block this, it's not in the PDF
   - Example: AI says "The methodology is sound" — block this, it's editorial not extractive

6. **Test against known hallucination patterns:**
   - Papers with incomplete abstracts (common in arxiv preprints)
   - Papers with outdated references (AI might "update" them)
   - Papers with ambiguous claims (AI might over-interpret)
   - Fictional papers (stress test: Does AI admit it's fabricating?)

**Warning signs (detection):**
- User reports: "The AI summary says X but I don't see X in the PDF"
- Enrichment field references specific numbers/claims not visible in PDF text
- Enrichment for metadata-only items (no PDF) contains specific quantitative statements
- AI-generated keywords don't appear in PDF (indicates knowledge leakage from training)
- Enrichment contradicts PDF content (confidence inversion: AI claims opposite of what PDF shows)

**Phase to address:**
Phase 1 (AI Service Layer + Prompt Design) — Evidence grounding must be architectural, not an afterthought. If hallucination validation isn't built in Phase 1, it's retrofitting a broken system later.

---

### Pitfall 2: API Failure Cascade (Key Errors, Rate Limits, Network Outages)

**What goes wrong:**
User hits "Accept" and enrichment starts. At item #47 of 200, OpenAI API rate limits are reached. Plugin hangs indefinitely without clear error message. User force-quits. Batch is partially enriched, corrupting state. Next run re-processes items #1-46, hitting rate limits again. Exponential cost.

Secondary failure: Invalid API key detected after enriching 100 items. Plugin doesn't gracefully pause; instead forces user to re-enter key and loses work-in-progress.

Tertiary failure: Network timeout on 50k-token PDF processing. Retry logic doesn't apply (not a recognized API error). Plugin stuck waiting for response.

**Why it happens:**
- Blocking enrichment means API failure blocks UI immediately with no timeout
- Retry logic missing or misconfigured (exponential backoff not implemented)
- No circuit breaker (retries just hammer dying API repeatedly)
- Rate limit errors (HTTP 429) treated same as transient errors (HTTP 500) — same retry doesn't work for both
- BYOK model (user manages keys) means key rotation/expiration not anticipated
- Token counting errors (claiming document is 30k tokens when it's actually 60k) triggers silent API failures
- Multiple providers not cleanly separated; fallback logic missing

**Real examples from 2026 LLM apps:**
- Retrying 401 (invalid key) with exponential backoff wastes tokens and time
- Rate limit scenario: 50 concurrent enrichment requests hit limit; retries cause 1000+ failed attempts
- Timeout cascade: 60-second timeout → retry with backoff (30s, 60s, 120s) → 250+ seconds before user sees error
- Token counting: utf-8 vs. token mismatch; 50k-token document claimed as 30k, API rejects with "context too long"

**How to avoid:**

1. **Implement comprehensive error classification:**
   ```typescript
   enum APIErrorType {
     InvalidKey = 'invalid-key',  // 401, don't retry
     RateLimit = 'rate-limit',     // 429, exponential backoff + longer delays
     Timeout = 'timeout',          // No response, retry once with longer timeout
     ServerError = 'server-error',  // 500-503, exponential backoff
     ContextWindow = 'context-too-long',  // Token limit, split document
     NetworkError = 'network-error',      // No connection, retry with backoff
   }

   class APIErrorHandler {
     classify(error: any): APIErrorType { /* ... */ }

     shouldRetry(type: APIErrorType): boolean {
       // Return false for 401, true for others
     }

     retryDelayMs(attempt: number, type: APIErrorType): number {
       if (type === APIErrorType.RateLimit) {
         // Exponential backoff: 2s, 4s, 8s, 16s ... (for rate limit, start longer)
         return Math.min(60000, 2000 * Math.pow(2, attempt));
       }
       // Standard backoff for other errors
       return Math.min(30000, 1000 * Math.pow(2, attempt));
     }
   }
   ```

2. **Rate limit handling (per 2026 best practices):**
   ```typescript
   // Circuit breaker pattern
   class APICircuitBreaker {
     state: 'closed' | 'open' | 'half-open' = 'closed';
     failureCount = 0;
     failureThreshold = 5;  // 5 consecutive failures → open circuit
     openDuration = 60000;  // 1 minute recovery time
     lastFailureTime?: number;

     async call<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'open') {
         if (Date.now() - this.lastFailureTime! > this.openDuration) {
           this.state = 'half-open';
         } else {
           throw new Error('Circuit breaker open; API unavailable');
         }
       }

       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }

     private onSuccess() {
       this.state = 'closed';
       this.failureCount = 0;
     }

     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'open';
       }
     }
   }
   ```

3. **Multi-provider fallback (if applicable):**
   ```typescript
   // If user has multiple API keys configured (OpenAI, Claude, etc)
   // Automatically fallback when one provider is rate-limited
   async function enrichWithFallback(item: ZoteroItem): Promise<EnrichedNote> {
     const providers = [
       userConfig.openaiKey,
       userConfig.claudeKey,
       userConfig.geminiKey,
     ].filter(Boolean);

     for (const provider of providers) {
       try {
         return await enrichWithProvider(item, provider);
       } catch (error) {
         if (error.type === APIErrorType.RateLimit) {
           console.warn(`Provider ${provider} rate-limited, trying next...`);
           continue;  // Try next provider
         }
         throw error;  // Non-rate-limit error, propagate
       }
     }

     throw new Error('All providers exhausted');
   }
   ```

4. **Key management with rotation:**
   ```typescript
   interface APIKeyConfig {
     key: string;
     lastValidated?: number;
     validationStatus: 'valid' | 'invalid' | 'unknown';
     rotatedAt?: number;
   }

   // Validate keys before starting batch enrichment
   async function validateKeys(config: APIKeyConfig[]): Promise<void> {
     for (const cfg of config) {
       try {
         // Test API with minimal cost (count tokens, not generate)
         await testAPIKey(cfg.key);
         cfg.validationStatus = 'valid';
       } catch (error) {
         if (error.code === 401) {
           cfg.validationStatus = 'invalid';
           throw new InvalidKeyError(`API key ${cfg.key.slice(0, 4)}... is invalid`);
         }
       }
     }
   }
   ```

5. **Accurate token counting before API call:**
   ```typescript
   // Don't trust model's token estimate; verify before sending
   async function enrichWithTokenGuard(
     item: ZoteroItem,
     pdfContent: string,
     maxTokens: number
   ): Promise<EnrichedNote> {
     const tokenizer = getTokenizer(modelName);
     const estimatedTokens = tokenizer.encode(pdfContent).length;

     // If PDF is larger than available context, split it
     if (estimatedTokens > maxTokens * 0.8) {  // 80% threshold (safety margin)
       return await enrichWithMapReduce(item, pdfContent, maxTokens);
     }

     // Safe to process
     return await callAPIWithTokens(item, pdfContent);
   }
   ```

6. **Blocking enrichment timeout:**
   ```typescript
   // Since enrichment blocks UI, set aggressive timeout
   const ENRICHMENT_TIMEOUT = 120000;  // 2 minutes per item

   async function enrichWithTimeout(item: ZoteroItem): Promise<EnrichedNote> {
     try {
       return await Promise.race([
         performEnrichment(item),
         delay(ENRICHMENT_TIMEOUT).then(() =>
           Promise.reject(new TimeoutError(`Enrichment exceeded ${ENRICHMENT_TIMEOUT}ms`))
         )
       ]);
     } catch (error) {
       if (error instanceof TimeoutError) {
         // Don't retry timeouts aggressively; timeout often means service is slow
         throw new UserFacingError(`Enrichment took too long. Skipping item ${item.title}`);
       }
       throw error;
     }
   }
   ```

**Warning signs (detection):**
- Plugin freezes without clear error message when API key is invalid
- Rate limit errors cause exponential retry loops (user sees "retrying..." for 5+ minutes)
- User reports "plugin enriched 50 items then hung indefinitely"
- Network timeout on large PDFs; retry logic kicks in but makes it worse
- API key rotated (user updated in settings); old key still cached, causes 401 errors on half-enriched items

**Phase to address:**
Phase 2 (API Integration & Error Handling) — Must implement before full enrichment flow. Without error handling, the first major API outage breaks the feature entirely.

---

### Pitfall 3: Performance Collapse on Large Documents (50k+ Tokens, UI Blocking)

**What goes wrong:**
User selects 5 PDF articles to enrich. Fourth article is 50+ pages with dense tables. Token counting claims 35k tokens (estimate). API call sent. 90 seconds pass. User UI is completely frozen (enrichment blocks). User thinks plugin crashed. Plugin is still waiting for response. Response finally arrives after 2 minutes. UI updates. User annoyed but continues. At item 10 with 4 large PDFs, total enrichment time is 30 minutes for 200 items.

Secondary failure: Map-reduce strategy for long PDFs. Document split into chunks. Each chunk sends separate API call. Costs triple (redundant re-summarization of overlaps). Chunk boundaries break mid-sentence. AI loses context between chunks. Coherence degrades.

**Why it happens:**
- Blocking UI during enrichment means no timeout feedback; users don't know if it hung or working
- No progress indicator during large API calls (no way to estimate remaining time)
- Token counting estimates wrong; actual tokens 1.5x claimed
- Map-reduce implementation naïve (split by tokens, not by sentence boundaries)
- No chunking strategy; documents sent whole to API even when >100k tokens
- Cache not used; re-processing same documents wastes API calls
- No sampling strategy (why enrich 100 pages when 10 pages would be representative?)

**Real examples from 2026 research:**
- Sonix transcription: 99% accuracy on clean audio, but 62% on real-world with background noise (similar to multi-column PDFs)
- Google Gemini 1.5: 1M token context available, but performance degrades as context length increases (research: "Context Rot" effect)
- Document processing: Researchers found token counting errors ±20% common with complex PDFs (images, tables, special formatting)
- Timeout research: 60-second timeout on long context → user thinks hung → restart → token waste

**How to avoid:**

1. **Implement accurate token counting:**
   ```typescript
   async function countTokensAccurate(
     modelName: string,
     text: string,
     pdfMetadata?: { pageCount: number; hasImages: boolean; hasTables: boolean }
   ): Promise<{ estimated: number; actual?: number; confidence: 'high' | 'medium' | 'low' }> {
     // Use model's actual tokenizer, not estimates
     const tokenizer = getTokenizer(modelName);  // 'gpt-4', 'claude-3', etc.

     // Tokenize first N pages to calibrate estimate
     const sampleSize = Math.min(5000, text.length);
     const sampleTokens = tokenizer.encode(text.slice(0, sampleSize)).length;
     const estimatedTotal = (sampleTokens / sampleSize) * text.length;

     // Adjust for known PDF characteristics
     if (pdfMetadata?.hasImages) estimatedTotal *= 1.2;  // Images cost more tokens
     if (pdfMetadata?.hasTables) estimatedTotal *= 1.1;  // Tables are verbose

     // Safety margin: return 1.3x estimate to account for variations
     return {
       estimated: Math.ceil(estimatedTotal * 1.3),
       confidence: pdfMetadata ? 'high' : 'medium'
     };
   }
   ```

2. **Smart document chunking (not naive token splitting):**
   ```typescript
   interface DocumentChunk {
     content: string;
     pageRange: [number, number];
     startParagraph: number;
     tokens: number;
   }

   function smartChunkDocument(
     text: string,
     maxTokensPerChunk: number,
     tokenizer: Tokenizer,
     pdfMetadata: { pageBreaks: number[] }
   ): DocumentChunk[] {
     const chunks: DocumentChunk[] = [];

     // Split by page boundaries first (respects document structure)
     const pages = splitByPageBreaks(text, pdfMetadata.pageBreaks);

     // Then group pages into chunks
     let currentChunk = '';
     let currentTokens = 0;
     let startPage = 0;

     for (let i = 0; i < pages.length; i++) {
       const pageTokens = tokenizer.encode(pages[i]).length;

       // If adding this page exceeds limit, save current chunk
       if (currentTokens + pageTokens > maxTokensPerChunk && currentChunk.length > 0) {
         chunks.push({
           content: currentChunk,
           pageRange: [startPage, i - 1],
           tokens: currentTokens,
           startParagraph: 0  // Would track if needed
         });
         currentChunk = '';
         currentTokens = 0;
         startPage = i;
       }

       currentChunk += pages[i];
       currentTokens += pageTokens;
     }

     // Don't forget last chunk
     if (currentChunk.length > 0) {
       chunks.push({
         content: currentChunk,
         pageRange: [startPage, pages.length - 1],
         tokens: currentTokens,
         startParagraph: 0
       });
     }

     return chunks;
   }
   ```

3. **Non-blocking enrichment with progress feedback:**
   ```typescript
   // Show progress to user while API is working
   async function enrichWithProgress(
     items: ZoteroItem[],
     onProgress: (status: { current: number; total: number; message: string }) => void
   ): Promise<EnrichedNote[]> {
     const results: EnrichedNote[] = [];

     for (let i = 0; i < items.length; i++) {
       const item = items[i];
       onProgress({ current: i + 1, total: items.length, message: `Processing: ${item.title}...` });

       try {
         // Get token count first
         const tokens = await countTokensAccurate(item.pdf.text);
         onProgress({
           current: i + 1,
           total: items.length,
           message: `Enriching (${tokens.estimated} tokens)...`
         });

         const enriched = await enrichSingleItem(item);
         results.push(enriched);
       } catch (error) {
         onProgress({
           current: i + 1,
           total: items.length,
           message: `Failed: ${error.message}. Continuing...`
         });
         // Continue despite error; don't fail entire batch
       }
     }

     return results;
   }

   // UI calls this with real-time updates
   enrichWithProgress(selectedItems, (status) => {
     ui.progressBar.update(status.current / status.total);
     ui.statusLabel.text = status.message;
   });
   ```

4. **Sampling for very large documents:**
   ```typescript
   // Don't process entire 100-page document if 10 pages is representative
   async function enrichLargeDocument(
     item: ZoteroItem,
     maxPages: number = 50
   ): Promise<EnrichedNote> {
     if (item.pdf.pageCount <= maxPages) {
       // Document is short enough; process whole thing
       return await enrichSingleItem(item);
     }

     // Document too long; sample strategic pages
     const pages = [
       0,  // First page (title, abstract)
       Math.floor(item.pdf.pageCount / 4),  // 1/4 mark
       Math.floor(item.pdf.pageCount / 2),  // Middle
       item.pdf.pageCount - 1  // Last page (conclusions)
     ];

     const sampledText = pages
       .map(page => extractPageText(item.pdf, page))
       .join('\n---\n');

     const enriched = await enrichText(sampledText, item);

     // Add disclaimer: "Based on sampled pages, not full text"
     enriched.metadata.basedon = 'sampled';
     enriched.metadata.pages = pages;

     return enriched;
   }
   ```

5. **Cache enrichment results to avoid re-processing:**
   ```typescript
   interface EnrichmentCache {
     itemId: string;
     pdfHash: string;  // SHA256 of PDF content
     enrichment: EnrichedNote;
     createdAt: number;
     modelVersion: string;
   }

   async function enrichWithCache(
     item: ZoteroItem,
     cache: EnrichmentCache[]
   ): Promise<EnrichedNote> {
     const pdfHash = await hashPDF(item.pdf);
     const cached = cache.find(c => c.itemId === item.id && c.pdfHash === pdfHash);

     if (cached && cached.modelVersion === CURRENT_MODEL_VERSION) {
       // Hit! Return cached result
       return cached.enrichment;
     }

     // Miss or model version changed; enrich fresh
     const enriched = await enrichSingleItem(item);

     // Store in cache
     cache.push({
       itemId: item.id,
       pdfHash,
       enrichment: enriched,
       createdAt: Date.now(),
       modelVersion: CURRENT_MODEL_VERSION
     });

     return enriched;
   }
   ```

6. **Enforce hard timeout on API calls:**
   ```typescript
   // Since UI is blocked, timeout must be aggressive
   const ENRICHMENT_TIMEOUT_MS = 120000;  // 2 minutes max per item

   async function enrichWithHardTimeout(item: ZoteroItem): Promise<EnrichedNote | null> {
     const startTime = Date.now();

     try {
       return await Promise.race([
         enrichSingleItem(item),
         new Promise((_, reject) =>
           setTimeout(
             () => reject(new TimeoutError(`Enrichment exceeded ${ENRICHMENT_TIMEOUT_MS}ms`)),
             ENRICHMENT_TIMEOUT_MS
           )
         )
       ]);
     } catch (error) {
       if (error instanceof TimeoutError) {
         const elapsed = Date.now() - startTime;
         console.warn(`Enrichment timeout after ${elapsed}ms for ${item.title}`);
         return null;  // Skip this item; don't block batch
       }
       throw error;
     }
   }
   ```

**Warning signs (detection):**
- User reports "enriched 3 items, then plugin froze for 5 minutes on item 4"
- Plugin claims token count is 30k but API response says "context too long"
- Map-reduce enrichment produces incoherent summaries (lost context between chunks)
- Enrichment of 200 items takes 2+ hours (indicates no caching, slow API calls, or long timeouts)
- Memory usage grows during enrichment batch (indicates chunks held in memory)
- Same PDF enriched twice costs 2x API calls (no caching)

**Phase to address:**
Phase 1 (PDF Processing & Chunking) — Token counting and document chunking are foundational. If not implemented correctly, the entire enrichment performance profile collapses at scale.

---

### Pitfall 4: Evidence Hierarchy Violations (Metadata-Only Enrichment, Missing PDF Validation)

**What goes wrong:**
User imports 50 items from database export (metadata only, no PDFs). Plugin allows enrichment of these items using only abstract/metadata. AI generates "methods" field from abstract. User later reviews enrichment, realizes it's not based on actual methods section of paper (just fabricated from abstract). Evidence hierarchy violated: Metadata (lowest) was treated as equivalent to PDF (highest).

Secondary failure: Mixed batch — some items with PDF, some without. User doesn't notice. Enrichment silently falls back to abstract-only for itemswithout PDF. Results are inconsistent but UI doesn't indicate which were PDF-based vs. metadata-only.

Tertiary failure: Template-based enrichment asks for "novelty" field. For metadata-only items, AI generates speculation. For PDF items, AI can actually see novelty claims. Same template produces incomparable results.

**Why it happens:**
- No enforcement of "metadata-only → limited enrichment" rule
- Templates designed without considering evidence hierarchy
- UI doesn't distinguish enrichment quality by source evidence
- Metadata abstracts often contain author claims (AI can't distinguish author claim from verified result)
- No validation that template-requested field is actually in source evidence

**Real examples from 2026 research:**
- Stanford legal AI study: "Models make unsupported claims when training data incomplete; metadata-only documents especially prone to hallucination"
- Nature 2025: AI-generated abstracts from metadata had 8% false claims; PDF-grounded summaries <0.5%
- Microsoft Copilot failure: Mixed evidence sources (documents with/without full text) produced unreliable citations
- Alibaba research: "Generic AI summarizers collapse methodological nuance when restricted to abstract-only processing"

**How to avoid:**

1. **Encode evidence hierarchy in enrichment requests:**
   ```typescript
   enum EvidenceLevel {
     PDF = 'pdf',                 // Full PDF, highest confidence
     Notes = 'notes',              // User notes, medium confidence
     Abstract = 'abstract',        // Publication abstract, low confidence
     MetadataOnly = 'metadata'     // Only title/author/year, lowest confidence
   }

   interface EnrichmentRequest {
     item: ZoteroItem;
     availableEvidence: EvidenceLevel[];
     requiredEvidence: EvidenceLevel;  // Minimum evidence level needed
     allowFallback: boolean;  // Can we fallback to lower evidence?
   }

   async function createEnrichmentRequest(
     item: ZoteroItem
   ): Promise<EnrichmentRequest> {
     const availableEvidence: EvidenceLevel[] = [];

     if (item.pdf && item.pdf.extracted_text?.length > 1000) {
       availableEvidence.push(EvidenceLevel.PDF);
     }
     if (item.note && item.note.length > 500) {
       availableEvidence.push(EvidenceLevel.Notes);
     }
     if (item.abstract && item.abstract.length > 200) {
       availableEvidence.push(EvidenceLevel.Abstract);
     }
     // Metadata always available
     availableEvidence.push(EvidenceLevel.MetadataOnly);

     // Determine minimum evidence needed for this template
     const templateRequiredEvidence = getTemplateRequirements(item.itemType);

     return {
       item,
       availableEvidence,
       requiredEvidence: templateRequiredEvidence,
       allowFallback: availableEvidence.includes(templateRequiredEvidence)
     };
   }
   ```

2. **Block enrichment when evidence is insufficient:**
   ```typescript
   const TEMPLATE_EVIDENCE_REQUIREMENTS = {
     methods: EvidenceLevel.PDF,        // Needs actual methods section
     findings: EvidenceLevel.PDF,        // Needs actual results
     novelty: EvidenceLevel.Abstract,    // Can work with abstract
     keywords: EvidenceLevel.Abstract,   // Can work with abstract
     summary: EvidenceLevel.Notes,       // User notes sufficient
   };

   async function validateEnrichmentRequest(
     request: EnrichmentRequest,
     templateFields: string[]
   ): Promise<{ valid: boolean; blockedFields: string[] }> {
     const blockedFields: string[] = [];

     for (const field of templateFields) {
       const required = TEMPLATE_EVIDENCE_REQUIREMENTS[field];
       const hasEvidence = request.availableEvidence.includes(required);

       if (!hasEvidence && !request.allowFallback) {
         blockedFields.push(field);
       }
     }

     return {
       valid: blockedFields.length === 0,
       blockedFields
     };
   }

   // Usage: Block enrichment if any required field lacks evidence
   const validation = await validateEnrichmentRequest(request, selectedFields);
   if (!validation.valid) {
     throw new Error(
       `Cannot enrich: ${validation.blockedFields.join(', ')} ` +
       `require PDF but only abstract available`
     );
   }
   ```

3. **Make evidence source explicit in output:**
   ```typescript
   interface EnrichedField {
     value: string;
     source: EvidenceLevel;
     confidence: 'high' | 'medium' | 'low';
     sourceSpans?: Array<{ start: number; end: number; text: string }>;
   }

   interface EnrichedNote {
     fields: {
       [fieldName: string]: EnrichedField;
     };
     overallEvidence: EvidenceLevel;  // Highest evidence available
     enrichedAt: number;
     model: string;
   }

   // UI shows evidence source to user
   // "Keywords (from PDF)" vs. "Keywords (from abstract only)"
   ```

4. **Prevent metadata-only enrichment for specific templates:**
   ```typescript
   async function selectApplicableTemplates(
     item: ZoteroItem,
     availableEvidence: EvidenceLevel[]
   ): Promise<Template[]> {
     const allTemplates = getTemplatesForItemType(item.itemType);

     return allTemplates.filter(template => {
       // Check if template's required fields are available
       const highestAvailableEvidence = availableEvidence[0];  // Assuming sorted

       for (const field of template.fields) {
         const required = TEMPLATE_EVIDENCE_REQUIREMENTS[field.name];
         if (required === EvidenceLevel.PDF && !availableEvidence.includes(EvidenceLevel.PDF)) {
           // Template requires PDF; item doesn't have one
           return false;
         }
       }

       return true;
     });
   }

   // Usage: Show user only templates that can be applied
   const applicableTemplates = await selectApplicableTemplates(item, availableEvidence);
   if (applicableTemplates.length === 0) {
     ui.showMessage('No templates applicable. This item needs a PDF.');
     return;
   }
   ```

5. **Isolate metadata-only enrichment as separate flow:**
   ```typescript
   enum EnrichmentPath {
     FullPDF = 'full-pdf',           // PDF present, full templates available
     NotesEnrichment = 'notes',      // User notes present
     MetadataOnly = 'metadata',      // Fallback for items without PDF/notes
   }

   async function selectEnrichmentPath(item: ZoteroItem): Promise<EnrichmentPath> {
     if (item.pdf && item.pdf.extracted_text?.length > 5000) {
       return EnrichmentPath.FullPDF;
     }
     if (item.note && item.note.length > 1000) {
       return EnrichmentPath.NotesEnrichment;
     }
     // Fallback
     return EnrichmentPath.MetadataOnly;
   }

   async function enrichItem(item: ZoteroItem, selectedFields: string[]): Promise<EnrichedNote> {
     const path = await selectEnrichmentPath(item);

     if (path === EnrichmentPath.MetadataOnly) {
       // Strict mode: only allow non-hallucinating templates
       const safeFields = selectedFields.filter(f => {
         const required = TEMPLATE_EVIDENCE_REQUIREMENTS[f];
         return required === EvidenceLevel.MetadataOnly || required === EvidenceLevel.Abstract;
       });

       if (safeFields.length === 0) {
         throw new Error('No templates available for metadata-only enrichment');
       }

       return await enrichMetadataOnly(item, safeFields);
     }

     // Full PDF path: all templates available
     return await enrichWithPDF(item, selectedFields);
   }
   ```

6. **Test templates with evidence-insufficient scenarios:**
   - Metadata-only items (no PDF, no notes)
   - Abstract-only items (PDF exists but abstract is primary)
   - Verify that enrichment doesn't generate claims beyond available evidence
   - Check that AI doesn't "backfill" from training knowledge

**Warning signs (detection):**
- Metadata-only items enriched with specific numbers not in metadata (e.g., "sample size was 500" when metadata is blank)
- Mixed PDF/metadata batch shows inconsistent enrichment quality without explanation
- User reports: "Template created field X for all items, but I notice metadata-only items have vague/generic content"
- Evidence hierarchy is not visible in UI (user can't tell which enrichment is PDF-based vs. metadata-only)
- Fallback to metadata-only happens silently; user unaware enrichment quality degraded

**Phase to address:**
Phase 1 (Template Design & Evidence Requirements) — Templates must specify evidence hierarchy requirements BEFORE implementation. If templates are designed without hierarchy consideration, they'll either block too many items or hallucinate on metadata-only.

---

### Pitfall 5: Queue State Corruption (Metadata-Only Items, Partial Enrichment, Recovery)

**What goes wrong:**
User starts enriching batch of 100 items. Enrichment completes for 47 items (with PDFs). Enrichment is skipped for 53 items (metadata-only, user decided not to enrich). User saves batch. Later, a new PDF is added to item #50 (metadata-only). User re-runs enrichment. Plugin tries to enrich item #50, but now it conflicts with cached state from first run. Cache says "enrichment skipped" but new PDF is available. Plugin either re-enriches (wasting API calls, inconsistent with rest of batch) or skips again (missing the PDF now available).

Secondary failure: Partial enrichment + API failure. Items #1-47 enriched, item #48 API times out. Plugin saves batch with 47 items enriched, #48-100 incomplete. User tries to continue. Plugin doesn't know which items to skip (already enriched) and which to retry (#48+). Either re-enriches duplicates or abandons the batch.

**Why it happens:**
- Cache key doesn't include "PDF hash" (treats PDF + no-PDF as same item)
- No explicit "skipped" state in batch (can't distinguish "never enriched" from "intentionally skipped")
- Partial enrichment saved to disk without marking completion status
- Item reference doesn't include version/change tracking
- Recovery logic missing (no way to "resume from item #48")

**Real examples from 2026 workflow systems:**
- Batch processing: Partial failures cause cascading state corruption; recovery often requires manual intervention
- Task queues: Lost checkpoint between steps; no way to resume mid-batch
- Async workflows: Clients updating items during processing cause version conflicts

**How to avoid:**

1. **Explicit enrichment state tracking:**
   ```typescript
   enum EnrichmentStatus {
     NotEnriched = 'not-enriched',
     Enriching = 'enriching',
     Enriched = 'enriched',
     SkippedByUser = 'skipped-by-user',    // User said "don't enrich this"
     SkippedNoEvidence = 'skipped-no-evidence',  // No PDF/notes available
     Failed = 'failed',
     FailedRecoverable = 'failed-recoverable'  // Can retry
   }

   interface EnrichmentState {
     itemId: string;
     status: EnrichmentStatus;
     attemptCount: number;
     lastAttemptTime?: number;
     lastError?: string;
     enrichedAt?: number;
     pdfHash?: string;  // Hash of PDF at enrichment time
   }

   // Track state per item per batch
   interface BatchEnrichmentState {
     batchId: string;
     items: Map<string, EnrichmentState>;
     startedAt: number;
     completedAt?: number;
     totalApiCalls: number;
   }
   ```

2. **State persistence with recovery:**
   ```typescript
   class EnrichmentBatchManager {
     private batchState: BatchEnrichmentState;

     async saveBatchState(state: BatchEnrichmentState): Promise<void> {
       // Persist to disk/database
       const filename = `batch-${state.batchId}-state.json`;
       await writeFile(filename, JSON.stringify(state, null, 2));
     }

     async loadBatchState(batchId: string): Promise<BatchEnrichmentState> {
       const filename = `batch-${batchId}-state.json`;
       return JSON.parse(await readFile(filename));
     }

     async resumeBatch(batchId: string, items: ZoteroItem[]): Promise<void> {
       // Load previous state
       const previousState = await this.loadBatchState(batchId);

       for (const item of items) {
         const itemState = previousState.items.get(item.id);

         // Skip items already enriched successfully
         if (itemState?.status === EnrichmentStatus.Enriched) {
           console.log(`Skipping ${item.id} (already enriched)`);
           continue;
         }

         // Retry items that failed
         if (itemState?.status === EnrichmentStatus.FailedRecoverable) {
           console.log(`Retrying ${item.id} (failed ${itemState.attemptCount} times)`);
           // Enrich again
         }

         // Respect user skip decision
         if (itemState?.status === EnrichmentStatus.SkippedByUser) {
           console.log(`Skipping ${item.id} (user decision)`);
           continue;
         }
       }
     }
   }
   ```

3. **Detect item version changes (PDF added after skipping):**
   ```typescript
   async function detectItemChanges(
     item: ZoteroItem,
     previousState: EnrichmentState
   ): Promise<{ changed: boolean; reason?: string }> {
     // Hash PDF at enrichment time; compare now
     const currentHash = await hashPDF(item.pdf);
     const previousHash = previousState.pdfHash;

     if (previousHash === undefined && currentHash !== undefined) {
       // PDF was added after enrichment was skipped
       return { changed: true, reason: 'PDF added' };
     }

     if (previousHash !== currentHash) {
       // PDF changed; may need re-enrichment
       return { changed: true, reason: 'PDF updated' };
     }

     // Metadata changed?
     const currentMetadataHash = await hashMetadata(item);
     if (currentMetadataHash !== previousState.metadataHash) {
       return { changed: true, reason: 'Metadata updated' };
     }

     return { changed: false };
   }
   ```

4. **Prevent re-enrichment of already-completed items:**
   ```typescript
   async function enrichBatch(
     items: ZoteroItem[],
     options: { resumeFrom?: string } = {}
   ): Promise<BatchEnrichmentState> {
     const batchId = generateId();
     const state = new Map<string, EnrichmentState>();

     for (const item of items) {
       // Skip if already enriched and unchanged
       const itemState = state.get(item.id);
       if (itemState?.status === EnrichmentStatus.Enriched) {
         const changes = await detectItemChanges(item, itemState);
         if (!changes.changed) {
           console.log(`Skipping ${item.id} (already enriched, no changes)`);
           continue;
         } else {
           console.log(`Re-enriching ${item.id} (${changes.reason})`);
         }
       }

       // Perform enrichment
       try {
         const enriched = await enrichItem(item);
         state.set(item.id, {
           itemId: item.id,
           status: EnrichmentStatus.Enriched,
           enrichedAt: Date.now(),
           pdfHash: await hashPDF(item.pdf),
           metadataHash: await hashMetadata(item),
           attemptCount: (itemState?.attemptCount ?? 0) + 1
         });
       } catch (error) {
         state.set(item.id, {
           itemId: item.id,
           status: EnrichmentStatus.FailedRecoverable,
           lastError: error.message,
           lastAttemptTime: Date.now(),
           attemptCount: (itemState?.attemptCount ?? 0) + 1,
           pdfHash: await hashPDF(item.pdf)
         });
       }

       // Save state periodically (every 10 items)
       if (items.length % 10 === 0) {
         await this.saveBatchState({
           batchId,
           items: state,
           startedAt: Date.now(),
           totalApiCalls: getTotalAPICallCount()
         });
       }
     }

     return { batchId, items: state, startedAt: Date.now(), totalApiCalls: getTotalAPICallCount() };
   }
   ```

5. **Metadata-only item queue handling:**
   ```typescript
   async function enrichWithMetadataQueue(
     items: ZoteroItem[],
     batchState: BatchEnrichmentState
   ): Promise<void> {
     // Separate metadata-only items into separate queue
     const metadataOnlyItems = items.filter(item => !item.pdf);
     const pdfItems = items.filter(item => item.pdf);

     // Process PDF items first
     await enrichBatch(pdfItems);

     // Then metadata-only items with restrictions
     for (const item of metadataOnlyItems) {
       const applicableTemplates = await selectApplicableTemplates(item, [EvidenceLevel.Abstract]);

       if (applicableTemplates.length === 0) {
         batchState.items.set(item.id, {
           itemId: item.id,
           status: EnrichmentStatus.SkippedNoEvidence,
           attemptCount: 0
         });
         continue;
       }

       // Enrich with metadata-only templates
       await enrichItem(item, applicableTemplates);
     }
   }
   ```

**Warning signs (detection):**
- User re-runs enrichment; sees duplicate enrichment for items already enriched
- Partial batch enrichment lost on restart; user has to re-select items
- Metadata-only items enriched, then PDF added later; plugin re-enriches and API costs double
- Cache shows "enrichment skipped" but UI allows re-enrichment (state inconsistency)
- Batch state file corrupted (partial JSON write); recovery impossible

**Phase to address:**
Phase 2 (Batch Management & State Persistence) — Must implement before releasing batch enrichment. State corruption causes data loss and API waste; recovery must be robust.

---

## Integration Gotchas

Common mistakes when connecting AI enrichment to existing triage workflow.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Enrichment + Profile Initialization** | Enrichment modifies cached profile before ProfileInitializer runs; profile scoring uses stale data | Enrichment completes BEFORE ProfileInitializer runs; enriched fields used in scoring |
| **Batch Enrichment + Triage Queue** | User accepts batch while enrichment is in-progress; queue processes half-enriched items | Block triage queue during enrichment; don't accept batch until enrichment completes |
| **API Key + Plugin Startup** | Invalid key detected after loading 50 items; plugin crashes | Validate key on plugin startup BEFORE loading items; fail fast with clear error |
| **Evidence Hierarchy + Recommendation** | Recommendation weights metadata-only enrichment same as PDF-based; score is misleading | Enrichment quality affects recommendation confidence; lower weight for metadata-only |
| **Template + Item Type** | Journal article template applied to book; fields don't make sense | Template selection conditional on item type; incompatible templates hidden |
| **Caching + PDF Updates** | PDF updated in Zotero; cached enrichment still uses old PDF | Cache invalidates on PDF change; detect via hash, force re-enrich |
| **Queue Management + Interruption** | User interrupts enrichment batch; partial state persisted; resume broken | Batch checkpoint every 10 items; resume restores complete state |

---

## Performance Traps

Patterns that work at small scale (5 items) but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **No token counting** | API rejects PDFs claiming "too long"; user doesn't know why | Count tokens before API call; split if needed | 10k+ token documents |
| **Naive map-reduce** | Split documents by character count, losing sentence boundaries; incoherent summaries | Split by page/paragraph, preserve context between chunks | 50k+ token PDFs |
| **Synchronous enrichment** | UI freezes; user thinks plugin hung; no progress feedback | Show progress; long operations should display time estimate | 50+ document batch |
| **No API call caching** | Same document enriched twice costs 2x API calls | Hash PDF; cache by (itemId, pdfHash); invalidate on PDF change | 20+ repeated enrichments |
| **Per-item API timeout** | Large PDF takes 90 seconds; user gives up; kills plugin | Set 2-minute timeout per item; implement early-exit if taking too long | 5+ large documents |
| **Metadata-only silently used** | User thinks enrichment is PDF-based; actually abstract-only; hallucination risk | Always show enrichment source; block risky templates for metadata-only | 100+ metadata-only items |
| **No batch state persistence** | Partial enrichment lost on plugin crash; user re-runs entire batch | Checkpoint state every 10 items; resume from checkpoint | 100+ item batch |
| **Circuit breaker missing** | API rate-limited; retry loop hammers API; costs explode | Implement circuit breaker; detect persistent failure; disable feature | API rate limit hit |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **API keys in logs** | User reports plugin crash; logs contain full API key; exposed in debug files | Never log full key; log only "...ending in xyz"; mask in error messages |
| **Unencrypted key storage** | Plugin stores OpenAI key in plaintext settings file; attacker reads file → unlimited API calls | Encrypt keys at rest using Zotero's secure storage API; never plaintext |
| **Key rotation not handled** | User rotates API key in settings; old key still cached; 401 errors cascade | Validate key periodically; detect 401, prompt user to re-enter |
| **BYOK without isolation** | User's OpenAI key can access all their OpenAI resources; plugin could be compromised → key theft | Document that BYOK key only enables enrichment; restrict scope if API provider allows |
| **No rate limit on enrichment** | User could trigger enrichment of 1000 items → $1000+ API cost before realizing | Implement per-batch API cost estimate; require user confirmation; set weekly limits |
| **Metadata exposure** | Enriched notes contain sensitive field values exposed in debug output | Sanitize enrichment output; don't log enriched field values |
| **Cache injection** | Malicious enrichment cached; affects future items | Validate enrichment integrity; check that claims map to source evidence |

---

## UX Pitfalls

Common user experience mistakes in AI enrichment.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **No progress during enrichment** | UI freezes; user thinks crashed; force-quits | Show real-time progress: "Item 3/50 (2min remaining)" |
| **Silent metadata-only fallback** | User thinks enrichment is PDF-based; later realizes it's abstract-only | Show badge: "Enriched from: PDF" vs. "Enriched from: Abstract only" |
| **No error visibility** | Enrichment "fails" silently for some items; user doesn't notice | Log failures in UI: "5 items failed to enrich; see details" |
| **Blocking UI during enrichment** | User can't do anything for 30+ minutes; feels broken | Consider async enrichment with background progress (if architecture allows) |
| **No API cost feedback** | User doesn't know enrichment costs $10; bill shock later | Show estimated cost BEFORE starting: "This will cost ~$5-10 in API calls" |
| **Confusing evidence warnings** | "Cannot enrich methods field" without explaining why | "Cannot enrich methods field: Requires PDF. This item has only abstract." |
| **No undo for enrichment** | User accepts enrichment, realizes it's wrong, no way to revert | Keep enrichment history; allow rollback to "before enrichment" state |
| **Mixing high/low confidence results** | Batch has PDF-based and abstract-only enrichment; user can't tell which is which | Color-code or badge enrichment by source evidence confidence |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces before enrichment is released.

- [ ] **Hallucination validation:** Every claim in enrichment is validated against source text (PDF or notes); no fabrications pass validation
- [ ] **Evidence hierarchy:** UI clearly shows enrichment source (PDF, notes, metadata); metadata-only enrichment explicitly marked as lower confidence
- [ ] **Token counting:** Token count tested against real PDFs; accuracy validated before API call; chunking strategy tested on 50k+ token documents
- [ ] **Error handling:** All API errors classified (401, 429, timeout); retry strategy documented; circuit breaker implemented for persistent failures
- [ ] **Progress feedback:** Enrichment progress shown in real-time; no UI freezes longer than 5 seconds without update; time estimate provided
- [ ] **Key validation:** API keys validated on plugin startup; invalid keys detected early; user prompted to update
- [ ] **State persistence:** Batch enrichment state saved to disk; resume from checkpoint possible; no data lost on plugin crash
- [ ] **Caching:** PDF enrichment cached; duplicates detected; cache invalidated on PDF change
- [ ] **Timeout protection:** Hard timeout on API calls (2 min per item); graceful degradation if timeout exceeded
- [ ] **Template restrictions:** Metadata-only enrichment limited to safe templates; risky fields blocked unless PDF/notes available
- [ ] **Queue management:** Metadata-only items handled separately; no hallucination risk from mixing evidence levels
- [ ] **Cost tracking:** API cost estimated before batch; user can see total cost before accepting enrichment
- [ ] **Recovery**: Partial failures logged; user can see which items failed and why; resume possible
- [ ] **Testing:** Tested on real Zotero databases with PDFs, metadata-only items, mixed batches, API failures, timeouts, invalid keys

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Hallucinated enrichment accepted** | MEDIUM | Implement enrichment history; allow rollback to pre-enrichment state; audit hallucinated claims (manually or with secondary LLM validation) |
| **API key invalid detected mid-batch** | MEDIUM | Pause enrichment; prompt user to re-enter key; resume from checkpoint (skip already-enriched items) |
| **Rate limit hit** | MEDIUM | Detect 429 response; activate circuit breaker; pause enrichment; show user time when API recovers; allow manual retry |
| **Large PDF timeout** | LOW | Catch timeout; fall back to sampled pages (first, middle, last) instead of full PDF; mark enrichment as "partial" |
| **Batch partially enriched before crash** | LOW | Load checkpoint state; resume from last completed item; skip already-enriched items; continue from failure point |
| **Metadata-only item hallucinated** | HIGH | Implement metadata-only validation; require user confirmation before accepting risky enrichment; log for audit |
| **Cache invalidation fails** | HIGH | Manual cache clear button in settings; re-hash all cached items on upgrade; force re-enrich if hashes don't match |
| **Token counting mismatch** | MEDIUM | Implement conservative token budget (use 1.3x estimate); split earlier than necessary; add buffer before API limit |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Hallucination risk | Phase 1 (Prompt + Validation) | Every claim in output validated against source text; test with 10+ hallucination-prone PDFs |
| API failure cascade | Phase 2 (API Integration) | All error types handled (401, 429, timeout); circuit breaker tested; retry logic verified on rate limit |
| Performance collapse | Phase 1 (Token Counting + Chunking) | Token counting accurate on 50k+ PDFs; chunking preserves context; 2-minute timeout enforced |
| Evidence hierarchy violation | Phase 1 (Template + Evidence) | Templates block metadata-only enrichment for risky fields; evidence source visible in UI |
| Queue state corruption | Phase 2 (Batch Manager) | Partial enrichment state persisted; resume restores complete state; no duplicate API calls on resume |

---

## Technical Debt & Shortcuts

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| **Skip hallucination validation** | Faster development, simpler logic | User accepts hallucinated enrichment; trust erodes; feature becomes unreliable | Never - hallucination validation is required constraint |
| **Metadata-only templates (full set)** | Fewer template branches to implement | High hallucination risk; user doesn't notice enrichment is unreliable | Only for safe templates (keywords, summary); never methods/findings |
| **No token counting** | Simpler implementation | API rejects 50k+ PDFs; user frustration | Never - token counting essential for >10k documents |
| **Naive chunking by character count** | Simpler split logic | Context breaks mid-sentence; coherence degrades; user gets poor results | Never - chunk by page/paragraph boundaries |
| **No progress feedback** | Fewer UI updates needed | User thinks plugin hung; force-quits; trust erodes | Never - always show progress for >10-second operations |
| **Single API provider (no fallback)** | Simpler key management | Single provider outage blocks entire feature | Acceptable for MVP if user OK with single provider; plan fallback for production |
| **No batch state persistence** | Simpler implementation | Partial enrichment lost; no resume; user re-runs entire batch | Never for >10 item batches; checkpoint essential |
| **Cache without invalidation strategy** | Faster development | Stale cache used; enrichment doesn't reflect PDF updates | Only if invalidation added in Phase 2 |
| **Blocking enrichment in UI** | Simpler architecture (no async) | Users can't do anything during enrichment; feels broken at scale | Acceptable for MVP if <30 second enrichment; async required for production |

---

## Real-World Examples from AI Enrichment Systems

### Example 1: The Hallucination Horror

**What happened:** AI enrichment plugin generated "findings" field for abstract-only papers. User relied on enrichment to decide whether to cite paper. Later discovered AI fabricated "significant p < 0.001 finding" that wasn't in abstract. Paper wasn't appropriate for citation.

**Root cause:** No validation that generated claims appear in source text. Prompt asked "What are the key findings?" without requiring evidence grounding.

**Solution:** Implement claim-level validation. Every statement in enrichment must map to source text span. Block generation if can't find evidence.

**Prevention:** Test enrichment against papers with incomplete abstracts; verify generated claims are actually present in abstract.

---

### Example 2: The API Cost Explosion

**What happened:** User started enriching 500-item library. API costs started at $5/item. By item 200, realized enrichment would cost $2500 total. Too late to stop mid-batch.

**Root cause:** No cost estimation before batch. User didn't know enrichment was so expensive.

**Solution:** Estimate cost for first 5 items; show user total before starting. Require confirmation.

**Prevention:** Implement cost tracking from Phase 1. Never enrich batch without showing user cost estimate first.

---

### Example 3: The Rate Limit Retry Storm

**What happened:** Enrichment hit OpenAI rate limit at item #100. Retry logic kicked in: 1s wait, retry, fail, 2s wait, retry, fail, 4s wait... By item #150, plugin had made 500+ failed API calls trying to retry. API bill doubled; rate limit period extended.

**Root cause:** Exponential backoff without circuit breaker. API was persistently unavailable; retry logic kept hammering it.

**Solution:** Implement circuit breaker. After 5 consecutive failures, stop retrying. Show user "API temporarily unavailable" and wait 60 seconds before retrying.

**Prevention:** Test rate limit handling with mock API that returns 429 continuously. Verify retries stop after threshold.

---

### Example 4: The Token Counting Disaster

**What happened:** Plugin claimed "50k token PDF" but actual tokens were 75k (due to complex formatting, tables). API rejected with "context too long". Plugin tried to split PDF naively (mid-sentence). Enrichment produced incoherent summary.

**Root cause:** Token estimate wrong. Chunking logic broke sentences.

**Solution:** Count tokens accurately using model's tokenizer. Chunk by page/paragraph, not character count. Add safety margin (use 1.3x estimate).

**Prevention:** Test token counting on 100+ PDFs with various formatting. Verify accuracy. Test chunking on complex documents (tables, code, formatting).

---

### Example 5: The Metadata-Only Hallucination

**What happened:** User had 200 items without PDFs (metadata from database export). Enrichment generated "methodology" field from abstract (which is actually just a one-liner). AI hallucinated methods. User used enriched metadata in recommendations.

**Root cause:** No evidence hierarchy enforcement. Templates allowed for metadata-only items despite needing PDF.

**Solution:** Block "methodology" template for metadata-only items. Show user which enrichment is PDF-based vs. abstract-only.

**Prevention:** Implement evidence requirements per template. Test with metadata-only items. Verify templates are restricted appropriately.

---

## Sources

### Hallucination Prevention Research

- [From Illusion to Insight: A Taxonomic Survey of Hallucination Mitigation Techniques in LLMs](https://www.mdpi.com/2673-2688/6/10/260) — Comprehensive survey of hallucination techniques including evidence grounding, RAG, prompt engineering
- [A hallucination detection and mitigation framework for faithful text summarization using LLMs](https://www.nature.com/articles/s41598-025-31075-1) — Framework for validating AI output against source text
- [Hallucination Detection and Mitigation in Large Language Models](https://arxiv.org/pdf/2601.09929) — Detailed taxonomy of hallucination types and mitigation strategies
- [The Reality of AI Hallucinations in 2025](https://drainpipe.io/the-reality-of-ai-hallucinations-in-2025/) — 2025-2026 benchmark data showing hallucination rates across models
- [Hallucination Rates in 2025 — Accuracy, Refusal, and Liability](https://medium.com/@markus_brinsa/hallucination-rates-in-2025-accuracy-refusal-and-liability-aa0032019ca1) — Legal and liability implications of hallucinations in production systems
- [Hallucination‐Free? Assessing the Reliability of Leading AI Legal Research Tools](https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf) — Stanford study: Leading AI tools have >10% citation error rate
- [Cite-While-You-Generate: Training-Free Evidence Attribution for Multimodal Clinical Summarization](https://arxiv.org/html/2601.16397) — Evidence attribution at generation time; phrase-level source mapping

### API Reliability & Error Handling

- [Tackling rate limiting for LLM apps](https://portkey.ai/blog/tackling-rate-limiting-for-llm-apps/) — Exponential backoff, circuit breaker, multi-provider fallback patterns
- [LLM Tool-Calling in Production: Rate Limits, Retries, and the "Infinite Loop" Failure Mode](https://medium.com/@komalbaparmar007/llm-tool-calling-in-production-rate-limits-retries-and-the-infinite-loop-failure-mode-you-must-2a1e2a1e84c8) — Detailed analysis of retry failures and solutions
- [Retries, fallbacks, and circuit breakers in LLM apps: what to use when](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/) — Practical guide to reliability patterns
- [Rate Limiting in AI Gateway: The Ultimate Guide](https://www.truefoundry.com/blog/rate-limiting-in-llm-gateway/) — 2026 best practices for rate limit handling

### Token Counting & Context Windows

- [Google Gemini Context Window: Token Limits, Model Comparison, and Workflow Strategies for Late 2025/2026](https://www.datastudios.org/post/google-gemini-context-window-token-limits-model-comparison-and-workflow-strategies-for-late-2025) — Current context window limits and strategies
- [Beyond 200K Tokens: How Long Context Windows Are Changing AI in 2026](https://www.novakit.ai/blog/long-context-windows-ai-document-processing) — Large document handling with 200k+ token models
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://research.trychroma.com/context-rot) — Performance degradation with large context; explains why 1M token context still has accuracy loss

### Performance & Blocking UI

- [Blocking UI? How to Stop FileStream from Freezing Your .NET Core App](https://medium.com/c-sharp-programming/blocking-ui-how-to-stop-filestream-from-freezing-your-net-core-app-504c4ead0fb0) — Blocking vs. non-blocking patterns for resource-intensive operations
- [Managing Non-blocking Calls on the UI Thread with Async Await](https://www.codeguru.com/dotnet/managing-non-blocking-calls-on-the-ui-thread-with-async-await/) — Timeout protection and progress feedback patterns

### Evidence-Based Enrichment

- [Perplexity AI PDF reading: retrieval-based parsing, citation grounding, and research workflows for early 2026](https://www.datastudios.org/post/perplexity-ai-pdf-reading-retrieval-based-parsing-citation-grounding-and-research-workflows-for-e) — Citation grounding in PDF processing; how to ground claims in source
- [How To Use Ai To Summarize Research Papers Without Losing Methodological Nuance Or Citation Context](https://www.alibaba.com/product-insights/how-to-use-ai-to-summarize-research-papers-without-losing-methodological-nuance-or-citation-context.html) — Detailed guide to avoiding hallucination in research paper summarization

### Zotero Plugin Integration

- [High Memory Usage and Performance Issues in Zotero 7 When Handling PDFs](https://forums.zotero.org/discussion/121215/high-memory-usage-and-performance-issues-in-zotero-7-when-handling-pdfs) — Zotero performance with large PDF batches
- [Memory leak of closed PDF Items with 100 more annotations when plugin enabled](https://forums.zotero.org/discussion/107101/memory-leak-of-closed-pdf-items-with-100-more-annotations-when-plugin-enabled) — Plugin memory management pitfalls

### BYOK Security

- [Bring Your Own Key (BYOK): explained](https://ironcorelabs.com/byok/) — BYOK security patterns; encryption at rest
- [Demystifying AWS KMS key operations, bring your own key (BYOK), custom key store, and ciphertext portability](https://aws.amazon.com/blogs/security/demystifying-kms-keys-operations-bring-your-own-key-byok-custom-key-store-and-ciphertext-portability/) — Key management and rotation strategies

### Video Transcript Processing

- [AI Transcription Accuracy Trends Every Professional Should Know in 2026](https://sonix.ai/resources/ai-transcription-accuracy-trends/) — Real-world transcription accuracy (62% on noisy audio vs. 99% lab conditions)
- [How Accurate Is AI Transcription in 2026? Real Benchmarks for Noisy, Accented, and Multi-Speaker Audio](https://gotranscript.com/blog/ai-transcription-accuracy-benchmarks-2026) — Transcription quality variance; human review essential

---

## Next Steps

1. **Review pitfalls with implementation team** — Ensure pitfalls resonate with real concerns before development
2. **Create failing test cases** — Write tests verifying each pitfall prevention (hallucination validation, error handling, token counting)
3. **Set quality gates** — Define measurable success criteria:
   - Hallucination rate: <0.5% (validated against source text)
   - API error handling: All error types classified; 95% automatic recovery rate
   - Performance: Enrichment of 50-item batch <30 minutes; no UI freeze >5 seconds
   - Evidence hierarchy: 100% of enrichment sources documented and visible to user
4. **Establish monitoring** — Track in production:
   - Hallucination detection rate (claims without evidence)
   - API cost per item batch
   - Enrichment timeout frequency
   - User feedback on enrichment quality (especially metadata-only items)
5. **Plan Phase 1 research flags** — Identify topics needing deeper exploration during Phase 1:
   - Optimal prompt engineering for hallucination prevention
   - Token counting accuracy across PDF types
   - Zotero 7+ annotation handling during enrichment

---

*Pitfalls research for: Zotero Triage Plugin v2.0 (AI Enrichment Layer)*
*Researched: 2026-01-30*
*Confidence: HIGH*
*Sources: 2026 LLM research, Zotero ecosystem forums, API reliability patterns, production failure case studies*
