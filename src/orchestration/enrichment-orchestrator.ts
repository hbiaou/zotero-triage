/**
 * Enrichment Orchestrator
 *
 * Central orchestration layer that coordinates all enrichment services in a
 * blocking, observable pipeline with error boundaries at each stage and clear
 * progress feedback.
 *
 * Pipeline stages:
 * 1. Extraction (0-20%) - Evidence extraction from PDF/notes/abstract
 * 2. Classification (20-40%) - Domain classification for template selection
 * 3. Enrichment (40-70%) - LLM-powered content generation
 * 4. Validation (70-90%) - Output quality validation
 * 5. Saving (90-100%) - Save enriched note to vault
 *
 * Error handling:
 * - Each stage wrapped in error boundary with PipelineStageError
 * - Timeout enforced at orchestration level (2 minutes)
 * - Progress modal provides real-time feedback
 * - Graceful failure with OrchestrationResult
 *
 * Usage:
 * ```typescript
 * const orchestrator = new EnrichmentOrchestrator(
 *   app,
 *   domainClassifier,
 *   evidenceExtractor,
 *   enrichmentService,
 *   outputValidator,
 *   outputFolder
 * );
 *
 * const result = await orchestrator.orchestrate(item);
 * if (result.success) {
 *   console.log(`Note saved to: ${result.notePath}`);
 * } else {
 *   console.error(`Failed at stage ${result.stage}: ${result.error}`);
 * }
 * ```
 */

import type { App } from 'obsidian';
import type {
  ZoteroItem,
  PipelineStage,
  PipelineState,
  OrchestrationResult,
  EnrichmentResult,
} from '../types';
import type { ClassificationResult } from '../classification/types';
import type { EvidenceExtraction } from '../ai/types';
import type { ValidationResult } from '../validation/output-validator';
import type { DomainClassifier } from '../classification/domain-classifier';
import type { EvidenceExtractor } from '../services/evidence-extractor';
import type { EnrichmentService } from '../services/enrichment-service';
import type { OutputValidator } from '../validation/output-validator';
import { EnrichmentProgressModal } from '../ui/enrichment-progress-modal';

/**
 * Enrichment timeout threshold (2 minutes)
 *
 * Prevents UI freeze for long-running enrichments.
 * From Phase 16 decision: 2-minute timeout for enrichment operations.
 */
const TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Enrichment Orchestrator
 *
 * Coordinates full enrichment pipeline with state machine transitions
 * and real-time progress feedback.
 */
export class EnrichmentOrchestrator {
  private currentState: PipelineState | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;
  private readonly TIMEOUT_MS = TIMEOUT_MS;

  constructor(
    private app: App,
    private domainClassifier: DomainClassifier,
    private evidenceExtractor: EvidenceExtractor,
    private enrichmentService: EnrichmentService,
    private outputValidator: OutputValidator,
    private outputFolder: string
  ) {}

  /**
   * Orchestrate full enrichment pipeline with progress feedback
   *
   * Runs five-stage pipeline with blocking progress modal:
   * 1. Extraction - Extract evidence from PDF/notes/abstract
   * 2. Classification - Determine domain for template selection
   * 3. Enrichment - Generate enriched content via LLM
   * 4. Validation - Validate output quality and consistency
   * 5. Saving - Save enriched note to vault
   *
   * @param item - Zotero item to enrich
   * @returns Promise resolving to orchestration result
   */
  async orchestrate(item: ZoteroItem): Promise<OrchestrationResult> {
    // Initialize state
    this.currentState = {
      stage: 'idle',
      progress: 0,
      item,
    };

    // Create progress modal
    const progressModal = new EnrichmentProgressModal(this.app);
    progressModal.open();
    progressModal.updateProgress(0, 'Starting enrichment...');

    // Set timeout to prevent UI freeze
    this.timeoutHandle = setTimeout(() => {
      this.handleTimeout(progressModal);
    }, this.TIMEOUT_MS);

    try {
      // Stage 1: Evidence Extraction (0-20%)
      await this.runStage('extracting', async () => {
        progressModal.updateProgress(5, 'Extracting evidence...');
        const evidence = await this.evidenceExtractor.extract(item);
        this.currentState!.evidence = evidence;
        progressModal.updateProgress(
          20,
          `Evidence: ${evidence.level} (${evidence.tokenEstimate} tokens)`
        );
      });

      // Stage 2: Classification (20-40%)
      await this.runStage('classifying', async () => {
        progressModal.updateProgress(25, 'Classifying item...');
        const classification = await this.domainClassifier.classify(
          item,
          this.currentState!.evidence! as EvidenceExtraction
        );
        this.currentState!.classification = classification;
        progressModal.updateProgress(
          40,
          `Domain: ${classification.domain} (${Math.round(classification.confidence * 100)}%)`
        );
      });

      // Stage 3: Enrichment (40-70%)
      await this.runStage('enriching', async () => {
        progressModal.updateProgress(45, 'Generating enriched content...');
        const enrichment = await this.enrichmentService.enrich(
          item,
          this.currentState!.classification! as ClassificationResult
        );
        this.currentState!.enrichment = enrichment;
        progressModal.updateProgress(70, 'Enrichment complete');
      });

      // Stage 4: Validation (70-90%)
      await this.runStage('validating', async () => {
        progressModal.updateProgress(75, 'Validating output...');
        const validationResult = await this.outputValidator.validate(
          this.currentState!.enrichment!.content,
          item,
          this.currentState!.evidence! as EvidenceExtraction
        );
        this.currentState!.validationResult = validationResult;

        if (!validationResult.valid) {
          throw new Error(
            `Validation failed: ${validationResult.errors.map((e) => e.message).join('; ')}`
          );
        }

        progressModal.updateProgress(90, 'Validation passed');
      });

      // Stage 5: Save Note (90-100%)
      let notePath: string;
      await this.runStage('saving', async () => {
        progressModal.updateProgress(95, 'Saving note...');
        notePath = await this.saveEnrichedNote(
          this.currentState!.enrichment!.content,
          item
        );
        progressModal.updateProgress(100, 'Complete!');
      });

      // Clear timeout
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      // Close modal after brief delay
      setTimeout(() => progressModal.close(), 1000);

      this.currentState!.stage = 'completed';
      return {
        success: true,
        notePath: notePath!,
        stage: 'completed',
        validationWarnings: (this.currentState!.validationResult as ValidationResult)?.warnings,
      };
    } catch (error) {
      // Clear timeout
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      this.currentState!.stage = 'failed';
      this.currentState!.error = error as Error;

      progressModal.showError((error as Error).message);
      setTimeout(() => progressModal.close(), 3000);

      return {
        success: false,
        stage: this.currentState!.stage,
        error: error as Error,
      };
    }
  }

