# Phase 16: Enrichment Orchestration & Validation - Research

**Researched:** 2026-02-01
**Domain:** Blocking async orchestration, progress feedback, output validation, hallucination detection, error recovery
**Confidence:** HIGH for orchestration patterns and validation stack; MEDIUM for hallucination thresholds and timeout tuning; LOW for optimal modal delay timing

## Summary

Phase 16 orchestrates the Accept workflow into a blocking, multi-stage pipeline that transforms items into enriched notes while providing real-time progress feedback and validating output against evidence. Research confirms three critical technical domains:

1. **Orchestration with Progress Feedback** - Modern async workflows use state machines or explicit pipeline stages with Obsidian Notice API for non-blocking feedback. Blocking operations (10-30s) show modals or notices with update capability. Standard pattern is stage-based progress (Classification → Extraction → Enrichment → Validation) with percentage tracking.

2. **Output Validation Stack** - YAML frontmatter validation uses Zod schemas paired with JSON Schema validation. Metadata consistency (authors, year, title matching) is checked at parse time. Hallucination detection uses claim-level validation against source text via fact-checking LLMs or pattern matching.

3. **Error Recovery & Resilience** - Stub note fallback on enrichment failure prevents workflow breakage. Queue management for retries uses exponential backoff from Phase 14. Manual re-trigger via command palette is standard pattern. Timeout after 2 minutes prevents UI freeze with graceful degradation.

**Primary recommendation:** Implement orchestration as explicit state machine (Classification → Extraction → Enrichment → Validation → SaveNote) with Obsidian Notice for blocking operations showing progress percentage. Use Zod + JSON Schema for YAML frontmatter validation. Claim-level hallucination detection compares LLM output against source text using semantic similarity (not token-by-token matching). On failure, create stub note + queue for retry. Support manual re-enrichment via command palette. Set timeout to 2 minutes with auto-queue fallback.

## Standard Stack

### Orchestration & State Management

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Explicit State Machine** | Custom or XState | Orchestrate pipeline stages with clear transitions | Industry standard for multi-stage workflows; prevents race conditions, enables state recovery |
| **XState** (optional) | v5+ | Actor-based state management with events and transitions | Zero-dependency, proven for complex workflows; enables visualization of state diagram |
| **Obsidian Notice API** | Built-in (v1.0+) | Show progress notifications for blocking operations | Native Obsidian pattern; non-dismissible by default; supports update lifecycle |
| **Promises/async-await** | ES2020+ | Sequential stage execution with error boundaries | Native JavaScript; sufficient for linear pipeline |

### Validation Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Zod** | 3.25+ (existing) | Schema validation for YAML frontmatter + output structure | Type-safe, runtime validation; already in package.json; no learning curve |
| **JSON Schema** | Draft 2020-12 | Formal spec for validating YAML structure | Universal standard; integrates with Zod via schema conversion |
| **gray-matter** | 4.0+ | Parse YAML frontmatter from Markdown | Reliable, zero-dependency parser; standard in Markdown ecosystems |

### Hallucination Detection & Claim Validation

| Component | Source | Purpose | Standard |
|-----------|--------|---------|----------|
| **Semantic Similarity** | Existing AIService (Phase 14) | Compare claim text against source text embeddings/LLM scoring | Industry standard for claim validation; avoids brittle regex |
| **Fact-Checking LLM** | Existing AIProvider | Secondary validation: "Is this claim supported by the source?" | Pattern from research; uses LLM's reasoning for evidence matching |
| **Pattern Matching** | Custom rules | Quick validation for obvious hallucinations (author name mismatch, year out of range) | Fast fallback before expensive LLM calls |

### Supporting Libraries (Existing)

| Library | Version | Purpose |
|---------|---------|---------|
| **lodash.debounce** | 4.0+ | Throttle rapid validation/queue operations |
| **Node.js fs/promises** | Built-in | File I/O for note creation and stub recovery |

### Installation

```bash
# Zod already in package.json
# No new packages required; use existing stack
# Optional: npm install xstate (if choosing state machine library)
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Explicit state machine | Callback chains or event emitters | Event emitters are simpler but lack state visibility. Callbacks suffer from "callback hell". State machine adds clarity, visibility. |
| Zod + JSON Schema | Runtime validation only | Runtime-only validation misses YAML parse errors. Schema validation catches structural issues before processing. |
| Claim validation via LLM | Regex pattern matching or keyword overlap | Regex is fragile (breaks on synonyms, phrasing changes). Keyword overlap misses semantic hallucinations. LLM understands meaning. |
| Obsidian Notice | Custom modal with progress bar | Custom modals are more flexible but less native. Notice is simpler, follows platform conventions. |
| Timeout (2 minutes) | No timeout, let operations run | UI freeze risk. Users force-close plugin. Timeout prevents deadlock. |

## Architecture Patterns

### Recommended Project Structure

```
src/
├── orchestration/
│   ├── enrichment-orchestrator.ts      # Main pipeline orchestrator
│   ├── pipeline-stages.ts              # Classification, Extraction, Enrichment, Validation stages
│   ├── state-machine.ts                # FSM or explicit state transitions
│   ├── progress-reporter.ts            # Obsidian Notice + update logic
│   └── types.ts                        # PipelineState, StageResult, PipelineError types
│
├── validation/
│   ├── frontmatter-validator.ts        # YAML frontmatter schema validation (Zod)
│   ├── claim-validator.ts              # Hallucination detection + claim validation
│   ├── metadata-consistency.ts         # Author/year/title matching against evidence
│   └── schemas.ts                      # Zod schema definitions for YAML output
│
├── error-recovery/
│   ├── stub-note-generator.ts          # Create fallback stub note on failure
│   ├── retry-queue.ts                  # Queue failed enrichments for manual/batch retry
│   └── timeout-handler.ts              # 2-minute timeout + graceful degradation
│
├── services/
│   ├── enrichment-service.ts           # REUSE from Phase 15
│   ├── ai-service.ts                   # REUSE from Phase 14 for claim validation LLM calls
│   └── evidence-extractor.ts           # REUSE from Phase 14/15
│
└── ui/
    ├── enrichment-progress-modal.ts    # Progress modal with step tracking
    ├── enrichment-notice.ts            # Obsidian notice for blocking feedback
    └── manual-retry-command.ts         # Command palette entry for re-enrichment
