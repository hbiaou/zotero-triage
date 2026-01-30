# Architecture: AI Enrichment Integration (v2.0)

**Project:** Zotero Triage (AI Enrichment Milestone)
**Focus:** How AI enrichment features integrate with existing triage architecture
**Researched:** 2026-01-30
**Confidence:** HIGH (existing architecture documented in codebase, enrichment flow specified)

## Executive Summary

AI enrichment integration requires adding an orchestration layer (EnrichmentService) that triggers from the existing Accept action, replacing the simple synchronous note generation with an asynchronous pipeline. The enrichment workflow orchestrates five specialized components (classification, extraction, template selection, AI interaction, validation) while maintaining compatibility with existing registry, batch, and note generation systems. **Key insight:** Enrichment is **optional and non-blocking** — items without enrichable content (metadata-only) are queued for manual processing, allowing the triage UI to remain responsive. The architecture adds 5-7 new components but maintains existing state flow (registry → proposed → imported) and reuses existing patterns (dependency injection, async chunking, progress tracking, debounced persistence).

## Existing v1.x Architecture (Foundation)

### Component Ecosystem

The v1.x architecture has stabilized around these core services:

```
PLUGIN LIFECYCLE (main.ts)
├─ onload() → initialize services, setup UI
├─ onLayoutReady() → lazy load database
└─ onunload() → cleanup, save state

CORE SERVICES
├─ ZoteroConnector (SQLite queries for items, tags, fulltext, attachments)
├─ RegistryService (state persistence: unseen → proposed → imported)
├─ ProfileService + ProfileInitializer (user preferences, seed-based profile)
├─ RecommendationEngine + AdaptiveLearner (multi-signal scoring + feedback)
├─ BatchService (batch generation with scoring + state filtering)
└─ ValidationService (quality gates by item type)

UI LAYER
├─ TriageView (dashboard, batch display, action buttons)
├─ TriageCard (card component with accept/reject/defer buttons)
├─ OverrideModal (validation error display + field explanations)
├─ SetupWizardModal (onboarding, database config, seed selection)
└─ Various small modals (preview, search, stats)

NOTE GENERATION
├─ NoteGenerator (markdown file creation, YAML frontmatter)
└─ Templates (YAML generation, content formatting)

SUPPORTING INFRASTRUCTURE
├─ ProgressTracker (visual progress feedback in Notices)
├─ SessionTracker (usage metrics)
├─ ValidationService (field validation by item type)
├─ ErrorHandler (error context and logging)
└─ Utils (normalization, stemming, async helpers)
```

### Existing Data Flow (v1.x)

```
1. BATCH GENERATION
   Triage View → BatchService.generateBatch()
   ├─ Filter items by registry state (exclude imported/rejected)
   ├─ RecommendationEngine.scoreItems() if profile exists
   ├─ Sort and slice to batch size
   └─ Return batch with items marked as 'proposed'

2. USER ACCEPTS ITEM (current flow)
   Triage Card [Accept button] → TriageView.handleAccept()
   ├─ ValidationService.validate() (if quality gates enabled)
   ├─ If validation fails → OverrideModal (user confirms override)
   ├─ NoteGenerator.createNote() ← Creates stub note with YAML frontmatter
   ├─ RegistryService.markState(item, 'imported')
   ├─ SessionTracker.recordAction('accepted')
   └─ Show undo notice

3. STATE PERSISTENCE
   Any registry change → RegistryService.markState()
   └─ Debounced save (2000ms) → plugin.saveData()

4. BATCH COMPLETION
   After all items in batch processed → Show "Next batch?" prompt
```

### Key Architectural Patterns in v1.x

| Pattern | Location | Purpose | How Used |
|---------|----------|---------|----------|
| **Dependency Injection** | Service constructors | Loose coupling, testability | All services receive deps |
| **Async Chunking** | ZoteroConnector.processInChunks() | Non-blocking UI during heavy load | Item loading, scoring |
| **Lazy Loading** | main.ts onLayoutReady() | Defer DB connect until UI ready | Database only opens when needed |
| **Debounced Persistence** | RegistryService (2000ms) | Batch multiple state changes, reduce I/O | Registry saves, settings saves |
| **Progress Callbacks** | Various onProgress?: (n) ⇒ void | Optional fine-grained tracking | Loading, scoring, batch gen |
| **Retry with Backoff** | ZoteroConnector.retryWithBackoff() | Handle SQLITE_BUSY contention | DB access under load |
| **Read-Only Database** | sql.js in-memory copy | Never modify Zotero data | Zotero DB mounted read-only |
| **Multi-Signal Scoring** | RecommendationEngine | Combine multiple ranking signals | Tags + authors + keywords + recency |
| **State Machine** | RegistryService | Track item processing lifecycle | unseen → proposed → imported |

