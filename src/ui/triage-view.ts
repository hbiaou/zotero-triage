/**
 * TriageView - Card-based dashboard for reviewing Zotero items
 *
 * Provides an interactive UI for batch processing items with Accept/Reject/Defer actions.
 * Each action includes an undo option displayed as a toast notification.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type ZoteroTriagePlugin from '../main';
import type { ZoteroItem, RegistryState } from '../types';
import type { Batch } from '../batch/types';
import { createTriageCard, updateCardStatus } from './triage-card';
import { showUndoNotice } from './undo-notice';
import { renderStatsPanel } from './stats-panel';
import { OverrideConfirmModal } from './override-modal';
import { ProgressTracker } from '../performance/progress-tracker';
import { getErrorContext } from '../error/error-handler';
import { ErrorModal } from './error-modal';

export const TRIAGE_VIEW_TYPE = 'zotero-triage-view';

/**
 * Stores previous state for undo functionality
 */
interface UndoState {
  itemId: number;
  previousState: RegistryState;
}

/**
 * TriageView displays batches of items as cards with action buttons
 */
export class TriageView extends ItemView {
  private plugin: ZoteroTriagePlugin;
  private currentBatch: Batch | null = null;
  private processedCount: number = 0;
  private totalZoteroItems: number = 0;
  private searchQuery: string = '';
  private searchInput: HTMLInputElement | null = null;
  private validationWarnings: Map<string, number> = new Map();
  private scrollPosition: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: ZoteroTriagePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TRIAGE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Zotero Triage';
  }

  getIcon(): string {
    return 'inbox';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('zotero-triage-triage-container');

    // Check if database is configured and connected
    if (!this.plugin.settings.zoteroDbPath || !this.plugin.connector.itemsLoaded) {
      const message = !this.plugin.settings.zoteroDbPath
        ? 'Please configure Zotero database path in settings'
        : 'Click "Generate Batch" to load items from Zotero';

      container.createDiv({
        cls: 'zotero-triage-empty-state',
        text: message
      });
      return;
    }

    // Render initial empty state
    this.renderEmptyState(container);
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Generate a new batch and display it
   */
  async generateAndShowBatch(): Promise<void> {
    const progress = new ProgressTracker();

    try {
      // Ensure database connected before first operation
      await this.plugin.ensureConnected();

      // Start progress tracking
      progress.start('Loading Zotero library...', 5000); // Estimate 5000 items

      // Load items with progress callback
      const items = await this.plugin.connector.loadItems((loaded, total) => {
        progress.update(loaded, `Loading items from database...`);
        // Update estimate if total differs
        if (total !== progress['state'].total) {
          progress['state'].total = total;
        }
      });

      // Verify items were loaded
      console.log('Zotero Triage DEBUG: Loaded', items.length, 'items from Zotero');

      if (items.length === 0) {
        progress.error('No items found in Zotero library');
        return;
      }

      // Store total item count
      this.totalZoteroItems = items.length;

      progress.update(items.length, 'Generating batch...');

      // DEBUG: Log connector and registry state
      console.log('Zotero Triage DEBUG: Total items in connector:', this.totalZoteroItems);
      const registryStats = this.plugin.registry.getStats();
      console.log('Zotero Triage DEBUG: Registry stats:', registryStats);
      console.log('Zotero Triage DEBUG: First 3 item states:',
        items.slice(0, 3).map(item => ({
          id: item.itemID,
          title: item.title.substring(0, 50),
          state: this.plugin.registry.getState(item.itemID)
        }))
      );

      // Generate batch
      const batch = await this.plugin.batchService.generateBatch({
        size: this.plugin.settings.batchSize,
        includeDeferred: false
      });

      // DEBUG: Log batch result
      console.log('Zotero Triage DEBUG: Batch generated with', batch.items.length, 'items');

      if (batch.items.length === 0) {
        progress.error('No unprocessed items available');
        return;
      }

      progress.complete(`Generated batch of ${batch.items.length} items`);

      // Store batch and reset processed count
      this.currentBatch = batch;
      this.processedCount = 0;

      // Clear validation warnings for new batch
      this.validationWarnings.clear();

      // Collect validation warnings from batch
      if (this.plugin.settings.qualityGate.enabled) {
        for (const item of batch.items) {
          const validation = this.plugin.validationService.validate(item);
          if (!validation.valid) {
            for (const field of validation.missingFields) {
              const key = `Missing ${field}`;
              this.validationWarnings.set(key, (this.validationWarnings.get(key) ?? 0) + 1);
            }
          }
        }

        // Show aggregated validation summary if warnings exist
        if (this.validationWarnings.size > 0) {
          const summary = Array.from(this.validationWarnings.entries())
            .map(([issue, count]) => `${count}x ${issue}`)
            .join(', ');
          new Notice(`Validation: ${summary}`, 5000);
        }
      }

      // Render the batch
      this.refresh();

    } catch (err) {
      const context = getErrorContext(err as Error);
      progress.error(context.message);
      // Show error modal for detailed actions
      new ErrorModal(this.app, context).open();
    }
  }

  /**
   * Render the empty state with "Generate Batch" button
   */
  private renderEmptyState(container: HTMLElement): void {
    container.empty();

    const emptyState = container.createDiv({ cls: 'zotero-triage-empty-state' });
    emptyState.createEl('h3', { text: 'Zotero Triage' });
    emptyState.createEl('p', {
      text: 'Review and process items from your Zotero library in small batches.'
    });

    const generateBtn = emptyState.createEl('button', {
      cls: 'mod-cta',
      text: 'Generate Batch'
    });
    generateBtn.addEventListener('click', () => this.generateAndShowBatch());
  }

  /**
   * Render the current batch with progress and cards
   */
  private renderBatch(container: HTMLElement): void {
    container.empty();

    if (!this.currentBatch) {
      this.renderEmptyState(container);
      return;
    }

    // Check if batch is complete
    if (this.processedCount >= this.currentBatch.items.length) {
      this.renderBatchComplete(container);
      return;
    }

    // Render stats panel
    this.renderStatsPanel(container);

    // Render progress bar
    this.renderProgressBar(container);

    // Render search filter
    this.renderSearchFilter(container);

    // Render cards
    const cardContainer = container.createDiv({ cls: 'zotero-triage-card-list' });
    const displayedItems = this.filterItems(this.currentBatch.items);
    for (const item of displayedItems) {
      // Run validation
      const validationResult = this.plugin.validationService.validate(item);

      // DEBUG: Log validation results
      console.log('Zotero Triage DEBUG: Validation for', item.title.substring(0, 50), {
        itemType: item.itemType,
        valid: validationResult.valid,
        missingFields: validationResult.missingFields,
        errors: validationResult.errors
      });

      const card = createTriageCard(cardContainer, {
        item,
        validationResult,
        onAccept: (item) => this.handleAccept(item),
        onReject: (item) => this.handleReject(item),
        onDefer: (item) => this.handleDefer(item)
      });

      // Apply status badge if item was previously processed
      const state = this.plugin.registry.getState(item.itemID);
      if (state !== 'unseen' && state !== 'proposed') {
        // Map 'imported' state to 'accepted' for badge display
        const badgeState: RegistryState = state === 'imported' ? 'accepted' : state;
        updateCardStatus(card, badgeState);
      }
    }
  }

  /**
   * Render stats panel with library and session statistics
   */
  private renderStatsPanel(container: HTMLElement): void {
    // Get currently valid item IDs from connector cache to filter stats
    const validItemIds = new Set(
      this.plugin.connector.getCachedItems().map(i => i.itemID)
    );

    renderStatsPanel(container, {
      registry: this.plugin.registry,
      sessionTracker: this.plugin.sessionTracker,
      totalZoteroItems: this.totalZoteroItems,
      validItemIds // Pass to stats panel (which needs to pass it to registry.getStats)
    });
  }

  /**
   * Render search filter input
   */
  private renderSearchFilter(container: HTMLElement): void {
    const searchGroup = container.createDiv({ cls: 'triage-search' });

    this.searchInput = searchGroup.createEl('input', {
      type: 'text',
      cls: 'search-filter-input',
      placeholder: 'Search by author, title, or tag...'
    });

    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      // Only re-render the card list, not the entire view
      this.renderCardListOnly();
    });
  }

  /**
   * Filter items by search query
   */
  private filterItems(items: ZoteroItem[]): ZoteroItem[] {
    if (this.searchQuery.length === 0) {
      return items;
    }

    return items.filter(item => {
      const query = this.searchQuery;

      // Match against title
      if (item.title.toLowerCase().includes(query)) {
        return true;
      }

      // Match against authors
      if (item.authors.some(a => a.toLowerCase().includes(query))) {
        return true;
      }

      // Match against tags (if exist)
      if (item.tags?.some(t => t.toLowerCase().includes(query))) {
        return true;
      }

      return false;
    });
  }

  /**
   * Render only the card list (selective re-render for search filtering)
   * Preserves search input and other UI elements
   */
  private renderCardListOnly(): void {
    if (!this.currentBatch) return;

    // Find existing card list container
    const container = this.containerEl.children[1] as HTMLElement;
    const existingCardList = container.querySelector('.zotero-triage-card-list') as HTMLElement;

    if (!existingCardList) {
      // Fallback to full render if card list doesn't exist
      this.refresh();
      return;
    }

    // Save scroll position
    this.scrollPosition = existingCardList.scrollTop;

    // Clear and re-populate card list
    existingCardList.empty();
    const displayedItems = this.filterItems(this.currentBatch.items);

    for (const item of displayedItems) {
      // Run validation
      const validationResult = this.plugin.validationService.validate(item);

      const card = createTriageCard(existingCardList, {
        item,
        validationResult,
        onAccept: (item) => this.handleAccept(item),
        onReject: (item) => this.handleReject(item),
        onDefer: (item) => this.handleDefer(item)
      });

      // Apply status badge if item was previously processed
      const state = this.plugin.registry.getState(item.itemID);
      if (state !== 'unseen' && state !== 'proposed') {
        // Map 'imported' state to 'accepted' for badge display
        const badgeState: RegistryState = state === 'imported' ? 'accepted' : state;
        updateCardStatus(card, badgeState);
      }
    }

    // Restore scroll position
    requestAnimationFrame(() => {
      existingCardList.scrollTop = this.scrollPosition;
    });
  }

  /**
   * Render the batch complete state
   */
  private renderBatchComplete(container: HTMLElement): void {
    this.handleBatchComplete();
  }

  /**
   * Handle batch completion with stats and next batch options
   */
  private handleBatchComplete(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('zotero-triage-triage-container');

    // Re-render stats panel
    this.renderStatsPanel(container);

    // Completion message
    const message = container.createDiv({ cls: 'batch-complete' });
    message.createEl('h3', { text: 'Batch Complete!' });
    message.createDiv({
      cls: 'batch-complete-text',
      text: 'Great progress! Ready for another batch?'
    });

    const actions = message.createDiv({ cls: 'batch-complete-actions' });

    // Check if more items available
    const hasMore = this.plugin.batchService.getUnprocessedCount() > 0 ||
      this.plugin.batchService.getDeferredCount() > 0;

    if (hasMore) {
      const nextBtn = actions.createEl('button', {
        cls: 'mod-cta',
        text: 'Generate Next Batch'
      });
      nextBtn.addEventListener('click', async () => {
        await this.generateAndShowBatch();
      });
    } else {
      actions.createDiv({
        cls: 'batch-complete-text',
        text: 'No more items to process!'
      });
    }

    const laterBtn = actions.createEl('button', {
      text: 'Take a Break'
    });
    laterBtn.addEventListener('click', () => {
      this.plugin.app.workspace.detachLeavesOfType(TRIAGE_VIEW_TYPE);
    });
  }

  /**
   * Render progress indicator
   */
  private renderProgressBar(container: HTMLElement): void {
    if (!this.currentBatch) return;

    const progressSection = container.createDiv({ cls: 'zotero-triage-progress' });

    // Text indicator
    const progressText = progressSection.createDiv({ cls: 'progress-text' });
    progressText.setText(
      `Progress: ${this.processedCount}/${this.currentBatch.items.length} processed`
    );

    // Visual progress bar
    const progressBar = progressSection.createDiv({ cls: 'progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
    const percentage = (this.processedCount / this.currentBatch.items.length) * 100;
    progressFill.style.width = `${percentage}%`;
  }

  /**
   * Handle Accept action - check validation and show override modal if needed
   */
  private async handleAccept(item: ZoteroItem): Promise<void> {
    const previousState = this.plugin.registry.getState(item.itemID);

    // Run validation if quality gate is enabled
    if (this.plugin.settings.qualityGate.enabled) {
      const validationResult = this.plugin.validationService.validate(item);

      if (!validationResult.valid) {
        // Show override confirmation modal
        new OverrideConfirmModal(this.app, {
          item: item,
          missingFields: validationResult.missingFields,
          onConfirm: () => {
            // User confirmed override - proceed with import
            this.performAccept(item, previousState);
          },
          onCancel: () => {
            // User cancelled - do nothing
            new Notice('Import cancelled');
          }
        }).open();
        return;  // Exit early, wait for modal decision
      }
    }

    // Validation passed or disabled - proceed
    this.performAccept(item, previousState);
  }

  /**
   * Perform the actual import after validation check
   */
  private async performAccept(item: ZoteroItem, previousState: RegistryState): Promise<void> {
    this.saveScrollPosition();

    try {
      console.log('🔍 ACCEPT DEBUG: Starting accept for item:', item.itemID, item.title?.substring(0, 50));
      console.log('🔍 ACCEPT DEBUG: AI Service exists:', !!this.plugin.aiService);
      console.log('🔍 ACCEPT DEBUG: AI Service ready:', this.plugin.aiService?.isReady());
      console.log('🔍 ACCEPT DEBUG: AI current provider:', this.plugin.aiService?.['currentProvider']?.providerId || 'none');
      console.log('🔍 ACCEPT DEBUG: AI config:', {
        selectedProvider: this.plugin.settings.aiConfig?.selectedProvider,
        selectedModel: this.plugin.settings.aiConfig?.selectedModel
      });
      console.log('🔍 ACCEPT DEBUG: Enrichment Orchestrator exists:', !!this.plugin.enrichmentOrchestrator);
      console.log('🔍 ACCEPT DEBUG: Evidence Extractor exists:', !!this.plugin.evidenceExtractor);
      console.log('🔍 ACCEPT DEBUG: Zotero DB Path:', this.plugin.settings.zoteroDbPath ? '[configured]' : '[not configured]');

      // Check if AI services and enrichment orchestrator are configured
      if (!this.plugin.aiService || !this.plugin.aiService.isReady() || !this.plugin.enrichmentOrchestrator) {
        console.log('⚠️ ACCEPT DEBUG: AI not configured, entering fallback path');
        // Fallback to diagnostic note flow (existing code for insufficient evidence)
        if (this.plugin.evidenceExtractor) {
          console.log('⚠️ ACCEPT DEBUG: Evidence extractor exists, extracting evidence');
          const evidence = await this.plugin.evidenceExtractor.extract(item);
          console.log('⚠️ ACCEPT DEBUG: Evidence extracted:', evidence);

          // If evidence is insufficient, create diagnostic note
          const canEnrich = this.plugin.evidenceExtractor.canEnrich(evidence);
          console.log('⚠️ ACCEPT DEBUG: Can enrich?', canEnrich);
          if (!canEnrich) {
            console.log('⚠️ ACCEPT DEBUG: Creating diagnostic note');
            // Generate diagnostic note
            const diagnosticNote = this.plugin.diagnosticNoteService.createDiagnosticNote(item, evidence);

            // Ensure output folder exists
            const outputFolder = this.plugin.settings.outputFolder;
            if (outputFolder) {
              const folder = this.app.vault.getAbstractFileByPath(outputFolder);
              if (!folder) {
                await this.app.vault.createFolder(outputFolder);
              }
            }

            // Create diagnostic note file
            const filePath = this.plugin.noteGenerator.getFilePath(item);
            console.log('⚠️ ACCEPT DEBUG: Creating diagnostic note at:', filePath);

            // Check if file already exists
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile) {
              console.log('⚠️ ACCEPT DEBUG: File already exists, modifying');
              await this.app.vault.modify(existingFile as any, diagnosticNote);
            } else {
              console.log('⚠️ ACCEPT DEBUG: Creating new file');
              await this.plugin.app.vault.create(filePath, diagnosticNote);
            }
            console.log('⚠️ ACCEPT DEBUG: Diagnostic note saved successfully');

            // Mark as enrichment_pending instead of imported
            this.plugin.registry.markState(item.itemID, 'enrichment_pending');
            this.plugin.registry.setEnrichmentMetadata(item.itemID, {
              evidenceLevel: evidence.level,
              pendingReason: this.getEvidencePendingReason(evidence),
              retryCount: 0,
              lastRetryTimestamp: new Date().toISOString()
            });

            // Update status badge on card
            const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
            if (card) {
              updateCardStatus(card, 'enrichment_pending');
            }

            // Increment processed count
            this.processedCount++;

            // Record session action
            this.plugin.sessionTracker.recordAction('accepted');

            // Show notice about diagnostic note
            showUndoNotice({
              message: 'Diagnostic note created - item queued for enrichment.',
              onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'accepted'),
              timeout: 3000
            });

            // Refresh view and restore scroll
            this.refresh();
            this.restoreScrollPosition();

            return;
          }
        }

        // No evidence extractor or sufficient evidence but AI not configured - create regular note
        console.log('⚠️ ACCEPT DEBUG: Creating regular note (no AI or sufficient evidence but no AI)');
        try {
          await this.plugin.noteGenerator.createNote(item);
          console.log('⚠️ ACCEPT DEBUG: Regular note created successfully');
        } catch (noteErr) {
          // Check if error is "file already exists" - if so, treat as success
          const errMsg = noteErr instanceof Error ? noteErr.message : String(noteErr);
          if (errMsg.includes('already exists')) {
            console.log('⚠️ ACCEPT DEBUG: Note already exists, treating as success');
            new Notice('Note already exists - item marked as imported');
          } else {
            console.error('⚠️ ACCEPT DEBUG: Failed to create regular note:', noteErr);
            throw noteErr;
          }
        }
        this.plugin.registry.markState(item.itemID, 'imported');

        // Update UI
        const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
        if (card) {
          updateCardStatus(card, 'accepted');
        }

        await this.plugin.batchService.recordAccept(item);
        this.processedCount++;
        this.plugin.sessionTracker.recordAction('accepted');

        showUndoNotice({
          message: 'Item accepted and note created.',
          onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'accepted'),
          timeout: 3000
        });

        this.refresh();
        this.restoreScrollPosition();
        return;
      }

      // Run enrichment orchestration
      console.log('✅ ACCEPT DEBUG: AI configured, calling orchestrator');
      const result = await this.plugin.enrichmentOrchestrator.orchestrate(item);
      console.log('✅ ACCEPT DEBUG: Orchestrator result:', result);

      if (result.success) {
        // Enrichment succeeded
        console.log('✅ ACCEPT DEBUG: Enrichment succeeded! Note path:', result.notePath);
        new Notice(`✅ Enriched note created: ${result.notePath}`);

        // Mark as imported (enriched state)
        this.plugin.registry.markState(item.itemID, 'imported');
        this.plugin.registry.setEnrichmentMetadata(item.itemID, {
          evidenceLevel: 'FullText', // or from result
          enrichedAt: new Date().toISOString(),
          modelUsed: this.plugin.aiService.getCurrentModel() || 'unknown',
        });

        // Show warnings if any
        if (result.validationWarnings && result.validationWarnings.length > 0) {
          const warningMsg = result.validationWarnings
            .map(w => w.message)
            .join(', ');
          new Notice(`⚠️ Warnings: ${warningMsg}`, 5000);
        }

        // Update status badge on card
        const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
        if (card) {
          updateCardStatus(card, 'accepted');
        }

        // Record accept for adaptive learning
        await this.plugin.batchService.recordAccept(item);

        // Increment processed count
        this.processedCount++;

        // Record session action
        this.plugin.sessionTracker.recordAction('accepted');

        // Show undo notice
        showUndoNotice({
          message: 'Item accepted and enriched note created.',
          onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'accepted'),
          timeout: 3000
        });

        // Refresh view and restore scroll
        this.refresh();
        this.restoreScrollPosition();

      } else {
        // Enrichment failed - create stub note and queue retry
        console.log('❌ ACCEPT DEBUG: Enrichment failed, creating stub note');
        const failureContext = {
          stage: result.stage as any,
          error: result.error!,
          item,
          classification: undefined, // Could extract from orchestrator state if needed
          evidence: undefined
        };

        console.log('❌ ACCEPT DEBUG: Failure context:', failureContext);
        const stubNote = this.plugin.stubNoteGenerator.createStubNote(failureContext);
        console.log('❌ ACCEPT DEBUG: Stub note created, saving to:', this.plugin.settings.outputFolder);
        const stubPath = await this.plugin.stubNoteGenerator.saveStubNote(
          stubNote,
          this.plugin.settings.outputFolder
        );
        console.log('❌ ACCEPT DEBUG: Stub note saved to:', stubPath);

        // Queue for retry
        await this.plugin.retryQueue.enqueue({
          itemId: item.itemID,
          itemKey: item.itemKey || '',
          itemTitle: item.title || 'Untitled',
          notePath: stubPath,
          failureStage: result.stage,
          failureReason: result.error!.message
        });

        new Notice(`⚠️ Enrichment failed - stub note created. Queued for retry.`, 5000);

        // Mark as enrichment_pending
        this.plugin.registry.markState(item.itemID, 'enrichment_pending');

        // Update status badge on card
        const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
        if (card) {
          updateCardStatus(card, 'enrichment_pending');
        }

        // Increment processed count
        this.processedCount++;

        // Record session action
        this.plugin.sessionTracker.recordAction('accepted');

        showUndoNotice({
          message: 'Enrichment failed - stub note created (queued for retry).',
          onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'accepted'),
          timeout: 3000
        });

        // Refresh view and restore scroll
        this.refresh();
        this.restoreScrollPosition();
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to create note: ${message}`);
      console.error('Accept action error:', err);

      // Restore previous state on catastrophic failure
      this.plugin.registry.markState(item.itemID, previousState);
    }
  }

  /**
   * Get human-readable reason for enrichment pending state
   * @param evidence - Evidence extraction result
   * @returns Reason string
   */
  private getEvidencePendingReason(evidence: any): string {
    switch (evidence.level) {
      case 'MetadataOnly':
        return 'No content available (add PDF, notes, or transcript)';
      case 'Abstract':
        return 'Abstract only (add PDF or notes for better enrichment)';
      default:
        return 'Insufficient evidence for enrichment';
    }
  }

  /**
   * Handle Reject action - mark rejected
   */
  private handleReject(item: ZoteroItem): void {
    this.saveScrollPosition();

    const previousState = this.plugin.registry.getState(item.itemID);

    // Mark as rejected
    this.plugin.registry.markState(item.itemID, 'rejected');

    // Update status badge on card
    const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, 'rejected');
    }

    // Record reject for adaptive learning
    this.plugin.batchService.recordReject(item);

    // Increment processed count
    this.processedCount++;

    // Record session action
    this.plugin.sessionTracker.recordAction('rejected');

    // Show undo notice
    showUndoNotice({
      message: 'Item rejected.',
      onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'rejected'),
      timeout: 3000
    });

    // Refresh view and restore scroll
    this.refresh();
    this.restoreScrollPosition();
  }

  /**
   * Handle Defer action - mark deferred
   */
  private handleDefer(item: ZoteroItem): void {
    this.saveScrollPosition();

    const previousState = this.plugin.registry.getState(item.itemID);

    // Mark as deferred
    this.plugin.registry.markState(item.itemID, 'deferred');

    // Update status badge on card
    const card = this.containerEl.querySelector(`[data-item-id="${item.itemID}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, 'deferred');
    }

    // Increment processed count
    this.processedCount++;

    // Record session action
    this.plugin.sessionTracker.recordAction('deferred');

    // Show undo notice
    showUndoNotice({
      message: 'Item deferred.',
      onUndo: () => this.undoAction({ itemId: item.itemID, previousState }, 'deferred'),
      timeout: 3000
    });

    // Refresh view and restore scroll
    this.refresh();
    this.restoreScrollPosition();
  }

  /**
   * Undo the last action
   */
  private undoAction(undoState: UndoState, actionType: 'accepted' | 'rejected' | 'deferred'): void {
    // Revert registry state
    this.plugin.registry.markState(undoState.itemId, undoState.previousState);

    // Update status badge on card (remove badge by passing previous state)
    const card = this.containerEl.querySelector(`[data-item-id="${undoState.itemId}"]`) as HTMLElement;
    if (card) {
      updateCardStatus(card, undoState.previousState);
    }

    // Decrement processed count
    this.processedCount--;

    // Undo session action
    this.plugin.sessionTracker.undoAction(actionType);

    // Refresh view
    this.refresh();

    new Notice('Action undone');
  }

  /**
   * Save scroll position before re-rendering
   */
  private saveScrollPosition(): void {
    const cardContainer = this.containerEl.querySelector('.zotero-triage-card-list') as HTMLElement;
    if (cardContainer) {
      this.scrollPosition = cardContainer.scrollTop;
    }
  }

  /**
   * Restore scroll position after re-rendering
   */
  private restoreScrollPosition(): void {
    requestAnimationFrame(() => {
      const cardContainer = this.containerEl.querySelector('.zotero-triage-card-list') as HTMLElement;
      if (cardContainer) {
        cardContainer.scrollTop = this.scrollPosition;
      }
    });
  }

  /**
   * Refresh the view with current state
   */
  refresh(): void {
    const container = this.containerEl.children[1] as HTMLElement;

    if (!this.currentBatch) {
      this.renderEmptyState(container);
    } else {
      this.renderBatch(container);
    }
  }
}