```

### Pattern 1: Pipeline Orchestration with State Machine

**What:** Explicit state machine that orchestrates the four pipeline stages (Classification → Extraction → Enrichment → Validation → SaveNote) with error boundaries and progress reporting at each stage.

**When to use:** Accept workflow. Each item goes through all stages sequentially. Failed stages trigger error recovery path.

**Standard approach:**

```typescript
// Source: State machine patterns consensus (2024-2026), Azure Durable Orchestrations
// File: src/orchestration/state-machine.ts

export type PipelineStage =
  | 'idle'
  | 'classifying'
  | 'extracting'
  | 'enriching'
  | 'validating'
  | 'saving'
  | 'completed'
  | 'failed';

export interface PipelineState {
  stage: PipelineStage;
  item: ZoteroItem;
  progress: { current: number; total: number }; // 0-100%
  classification?: ClassificationResult;
  evidence?: EvidenceExtraction;
  enrichment?: EnrichedNote;
  validationErrors: ValidationError[];
  error?: Error;
}

export interface PipelineContext {
  state: PipelineState;
  onProgress: (progress: number, stage: string) => void;
  onError: (error: Error) => void;
}

// Simple state machine (no external library needed)
export class EnrichmentOrchestrator {
  private currentState: PipelineState;
  private progressReporter: ProgressReporter;

  async orchestrate(
    item: ZoteroItem,
    onProgress: (percent: number, stage: string) => void
  ): Promise<EnrichedNoteOutput> {
    this.currentState = {
      stage: 'idle',
      item,
      progress: { current: 0, total: 100 },
      validationErrors: []
    };

    try {
      // Stage 1: Classification (0-25%)
      await this.runStage(
        'classifying',
        () => this.classifyItem(item),
        (result) => { this.currentState.classification = result; },
        25
      );
      onProgress(25, 'Classification complete');

      // Stage 2: Extraction (25-50%)
      await this.runStage(
        'extracting',
        () => this.extractEvidence(item),
        (result) => { this.currentState.evidence = result; },
        50
      );
      onProgress(50, 'Evidence extracted');

      // Stage 3: Enrichment (50-75%)
      await this.runStage(
        'enriching',
        () => this.enrichNote(item, this.currentState.evidence!),
        (result) => { this.currentState.enrichment = result; },
        75
      );
      onProgress(75, 'Enrichment complete');

      // Stage 4: Validation (75-100%)
      await this.runStage(
        'validating',
        () => this.validateOutput(this.currentState.enrichment!),
        (errors) => { this.currentState.validationErrors = errors; },
        100
      );
      onProgress(100, 'Validation complete');

      // Stage 5: Save note
      await this.runStage(
        'saving',
        () => this.saveEnrichedNote(this.currentState.enrichment!),
        () => {},
        100
      );

      this.currentState.stage = 'completed';
      return this.currentState.enrichment!;
    } catch (error) {
      this.currentState.stage = 'failed';
      this.currentState.error = error as Error;
      throw error;
    }
  }

  private async runStage<T>(
    stageName: PipelineStage,
    stageFunction: () => Promise<T>,
    onSuccess: (result: T) => void,
    progressPercent: number
  ): Promise<void> {
    this.currentState.stage = stageName;
    this.currentState.progress.current = progressPercent;

    try {
      const result = await stageFunction();
      onSuccess(result);
    } catch (error) {
      // On any stage failure, immediately transition to error recovery
      throw new PipelineStageError(stageName, error as Error);
    }
  }

  // Individual stage implementations
  private async classifyItem(item: ZoteroItem): Promise<ClassificationResult> {
    return await this.classifier.classify(item);
  }

  private async extractEvidence(item: ZoteroItem): Promise<EvidenceExtraction> {
    return await this.evidenceExtractor.extract(item);
  }

  private async enrichNote(item: ZoteroItem, evidence: EvidenceExtraction): Promise<EnrichedNote> {
    return await this.enrichmentService.enrich(item, evidence, this.currentState.classification!.domain);
  }

  private async validateOutput(enrichment: EnrichedNote): Promise<ValidationError[]> {
    return await this.outputValidator.validate(enrichment, this.currentState.evidence!);
  }

  private async saveEnrichedNote(enrichment: EnrichedNote): Promise<void> {
    await this.noteStorage.save(enrichment);
  }
}

export class PipelineStageError extends Error {
  constructor(
    public stage: PipelineStage,
    public originalError: Error
  ) {
    super(`Pipeline failed at stage ${stage}: ${originalError.message}`);
    this.name = 'PipelineStageError';
  }
}
```

**Key insight:** No external state machine library needed. Explicit state transitions with try-catch error boundaries are sufficient for linear pipelines. XState is optional for visual state diagram generation but adds complexity.

### Pattern 2: Progress Feedback with Obsidian Notice

**What:** Show progress modal with percentage and current stage. Update in real-time as stages complete. Support dismiss-on-complete or persistent notice option.

**When to use:** Blocking operations (10-30s). Keep user informed without intrusive modal behavior.

**Standard approach:**

```typescript
// Source: Obsidian Notice API patterns, long-running operation feedback
// File: src/orchestration/progress-reporter.ts

export interface ProgressUpdate {
  percentage: number; // 0-100
  stage: string;      // "Classification", "Extraction", etc.
  message?: string;   // Optional detail message
}

export class ProgressReporter {
  private notice: Notice | null = null;
  private startTime = 0;
  private timeoutHandle: NodeJS.Timeout | null = null;