  /**
   * Execute a pipeline stage with error boundary
   *
   * Wraps stage execution in try-catch to capture errors and
   * convert them to PipelineStageError with context.
   *
   * @param stageName - Name of pipeline stage
   * @param stageFunction - Async function to execute
   * @throws PipelineStageError if stage fails
   */
  private async runStage(
    stageName: PipelineStage,
    stageFunction: () => Promise<void>
  ): Promise<void> {
    this.currentState!.stage = stageName;

    try {
      await stageFunction();
    } catch (error) {
      throw new PipelineStageError(
        stageName,
        error as Error,
        this.currentState!.item.itemID
      );
    }
  }

  /**
   * Handle timeout - close modal and throw error
   *
   * Called when enrichment exceeds 2-minute timeout.
   * Shows error in modal and throws to trigger failure path.
   *
   * @param progressModal - Progress modal instance
   * @throws Error indicating timeout
   */
  private handleTimeout(progressModal: EnrichmentProgressModal): void {
    progressModal.showError('Enrichment timed out after 2 minutes');
    setTimeout(() => progressModal.close(), 3000);

    throw new Error('Enrichment timeout - operation took longer than 2 minutes');
  }

  /**
   * Save enriched note to vault
   *
   * Creates enriched note in output folder with sanitized filename.
   * Handles duplicate filenames by appending counter.
   *
   * @param content - Full markdown content with frontmatter
   * @param item - Zotero item for filename generation
   * @returns Path to saved note
   */
  private async saveEnrichedNote(content: string, item: ZoteroItem): Promise<string> {
    // Ensure output folder exists
    const folder = this.app.vault.getAbstractFileByPath(this.outputFolder);
    if (!folder) {
      await this.app.vault.createFolder(this.outputFolder);
    }

    // Sanitize filename
    const safeTitle = (item.title || 'Untitled')
      .replace(/[\\/:*?"<>|]/g, '-')
      .substring(0, 200);

    const filePath = `${this.outputFolder}/${safeTitle}.md`;

    // Check for duplicates
    let finalPath = filePath;
    let counter = 1;
    while (await this.app.vault.adapter.exists(finalPath)) {
      finalPath = `${this.outputFolder}/${safeTitle} (${counter}).md`;
      counter++;
    }

    await this.app.vault.create(finalPath, content);
    return finalPath;
  }

  /**
   * Get current pipeline state (for debugging/monitoring)
   *
   * Exposes internal state for debugging or progress tracking.
   *
   * @returns Current pipeline state or null if not running
   */
  getCurrentState(): PipelineState | null {
    return this.currentState;
  }
}

/**
 * Custom error for pipeline stage failures
 *
 * Captures stage name, cause, and item ID for diagnostic purposes.
 */
export class PipelineStageError extends Error {
  constructor(
    public stage: PipelineStage,
    public cause: Error,
    public itemId: number
  ) {
    super(`Pipeline failed at stage '${stage}': ${cause.message}`);
    this.name = 'PipelineStageError';
  }
}