## AI Enrichment Architecture (v2.0)

### Enrichment Workflow Overview

```
USER CLICKS ACCEPT → ENRICHMENT PIPELINE ← NON-BLOCKING, OPTIONAL

1. TRIGGER (TriageView.handleAccept)
   ├─ Check quality gates (validation)
   ├─ CreateNote() → stub note with YAML frontmatter
   ├─ Mark registry as 'imported'
   ├─ → ASYNC TRIGGER: EnrichmentOrchestrator.enrich(item)
   └─ Return immediately (UI not blocked)

2. EVIDENCE ASSESSMENT (EnrichmentOrchestrator.assessEvidence)
   ├─ Check content availability:
   │  ├─ PDF fulltext from Zotero cache (highest priority)
   │  ├─ User notes in vault (if linked)
   │  ├─ Item abstract (fallback)
   │  └─ Metadata only (lowest priority)
   ├─ Calculate evidence quality score
   └─ Emit evidence event for UI feedback

3. CLASSIFICATION (SmartClassifier)
   ├─ Input: item.title + item.tags + item.abstract
   ├─ Classify item into domain category
   │  ├─ ML/AI, Biology, Chemistry, Physics, etc.
   └─ Return domain label + confidence

4. TEMPLATE SELECTION (TemplateSelector)
   ├─ Input: item.itemType + domain
   ├─ Select extraction template
   │  ├─ Different template for Journal Article vs Book vs Video
   │  └─ Different template for ML domain vs Biology domain
   └─ Return template with extraction schema

5. CONTENT EXTRACTION (ContentExtractor)
   ├─ Input: PDF fulltext OR notes OR abstract
   ├─ Extract relevant sections:
   │  ├─ Key findings, Methods, Results, etc.
   │  └─ Follow template schema
   ├─ Handle large content:
   │  ├─ If > 50K tokens → LongContentHandler (map-reduce)
   │  └─ Chunked processing with overlap
   └─ Return structured extraction

6. ENRICHMENT (AIProvider + EnrichmentOrchestrator)
   ├─ Input: extracted content + template
   ├─ Call LLM API (Claude, OpenAI, user's choice)
   │  ├─ BYOK (bring your own key) authentication
   │  ├─ Token counting before send
   │  ├─ Error handling for API failures
   │  └─ Retry logic with backoff
   ├─ LLM generates enriched fields
   │  ├─ Structured output (JSON) per template
   │  └─ Example: { keyFindings: [...], methods: [...], implications: [...] }
   └─ Return LLM response

7. VALIDATION (EnrichmentValidator)
   ├─ Input: LLM response + template schema
   ├─ Check consistency and completeness
   │  ├─ Required fields populated?
   │  ├─ Field types correct (arrays, strings)?
   │  ├─ No hallucination (validate against source)?
   │  └─ Flag suspicious/missing fields
   └─ Return validation result + warnings

8. PERSISTENCE (NoteGenerator enhancement)
   ├─ Input: enriched fields + validation result
   ├─ Update existing stub note with enriched content
   │  ├─ Merge enriched fields into YAML frontmatter
   │  ├─ Add enriched body sections below metadata
   │  └─ Preserve user's summary/notes if exists
   ├─ RegistryService.markState(item, 'enriched') ← NEW STATE
   └─ ProgressTracker.update() → Show "Enrichment complete"

9. QUEUEING (Metadata-Only Path)
   ├─ If evidence = metadata-only → Skip enrichment, return early
   ├─ QueueManager.queue(item, 'enrichment-pending')
   ├─ Create diagnostic stub note:
   │  ├─ Add comment: "No PDF/notes available. Request full text from author."
   │  └─ Link to Zotero item
   └─ User can manually add PDF later, trigger re-enrichment
```