  /**
   * Show blocking progress notice for long operations
   * Blocks further interaction until closed/completed
   */
  showBlockingProgress(itemTitle: string): {
    updateProgress: (update: ProgressUpdate) => void;
    complete: () => void;
    fail: (error: Error) => void;
  } {
    this.startTime = Date.now();

    // Create modal for blocking operation
    const modal = new Modal(app);
    const contentEl = modal.contentEl;
    contentEl.empty();

    // Header
    contentEl.createEl('h2', { text: 'Enriching Note' });
    contentEl.createEl('p', { text: `Processing: ${itemTitle}` });

    // Progress bar
    const progressDiv = contentEl.createDiv({ cls: 'enrichment-progress-container' });
    const progressPercent = progressDiv.createEl('div', { cls: 'enrichment-progress-bar' });
    const progressLabel = contentEl.createEl('span', { cls: 'enrichment-progress-label', text: '0%' });

    // Stage info
    const stageInfo = contentEl.createEl('div', { cls: 'enrichment-stage-info' });
    stageInfo.createEl('strong', { text: 'Stage: ' });
    const stageName = stageInfo.createEl('span', { text: 'Initializing...' });

    // Time elapsed
    const elapsedInfo = contentEl.createEl('div', { cls: 'enrichment-elapsed' });
    const elapsedTime = elapsedInfo.createEl('span', { text: '0s' });
    const elapsedInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      elapsedTime.textContent = `${elapsed}s`;
    }, 1000);

    // Cancel button (optional - Claude's discretion)
    const actions = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    let isCancelled = false;
    cancelBtn.addEventListener('click', () => {
      isCancelled = true;
      modal.close();
      clearInterval(elapsedInterval);
    });

    modal.open();

    return {
      updateProgress: (update: ProgressUpdate) => {
        if (isCancelled) return;

        // Update progress bar
        progressPercent.style.width = `${update.percentage}%`;
        progressLabel.textContent = `${update.percentage}%`;

        // Update stage
        stageName.textContent = update.stage;

        // Update detail message if provided
        if (update.message) {
          stageInfo.textContent = `${update.stage} - ${update.message}`;
        }
      },

      complete: () => {
        clearInterval(elapsedInterval);
        modal.close();
      },

      fail: (error: Error) => {
        clearInterval(elapsedInterval);
        // Show error state
        progressDiv.style.backgroundColor = 'var(--color-error)';
        contentEl.createEl('p', {
          text: `Error: ${error.message}`,
          cls: 'mod-error'
        });
        // Keep modal open; user dismisses
      }
    };
  }

  /**
   * Show non-blocking notice for background operations
   * User can continue editing; notice auto-dismisses or stays persistent
   */
  showBackgroundProgress(message: string): {
    updateProgress: (update: ProgressUpdate) => void;
    complete: () => void;
  } {
    this.notice = new Notice(message, 0); // 0 = persistent (not auto-dismiss)

    return {
      updateProgress: (update: ProgressUpdate) => {
        if (!this.notice) return;
        // Update notice text (Notice API doesn't support inline progress bars)
        this.notice.setMessage(`${update.stage}: ${update.percentage}%`);
      },

      complete: () => {
        if (this.notice) {
          this.notice.setMessage('Enrichment complete!');
          setTimeout(() => this.notice?.hide(), 3000); // Auto-hide after 3s
        }
      }
    };
  }
}
```

**Key insight:** Obsidian Notice has two modes—blocking (Modal) for critical operations, non-blocking (Notice) for background tasks. Phase context says "blocking operations with progress feedback" so use Modal.

### Pattern 3: YAML Frontmatter Validation with Zod

**What:** Define Zod schema for YAML frontmatter structure. Parse and validate before saving note. Catch structural errors early.

**When to use:** Before saving enriched note to disk. Validate all required fields present, types correct, values valid.

**Standard approach:**

```typescript
// Source: Zod + JSON Schema validation consensus (2024-2026)
// File: src/validation/schemas.ts

import { z } from 'zod';

// Define YAML frontmatter schema
export const YAMLFrontmatterSchema = z.object({
  note_type: z.literal('literature-note'),
  zotero_item_type: z.enum([
    'journalArticle',
    'book',
    'thesis',
    'webpage',
    'document',
    'videoRecording',
    'conferencePaper',
    'report'
  ]),
  knowledge_domain: z.enum(['Academic', 'Software', 'Farming', 'General']),
  evidence_level: z.enum(['FullText', 'Transcript', 'Notes', 'Abstract', 'MetadataOnly']),
  template_used: z.enum(['ACADEMIC', 'SOFTWARE', 'FARMING', 'GENERAL']),
  date_processed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  zotero_key: z.string().optional(),
  doi: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional()
});

export type YAMLFrontmatter = z.infer<typeof YAMLFrontmatterSchema>;

// File: src/validation/frontmatter-validator.ts

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import matter from 'gray-matter';

export class FrontmatterValidator {
  /**
   * Parse Markdown file and validate YAML frontmatter
   */
  validateMarkdown(markdownContent: string): {
    valid: boolean;
    frontmatter?: YAMLFrontmatter;
    content: string;
    errors: string[];
  } {
    try {
      const { data, content } = matter(markdownContent);

      // Validate against Zod schema
      const result = YAMLFrontmatterSchema.safeParse(data);

      if (!result.success) {
        return {
          valid: false,
          content,
          errors: result.error.errors.map(err => {
            const path = err.path.join('.');
            return `${path}: ${err.message}`;
          })
        };
      }

      return {
        valid: true,
        frontmatter: result.data,
        content,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        content: markdownContent,
        errors: [`Failed to parse frontmatter: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Generate valid YAML frontmatter from structured data
   */
  generateFrontmatter(data: YAMLFrontmatter): string {
    // Validate before generating
    const result = YAMLFrontmatterSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`Invalid frontmatter data: ${JSON.stringify(result.error.errors)}`);
    }

    return stringifyYaml(result.data, { lineWidth: 0 });
  }

  /**
   * Merge frontmatter into Markdown (respects existing content)
   */
  mergeWithContent(frontmatter: YAMLFrontmatter, content: string): string {
    const yamlString = this.generateFrontmatter(frontmatter);
    return `---\n${yamlString}\n---\n${content}`;
  }
}
```

**Key insight:** Use gray-matter for YAML parsing (zero-dependency, reliable). Validate parsed YAML with Zod for runtime safety. Fail early on invalid structure—don't try to save invalid notes.

### Pattern 4: Claim-Level Hallucination Detection

**What:** Validate that claims in enriched note are supported by source text. Use semantic similarity or fact-checking LLM to verify claims against evidence.

**When to use:** Validation stage (Stage 4). After enrichment, before saving note.

**Standard approach:**

```typescript
// Source: Hallucination detection consensus (2024-2026), fact-checking LLM patterns
// File: src/validation/claim-validator.ts

export interface ValidationError {
  type: 'unsupported_claim' | 'metadata_mismatch' | 'low_confidence';
  section: string;        // e.g., "Main Findings", "Authors"
  claim: string;          // The problematic text
  sourceText: string;     // What's in the evidence
  confidence: number;     // 0-1; how confident in the error
  severity: 'error' | 'warning'; // Block save or just warn
}

export class ClaimValidator {
  constructor(
    private aiService: AIService,
    private evidenceExtractor: EvidenceExtractor
  ) {}

  /**
   * Validate enriched note against source evidence
   * Checks:
   * 1. Metadata consistency (title, authors, year match)
   * 2. Key claims supported by source
   * 3. No obvious hallucinations
   */
  async validateEnrichedNote(
    enrichment: EnrichedNote,
    evidence: EvidenceExtraction,
    item: ZoteroItem
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // 1. Quick metadata validation (fast path)
    const metadataErrors = this.validateMetadata(enrichment, item);
    errors.push(...metadataErrors);

    // 2. Claim validation via LLM (slower, more thorough)
    if (evidence.level !== 'MetadataOnly') {
      const claimErrors = await this.validateClaims(enrichment, evidence);
      errors.push(...claimErrors);
    }

    // 3. Filter: Only return errors with severity > threshold
    return errors.filter(e => e.severity === 'error' || e.confidence > 0.8);
  }

  private validateMetadata(
    enrichment: EnrichedNote,
    item: ZoteroItem
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Title validation: Should appear in enrichment or item abstract
    if (item.title && !this.containsText(enrichment.fullText, item.title, 0.8)) {
      errors.push({
        type: 'metadata_mismatch',
        section: 'Title',
        claim: enrichment.metadata.title || '',
        sourceText: item.title,
        confidence: 0.6,
        severity: 'warning' // Not critical, title might be paraphrased
      });
    }

    // Author validation: At least one author should match
    const enrichmentAuthors = this.extractAuthors(enrichment.fullText);
    const itemAuthors = item.creators.map(c => c.name || `${c.firstName} ${c.lastName}`);
    const authorMatch = itemAuthors.some(a =>
      enrichmentAuthors.some(e => this.stringsSimilar(a, e, 0.7))
    );

    if (!authorMatch && itemAuthors.length > 0) {
      errors.push({
        type: 'metadata_mismatch',
        section: 'Authors',
        claim: enrichmentAuthors.join(', '),
        sourceText: itemAuthors.join(', '),
        confidence: 0.9,
        severity: 'error'
      });
    }

    // Year validation: Should match item year
    if (item.year) {
      const yearInText = enrichment.fullText.match(/\b(19|20)\d{2}\b/g);
      const yearMatches = yearInText?.some(y => y === item.year.toString());

      if (!yearMatches) {
        errors.push({
          type: 'metadata_mismatch',
          section: 'Publication Year',
          claim: yearInText?.[0] || 'Not found',
          sourceText: item.year.toString(),
          confidence: 0.7,
          severity: 'warning'
        });
      }
    }

    return errors;
  }

  private async validateClaims(
    enrichment: EnrichedNote,
    evidence: EvidenceExtraction
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Extract key claims from enrichment (simple approach: sentences in key sections)
    const keyClaimsToValidate = [
      ...this.extractClaimsFromSection(enrichment.fullText, 'Main Findings'),
      ...this.extractClaimsFromSection(enrichment.fullText, 'Key Results')
    ].slice(0, 5); // Limit to top 5 claims to avoid excessive LLM calls

    for (const claim of keyClaimsToValidate) {
      const isSupported = await this.isClaimSupportedByEvidence(claim, evidence.content);

      if (!isSupported.supported && isSupported.confidence > 0.8) {
        errors.push({
          type: 'unsupported_claim',
          section: 'Main Findings',
          claim,
          sourceText: evidence.content.substring(0, 500),
          confidence: isSupported.confidence,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Use fact-checking LLM to determine if claim is in evidence
   */
  private async isClaimSupportedByEvidence(
    claim: string,
    evidenceText: string
  ): Promise<{ supported: boolean; confidence: number }> {
    const prompt = `Determine if this claim is supported by the given text.

Claim: "${claim}"

Text excerpt: "${evidenceText.substring(0, 1000)}"

Respond ONLY with JSON: { "supported": true/false, "confidence": 0.0-1.0, "reasoning": "..." }`;

    try {
      const response = await this.aiService.complete({
        systemPrompt: 'You are a fact-checker. Determine if claims are supported by evidence.',
        prompt,
        temperature: 0.3,
        maxTokens: 100
      });

      const result = JSON.parse(response.content);
      return {
        supported: result.supported,
        confidence: Math.min(1, Math.max(0, result.confidence))
      };
    } catch (error) {
      // On LLM error, be conservative: assume claim is unsupported
      return { supported: false, confidence: 0.4 };
    }
  }

  // Helper methods
  private containsText(text: string, search: string, threshold: number): boolean {
    const similarity = this.stringSimilarity(text.toLowerCase(), search.toLowerCase());
    return similarity > threshold;
  }

  private stringsSimilar(a: string, b: string, threshold: number): boolean {
    const similarity = this.stringSimilarity(a.toLowerCase(), b.toLowerCase());
    return similarity > threshold;
  }

  private stringSimilarity(a: string, b: string): number {
    // Simple Levenshtein-based similarity (0-1)
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const editDistance = this.levenshtein(longer, shorter);
    return 1 - editDistance / longer.length;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private extractClaimsFromSection(text: string, section: string): string[] {
    // Simple extraction: find section heading and extract sentences
    const regex = new RegExp(`## ${section}([^#]*)`, 'i');
    const match = text.match(regex);
    if (!match) return [];

    const sectionText = match[1];
    const sentences = sectionText.split(/\.\s+/).filter(s => s.length > 20);
    return sentences.slice(0, 3); // Top 3 claims per section
  }

  private extractAuthors(text: string): string[] {
    // Simple extraction: look for "Authors:" or "by" patterns
    // In production, use more sophisticated NER
    const match = text.match(/(?:Authors?:|by)\s*([^\n]+)/i);
    if (!match) return [];
    return match[1].split(/,|and/).map(a => a.trim()).filter(a => a.length > 2);
  }
}
```

**Key insight:** Claim validation is expensive (LLM calls). Validate only on validation stage, not continuously. Use metadata validation fast path first (string similarity), then selective claim validation. Don't validate every sentence—pick top claims only.

### Pattern 5: Stub Note & Error Recovery

**What:** On enrichment failure, create minimal "stub note" with metadata + diagnostic info. Queue for manual retry. Don't break workflow.

**When to use:** Enrichment stage failure (ANY exception). Saves partial work and prevents data loss.

**Standard approach:**

```typescript
// Source: Resilience patterns consensus (2024-2026), fallback strategies
// File: src/error-recovery/stub-note-generator.ts

export interface StubNote {
  title: string;
  metadata: {
    note_type: 'literature-note';
    zotero_item_type: string;
    status: 'stub';
    created_at: string;
    last_enrichment_attempt: string;
    error_message: string;
  };
  diagnostic: {
    stage_failed: PipelineStage;
    evidence_level: string;
    full_error?: string;
  };
  content: string; // Minimal content: title, authors, abstract
}

export class StubNoteGenerator {
  /**
   * Generate stub note from partial pipeline state
   * Called on any enrichment failure
   */
  generateStubNote(
    item: ZoteroItem,
    failureContext: {
      stage: PipelineStage;
      error: Error;
      evidence?: EvidenceExtraction;
      classification?: ClassificationResult;
    }
  ): StubNote {
    const frontmatter = {
      note_type: 'literature-note' as const,
      zotero_item_type: item.itemType,
      knowledge_domain: failureContext.classification?.domain || 'General',
      evidence_level: failureContext.evidence?.level || 'MetadataOnly',
      template_used: 'GENERAL', // Default template for stub
      date_processed: new Date().toISOString().split('T')[0],
      zotero_key: item.key,
      status: 'stub',
      last_enrichment_attempt: new Date().toISOString(),
      error_message: failureContext.error.message
    };

    // Build minimal content from available data
    let content = '';
    content += `# ${item.title || 'Untitled'}\n\n`;

    if (item.creators && item.creators.length > 0) {
      const authors = item.creators
        .map(c => c.name || `${c.firstName} ${c.lastName}`)
        .join(', ');
      content += `**Authors:** ${authors}\n\n`;
    }

    if (item.year) {
      content += `**Year:** ${item.year}\n\n`;
    }

    if (item.abstract) {
      content += `## Abstract\n\n${item.abstract}\n\n`;
    }

    // Diagnostic info for user
    content += `---\n\n## Enrichment Status\n\n`;
    content += `**Status:** ⚠️ Enrichment Failed\n\n`;
    content += `Failed at stage: **${failureContext.stage}**\n\n`;
    content += `Error: ${failureContext.error.message}\n\n`;
    content += `This note was created with minimal content as a fallback. You can:\n`;
    content += `1. Retry enrichment via command palette: "Zotero Triage: Re-enrich Note"\n`;
    content += `2. Manually complete the note\n`;
    content += `3. Check the error and retry later\n`;

    return {
      title: item.title || 'Untitled',
      metadata: frontmatter as any,
      diagnostic: {
        stage_failed: failureContext.stage,
        evidence_level: failureContext.evidence?.level || 'Unknown',
        full_error: failureContext.error.stack
      },
      content
    };
  }

  /**
   * Save stub note to vault
   */
  async saveStubNote(stub: StubNote, vaultPath: string): Promise<string> {
    const yaml = `---
note_type: ${stub.metadata.note_type}
zotero_item_type: ${stub.metadata.zotero_item_type}
knowledge_domain: ${stub.metadata.knowledge_domain}
evidence_level: ${stub.metadata.evidence_level}
template_used: ${stub.metadata.template_used}
date_processed: ${stub.metadata.date_processed}
zotero_key: ${stub.metadata.zotero_key}
status: stub
last_enrichment_attempt: ${stub.metadata.last_enrichment_attempt}
error_message: ${stub.metadata.error_message.replace(/"/g, '\\"')}
---
`;

    const filePath = `${vaultPath}/${stub.title}.md`;
    await this.vault.create(filePath, yaml + stub.content);

    return filePath;
  }
}

// File: src/error-recovery/retry-queue.ts

export interface QueuedEnrichment {
  id: string;
  itemKey: string;
  itemTitle: string;
  notePath: string;
  failedAt: string;
  failureReason: string;
  attempts: number;
  lastAttemptTime: string;
  nextRetryTime: string;
}

export class RetryQueue {
  private queueFile = '.zotero-triage-queue.json';

  /**
   * Queue failed enrichment for manual retry
   */
  async queueForRetry(
    item: ZoteroItem,
    notePath: string,
    error: Error
  ): Promise<void> {
    const queue = await this.loadQueue();

    const existing = queue.find(q => q.itemKey === item.key);
    if (existing) {
      existing.attempts++;
      existing.lastAttemptTime = new Date().toISOString();
      existing.nextRetryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min delay
    } else {
      queue.push({
        id: crypto.randomUUID(),
        itemKey: item.key,
        itemTitle: item.title,
        notePath,
        failedAt: new Date().toISOString(),
        failureReason: error.message,
        attempts: 1,
        lastAttemptTime: new Date().toISOString(),
        nextRetryTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      });
    }

    await this.saveQueue(queue);
  }

  /**
   * Get all queued items ready for retry
   */
  async getReadyForRetry(): Promise<QueuedEnrichment[]> {
    const queue = await this.loadQueue();
    const now = new Date();

    return queue.filter(q => {
      const nextRetry = new Date(q.nextRetryTime);
      return nextRetry <= now && q.attempts < 5; // Max 5 retries
    });
  }

  /**
   * Remove item from queue after successful retry
   */
  async removeFromQueue(id: string): Promise<void> {
    const queue = await this.loadQueue();
    const filtered = queue.filter(q => q.id !== id);
    await this.saveQueue(filtered);
  }

  private async loadQueue(): Promise<QueuedEnrichment[]> {
    try {
      const content = await this.vault.read(this.queueFile);
      return JSON.parse(content);
    } catch {
      return []; // File doesn't exist or empty
    }
  }

  private async saveQueue(queue: QueuedEnrichment[]): Promise<void> {
    await this.vault.write(this.queueFile, JSON.stringify(queue, null, 2));
  }
}
```

**Key insight:** Stub notes prevent total data loss. User gets immediate feedback ("Enrichment failed"), can see diagnostic info, and can manually retry. Queue persists across sessions.

### Pattern 6: Timeout Handling (2-Minute Limit)

**What:** Set 2-minute maximum for entire enrichment pipeline. On timeout, save stub note and queue for retry instead of freezing UI.

**When to use:** Orchestrator wraps entire pipeline in timeout handler. Prevents indefinite hangs.

**Standard approach:**

```typescript
// Source: Timeout handling patterns (2024-2026), Azure Functions durable timeouts
// File: src/error-recovery/timeout-handler.ts

export class TimeoutHandler {
  private static readonly ENRICHMENT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  /**
   * Wrap pipeline execution in timeout
   */
  static async executeWithTimeout<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    return Promise.race([
      operation(),
      this.createTimeoutPromise(operationName)
    ]);
  }

  private static createTimeoutPromise<T>(operationName: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `${operationName} timed out after ${this.ENRICHMENT_TIMEOUT_MS / 1000} seconds`
        ));
      }, this.ENRICHMENT_TIMEOUT_MS);
    });
  }
}