### New Components Required

#### 1. EnrichmentOrchestrator
**File:** `src/enrichment/enrichment-orchestrator.ts`

**Responsibility:** Coordinates the enrichment pipeline, manages state transitions, handles async flow

**Interface:**
```typescript
export class EnrichmentOrchestrator {
  constructor(
    classifier: SmartClassifier,
    templateSelector: TemplateSelector,
    contentExtractor: ContentExtractor,
    aiProvider: AIProvider,
    validator: EnrichmentValidator,
    registry: RegistryService,
    noteGenerator: NoteGenerator,
    queueManager: QueueManager
  )

  async enrich(item: ZoteroItem): Promise<EnrichmentResult>
  // Returns: { success, enrichedNote?, warnings?, queuedFor? }

  private async assessEvidence(item): Promise<EvidenceLevel>
  // Returns: { level: 'pdf' | 'notes' | 'abstract' | 'metadata', confidence }

  private async pipelineWithFallback(item, evidence)
  // Orchestrates: classify → select template → extract → enrich → validate → persist
}
```

**Key decisions:**
- Enrichment is **fire-and-forget** from UI perspective (non-blocking)
- Handles both happy path (enrichment succeeds) and fallback (queue for manual)
- Emits progress events for optional UI updates (modal with progress)
- Catches all errors and returns structured result (no throwing)

#### 2. SmartClassifier
**File:** `src/enrichment/smart-classifier.ts`

**Responsibility:** Classify items into research domains for template selection

**Interface:**
```typescript
export class SmartClassifier {
  constructor(aiProvider: AIProvider)

  async classify(item: {
    title: string
    abstract?: string
    tags?: string[]
  }): Promise<Classification>
  // Returns: { domain: 'ML' | 'Biology' | ... , confidence: 0-1 }
}
```

**Key decisions:**
- Uses AI for flexible domain classification (not hardcoded patterns)
- Confidence score helps select fallback template if low
- Caches classifications per item to avoid redundant API calls
- Supports custom domain taxonomies per user

#### 3. TemplateSelector
**File:** `src/enrichment/template-selector.ts`

**Responsibility:** Select enrichment template based on item type + domain

**Interface:**
```typescript
export class TemplateSelector {
  selectTemplate(itemType: string, domain: string): EnrichmentTemplate
  // Returns template with:
  // - schema: required and optional fields
  // - prompt: system prompt for LLM
  // - examples: few-shot examples for LLM
  // - fallback: simpler template if primary fails
}
```

**Templates required (MVP):**
- Journal Article (ML domain)
- Journal Article (Biology domain)
- Book
- Preprint / Working Paper
- Video / Lecture (YouTube/Vimeo)
- Web page / Blog post

**Key decisions:**
- Templates are data-driven (JSON configs, not code)
- Each template specifies extraction fields
- LLM gets template schema as structured output schema
- Fallback to generic template if domain unknown

#### 4. ContentExtractor
**File:** `src/enrichment/content-extractor.ts`

**Responsibility:** Extract text from PDF, notes, or abstract in priority order

**Interface:**
```typescript
export class ContentExtractor {
  constructor(
    zoteroConnector: ZoteroConnector,
    longContentHandler: LongContentHandler
  )

  async extract(item: ZoteroItem): Promise<ExtractedContent>
  // Returns: { text, source: 'pdf' | 'notes' | 'abstract', tokenCount }

  private async extractFromPDF(pdfPath): Promise<string>
  private async extractFromNotes(itemKey): Promise<string>
  private async extractFromAbstract(item): Promise<string>
}
```

**Extraction priority:**
1. **PDF fulltext** from Zotero cache (`item.pdfPath`)
   - Use pdfjs-dist or similar library
   - Extract plain text (not OCR initially)
   - Cache result to avoid re-extraction
2. **User notes** in vault
   - Search vault for note with item link
   - Extract note body (skip frontmatter)
3. **Abstract** from item metadata
   - Item.abstract field
4. **Metadata only**
   - Title + tags + authors
   - Queue for manual enrichment

**Key decisions:**
- Content extraction is blocking but can timeout
- If extraction fails for PDF, fall back to abstract
- Cache extracted text per item (avoid re-processing PDFs)
- Track evidence quality in result metadata