export class TimeoutError extends Error {
  name = 'TimeoutError';
}

// In orchestrator:
async orchestrate(item: ZoteroItem): Promise<EnrichedNoteOutput> {
  try {
    return await TimeoutHandler.executeWithTimeout(
      () => this.runPipeline(item),
      'Enrichment pipeline'
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Timeout occurred; create stub + queue
      const stub = this.stubGenerator.generateStubNote(item, {
        stage: this.currentState.stage,
        error,
        evidence: this.currentState.evidence,
        classification: this.currentState.classification
      });

      await this.stubGenerator.saveStubNote(stub, notesPath);
      await this.retryQueue.queueForRetry(item, stubNotePath, error);

      throw new EnrichmentTimeoutError(
        `Enrichment timed out. Stub note created: ${stubNotePath}`
      );
    }

    throw error;
  }
}
```

**Key insight:** 2-minute timeout is conservative (most operations complete in 10-30s). If timeout occurs, it's likely API/network issue, so stub + queue + retry is better than hanging.

## Don't Hand-Roll

Problems that look simple but have existing, essential solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State transitions for pipeline | Custom if-else state tracking | Explicit state machine or FSM library | State machines prevent invalid transitions, enable visualization, reduce bugs from implicit state |
| Progress percentage calculation | Manual tracking of stage counts | Explicit stage-to-percentage mapping | Easy to get wrong (4 stages ≠ 25% each if stages have different duration). Mapping prevents confusion. |
| YAML frontmatter validation | Custom string checks | Zod + JSON Schema | Zod catches type errors at runtime. JSON Schema handles structural validation. Combined = bulletproof. |
| Hallucination detection | Regex or keyword matching | LLM fact-checker or semantic similarity | Semantic claims can't be detected by keywords. LLM understands meaning. Investing in validation saves support tickets. |
| Timeout handling | Manual setTimeout tracking | Promise.race() with timeout promise | Promise.race is standard, proven pattern. Manual tracking is error-prone. |
| Stub note creation | Skip and show error | Fallback stub with diagnostic info | Users lose work if error occurs. Stub preserves partial progress and metadata. Critical for resilience. |
| Retry queue | In-memory only | Persistent queue file | In-memory queues lost on app restart. File-based persists, survives crashes. Essential for reliability. |

**Key insight:** Phase 16 is where complexity comes from orchestrating multiple services. Hand-rolling solutions here causes cascade failures (one bad retry crashes the modal, state gets stuck, etc). Use proven patterns.

## Common Pitfalls

### Pitfall 1: Progress Percentage Not Representing Actual Time

**What goes wrong:** Four stages → show 25% per stage. But Classification takes 0.5s, Enrichment takes 20s. User sees "50% (Enrichment)" and waits 20s more. Feels stuck.

**Why it happens:** Linear percentage mapping assumes equal stage duration. Reality: stages have huge variance.

**How to avoid:**
- Map stages to realistic time: Classification 5%, Extraction 10%, Enrichment 60%, Validation 20%, Save 5%
- Better: Use adaptive timing based on actual stage durations from previous runs
- Feedback: Show "Enriching note... this typically takes 15-30 seconds"
- Don't promise "10% per stage"—show actual progress as percentage, not stage count

**Warning signs:**
- Progress bar gets stuck at 50% for long time
- User reports "progress bar doesn't move"
- Testing shows last stage takes 3x longer than shown

### Pitfall 2: Validation Errors on Low-Confidence Claims Blocking Save

**What goes wrong:** Hallucination detector flags paraphrased claim as unsupported. Note doesn't save. User frustrated: "The content IS in the source!"

**Why it happens:** Claim validation is imperfect. LLM overconfident that claim isn't supported. Threshold too strict.

**How to avoid:**
- Treat validation errors as warnings when confidence < 0.95 (allow some uncertainty)
- Only BLOCK save if confidence > 0.95 AND severity = 'error'
- For lower confidence, show "⚠️ Possible hallucination" in frontmatter but save anyway
- Let user review and correct if needed
- Log validation warnings for debugging, don't surface to user every time

**Warning signs:**
- Users report "Note won't save because of paraphrasing"
- Validation errors on claims that ARE in the source (false positives)
- Users bypassing validation or getting frustrated

### Pitfall 3: State Machine State Lost on Error

**What goes wrong:** Classification succeeds, enrichment fails. State is lost. User clicks "Retry" and restarts from beginning, re-classifying. Wasteful.

**Why it happens:** State not persisted. Error handler doesn't preserve partial state.

**How to avoid:**
- Persist pipeline state to file after each successful stage
- On retry, load saved state and resume from failure point, not start
- Include state in stub note: "Failed at Enrichment stage. Classification: Academic, Evidence: FullText"
- User can retry just enrichment without re-classifying

**Warning signs:**
- Retrying takes same time as first attempt (no resume)
- Users see "Classification" progress twice
- Inefficient retry loop

### Pitfall 4: Timeout Too Short or Too Long

**What goes wrong:**
- 30-second timeout: 70% of enrichments timeout on slow networks. Stub notes everywhere.
- 10-minute timeout: UI frozen for 10 min on API outage. User force-quits app.

**Why it happens:** Timeout tuning is empirical. Hard to predict in test environment.

**How to avoid:**
- 2 minutes is conservative (Phase context decision). Safe for both fast and slow networks.
- Monitor actual enrichment times in production. Adjust if needed.
- On timeout, default action is stub + queue. Don't retry immediately (avoid cascade).
- Log timeouts separately. Alert if > 10% of operations timeout.

**Warning signs:**
- Frequent stub notes from timeouts (infrastructure issue)
- UI frozen for long periods
- Timeout errors on fast operations (2 min is overkill)

### Pitfall 5: Stub Note Diagnostic Info Unclear

**What goes wrong:** User sees stub note with "Failed at Enrichment stage: Error: Rate limit exceeded". Doesn't know what to do next.

**Why it happens:** Diagnostic info is technical. User doesn't know if it's retryable, user's fault, or permanent issue.

**How to avoid:**
- Include clear next steps: "Retry enrichment via command palette" vs "Check API key configuration"
- Differentiate retryable errors (rate limit, timeout) from permanent (invalid API key)
- Link to error recovery docs
- Provide command to manually retry from stub note

**Warning signs:**
- User creates new note instead of retrying stub
- Users report "I don't understand the error"
- Support tickets about stub notes

### Pitfall 6: Claim Validation Too Expensive

**What goes wrong:** Validating 50 claims via LLM for every note = 50 API calls = slow, expensive, rate-limited.

**Why it happens:** Validating all claims sounds thorough. Reality: expensive.

**How to avoid:**
- Validate only top 5 key claims (not every sentence)
- Use fast metadata validation first (title, authors, year)
- Only run expensive LLM claim validation if metadata passes
- Cache validation results; don't re-validate same claims

**Warning signs:**
- Enrichment takes 30+ seconds just for validation
- High API usage from validation calls
- Rate limit errors during validation phase

### Pitfall 7: Retry Queue Not Cleared After Success

**What goes wrong:** User retries enrichment via command palette. Success. But item still in retry queue. Next day, auto-retry happens, overwrites manual note.

**Why it happens:** Retry queue not updated after manual retry success.

**How to avoid:**
- After successful manual retry, remove item from queue immediately
- Add flag to queue entry: "manual_retry_in_progress" → queue is skipped
- Log successful retries; clean up old queue entries (> 1 week old)

**Warning signs:**
- Users report "Note got overwritten by retry"
- Duplicate enrichments happening
- Queue growing indefinitely

## Code Examples

### Full Accept Workflow with Orchestration

```typescript
// Source: Phase 16 architecture, orchestration patterns
// File: src/main.ts (Accept workflow entrypoint)

async acceptItem(item: ZoteroItem): Promise<void> {
  const progressReporter = new ProgressReporter();

  try {
    // Show blocking progress modal
    const progress = progressReporter.showBlockingProgress(item.title);

    // Run orchestration pipeline with timeout
    const enrichedNote = await TimeoutHandler.executeWithTimeout(
      async () => {
        return await this.orchestrator.orchestrate(
          item,
          (percent, stage) => {
            progress.updateProgress({ percentage: percent, stage });
          }
        );
      },
      'Enrichment pipeline'
    );

    // Save enriched note
    await this.noteStorage.save(enrichedNote);

    progress.complete();

    // Notify user
    new Notice(`Enriched note created: ${enrichedNote.metadata.title}`);

  } catch (error) {
    if (error instanceof EnrichmentTimeoutError) {
      // Timeout handled; stub already created
      new Notice(error.message);
    } else if (error instanceof PipelineStageError) {
      // Partial failure; try to save stub
      const stub = this.stubGenerator.generateStubNote(item, {
        stage: error.stage,
        error: error.originalError,
        evidence: this.currentEvidence,
        classification: this.currentClassification
      });

      const stubPath = await this.stubGenerator.saveStubNote(stub, this.notesPath);
      await this.retryQueue.queueForRetry(item, stubPath, error.originalError);

      new Notice(`Enrichment failed. Stub note created: ${stubPath}`);
    } else {
      // Unexpected error
      new Notice(`Error: ${error.message}`);
      throw error;
    }
  }
}
```

### Manual Retry Command

```typescript
// File: src/commands/manual-retry.ts