#### 5. LongContentHandler
**File:** `src/enrichment/long-content-handler.ts`

**Responsibility:** Handle content > 50K tokens using map-reduce pattern

**Interface:**
```typescript
export class LongContentHandler {
  async processLongContent(
    fullText: string,
    template: EnrichmentTemplate,
    aiProvider: AIProvider
  ): Promise<string>
  // Returns: merged/deduplicated enrichment result
}
```

**Algorithm (map-reduce):**
1. **MAP:** Split content into overlapping chunks (e.g., 10K tokens with 1K overlap)
2. **REDUCE:** Send each chunk to LLM with template schema
3. **MERGE:** Deduplicate and consolidate responses
4. **VALIDATE:** Ensure merged result still valid per schema

**Key decisions:**
- Adaptive chunking based on token limits
- Overlap prevents information loss at chunk boundaries
- Parallel processing of chunks to reduce API calls
- Result deduplication for map phase (e.g., combine lists)

#### 6. AIProvider
**File:** `src/enrichment/ai-provider.ts`

**Responsibility:** Abstraction layer for LLM API calls (BYOK: bring your own key)

**Interface:**
```typescript
export class AIProvider {
  constructor(
    encryptedStorage: EncryptedStorage,
    settings: ZoteroTriageSettings
  )

  async sendRequest(
    prompt: string,
    system: string,
    schema?: JSONSchema
  ): Promise<string | object>
  // Returns: LLM response (string or structured JSON)

  async tokenCount(text: string): Promise<number>
}
```

**Supported models (MVP):**
- Claude (Anthropic)
- GPT-4 / GPT-3.5 (OpenAI)
- Open source option (e.g., Ollama)

**Key decisions:**
- Provider-agnostic interface (support swapping providers)
- Token counting before API call (avoid surprises)
- Retry logic with exponential backoff (rate limits)
- Rate limiting client-side (respect free tier quotas)
- Streaming not required initially (batch response OK)

#### 7. EncryptedStorage
**File:** `src/enrichment/encrypted-storage.ts`

**Responsibility:** Encrypt and persist API keys securely

**Interface:**
```typescript
export class EncryptedStorage {
  async setApiKey(provider: string, key: string): Promise<void>
  async getApiKey(provider: string): Promise<string | null>
  async deleteApiKey(provider: string): Promise<void>
}
```

**Key decisions:**
- Use OS keychain if available (electron-store with encryption)
- Fallback to encrypted plugin storage (libsodium.js for encryption)
- Never log or transmit keys
- Support multiple provider keys (Claude + OpenAI simultaneously)

#### 8. EnrichmentValidator
**File:** `src/enrichment/enrichment-validator.ts`

**Responsibility:** Validate LLM output against template schema and source

**Interface:**
```typescript
export class EnrichmentValidator {
  validateAgainstSchema(
    response: object,
    schema: JSONSchema
  ): ValidationResult
  // Returns: { valid: bool, missingFields: [], warnings: [] }

  validateAgainstSource(
    enrichment: object,
    sourceContent: string
  ): FaithfulnessResult
  // Returns: { score: 0-1, suspiciousClaims: [] }
}
```

**Validation steps:**
1. **Schema validation:** Check all required fields present and correct type
2. **Faithfulness check:** Spot-check key claims against source (optional, slower)
3. **Hallucination detection:** Flag claims not supported by source

**Key decisions:**
- Schema validation is mandatory
- Faithfulness check is optional (user can disable for speed)
- Missing fields don't block persistence (flag as warning)
- Warnings stored in frontmatter for user review

#### 9. QueueManager
**File:** `src/enrichment/queue-manager.ts`

**Responsibility:** Track items pending enrichment (metadata-only items)

**Interface:**
```typescript
export class QueueManager {
  async queue(item: ZoteroItem, reason: string): Promise<void>
  async getQueue(): Promise<QueuedItem[]>
  async remove(itemId: number): Promise<void>
  async retry(itemId: number): Promise<void>
}
```

**Key decisions:**
- Persisted in plugin storage (survives restarts)
- UI shows "Enrichment Queue" panel with pending items
- User can manually add PDF/notes, then trigger re-enrichment
- Queue includes reason (metadata-only, API error, etc.)

### Data Structures