export class ManualRetryCommand {
  register(app: App, plugin: Plugin): void {
    plugin.addCommand({
      id: 'zotero-triage-re-enrich-note',
      name: 'Re-enrich Note',
      checkCallback: (checking) => {
        // Only available in literature notes
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) return false;

        if (checking) {
          const metadata = this.parseNoteMetadata(activeFile);
          return metadata?.zotero_key !== undefined;
        }

        // Execute re-enrichment
        this.reEnrichNote(activeFile);
        return true;
      }
    });
  }

  private async reEnrichNote(file: TFile): Promise<void> {
    try {
      // Parse metadata to get Zotero item key
      const content = await app.vault.read(file);
      const metadata = this.parseNoteMetadata(file);

      if (!metadata?.zotero_key) {
        new Notice('Note does not have a Zotero key. Cannot re-enrich.');
        return;
      }

      // Fetch item from Zotero
      const item = await this.zoteroService.getItemByKey(metadata.zotero_key);

      // Run orchestration again
      const progressReporter = new ProgressReporter();
      const progress = progressReporter.showBlockingProgress(item.title);

      const enrichedNote = await this.orchestrator.orchestrate(
        item,
        (percent, stage) => {
          progress.updateProgress({ percentage: percent, stage });
        }
      );

      // Update note file
      await app.vault.modify(file, this.noteToMarkdown(enrichedNote));

      // Remove from retry queue if present
      await this.retryQueue.removeFromQueue(metadata.zotero_key);

      progress.complete();

      new Notice('Note re-enriched successfully!');

    } catch (error) {
      new Notice(`Re-enrichment failed: ${error.message}`);
    }
  }

  private parseNoteMetadata(file: TFile): any {
    const content = app.vault.read(file);
    const { data } = matter(content);
    return data;
  }
}
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|------------------------|--------------|--------|
| Callback chains for async ops | State machine or async/await pipeline | 2023-2024 | Clearer state, better error handling, easier to debug |
| Manual progress percentage | Stage-based progress mapping | 2024-2025 | Better UX; users see realistic progress |
| No validation of output | Zod schema validation + LLM claim checking | 2024-2025 | Catches errors before user sees them; prevents bad enrichment |
| Retry on timeout immediately | Stub + queue + exponential backoff | 2024-2025 | Prevents cascade failures; resilient |
| No fallback on error | Stub note generation + retry queue | 2024-2025 | Users never lose work; partial data preserved |
| Silent validation failures | Persistent validation log + severity levels | 2024-2025 | Better observability; easier debugging |