#### EnrichmentResult
```typescript
interface EnrichmentResult {
  success: boolean
  enrichedNote?: {
    frontmatter: Record<string, unknown>
    body: string
  }
  warnings?: string[]
  queuedFor?: string  // Reason for queuing if not enriched
  evidence?: EvidenceLevel
  error?: string
}
```

#### EnrichmentTemplate
```typescript
interface EnrichmentTemplate {
  id: string
  name: string
  itemType: string[]  // ['journalArticle', 'book', ...]
  domains: string[]   // ['ML', 'Biology', ...]
  schema: JSONSchema
  systemPrompt: string
  examples?: object[]
  fallback?: EnrichmentTemplate
}
```

#### Classification
```typescript
interface Classification {
  domain: string
  confidence: number
  explanation?: string
}
```

## Integration with Existing Architecture

### 1. Registry State Machine Extension

**Current states:** `unseen → proposed → [accepted|rejected|deferred] → imported`

**New states:**
- `imported` → enrichment attempt made
- NEW: `enriched` → enrichment succeeded
- NEW: `enrichment_pending` → queued for manual enrichment (metadata-only)

**Registry changes:**
```typescript
export type RegistryState =
  | 'unseen'
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'imported'
  | 'enriched'              // ← NEW
  | 'enrichment_pending'    // ← NEW
```

**Note:** Enrichment is optional — items can stay `imported` if enrichment skipped or failed.

### 2. Accept Flow Integration

**Before (v1.x):**
```
User clicks Accept
→ ValidationService.validate()
→ NoteGenerator.createNote()
→ RegistryService.markState('imported')
→ Update UI immediately
```

**After (v2.0):**
```
User clicks Accept
→ ValidationService.validate()
→ NoteGenerator.createNote() [stub note]
→ RegistryService.markState('imported')
→ Update UI immediately (return to user)
→ ASYNC: EnrichmentOrchestrator.enrich() [fire-and-forget]
  └─ Eventually: Update note with enriched content
  └─ Eventually: RegistryService.markState('enriched')
```