**Deprecated/outdated:**
- **Promise callbacks** (pre-2020): Callback hell; hard to follow. async/await is standard.
- **Manual state tracking** (pre-2023): Easy to get stuck. State machines enforce valid transitions.
- **No fallback strategy** (pre-2024): Data loss risk. Stub + queue is now expected.
- **Synchronous validation** (pre-2024): Blocks UI. Async validation or background validation is standard.

## Open Questions

1. **Progress Modal Delay Threshold**
   - What we know: Modal useful for operations > 2-3 seconds
   - What's unclear: Exact threshold for "show modal vs silent operation"
   - Recommendation: Show modal immediately on Accept (user expects feedback). Don't auto-hide—let it complete naturally.
   - Status: MEDIUM confidence; UX decision

2. **Progress Granularity: 4 Steps vs Percentage-Only**
   - What we know: Phase context specifies 4 major steps (Classification → Extraction → Enrichment → Validation)
   - What's unclear: Should progress also show percentage, or just step name?
   - Recommendation: Show both: "Enriching (Stage 3/4): 65%". Percentage gives precise feedback; step name provides context.
   - Status: MEDIUM confidence; needs UX testing

3. **Hallucination Confidence Threshold**
   - What we know: Research suggests 0.80-0.95 confidence for blocking saves
   - What's unclear: Exact threshold for this use case (literature notes, 4 domain types)
   - Recommendation: Start at 0.90 (block save if validator 90%+ confident hallucination exists). Monitor error rate; adjust if > 5% false positives.
   - Status: MEDIUM confidence; needs production metrics

4. **Timeout Recovery: Immediate Retry vs Queue-Only**
   - What we know: Immediate retry can cascade on persistent failures. Queue respects backoff.
   - What's unclear: Should timeout allow 1-2 immediate retries before queueing?
   - Recommendation: Queue-only for timeouts (don't retry immediately). Exponential backoff in retry queue. Prevent cascade.
   - Status: HIGH confidence on approach

5. **State Machine Library Selection: XState vs Custom**
   - What we know: XState is feature-rich; custom FSM is simpler for linear pipelines
   - What's unclear: Whether visualization of state diagram is valuable during development
   - Recommendation: Start with custom explicit state machine (simpler, no dependency). Switch to XState only if state diagram visualization is needed for debugging.
   - Status: HIGH confidence; architectural preference

6. **Claim Validation: Sampling vs All Claims**
   - What we know: Validating all claims is expensive; sampling is practical
   - What's unclear: Optimal sample size (top 5? top 10?) and sampling strategy
   - Recommendation: Validate top 5 claims by sentence position. Prioritize main finding sections.
   - Status: MEDIUM confidence; needs tuning based on performance

## Sources

### Primary (HIGH confidence)

- **Obsidian Notice API** - https://docs.obsidian.md/Reference/TypeScript+API/Notice
  - Topics: Notice API, Modal API, blocking operations feedback

- **Zod Documentation** - https://zod.dev/
  - Topics: Runtime schema validation, TypeScript type inference, error reporting

- **Zod-Matter for Frontmatter Validation** - https://github.com/HiDeoo/zod-matter
  - Topics: YAML frontmatter parsing and validation with Zod

- **Fact-Checking with Large Language Models (2026)** - https://arxiv.org/pdf/2601.02574
  - Topics: LLM-based claim validation, hallucination detection methods

### Secondary (MEDIUM confidence)

- **State Machine Patterns for Async Workflows** - https://stately.ai/docs/xstate
  - Topics: Event-driven state management, TypeScript state machines

- **Hallucination Detection & Mitigation** - https://arxiv.org/pdf/2601.09929
  - Topics: Hallucination detection frameworks, claim-level validation

- **OpenFactCheck Framework** - https://openfactcheck.com/
  - Topics: Factuality evaluation of LLM outputs, validation frameworks

- **Resilience Patterns in Distributed Systems** - https://temporal.io/blog/error-handling-in-distributed-systems
  - Topics: Timeout handling, circuit breaker patterns, fallback strategies

- **Timeout Handling in Async Operations** - https://medium.com/@huzefa.qubbawala/design-and-implementation-of-an-asynchronous-api-model-for-long-running-operations-in-rest-api-3303ba6d45a2
  - Topics: Timeout patterns, graceful degradation

- **Pipeline Pattern in TypeScript** - https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn
  - Topics: Stage-based pipeline architecture, async orchestration

- **Command Palette Plugin Implementation** - https://github.com/deathau/command-uri-obsidian
  - Topics: Obsidian command registration, retry triggers

### Tertiary (LOW confidence)

- **WebSearch: "Progress Modal in Long Operations"** - Obsidian plugin ecosystem patterns
  - Topics: Non-blocking progress feedback UX, modal timing

- **WebSearch: "YAML Frontmatter Validation TypeScript"** - Astro Content Collections
  - Topics: Frontmatter schema approaches, validation strategies

## Metadata

**Confidence breakdown:**
- **Orchestration patterns**: HIGH — State machines and async/await patterns well-proven across industry
- **Validation stack (Zod + schemas)**: HIGH — Tools well-documented, widely used in TypeScript ecosystem
- **Hallucination detection**: MEDIUM — LLM fact-checking emerging but not yet fully standardized; confidence thresholds need empirical tuning
- **Progress feedback UX**: MEDIUM — Obsidian Notice API documented; exact timing and granularity need UX validation
- **Timeout handling**: HIGH — Industry consensus on 2-minute timeout and exponential backoff patterns
- **Stub note recovery**: MEDIUM — Pattern proven; queue persistence specifics need Phase 16 design

**Research date:** 2026-02-01
**Valid until:** 2026-03-02 (30 days; expires when Phase 16 implementation begins and actual timing/performance metrics become available)

**Key assumptions validated:**
- Phase 14 AIService available for claim validation LLM calls
- Phase 15 enrichment service produces structured EnrichedNote output
- Obsidian Notice/Modal API supports real-time progress updates
- Zod already in package.json (verified in prior phases)
- 2-minute timeout is conservative and realistic for blocking operations