**Key design:** Note creation happens synchronously (user sees progress), enrichment happens asynchronously (doesn't block UI).

### 3. TriageView Updates

**New button state:** Show enrichment progress in modal when enriching

```typescript
// In TriageView.performAccept():
try {
  await noteGenerator.createNote(item);  // Synchronous
  registry.markState(item.itemID, 'imported');

  // Async enrichment (non-blocking)
  if (settings.enrichmentEnabled) {
    showProgressModal('Enriching note...');

    enrichmentOrchestrator.enrich(item)
      .then(result => {
        if (result.success) {
          registry.markState(item.itemID, 'enriched');
          updateProgressModal('Enrichment complete!');
        } else {
          updateProgressModal(`Queued: ${result.queuedFor}`);
        }
      })
      .catch(err => {
        console.error('Enrichment error:', err);
        updateProgressModal('Enrichment failed (note saved)');
      })
      .finally(() => closeProgressModal());
  }
} catch (err) {
  // Note creation failed, block user
}
```

### 4. ProgressTracker Integration

**Existing:** ProgressTracker used for batch generation, loading

**New usage:**
- Show modal during enrichment pipeline
- Display stage (Classification → Extraction → Enrichment → Validation)
- Estimate time remaining based on token count

### 5. Settings Integration

**New settings:**
```typescript
export interface ZoteroTriageSettings {
  // ... existing ...

  // Enrichment settings
  enrichmentEnabled: boolean           // Enable/disable feature
  enrichmentProvider: 'claude' | 'openai' | 'ollama'
  enrichmentModel: string              // 'claude-opus-4-5', 'gpt-4', etc.
  enrichmentTimeout: number            // Seconds before cancel
  contentExtractionEnabled: boolean    // Enable PDF/notes extraction
  evidenceRequired: 'pdf' | 'abstract' | 'metadata'  // Minimum quality
  validationStrictness: 'lenient' | 'moderate' | 'strict'
  cachePDFExtraction: boolean          // Reuse extracted text
}
```

### 6. Note Structure Enhancement

**Existing frontmatter:**
```yaml
---
title: ...
authors: [...]
year: ...
doi: ...
abstract: ...
status: unread
---
```

**Enhanced frontmatter (post-enrichment):**
```yaml
---
title: ...
authors: [...]
year: ...
doi: ...
abstract: ...
status: unread

# NEW: Enrichment metadata
enrichment_status: enriched
enrichment_timestamp: 2026-01-30T14:23:45Z
enrichment_model: claude-opus-4-5
enrichment_warnings: []

# Template-specific enriched fields
key_findings:
  - Finding 1
  - Finding 2
methods: |
  Multi-paragraph methods description
implications: ...
---

## Summary
[Enriched content]

## Key Findings
- [From enrichment]

## Methods
[From enrichment]

## Notes
[User's manual notes]
```

## Architecture Patterns Reused

### 1. Dependency Injection (Enhanced)

All enrichment services follow constructor-based DI:
```typescript
class EnrichmentOrchestrator {
  constructor(
    classifier: SmartClassifier,
    templateSelector: TemplateSelector,
    contentExtractor: ContentExtractor,
    aiProvider: AIProvider,
    validator: EnrichmentValidator,
    registry: RegistryService,
    noteGenerator: NoteGenerator,
    queueManager: QueueManager
  )
}
```

**Benefit:** Easy to swap implementations (e.g., MockAIProvider for testing)

### 2. Async Chunking (Reused)

ContentExtractor uses same chunking pattern as ZoteroConnector:
```typescript
private async processInChunks(
  text: string,
  chunkSize: number,
  fn: (chunk: string) => Promise<T>
): Promise<T[]>
```

### 3. Debounced State (Reused)

RegistryService continues to use debounced saves (2000ms).

**New:** EnrichmentOrchestrator batches registry updates:
```typescript
private debouncedRegistrySave = debounce(async () => {
  await registry.flush();  // Ensure written before closing
}, 2000)
```

### 4. Progress Callbacks (Extended)

Existing pattern extended to enrichment stages:
```typescript
async enrich(
  item: ZoteroItem,
  onProgress?: (stage: string, percent: number) => void
): Promise<EnrichmentResult> {
  onProgress?.('classifying', 20);
  onProgress?.('extracting', 40);
  onProgress?.('enriching', 60);
  onProgress?.('validating', 80);
  onProgress?.('persisting', 100);
}
```

### 5. Retry with Backoff (Reused)

AIProvider uses existing retry pattern for API calls:
```typescript
async sendRequest(prompt: string, system: string) {
  return retryWithBackoff(async () => {
    const response = await fetch(apiEndpoint, { ... });
    if (!response.ok) throw new Error(...);
    return response.json();
  }, { maxRetries: 3, backoffMs: 1000 });
}
```

### 6. Multi-Signal Processing (Analogy)

RecommendationEngine combines multiple signals (tags + authors + keywords).

Enrichment orchestrator combines multiple steps (classify → extract → enrich) in similar pattern.

## Build Order

**Dependency graph:**

```
1. EncryptedStorage (no deps)
   └─ Persists API keys securely

2. AIProvider (depends on EncryptedStorage)
   └─ Provides LLM interface

3. ContentExtractor (depends on ZoteroConnector, needs LongContentHandler)
   ├─ Extracted content feeds into enrichment

4. LongContentHandler (depends on AIProvider)
   └─ Handles large PDFs

5. SmartClassifier (depends on AIProvider)
   └─ Classifies items into domains

6. TemplateSelector (no deps, data-driven)
   └─ Selects template based on item type + domain

7. EnrichmentValidator (no deps)
   └─ Validates LLM output

8. QueueManager (depends on RegistryService)
   └─ Tracks pending enrichment

9. EnrichmentOrchestrator (depends on all above)
   └─ Coordinates pipeline

10. TriageView updates (depends on EnrichmentOrchestrator)
    └─ Integrate enrichment into Accept flow

11. Settings updates (depends on enrichment config needs)
    └─ Add enrichment settings UI

12. Note structure updates (depends on validation + templates)
    └─ Enhance note format with enriched fields
```

**Parallel tracks possible:**
- Track A: EncryptedStorage → AIProvider → SmartClassifier + LongContentHandler (AI foundation)
- Track B: ContentExtractor + TemplateSelector (Content layer)
- Track C: EnrichmentValidator + QueueManager (Validation layer)
- Track D: EnrichmentOrchestrator (Orchestration, depends on A, B, C)
- Track E: UI integration (depends on D)
- Track F: Settings/configuration (depends on D)

**Critical path:** EncryptedStorage → AIProvider → EnrichmentOrchestrator → UI integration

## Performance Implications

### Blocking Operations
- **Note creation:** Synchronous, ~100ms (writes file to vault)
- **Registry update:** Debounced, ~2s later (minimal impact)

### Non-Blocking Operations (Async)
- **Enrichment pipeline:** Runs background after note created
  - Classification: ~2-5s (LLM call + parsing)
  - Extraction: ~1-3s (PDF text or abstract)
  - Enrichment: ~5-15s (LLM call with content)
  - Validation: ~1-2s (schema + optional faithfulness check)
  - **Total:** 10-30s typical for full enrichment

### Timeouts
- **Content extraction:** 30s timeout (PDF parsing can be slow)
- **LLM API call:** 60s timeout (API latency)
- **Enrichment pipeline:** 2min total (cancel and queue if exceeded)

### Memory
- **PDF extraction cache:** ~100MB for 1000 PDFs (optional LRU cache)
- **Chunk processing:** ~10MB working memory for large docs
- **Queue state:** ~1KB per pending item

### Resource Constraints
- **API rate limiting:** User-configured (e.g., 3 requests/min for free tier)
- **Concurrent enrichment:** Single-threaded (one item at a time) to avoid API hammering
- **Token budgets:** User sets monthly quota in settings

## Error Handling Paths

### Path 1: Evidence Too Low (Metadata-Only)
```
Item lacks PDF/notes → AssessEvidence returns 'metadata'
→ EnrichmentOrchestrator decides not to enrich
→ QueueManager.queue(item, 'metadata-only')
→ Create diagnostic stub note
→ Return success (no error to user)
```

### Path 2: Classification Fails
```
SmartClassifier API error → Retry with backoff
→ Still fails after 3 retries
→ Use generic template (fallback)
→ Continue to extraction
→ Or: Queue for manual classification
```

### Path 3: Extraction Fails
```
PDF extraction timeout → Fall back to abstract
→ Abstract empty → Use metadata only
→ Continue with whatever content available
→ Or: Queue if no content at all
```

### Path 4: LLM API Key Missing
```
AIProvider.sendRequest() → EncryptedStorage returns null
→ Return error: "API key not configured"
→ TriageView shows: "Configure API key in settings"
→ User manually enables in SettingsPanel
→ User retries enrichment
```

### Path 5: LLM Output Invalid
```
LLM returns malformed JSON → Validator catches exception
→ Return validation error: "Invalid response structure"
→ EnrichmentValidator.validateAgainstSchema() fails
→ Flag warnings but persist anyway (partial enrichment)
→ User can manually fix in note
```

### Path 6: Rate Limited
```
AIProvider.sendRequest() gets 429 (too many requests)
→ retryWithBackoff waits 30s, retries
→ Hits max retries → throw error
→ EnrichmentOrchestrator catches → Queue for retry
→ QueueManager.queue(item, 'rate-limited')
→ User can retry later
```

### Path 7: Network Error During Enrichment
```
Fetch fails (no internet) → retryWithBackoff tries 3x
→ All fail → EnrichmentOrchestrator catches
→ Note already saved (safe state)
→ Log error, update registry to 'imported' (not 'enriched')
→ User sees note in vault, can manually enrich later
```

## Component Boundaries

| Component | Inputs | Outputs | Error Handling |
|-----------|--------|---------|-----------------|
| **EnrichmentOrchestrator** | ZoteroItem, optional onProgress | EnrichmentResult | Catches all errors, returns result object |
| **SmartClassifier** | Item title + abstract + tags | Classification { domain, confidence } | Retries API, falls back to 'general' domain |
| **TemplateSelector** | itemType + domain | EnrichmentTemplate | Returns generic fallback if no match |
| **ContentExtractor** | ZoteroItem | ExtractedContent { text, source } | Falls back: PDF → abstract → metadata |
| **LongContentHandler** | Full text + template | Enriched field values | Deduplicates, merges responses |
| **AIProvider** | Prompt + system + schema | LLM response (string or JSON) | Retry with backoff, respects rate limits |
| **EnrichmentValidator** | LLM response + schema | ValidationResult { valid, warnings } | Returns validation report, doesn't throw |
| **EncryptedStorage** | Provider name + key | Encrypted persistence | Returns null if key missing (not error) |
| **QueueManager** | Item + reason | Queued state | Persists in storage, retryable |
| **NoteGenerator** | Enriched content | Updated file | Throws if file write fails (caller handles) |

## Open Questions for Phase-Specific Research

1. **PDF extraction library:** Use pdfjs-dist, pdfjs-lib, or custom? Licensing/bundling?
2. **Encryption library:** Use OS keychain (best UX) or libsodium.js (pure JS)? Electron vs browser?
3. **LLM provider selection:** Support Claude + OpenAI + Ollama from day 1, or start with one?
4. **Template system:** Hard-code templates or load from JSON files? Version control for updates?
5. **Streaming responses:** Support streaming LLM responses or batch only? Affects progress UI.
6. **Faithfulness checking:** Always validate LLM output against source, or optional/slower check?
7. **PDF caching:** Store extracted text in plugin storage? Per-item or global cache?
8. **Video handling:** TranscriptFetcher for YouTube/Vimeo transcripts? Or fallback to metadata?
9. **Structured output:** Use LLM native structured output (Claude tools, GPT JSON mode) or parse?
10. **Token counting:** Use official libraries (tiktoken, js-tokenizers) or estimate? Accuracy vs speed tradeoff?

## Risk Assessment

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| API key security | HIGH | Use OS keychain, never log keys, encrypt storage, rotate periodically | Design |
| User's API quota exceeded | MEDIUM | Track token usage, warn before exceeding quota, allow disabling enrichment | Config |
| LLM hallucination | MEDIUM | Faithfulness validation, flag suspicious claims, user can edit before saving | Validation |
| UI blocked during enrichment | LOW | Fire-and-forget async design, note saved immediately, modal shows progress | Design |
| Large PDF extraction | MEDIUM | Timeout after 30s, fall back to abstract, cache extracted text | Implementation |
| Rate limiting API calls | MEDIUM | Client-side rate limiter, queue failed items, exponential backoff | Implementation |
| Incompatible item types | LOW | Generic fallback template, manual enrichment for edge cases | Template |
| State machine corruption | LOW | Registry persists to plugin storage, debounced saves, validation on load | Existing |
| Out-of-memory large PDFs | LOW | Chunk processing, streaming extraction, memory monitoring | Implementation |
| Schema version mismatch | MEDIUM | Version template schemas, migration for changes, graceful fallback | Design |

## Sources

- [ZoteroConnector implementation](../../src/db/zotero-connector.ts) — Database access patterns, chunking
- [RegistryService implementation](../../src/registry/registry-service.ts) — State persistence, debouncing
- [NoteGenerator implementation](../../src/notes/note-generator.ts) — File creation, YAML frontmatter
- [TriageView implementation](../../src/ui/triage-view.ts) — UI flow, Accept action handler
- [ProgressTracker implementation](../../src/performance/progress-tracker.ts) — Progress feedback
- [ValidationService implementation](../../src/validation/validation-service.ts) — Quality gates
- [RecommendationEngine implementation](../../src/recommendations/recommendation-engine.ts) — Multi-signal pattern
- [Existing Architecture document](./ARCHITECTURE.md) — v1.x patterns and state flow
- [Milestone context](../milestone_context provided) — Enrichment requirements
- [Phase 7 context](../phases/07-tag-based-recommendations/07-CONTEXT.md) — Component patterns

---

**Conclusion:** AI enrichment integrates as an optional, non-blocking async pipeline triggered from the existing Accept flow. New components (9 major: Orchestrator, Classifier, Selector, Extractor, Handler, Provider, Validator, Storage, Queue) follow established patterns (DI, async chunking, error handling) while maintaining compatibility with v1.x registry and note generation. Critical integration point is the Accept button flow — synchronous note creation returns immediately, async enrichment updates note asynchronously. Build order emphasizes API/storage foundation first (EncryptedStorage → AIProvider), then content layer (ContentExtractor), then orchestration, finally UI integration. **Estimated LOC for core enrichment: 1,500-2,000 lines across 9 components.** No architectural redesign needed — enrichment adds layers on top of existing foundations.
